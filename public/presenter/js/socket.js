// ===========================================================================
// Presenter Console — Real-Time Socket.io Communications
// ===========================================================================

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

  // Anchor tooltip directly below the server status dot
  if (serverStatusDot)
  {
    const rect = serverStatusDot.getBoundingClientRect();
    tooltip.style.left = `${Math.max(12, rect.left + rect.width / 2 - 60)}px`;
    tooltip.style.top = `${rect.bottom + 8}px`;
  }

  tooltip.textContent = message;
  tooltip.className = `server-status-tooltip visible ${isOnline ? 'online' : 'offline'}`;

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
    const isOnline = !serverStatusDot.classList.contains('disconnected');
    showStatusTooltip(isOnline ? '● Connected to Server' : '● Reconnecting to Server...', isOnline);
  });
}

// Handle bfcache restoration (Back-Forward Cache) for Presenter
window.addEventListener('pageshow', async (event) =>
{
  if (event.persisted)
  {
    // Page was restored from bfcache: reconnect socket and fetch latest state
    if (socket && !socket.connected)
    {
      socket.connect();
    }
    try
    {
      const res = await fetch('/api/state');
      if (res.ok)
      {
        const state = await res.json();
        liveState = state;
        updateLiveMonitor(state);
        highlightActiveInDecks(state);
      }
    }
    catch (err)
    {
      console.warn('Could not sync state after bfcache restore:', err);
    }
  }
});

if (socket)
{
  socket.on('connect', () =>
  {
    if (serverStatusDot)
    {
      serverStatusDot.classList.remove('disconnected');
      serverStatusDot.title = 'Connected to Presentation Server';
    }
    showStatusTooltip('● Connected to Server', true);
    socket.emit('role:register', {
      role: 'presenter',
      screen: `${window.innerWidth}x${window.innerHeight}`
    });
  });

  socket.on('disconnect', () =>
  {
    if (serverStatusDot)
    {
      serverStatusDot.classList.add('disconnected');
      serverStatusDot.title = 'Disconnected from server';
    }
    showStatusTooltip('● Reconnecting to Server...', false);
  });

  socket.on('display:update', (state) =>
  {
    liveState = state;
    updateLiveMonitor(state);
    highlightActiveInDecks(state);
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
    if (liveTitleText) liveTitleText.textContent = state.title || 'Live Presentation';
    const firstLine = (state.lines && state.lines.length > 0) ? state.lines[0] : (state.reference || '');
    if (liveLineText) liveLineText.textContent = firstLine || 'Ready for presentation';
  }
}

function highlightActiveInDecks(state)
{
  if (!state) return;

  const isLive = state.status === 'live' && state.type !== 'none';
  const liveVerse = (isLive && state.type === 'bible' && state.verseInfo) ? state.verseInfo : null;

  // Highlight in song slide deck
  document.querySelectorAll('.slide-card').forEach((card) =>
  {
    const sIndex = Number(card.getAttribute('data-slide-index'));
    const isThisSong = isLive && currentSong && Number(state.songId) === Number(currentSong.id);
    const active = isThisSong && sIndex === Number(state.slideIndex);
    card.classList.toggle('active-live', active);
    const badge = card.querySelector('.slide-card-badge');
    if (badge) badge.style.display = active ? 'inline-block' : 'none';
  });

  // Green highlight for Song items list in left panel
  const songListContainer = document.getElementById('song-list-container');
  if (songListContainer)
  {
    songListContainer.querySelectorAll('.song-item').forEach((it) =>
    {
      const songId = Number(it.getAttribute('data-id'));
      const isLiveSong = isLive && state.type === 'song' && Number(state.songId) === songId;
      it.classList.toggle('is-live-active', isLiveSong);
    });
  }

  // Highlight in vertical Bible chapter slide deck
  document.querySelectorAll('.slide-card-vertical').forEach((card) =>
  {
    const bNum = Number(card.getAttribute('data-book-num'));
    const cNum = Number(card.getAttribute('data-ch-num'));
    const vNum = Number(card.getAttribute('data-verse-num'));
    const isLiveVerse = liveVerse &&
      Number(liveVerse.bookNum) === bNum &&
      Number(liveVerse.chNum) === cNum &&
      Number(liveVerse.verseNum) === vNum;

    card.classList.toggle('is-live', isLiveVerse);
    const livePill = card.querySelector('.sc-live-pill');
    if (livePill) livePill.style.display = isLiveVerse ? 'inline-block' : 'none';
  });

  // Green highlight preview for Book list items
  if (bibleBooksList)
  {
    bibleBooksList.querySelectorAll('.book-item').forEach((it) =>
    {
      const bNum = Number(it.getAttribute('data-book-num'));
      const isLiveBook = liveVerse && bNum === Number(liveVerse.bookNum);
      it.classList.toggle('is-live-active', !!isLiveBook);
    });
  }

  // Green highlight preview for Chapter list buttons
  if (bibleChaptersList)
  {
    bibleChaptersList.querySelectorAll('.num-btn').forEach((btn) =>
    {
      const cNum = Number(btn.getAttribute('data-ch-num'));
      const isLiveChapter = liveVerse &&
        Number(liveVerse.bookNum) === Number(selectedBookNum) &&
        cNum === Number(liveVerse.chNum);
      btn.classList.toggle('is-live-active', !!isLiveChapter);
    });
  }

  // Green highlight preview for Verse list buttons
  if (bibleVersesList)
  {
    bibleVersesList.querySelectorAll('.num-btn').forEach((btn) =>
    {
      const vNum = Number(btn.getAttribute('data-verse-num'));
      const isLiveVerseBtn = liveVerse &&
        Number(liveVerse.bookNum) === Number(selectedBookNum) &&
        Number(liveVerse.chNum) === Number(selectedChapterNum) &&
        vNum === Number(liveVerse.verseNum);
      btn.classList.toggle('is-live-active', !!isLiveVerseBtn);
    });
  }
}
