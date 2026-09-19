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
    liveState = state;
    window.liveState = state;
    updateLiveMonitor(state);
    highlightActiveInDecks(state);
    if (typeof updateVirtualSongList === 'function' && state.type === 'song' && state.songId !== lastLiveSongId)
    {
      updateVirtualSongList(true);
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

  // 1. Song Slide Deck: direct index toggle without scanning entire deck
  const slideDeckSongsEl = document.getElementById('slide-deck-songs') || (typeof slideDeckContainer !== 'undefined' ? slideDeckContainer : null);
  if (slideDeckSongsEl)
  {
    const isThisSong = isLive && selectedSongId && Number(state.songId) === Number(selectedSongId);
    const targetIndex = isThisSong ? (Number(state.slideIndex) - 1) : -1;
    const newActiveCard = (targetIndex >= 0 && targetIndex < slideDeckSongsEl.children.length)
      ? slideDeckSongsEl.children[targetIndex]
      : null;

    if (lastLiveSongCard && lastLiveSongCard !== newActiveCard)
    {
      lastLiveSongCard.classList.remove('live');
      const oldBadge = lastLiveSongCard.querySelector('.slide-card-badge');
      if (oldBadge) oldBadge.style.display = 'none';
    }

    if (newActiveCard)
    {
      newActiveCard.classList.add('live');
      const newBadge = newActiveCard.querySelector('.slide-card-badge');
      if (newBadge) newBadge.style.display = 'inline-block';
    }
    lastLiveSongCard = newActiveCard;
  }

  // 2. Song Item in left list: direct update only when song ID changes
  const currentSongId = (isLive && state.type === 'song') ? Number(state.songId) : null;
  if (currentSongId !== lastLiveSongId)
  {
    const songListContainer = document.getElementById('song-list-container');
    if (lastLiveSongItem)
    {
      lastLiveSongItem.classList.remove('live');
      lastLiveSongItem = null;
    }
    if (currentSongId && songListContainer)
    {
      const targetItem = songListContainer.querySelector(`.song-searchresult[data-id="${currentSongId}"], .song-item[data-id="${currentSongId}"]`);
      if (targetItem)
      {
        targetItem.classList.add('live');
        lastLiveSongItem = targetItem;
      }
    }
    lastLiveSongId = currentSongId;
  }

  // 3. Bible Chapter Slide Deck: direct index toggle without scanning entire chapter
  if (typeof slideDeckBible !== 'undefined' && slideDeckBible)
  {
    const isCurrentChapter = liveVerse &&
      Number(liveVerse.bookNum) === Number(selectedBookNumber) &&
      Number(liveVerse.chNum) === Number(selectedChapterNumber);

    const targetVerseIndex = isCurrentChapter ? (Number(liveVerse.verseNum) - 1) : -1;
    const newActiveBibleCard = (targetVerseIndex >= 0 && targetVerseIndex < slideDeckBible.children.length)
      ? slideDeckBible.children[targetVerseIndex]
      : null;

    if (lastLiveBibleCard && lastLiveBibleCard !== newActiveBibleCard)
    {
      lastLiveBibleCard.classList.remove('live');
      const oldBadge = lastLiveBibleCard.querySelector('.slide-card-badge');
      if (oldBadge) oldBadge.style.display = 'none';
    }

    if (newActiveBibleCard)
    {
      newActiveBibleCard.classList.add('live');
      const newBadge = newActiveBibleCard.querySelector('.slide-card-badge');
      if (newBadge) newBadge.style.display = 'inline-block';
    }
    lastLiveBibleCard = newActiveBibleCard;
  }

  // 4. Bible Navigation Buttons (Book, Chapter, Verse): update only when key changes
  const currentVerseKey = liveVerse ? `${liveVerse.bookNum}:${liveVerse.chNum}:${liveVerse.verseNum}` : null;
  if (currentVerseKey !== lastLiveVerseKey)
  {
    // Verse button
    if (typeof bibleVersesList !== 'undefined' && bibleVersesList)
    {
      if (lastLiveVerseBtn)
      {
        lastLiveVerseBtn.classList.remove('live');
        lastLiveVerseBtn = null;
      }
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

    // Chapter button
    if (typeof bibleChaptersList !== 'undefined' && bibleChaptersList)
    {
      if (lastLiveChapterBtn)
      {
        lastLiveChapterBtn.classList.remove('live');
        lastLiveChapterBtn = null;
      }
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

    // Book button
    if (typeof bibleBooksList !== 'undefined' && bibleBooksList)
    {
      if (lastLiveBookBtn)
      {
        lastLiveBookBtn.classList.remove('live');
        lastLiveBookBtn = null;
      }
      if (liveVerse)
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
}
