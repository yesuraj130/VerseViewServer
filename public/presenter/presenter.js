
// Initialize Socket.io
const socket = (typeof io !== 'undefined') ? io() : null;

// Application State
let liveState = null;
let currentSong = null;
let currentSongSlides = [];
let activeSongSlideIndex = 1;
let currentBibleVerses = [];
let bibleVersions = [];
let selectedVersionId = 'tamil';
let selectedBookNum = null;
let selectedBookName = '';

// DOM Elements
const serverStatusDot = document.getElementById('server-status-dot');
const liveStatusBadge = document.getElementById('live-status-badge');
const liveTitleText = document.getElementById('live-title-text');
const liveLineText = document.getElementById('live-line-text');
const btnBlankScreen = document.getElementById('btn-blank-screen');
const btnClearText = document.getElementById('btn-clear-text');
const btnShowSlide = document.getElementById('btn-show-slide');
const btnPrevSlide = document.getElementById('btn-prev-slide');
const btnNextSlide = document.getElementById('btn-next-slide');

const songListContainer = document.getElementById('song-list-container');
const songSearchInput = document.getElementById('song-search-input');
const categoryChips = document.getElementById('category-chips');
const slideDeckContainer = document.getElementById('slide-deck-container');
const activeSongTitle = document.getElementById('active-song-title');
const activeSongCatBadge = document.getElementById('active-song-cat-badge');
const activeSlideCountIndicator = document.getElementById('active-slide-count-indicator');

const selectVersion = document.getElementById('select-version');
const selectBook = document.getElementById('select-book');
const selectChapter = document.getElementById('select-chapter');
const selectVerse = document.getElementById('select-verse');
const versePreviewContainer = document.getElementById('verse-preview-container');
const bibleQuickSearch = document.getElementById('bible-quick-search');

// Modal Elements
const songModal = document.getElementById('song-modal');
const modalSongTitle = document.getElementById('modal-song-title');
const modalSongId = document.getElementById('modal-song-id');
const modalInputTitle = document.getElementById('modal-input-title');
const modalInputCat = document.getElementById('modal-input-cat');
const modalInputLyrics = document.getElementById('modal-input-lyrics');
const modalInputLyrics2 = document.getElementById('modal-input-lyrics2');
const btnOpenAddSong = document.getElementById('btn-open-add-song');
const btnCloseSongModal = document.getElementById('btn-close-song-modal');
const btnCancelSongModal = document.getElementById('btn-cancel-song-modal');
const btnSaveSong = document.getElementById('btn-save-song');
const btnInsertSlide = document.getElementById('btn-insert-slide');
const btnInsertBr = document.getElementById('btn-insert-br');
const btnAutoFormatStanzas = document.getElementById('btn-auto-format-stanzas');

// ---------------------------------------------------------------------------
// 1. Socket.io Event Handling
// ---------------------------------------------------------------------------
if (socket) {
  socket.on('connect', () => {
    if (serverStatusDot) {
      serverStatusDot.classList.remove('disconnected');
      serverStatusDot.title = 'Connected to Presentation Server';
    }
    socket.emit('role:register', { role: 'presenter' });
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
}

// ---------------------------------------------------------------------------
// 2. UI Updates for Live Monitor and Controls
// ---------------------------------------------------------------------------
function updateLiveMonitor(state) {
  if (!state) return;

  if (state.status === 'blank') {
    liveStatusBadge.className = 'live-badge badge-blank';
    liveStatusBadge.textContent = 'BLANKED';
    btnBlankScreen.classList.add('active');
    btnClearText.classList.remove('active');
  } else if (state.status === 'clear') {
    liveStatusBadge.className = 'live-badge badge-clear';
    liveStatusBadge.textContent = 'CLEARED';
    btnClearText.classList.add('active');
    btnBlankScreen.classList.remove('active');
  } else {
    liveStatusBadge.className = 'live-badge badge-live';
    liveStatusBadge.textContent = 'LIVE';
    btnBlankScreen.classList.remove('active');
    btnClearText.classList.remove('active');
  }

  liveTitleText.textContent = state.title || 'Screen Ready';
  const firstLine = (state.lines && state.lines.length > 0) ? state.lines[0] : (state.reference || '');
  liveLineText.textContent = firstLine || 'No content';
}

function highlightActiveInDecks(state) {
  if (!state) return;

  // Highlight in slide deck
  const slideCards = document.querySelectorAll('.slide-card');
  slideCards.forEach((card) => {
    const sIndex = Number(card.getAttribute('data-slide-index'));
    const isThisSong = currentSong && Number(state.songId) === Number(currentSong.id);
    if (isThisSong && sIndex === Number(state.slideIndex) && state.status === 'live') {
      card.classList.add('active-live');
    } else {
      card.classList.remove('active-live');
    }
  });

  // Highlight in verse preview
  const verseCards = document.querySelectorAll('.verse-card');
  verseCards.forEach((card) => {
    const bNum = Number(card.getAttribute('data-book-num'));
    const cNum = Number(card.getAttribute('data-ch-num'));
    const vNum = Number(card.getAttribute('data-verse-num'));
    if (
      state.verseInfo &&
      Number(state.verseInfo.bookNum) === bNum &&
      Number(state.verseInfo.chNum) === cNum &&
      Number(state.verseInfo.verseNum) === vNum &&
      state.status === 'live'
    ) {
      card.classList.add('active-live');
    } else {
      card.classList.remove('active-live');
    }
  });
}

// ---------------------------------------------------------------------------
// 3. Songs Management & Library
// ---------------------------------------------------------------------------
let selectedCategory = 'All';

async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    const categories = await res.json();
    renderCategoryChips(categories);
  } catch (err) {
    console.error('Error loading categories:', err);
  }
}

function renderCategoryChips(categories) {
  categoryChips.innerHTML = '<span class="chip active" data-cat="All">All</span>';
  categories.forEach((cat) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.setAttribute('data-cat', cat);
    chip.textContent = cat;
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      selectedCategory = cat;
      loadSongs(songSearchInput.value, selectedCategory);
    });
    categoryChips.appendChild(chip);
  });

  // Re-attach All click
  const allChip = categoryChips.querySelector('[data-cat="All"]');
  allChip.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    allChip.classList.add('active');
    selectedCategory = 'All';
    loadSongs(songSearchInput.value, 'All');
  });
}

async function loadSongs(q = '', cat = 'All') {
  try {
    let url = `/api/songs?`;
    if (q) url += `q=${encodeURIComponent(q)}&`;
    if (cat && cat !== 'All') url += `cat=${encodeURIComponent(cat)}`;

    const res = await fetch(url);
    const songs = await res.json();
    renderSongList(songs);

    // If no song is active and songs exist, select first song automatically
    if (!currentSong && songs.length > 0) {
      selectSong(songs[0].id);
    }
  } catch (err) {
    console.error('Error loading songs:', err);
  }
}

function renderSongList(songs) {
  songListContainer.innerHTML = '';
  if (!songs || songs.length === 0) {
    songListContainer.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">No songs found. Click "+ Add Song" above.</div>';
    return;
  }

  songs.forEach((song) => {
    const item = document.createElement('div');
    item.className = 'song-item';
    if (currentSong && currentSong.id === song.id) {
      item.classList.add('selected');
    }

    item.innerHTML = `
      <div class="song-item-info">
        <div class="song-item-name">${escapeHtml(song.name)}</div>
        <div class="song-item-meta">
          <span>${escapeHtml(song.cat || 'General')}</span>
          <span>•</span>
          <span>${song.slideCount} slides</span>
        </div>
      </div>
      <div class="song-actions">
        <button class="btn-icon-tiny btn-edit-song" title="Edit Song" data-id="${song.id}">✏️</button>
        <button class="btn-icon-tiny btn-delete-song" title="Delete Song" data-id="${song.id}">🗑️</button>
      </div>
    `;

    // Click item to load into stage
    item.addEventListener('click', (e) => {
      if (e.target.closest('.btn-edit-song') || e.target.closest('.btn-delete-song')) return;
      document.querySelectorAll('.song-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      selectSong(song.id);
    });

    // Edit button
    const editBtn = item.querySelector('.btn-edit-song');
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditSongModal(song.id);
    });

    // Delete button
    const delBtn = item.querySelector('.btn-delete-song');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Delete song "${song.name}"?`)) {
        deleteSong(song.id);
      }
    });

    songListContainer.appendChild(item);
  });
}

async function selectSong(songId) {
  try {
    const res = await fetch(`/api/songs/${songId}`);
    const song = await res.json();
    currentSong = song;
    currentSongSlides = song.slides || [];
    activeSongSlideIndex = 1;

    activeSongTitle.textContent = song.name;
    activeSongCatBadge.textContent = song.cat || 'General';
    activeSongCatBadge.style.display = 'inline-block';
    activeSlideCountIndicator.textContent = `${currentSongSlides.length} slides`;

    renderSlideDeck(currentSong, currentSongSlides);
  } catch (err) {
    console.error('Error selecting song:', err);
  }
}

function renderSlideDeck(song, slides) {
  slideDeckContainer.innerHTML = '';
  if (!slides || slides.length === 0) {
    slideDeckContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 48px;">This song has no slides.</div>';
    return;
  }

  slides.forEach((slide) => {
    const card = document.createElement('div');
    card.className = 'slide-card';
    card.setAttribute('data-slide-index', slide.slideIndex);

    // Check if live
    const isLive = liveState && Number(liveState.songId) === Number(song.id) && Number(liveState.slideIndex) === Number(slide.slideIndex) && liveState.status === 'live';
    if (isLive) {
      card.classList.add('active-live');
    }

    const linesHtml = slide.lines.map(line => `<div>${escapeHtml(line)}</div>`).join('');

    card.innerHTML = `
      <div class="slide-card-header">
        <span class="slide-card-num">Slide ${slide.slideIndex} of ${slides.length}</span>
        ${isLive ? '<span class="slide-card-badge">LIVE</span>' : ''}
      </div>
      <div class="slide-card-content">
        ${linesHtml}
      </div>
    `;

    // Last-click-wins pattern: immediately present to screen
    card.addEventListener('click', () => {
      presentSlide(song, slide.slideIndex, slide);
    });

    slideDeckContainer.appendChild(card);
  });
}

function presentSlide(song, slideIndex, slideObj) {
  activeSongSlideIndex = slideIndex;
  const total = currentSongSlides.length;
  const payload = {
    type: 'song',
    title: song.name,
    reference: `${song.cat || 'Song'} • Slide ${slideIndex} of ${total}`,
    lines: slideObj.lines,
    rawSlide: slideObj.rawSlide,
    slideIndex: slideIndex,
    totalSlides: total,
    songId: song.id,
    verseInfo: null
  };

  if (socket) {
    socket.emit('action:present', payload);
  } else {
    fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }
}

// ---------------------------------------------------------------------------
// 4. Bible Lookup (Cascading Dropdowns)
// ---------------------------------------------------------------------------
async function initBibleDropdowns() {
  try {
    const res = await fetch('/api/bible/versions');
    bibleVersions = await res.json();
    
    selectVersion.innerHTML = '';
    bibleVersions.forEach((ver) => {
      const opt = document.createElement('option');
      opt.value = ver.id;
      opt.textContent = ver.available ? ver.name : `${ver.name} (DB missing)`;
      if (!ver.available) {
        opt.style.color = '#94a3b8';
      }
      selectVersion.appendChild(opt);
    });

    const firstAvailable = bibleVersions.find(v => v.available) || bibleVersions[0];
    if (firstAvailable) {
      selectedVersionId = firstAvailable.id;
      selectVersion.value = firstAvailable.id;
      await loadBooks(selectedVersionId);
    }
  } catch (err) {
    console.error('Error initializing Bible versions:', err);
  }
}

async function loadBooks(versionId) {
  try {
    const res = await fetch(`/api/bible/${versionId}/books`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      versePreviewContainer.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">${escapeHtml(errData.error || 'Database for this version is not installed.')}</div>`;
      selectBook.innerHTML = '<option value="">(No Database)</option>';
      selectChapter.innerHTML = '<option value="">Ch</option>';
      selectVerse.innerHTML = '<option value="">Verse</option>';
      return;
    }
    const data = await res.json();
    
    selectBook.innerHTML = '<option value="">Select Book...</option>';
    (data.books || []).forEach((b) => {
      const opt = document.createElement('option');
      opt.value = b.bookNum;
      opt.textContent = `${b.bookNum}. ${b.name}`;
      selectBook.appendChild(opt);
    });

    // Default select John (Book 43) or first available
    const defaultBook = (data.books || []).find(b => b.bookNum === 43) || (data.books && data.books[0]);
    if (defaultBook) {
      selectBook.value = defaultBook.bookNum;
      selectedBookNum = defaultBook.bookNum;
      selectedBookName = defaultBook.name;
      await loadChapters(versionId, selectedBookNum);
    }
  } catch (err) {
    console.error('Error loading Bible books:', err);
  }
}

async function loadChapters(versionId, bookNum) {
  try {
    const res = await fetch(`/api/bible/${versionId}/chapters?bookNum=${bookNum}`);
    const chapters = await res.json();

    selectChapter.innerHTML = '<option value="">Select Ch</option>';
    chapters.forEach((ch) => {
      const opt = document.createElement('option');
      opt.value = ch;
      opt.textContent = `Ch ${ch}`;
      selectChapter.appendChild(opt);
    });

    if (chapters.length > 0) {
      // Pick chapter 3 if John or 1
      const defaultCh = chapters.includes(3) ? 3 : chapters[0];
      selectChapter.value = defaultCh;
      await loadVerses(versionId, bookNum, defaultCh);
    }
  } catch (err) {
    console.error('Error loading Bible chapters:', err);
  }
}

async function loadVerses(versionId, bookNum, chNum) {
  try {
    // Load verse numbers for dropdown
    const resVerses = await fetch(`/api/bible/${versionId}/verses?bookNum=${bookNum}&chNum=${chNum}`);
    const verses = await resVerses.json();

    selectVerse.innerHTML = '<option value="">All Verses</option>';
    verses.forEach((v) => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = `Verse ${v}`;
      selectVerse.appendChild(opt);
    });

    // Fetch full verse text for preview list
    const resText = await fetch(`/api/bible/${versionId}/text?bookNum=${bookNum}&chNum=${chNum}`);
    const data = await resText.json();
    currentBibleVerses = data.verses || [];
    renderVerseCards(currentBibleVerses, data.bookName, chNum);
  } catch (err) {
    console.error('Error loading Bible verses:', err);
  }
}

function renderVerseCards(verses, bookName, chNum) {
  versePreviewContainer.innerHTML = '';
  if (!verses || verses.length === 0) {
    versePreviewContainer.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">No verses found for this chapter.</div>';
    return;
  }

  verses.forEach((v) => {
    const card = document.createElement('div');
    card.className = 'verse-card';
    card.setAttribute('data-book-num', v.bookNum);
    card.setAttribute('data-ch-num', v.chNum);
    card.setAttribute('data-verse-num', v.verseNum);

    const isLive = liveState && liveState.verseInfo &&
      Number(liveState.verseInfo.bookNum) === Number(v.bookNum) &&
      Number(liveState.verseInfo.chNum) === Number(v.chNum) &&
      Number(liveState.verseInfo.verseNum) === Number(v.verseNum) &&
      liveState.status === 'live';

    if (isLive) card.classList.add('active-live');

    card.innerHTML = `
      <div class="verse-header">
        <span class="verse-ref">${escapeHtml(bookName)} ${v.chNum}:${v.verseNum}</span>
        <button class="btn-primary" style="padding: 3px 8px; font-size: 11px;">Present</button>
      </div>
      <div class="verse-text">${escapeHtml(v.word)}</div>
    `;

    card.addEventListener('click', () => {
      presentVerse(selectedVersionId, bookName, v);
    });

    versePreviewContainer.appendChild(card);
  });
}

function presentVerse(versionId, bookName, verseObj) {
  const verObj = bibleVersions.find(v => v.id === versionId);
  const verName = verObj ? verObj.name : 'Bible';
  const refText = `${bookName} ${verseObj.chNum}:${verseObj.verseNum} (${verName})`;

  const payload = {
    type: 'bible',
    title: `${bookName} ${verseObj.chNum}:${verseObj.verseNum}`,
    reference: refText,
    lines: [verseObj.word],
    rawSlide: verseObj.word,
    slideIndex: 1,
    totalSlides: 1,
    songId: null,
    verseInfo: {
      bookNum: verseObj.bookNum,
      chNum: verseObj.chNum,
      verseNum: verseObj.verseNum,
      version: versionId
    }
  };

  if (socket) {
    socket.emit('action:present', payload);
  } else {
    fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }
}

// ---------------------------------------------------------------------------
// 5. Real-Time Action Controls (Blank, Clear, Show, Next, Prev)
// ---------------------------------------------------------------------------
btnBlankScreen.addEventListener('click', () => {
  if (socket) socket.emit('action:blank');
});

btnClearText.addEventListener('click', () => {
  if (socket) socket.emit('action:clear');
});

btnShowSlide.addEventListener('click', () => {
  if (socket) socket.emit('action:show');
});

btnNextSlide.addEventListener('click', () => {
  if (currentSong && currentSongSlides.length > 0) {
    if (activeSongSlideIndex < currentSongSlides.length) {
      const nextIdx = activeSongSlideIndex + 1;
      presentSlide(currentSong, nextIdx, currentSongSlides[nextIdx - 1]);
    }
  }
});

btnPrevSlide.addEventListener('click', () => {
  if (currentSong && currentSongSlides.length > 0) {
    if (activeSongSlideIndex > 1) {
      const prevIdx = activeSongSlideIndex - 1;
      presentSlide(currentSong, prevIdx, currentSongSlides[prevIdx - 1]);
    }
  }
});

// Keyboard Navigation Shortcuts
window.addEventListener('keydown', (e) => {
  // If typing in input, ignore global shortcuts
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
    return;
  }

  if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
    e.preventDefault();
    btnNextSlide.click();
  } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
    e.preventDefault();
    btnPrevSlide.click();
  } else if (e.key === 'b' || e.key === 'B') {
    e.preventDefault();
    btnBlankScreen.click();
  } else if (e.key === 'c' || e.key === 'C') {
    e.preventDefault();
    btnClearText.click();
  } else if (e.key === 's' || e.key === 'S') {
    e.preventDefault();
    btnShowSlide.click();
  }
});

// ---------------------------------------------------------------------------
// 6. Cascading Dropdown Change Listeners
// ---------------------------------------------------------------------------
selectVersion.addEventListener('change', async () => {
  selectedVersionId = selectVersion.value;
  await loadBooks(selectedVersionId);
});

selectBook.addEventListener('change', async () => {
  selectedBookNum = Number(selectBook.value);
  const selOpt = selectBook.options[selectBook.selectedIndex];
  selectedBookName = selOpt ? selOpt.textContent : '';
  if (selectedBookNum) {
    await loadChapters(selectedVersionId, selectedBookNum);
  }
});

selectChapter.addEventListener('change', async () => {
  const chNum = Number(selectChapter.value);
  if (selectedBookNum && chNum) {
    await loadVerses(selectedVersionId, selectedBookNum, chNum);
  }
});

selectVerse.addEventListener('change', () => {
  const vNum = Number(selectVerse.value);
  if (!vNum) {
    renderVerseCards(currentBibleVerses, selectedBookName, Number(selectChapter.value));
  } else {
    const singleVerse = currentBibleVerses.filter(v => Number(v.verseNum) === vNum);
    renderVerseCards(singleVerse, selectedBookName, Number(selectChapter.value));
  }
});

// Bible Quick Search
let bibleSearchDebounce = null;
bibleQuickSearch.addEventListener('input', () => {
  clearTimeout(bibleSearchDebounce);
  bibleSearchDebounce = setTimeout(async () => {
    const q = bibleQuickSearch.value.trim();
    if (!q) {
      if (selectedBookNum && selectChapter.value) {
        loadVerses(selectedVersionId, selectedBookNum, Number(selectChapter.value));
      }
      return;
    }
    try {
      const res = await fetch(`/api/bible/${selectedVersionId}/search?q=${encodeURIComponent(q)}`);
      const results = await res.json();
      renderVerseSearchResults(results);
    } catch (err) {
      console.error('Search error:', err);
    }
  }, 250);
});

function renderVerseSearchResults(results) {
  versePreviewContainer.innerHTML = '';
  if (!results || results.length === 0) {
    versePreviewContainer.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">No matching verses found.</div>';
    return;
  }

  results.forEach((v) => {
    const card = document.createElement('div');
    card.className = 'verse-card';
    card.innerHTML = `
      <div class="verse-header">
        <span class="verse-ref">${escapeHtml(v.reference)}</span>
        <button class="btn-primary" style="padding: 3px 8px; font-size: 11px;">Present</button>
      </div>
      <div class="verse-text">${escapeHtml(v.word)}</div>
    `;
    card.addEventListener('click', () => {
      presentVerse(selectedVersionId, v.bookName, v);
    });
    versePreviewContainer.appendChild(card);
  });
}

// ---------------------------------------------------------------------------
// 7. Add / Edit Song Modal Handling
// ---------------------------------------------------------------------------
btnOpenAddSong.addEventListener('click', () => {
  modalSongId.value = '';
  modalSongTitle.textContent = 'Add New Song';
  modalInputTitle.value = '';
  modalInputCat.value = '';
  modalInputLyrics.value = '';
  modalInputLyrics2.value = '';
  songModal.style.display = 'flex';
  modalInputTitle.focus();
});

btnCloseSongModal.addEventListener('click', () => songModal.style.display = 'none');
btnCancelSongModal.addEventListener('click', () => songModal.style.display = 'none');

btnInsertSlide.addEventListener('click', () => {
  insertAtCursor(modalInputLyrics, '<slide>');
});

btnInsertBr.addEventListener('click', () => {
  insertAtCursor(modalInputLyrics, '<BR>');
});

btnAutoFormatStanzas.addEventListener('click', () => {
  let val = modalInputLyrics.value;
  // Convert double newlines to <slide> and single newlines to <BR>
  const stanzas = val.split(/\n\s*\n/).map(s => {
    return s.split('\n').map(l => l.trim()).filter(Boolean).join('<BR>');
  }).filter(Boolean);
  modalInputLyrics.value = stanzas.join('<slide>');
});

btnSaveSong.addEventListener('click', async () => {
  const title = modalInputTitle.value.trim();
  const cat = modalInputCat.value.trim();
  const lyrics = modalInputLyrics.value.trim();
  const lyrics2 = modalInputLyrics2.value.trim();
  const id = modalSongId.value;

  if (!title || !lyrics) {
    alert('Please enter both a title and lyrics for the song.');
    return;
  }

  const payload = { name: title, cat: cat || 'General', lyrics, lyrics2 };

  try {
    if (id) {
      // Update
      const res = await fetch(`/api/songs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        songModal.style.display = 'none';
        await loadCategories();
        await loadSongs(songSearchInput.value, selectedCategory);
        selectSong(id);
      }
    } else {
      // Create
      const res = await fetch('/api/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const created = await res.json();
        songModal.style.display = 'none';
        await loadCategories();
        await loadSongs(songSearchInput.value, selectedCategory);
        selectSong(created.id);
      }
    }
  } catch (err) {
    console.error('Error saving song:', err);
    alert('Failed to save song: ' + err.message);
  }
});

async function openEditSongModal(songId) {
  try {
    const res = await fetch(`/api/songs/${songId}`);
    const song = await res.json();
    modalSongId.value = song.id;
    modalSongTitle.textContent = 'Edit Song';
    modalInputTitle.value = song.name;
    modalInputCat.value = song.cat || '';
    modalInputLyrics.value = song.lyrics || '';
    modalInputLyrics2.value = song.lyrics2 || '';
    songModal.style.display = 'flex';
  } catch (err) {
    console.error('Error loading song for edit:', err);
  }
}

async function deleteSong(songId) {
  try {
    const res = await fetch(`/api/songs/${songId}`, { method: 'DELETE' });
    if (res.ok) {
      if (currentSong && currentSong.id === songId) {
        currentSong = null;
        slideDeckContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 48px;">Select a song from the library on the left.</div>';
        activeSongTitle.textContent = 'Select a Song';
        activeSongCatBadge.style.display = 'none';
      }
      await loadCategories();
      await loadSongs(songSearchInput.value, selectedCategory);
    }
  } catch (err) {
    console.error('Error deleting song:', err);
  }
}

// Song Search Debounce
let searchDebounce = null;
songSearchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    loadSongs(songSearchInput.value, selectedCategory);
  }, 200);
});

// Helper: insert string at textarea cursor
function insertAtCursor(textarea, text) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const val = textarea.value;
  textarea.value = val.substring(0, start) + text + val.substring(end);
  textarea.selectionStart = textarea.selectionEnd = start + text.length;
  textarea.focus();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Initial Boot
loadCategories();
loadSongs();
initBibleDropdowns();
