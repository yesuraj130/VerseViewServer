// ===========================================================================
// VerseVIEW 10 Presenter — Real-Time Socket.io Communications
// ===========================================================================

if (socket) {
  socket.on('connect', () => {
    if (serverStatusDot) {
      serverStatusDot.classList.remove('disconnected');
      serverStatusDot.title = 'Connected to VerseVIEW Presentation Server';
    }
    socket.emit('role:register', {
      role: 'presenter',
      screen: `${window.innerWidth}x${window.innerHeight}`
    });
  });

  socket.on('disconnect', () => {
    if (serverStatusDot) {
      serverStatusDot.classList.add('disconnected');
      serverStatusDot.title = 'Disconnected from server';
    }
  });

  socket.on('display:update', (state) => {
    liveState = state;
    updateLiveMonitor(state);
    highlightActiveInDecks(state);
  });

  socket.on('stats:update', (stats) => {
    handleStatsUpdate(stats);
  });
}

function handleStatsUpdate(stats) {
  if (!stats) return;
  const presenterCountEl = document.getElementById('count-presenters');
  const displayCountEl = document.getElementById('count-displays');
  if (presenterCountEl) presenterCountEl.textContent = stats.presenters || 0;
  if (displayCountEl) displayCountEl.textContent = stats.displays || 0;
}

function updateLiveMonitor(state) {
  if (!state || !liveStatusBadge) return;

  const isNoSlide = state.status === 'clear' || state.type === 'none' || !state.lines || state.lines.length === 0;

  if (isNoSlide) {
    liveStatusBadge.className = 'live-badge badge-clear';
    liveStatusBadge.textContent = 'NO SLIDE';
    if (liveTitleText) liveTitleText.textContent = 'No slide presented';
    if (liveLineText) liveLineText.textContent = 'Select a slide or verse to present';
  } else {
    liveStatusBadge.className = 'live-badge badge-live';
    liveStatusBadge.textContent = 'LIVE';
    if (liveTitleText) liveTitleText.textContent = state.title || 'Live Presentation';
    const firstLine = (state.lines && state.lines.length > 0) ? state.lines[0] : (state.reference || '');
    if (liveLineText) liveLineText.textContent = firstLine || 'Ready for presentation';
  }
}

function highlightActiveInDecks(state) {
  if (!state) return;

  const isLive = state.status === 'live' && state.type !== 'none';

  // Highlight in song slide deck
  document.querySelectorAll('.slide-card').forEach((card) => {
    const sIndex = Number(card.getAttribute('data-slide-index'));
    const isThisSong = isLive && currentSong && Number(state.songId) === Number(currentSong.id);
    card.classList.toggle('active-live', isThisSong && sIndex === Number(state.slideIndex));
  });

  // Highlight in vertical Bible chapter slide deck
  document.querySelectorAll('.slide-card-vertical').forEach((card) => {
    const bNum = Number(card.getAttribute('data-book-num'));
    const cNum = Number(card.getAttribute('data-ch-num'));
    const vNum = Number(card.getAttribute('data-verse-num'));
    const isLiveVerse = isLive && state.verseInfo &&
      Number(state.verseInfo.bookNum) === bNum &&
      Number(state.verseInfo.chNum) === cNum &&
      Number(state.verseInfo.verseNum) === vNum;

    card.classList.toggle('is-live', isLiveVerse);
    const livePill = card.querySelector('.sc-live-pill');
    if (livePill) livePill.style.display = isLiveVerse ? 'inline-block' : 'none';
  });

  // Highlight active tile in verse list
  if (bibleVersesList) {
    bibleVersesList.querySelectorAll('.vv-num-btn').forEach((btn) => {
      const vNum = Number(btn.getAttribute('data-verse-num'));
      const isLiveTile = isLive && state.verseInfo && vNum === Number(state.verseInfo.verseNum);
      btn.classList.toggle('active', isLiveTile);
    });
  }
}
