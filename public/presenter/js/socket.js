// ===========================================================================
// Presenter Console — Real-Time Socket.io Communications
// ===========================================================================

// Latency and Status Management
let currentSocketLatency = null;
let latencyPingTimer = null;

function getConnectedStatusText()
{
  if (typeof currentSocketLatency === 'number' && currentSocketLatency >= 0)
  {
    return `Connected to Server (${currentSocketLatency} ms)`;
  }
  return 'Connected to Server';
}

function getConnectedTooltipText()
{
  if (typeof currentSocketLatency === 'number' && currentSocketLatency >= 0)
  {
    return `● Connected to Server (${currentSocketLatency} ms)`;
  }
  return '● Connected to Server';
}

function updateStatusDotAndTooltip()
{
  const isOnline = socket && socket.connected && (!serverStatusDot || !serverStatusDot.classList.contains('disconnected'));
  if (serverStatusDot)
  {
    serverStatusDot.title = isOnline ? getConnectedStatusText() : 'Disconnected from server';
  }
  const tooltip = document.getElementById('server-status-tooltip');
  if (tooltip && tooltip.classList.contains('visible') && isOnline)
  {
    tooltip.textContent = getConnectedTooltipText();
  }
}

function measureSocketLatency(callback)
{
  if (!socket || !socket.connected) return;
  const startTime = Date.now();
  socket.emit('client:ping', startTime, () =>
  {
    const latency = Math.max(0, Date.now() - startTime);
    currentSocketLatency = latency;
    updateStatusDotAndTooltip();
    if (typeof callback === 'function') callback(latency);
  });
}

function startLatencyPings()
{
  if (latencyPingTimer) clearInterval(latencyPingTimer);
  measureSocketLatency();
  latencyPingTimer = setInterval(() =>
  {
    if (socket && socket.connected)
    {
      measureSocketLatency();
    }
  }, 3000);
}

function stopLatencyPings()
{
  if (latencyPingTimer)
  {
    clearInterval(latencyPingTimer);
    latencyPingTimer = null;
  }
}

// Status Tooltip Popup Manager
let statusTooltipTimeout = null;
function showStatusTooltip(message, isOnline)
{
  let tooltip = document.getElementById('server-status-tooltip');
  if (!tooltip)
  {
    tooltip = document.createElement('div');
    tooltip.id = 'server-status-tooltip';
    tooltip.className = 'server-status-tooltip';
    document.body.appendChild(tooltip);
  }

  const displayText = message || (isOnline ? getConnectedTooltipText() : '● Reconnecting to Server...');
  tooltip.textContent = displayText;
  tooltip.className = `server-status-tooltip visible ${isOnline ? 'online' : 'offline'}`;

  // Anchor tooltip directly below the server status dot with viewport boundary awareness
  if (serverStatusDot)
  {
    const rect = serverStatusDot.getBoundingClientRect();
    const dotCenterX = rect.left + (rect.width / 2);
    const tooltipWidth = tooltip.offsetWidth || 150;
    const padding = 10;

    // Center tooltip under dot, clamped within window bounds
    const desiredLeft = dotCenterX - (tooltipWidth / 2);
    const maxLeft = Math.max(padding, window.innerWidth - tooltipWidth - padding);
    const clampedLeft = Math.max(padding, Math.min(maxLeft, desiredLeft));

    // Calculate the caret arrow's horizontal position relative to tooltip box
    const arrowOffset = Math.max(12, Math.min(tooltipWidth - 12, dotCenterX - clampedLeft));

    tooltip.style.left = `${Math.round(clampedLeft)}px`;
    tooltip.style.top = `${Math.round(rect.bottom + 8)}px`;
    tooltip.style.setProperty('--arrow-x', `${Math.round(arrowOffset)}px`);
  }

  clearTimeout(statusTooltipTimeout);
  statusTooltipTimeout = setTimeout(() =>
  {
    tooltip.classList.remove('visible');
  }, 2800);
}

if (serverStatusDot)
{
  serverStatusDot.addEventListener('mouseenter', () =>
  {
    const isOnline = socket && socket.connected && !serverStatusDot.classList.contains('disconnected');
    if (isOnline)
    {
      showStatusTooltip(getConnectedTooltipText(), true);
      measureSocketLatency((lat) =>
      {
        const tip = document.getElementById('server-status-tooltip');
        if (tip && tip.classList.contains('visible'))
        {
          tip.textContent = getConnectedTooltipText();
        }
      });
    }
    else
    {
      showStatusTooltip('● Reconnecting to Server...', false);
    }
  });

  serverStatusDot.addEventListener('mouseleave', () =>
  {
    const tooltip = document.getElementById('server-status-tooltip');
    if (tooltip)
    {
      tooltip.classList.remove('visible');
      clearTimeout(statusTooltipTimeout);
    }
  });
}

// Sync presenter state with server (authoritative REST fallback)
async function syncPresenterState()
{
  try
  {
    const res = await fetch('/api/state');
    if (res.ok)
    {
      const state = await res.json();
      liveState = state;
      window.liveState = state;
      updateLiveMonitor(state);
      highlightActiveInDecks(state);
      if (typeof updateVirtualSongList === 'function')
      {
        updateVirtualSongList(true);
      }
    }
  }
  catch (err)
  {
    console.warn('Could not sync presenter state:', err);
  }
}

// Instant wake-up reconnection handler
function handlePresenterWakeup()
{
  if (!socket) return;

  if (!socket.connected)
  {
    socket.connect();
  }
  else
  {
    // If socket claims it is connected, emit get:state to verify link & pull fresh slide
    socket.emit('get:state');
  }

  syncPresenterState();
}

// 1. Detect when tab/phone screen wakes up or becomes visible
document.addEventListener('visibilitychange', () =>
{
  if (document.visibilityState === 'visible')
  {
    handlePresenterWakeup();
  }
});

// 2. Handle page restoration from bfcache or standard page show
window.addEventListener('pageshow', (event) =>
{
  handlePresenterWakeup();
});

// 3. Window focus (user returns to browser or app window)
window.addEventListener('focus', () =>
{
  handlePresenterWakeup();
});

// 4. Device network restored (WiFi reconnected after sleep)
window.addEventListener('online', () =>
{
  handlePresenterWakeup();
});

// 5. Timer drift detection (detects OS sleep / freeze even without a visibility event)
let lastPresenterHeartbeat = Date.now();
setInterval(() =>
{
  const now = Date.now();
  const elapsed = now - lastPresenterHeartbeat;
  lastPresenterHeartbeat = now;
  if (elapsed > 7000)
  {
    handlePresenterWakeup();
  }
}, 2000);

if (socket)
{
  socket.on('connect', () =>
  {
    if (serverStatusDot)
    {
      serverStatusDot.classList.remove('disconnected');
      serverStatusDot.title = getConnectedStatusText();
    }
    showStatusTooltip(getConnectedTooltipText(), true);
    startLatencyPings();
    socket.emit('role:register', {
      role: 'presenter',
      screen: `${window.innerWidth}x${window.innerHeight}`
    });
    socket.emit('get:state');
  });

  socket.on('disconnect', () =>
  {
    stopLatencyPings();
    currentSocketLatency = null;
    if (serverStatusDot)
    {
      serverStatusDot.classList.add('disconnected');
      serverStatusDot.title = 'Disconnected from server';
    }
    showStatusTooltip('● Reconnecting to Server...', false);
  });

  socket.on('server:pong', (sentTime) =>
  {
    const start = Number(sentTime) || Date.now();
    currentSocketLatency = Math.max(0, Date.now() - start);
    updateStatusDotAndTooltip();
  });

  socket.on('display:update', (state) =>
  {
    const prevSongId = lastLiveSongId;
    liveState = state;
    window.liveState = state;
    updateLiveMonitor(state);
    highlightActiveInDecks(state);
    
    // If the live song changed or switched between song and scripture/clear, refresh the virtual list
    const currentSongId = (state && state.status === 'live' && state.type === 'song') ? Number(state.songId) : null;
    if (typeof updateVirtualSongList === 'function' && prevSongId !== currentSongId)
    {
      updateVirtualSongList(true);
    }

    if (typeof handleLiveStateForRecents === 'function')
    {
      handleLiveStateForRecents(state);
    }
  });

  socket.on('stats:update', (stats) =>
  {
    handleStatsUpdate(stats);
  });
}

function handleStatsUpdate(stats)
{
  if (!stats) return;
  const presenterCountEl = document.getElementById('count-presenters');
  const displayCountEl = document.getElementById('count-displays');
  if (presenterCountEl) presenterCountEl.textContent = stats.presenters || 0;
  if (displayCountEl) displayCountEl.textContent = stats.displays || 0;
}

function updateLiveMonitor(state)
{
  if (!state || !liveStatusBadge) return;

  const isNoSlide = state.status === 'clear' || state.type === 'none' || !state.lines || state.lines.length === 0;

  if (isNoSlide)
  {
    liveStatusBadge.className = 'live-badge badge-clear';
    liveStatusBadge.textContent = 'NO SLIDE';
    if (liveTitleText) liveTitleText.textContent = 'No slide presented';
    if (liveLineText) liveLineText.textContent = 'Select a slide or verse to present';
  }
  else
  {
    liveStatusBadge.className = 'live-badge badge-live';
    liveStatusBadge.textContent = 'LIVE';
    if (liveTitleText)
    {
      if (state.type === 'bible')
      {
        if (state.verseInfo && state.verseInfo.chNum && state.verseInfo.verseNum)
        {
          const baseBook = (state.title || '').replace(/\s+\d+:\d+.*$/, '').trim() || 'Scripture';
          const formattedTitle = `${baseBook} ${state.verseInfo.chNum}:${state.verseInfo.verseNum}`;
          liveTitleText.textContent = formattedTitle;
          liveTitleText.title = formattedTitle;
        }
        else
        {
          liveTitleText.textContent = state.title || 'Live Scripture';
          liveTitleText.title = state.title || 'Live Scripture';
        }
      }
      else
      {
        liveTitleText.textContent = state.title || 'Live Presentation';
        liveTitleText.title = state.title || 'Live Presentation';
      }
    }
    const firstLine = (state.lines && state.lines.length > 0) ? state.lines[0] : (state.reference || '');
    if (liveLineText)
    {
      liveLineText.textContent = firstLine || 'Ready for presentation';
      liveLineText.title = firstLine || 'Ready for presentation';
    }
  }
}

function isSameBibleVersion(v1, v2)
{
  if (!v1 || !v2) return false;
  const clean1 = String(v1).replace(/\.db$/i, '').trim().toLowerCase();
  const clean2 = String(v2).replace(/\.db$/i, '').trim().toLowerCase();
  return clean1 === clean2;
}

// Direct active element references for ultra-fast O(1) DOM updates without layout thrashing
let lastLiveSongCard = null;
let lastLiveBibleCard = null;
let lastLiveVerseBtn = null;
let lastLiveBookBtn = null;
let lastLiveChapterBtn = null;
let lastLiveSongItem = null;
let lastLiveSongId = null;
let lastLiveVerseKey = null;

function highlightActiveInDecks(state)
{
  if (!state) return;

  const isLive = state.status === 'live' && state.type !== 'none';
  const liveVerse = (isLive && state.type === 'bible' && state.verseInfo) ? state.verseInfo : null;

  // 1. Song Slide Deck: direct index toggle and clean any non-active live cards
  const slideDeckSongsEl = document.getElementById('slide-deck-songs') || (typeof slideDeckContainer !== 'undefined' ? slideDeckContainer : null);
  if (slideDeckSongsEl)
  {
    const isThisSong = isLive && selectedSongId && Number(state.songId) === Number(selectedSongId);
    const targetIndex = isThisSong ? (Number(state.slideIndex) - 1) : -1;
    const targetCard = (isThisSong && targetIndex >= 0 && targetIndex < slideDeckSongsEl.children.length)
      ? slideDeckSongsEl.children[targetIndex]
      : null;

    if (lastLiveSongCard && lastLiveSongCard !== targetCard)
    {
      lastLiveSongCard.classList.remove('live');
      const badge = lastLiveSongCard.querySelector('.slide-card-badge');
      if (badge) badge.style.display = 'none';
      lastLiveSongCard = null;
    }

    if (targetCard)
    {
      targetCard.classList.add('live');
      const badge = targetCard.querySelector('.slide-card-badge');
      if (badge) badge.style.display = 'inline-block';
      lastLiveSongCard = targetCard;
    }
  }

  // 2. Song Item in left list (search results and songs list)
  const currentSongId = (isLive && state.type === 'song') ? Number(state.songId) : null;
  const songListContainer = document.getElementById('song-list-container');
  if (songListContainer)
  {
    if (lastLiveSongItem && (!currentSongId || Number(lastLiveSongItem.getAttribute('data-id')) !== currentSongId))
    {
      lastLiveSongItem.classList.remove('live');
      lastLiveSongItem = null;
    }

    if (currentSongId)
    {
      const targetItem = songListContainer.querySelector(`.song-searchresult[data-id="${currentSongId}"], .song-item[data-id="${currentSongId}"]`);
      if (targetItem && !targetItem.classList.contains('live'))
      {
        targetItem.classList.add('live');
      }
      lastLiveSongItem = targetItem || null;
    }
  }
  lastLiveSongId = currentSongId;

  // 3. Bible Chapter Slide Deck: direct index toggle and clean any non-active live cards
  const curVersion = (typeof selectedBibleVersionId !== 'undefined' && selectedBibleVersionId)
    ? selectedBibleVersionId
    : (typeof window !== 'undefined' ? window.selectedBibleVersionId : null);
  const liveVersion = liveVerse ? (liveVerse.versionId || liveVerse.version) : null;
  const isSameVersion = isSameBibleVersion(liveVersion, curVersion);

  if (typeof slideDeckBible !== 'undefined' && slideDeckBible)
  {
    const isCurrentChapter = isSameVersion && liveVerse &&
      Number(liveVerse.bookNum) === Number(selectedBookNumber) &&
      Number(liveVerse.chNum) === Number(selectedChapterNumber);

    const targetVerseIndex = isCurrentChapter ? (Number(liveVerse.verseNum) - 1) : -1;
    const targetBibleCard = (isCurrentChapter && targetVerseIndex >= 0 && targetVerseIndex < slideDeckBible.children.length)
      ? slideDeckBible.children[targetVerseIndex]
      : null;

    if (lastLiveBibleCard && lastLiveBibleCard !== targetBibleCard)
    {
      lastLiveBibleCard.classList.remove('live');
      const badge = lastLiveBibleCard.querySelector('.slide-card-badge');
      if (badge) badge.style.display = 'none';
      lastLiveBibleCard = null;
    }

    if (targetBibleCard)
    {
      targetBibleCard.classList.add('live');
      const badge = targetBibleCard.querySelector('.slide-card-badge');
      if (badge) badge.style.display = 'inline-block';
      lastLiveBibleCard = targetBibleCard;
    }
  }

  // 4. Bible Navigation Buttons (Book, Chapter, Verse): update when key changes or DOM was regenerated
  const currentVerseKey = (isSameVersion && liveVerse)
    ? `${liveVersion}:${liveVerse.bookNum}:${liveVerse.chNum}:${liveVerse.verseNum}`
    : null;
  const isNavDomDetached = (lastLiveVerseBtn && !document.contains(lastLiveVerseBtn)) ||
    (lastLiveChapterBtn && !document.contains(lastLiveChapterBtn)) ||
    (lastLiveBookBtn && !document.contains(lastLiveBookBtn));

  if (currentVerseKey !== lastLiveVerseKey || isNavDomDetached || !currentVerseKey)
  {
    // Verse button
    if (typeof bibleVersesList !== 'undefined' && bibleVersesList)
    {
      if (lastLiveVerseBtn)
      {
        lastLiveVerseBtn.classList.remove('live');
        lastLiveVerseBtn = null;
      }
      if (!isSameVersion)
      {
        bibleVersesList.querySelectorAll('.number-button.live').forEach(btn => btn.classList.remove('live'));
      }
      else
      {
        const isLiveCh = liveVerse &&
          Number(liveVerse.bookNum) === Number(selectedBookNumber) &&
          Number(liveVerse.chNum) === Number(selectedChapterNumber);
        if (isLiveCh)
        {
          const vIdx = Number(liveVerse.verseNum) - 1;
          if (vIdx >= 0 && vIdx < bibleVersesList.children.length)
          {
            const btn = bibleVersesList.children[vIdx];
            btn.classList.add('live');
            lastLiveVerseBtn = btn;
          }
        }
      }
    }

    // Chapter button
    if (typeof bibleChaptersList !== 'undefined' && bibleChaptersList)
    {
      if (lastLiveChapterBtn)
      {
        lastLiveChapterBtn.classList.remove('live');
        lastLiveChapterBtn = null;
      }
      if (!isSameVersion)
      {
        bibleChaptersList.querySelectorAll('.number-button.live').forEach(btn => btn.classList.remove('live'));
      }
      else
      {
        const isLiveBk = liveVerse && Number(liveVerse.bookNum) === Number(selectedBookNumber);
        if (isLiveBk)
        {
          const chIdx = Number(liveVerse.chNum) - 1;
          if (chIdx >= 0 && chIdx < bibleChaptersList.children.length)
          {
            const btn = bibleChaptersList.children[chIdx];
            btn.classList.add('live');
            lastLiveChapterBtn = btn;
          }
        }
      }
    }

    // Book button
    if (typeof bibleBooksList !== 'undefined' && bibleBooksList)
    {
      if (lastLiveBookBtn)
      {
        lastLiveBookBtn.classList.remove('live');
        lastLiveBookBtn = null;
      }
      if (!isSameVersion)
      {
        bibleBooksList.querySelectorAll('.book-button.live').forEach(btn => btn.classList.remove('live'));
      }
      else if (liveVerse)
      {
        const bIdx = Number(liveVerse.bookNum) - 1;
        if (bIdx >= 0 && bIdx < bibleBooksList.children.length)
        {
          const btn = bibleBooksList.children[bIdx];
          btn.classList.add('live');
          lastLiveBookBtn = btn;
        }
      }
    }

    lastLiveVerseKey = currentVerseKey;
  }

  // 5. Bible Search Results List live highlighting synchronization
  const bibleSearchResultsList = document.getElementById('bible-search-tab-results-list');
  if (bibleSearchResultsList)
  {
    bibleSearchResultsList.querySelectorAll('.slide-card').forEach((card) =>
    {
      const cardBook = card.getAttribute('data-book-num');
      const cardCh = card.getAttribute('data-ch-num');
      const cardVerse = card.getAttribute('data-verse-num');

      const isMatch = isLive && liveVerse && isSameVersion &&
        cardBook && Number(cardBook) === Number(liveVerse.bookNum) &&
        cardCh && Number(cardCh) === Number(liveVerse.chNum) &&
        cardVerse && Number(cardVerse) === Number(liveVerse.verseNum);

      if (isMatch)
      {
        if (!card.classList.contains('live')) card.classList.add('live');
      }
      else
      {
        if (card.classList.contains('live')) card.classList.remove('live');
      }
    });
  }
}
