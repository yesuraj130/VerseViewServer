// ===========================================================================
// VerseVIEW 10 — Presenter Console Controller
// ===========================================================================

// Initialize Socket.io
const socket = (typeof io !== 'undefined') ? io() : null;

// Application State
let liveState = null;
let currentPresentationType = 'song'; // 'song' | 'bible'
let currentSong = null;
let currentSongSlides = [];
let activeSongSlideIndex = 1;

// Bible Application State (VerseVIEW 10)
let bibleVersions = [];
let selectedVersionId = 'tamil';
let allBibleBooks = [];
let filteredBibleBooks = [];
let selectedBookNum = 43; // Default John
let selectedBookName = 'John';
let selectedChapterNum = 3;
let selectedVerseNum = 16;
let currentChapterVerses = [];
let testamentFilter = 'all'; // 'all' | 'ot' | 'nt'
let bookSearchFilter = '';

// Persistent Recent Verses
let recentVerses = [];

try {
  const savedRecent = localStorage.getItem('verseview_recent_verses');
  if (savedRecent) recentVerses = JSON.parse(savedRecent);
} catch (e) {
  recentVerses = [];
}

// ---------------------------------------------------------------------------
// DOM Elements
// ---------------------------------------------------------------------------
// Top Header & Controls
const serverStatusDot = document.getElementById('server-status-dot');
const liveStatusBadge = document.getElementById('live-status-badge');
const liveTitleText = document.getElementById('live-title-text');
const liveLineText = document.getElementById('live-line-text');
const btnBlankScreen = document.getElementById('btn-blank-screen');
const btnClearText = document.getElementById('btn-clear-text');
const btnShowSlide = document.getElementById('btn-show-slide');
const btnPrevSlide = document.getElementById('btn-prev-slide');
const btnNextSlide = document.getElementById('btn-next-slide');

// Tabs & Panels
const vvTabsBar = document.getElementById('vv-tabs-bar');
const tabButtons = document.querySelectorAll('.vv-tab-btn');
const tabPanels = document.querySelectorAll('.vv-tab-panel');

// Songs Panel
const songListContainer = document.getElementById('song-list-container');
const songSearchInput = document.getElementById('song-search-input');
const categoryChips = document.getElementById('category-chips');

// Bible Panel (3-Column Selectable Lists)
const selectVersion = document.getElementById('select-version');
const bibleRefQuickInput = document.getElementById('bible-ref-quick-input');
const btnQuickRefGo = document.getElementById('btn-quick-ref-go');
const bibleRecentStrip = document.getElementById('bible-recent-strip');
const bibleBooksList = document.getElementById('bible-books-list');
const bibleChaptersList = document.getElementById('bible-chapters-list');
const bibleVersesList = document.getElementById('bible-verses-list');
const bibleChaptersCount = document.getElementById('bible-chapters-count');
const bibleVersesCount = document.getElementById('bible-verses-count');
const bibleBookFilter = document.getElementById('bible-book-filter');
const testamentTabs = document.getElementById('testament-tabs');

// Bible Search Panel
const bibleFullSearchInput = document.getElementById('bible-full-search-input');
const btnRunBibleSearch = document.getElementById('btn-run-bible-search');
const bibleSearchResultsContainer = document.getElementById('bible-search-results-container');
const bibleSearchStatus = document.getElementById('bible-search-status');
const bibleSearchVersionLabel = document.getElementById('bible-search-version-label');

// Center Stage (Deck)
const slideDeckContainer = document.getElementById('slide-deck-container');
const activeSongTitle = document.getElementById('active-song-title');
const activeSongCatBadge = document.getElementById('active-song-cat-badge');
const deckTypeBadge = document.getElementById('deck-type-badge');
const activeSlideCountIndicator = document.getElementById('active-slide-count-indicator');
const btnDeckEditSong = document.getElementById('btn-deck-edit-song');

// Song Modal Elements
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

// ---------------------------------------------------------------------------
// 2. Tab Navigation System (VerseVIEW 10)
// ---------------------------------------------------------------------------
function initTabNavigation() {
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });
}

function switchTab(tabId) {
  tabButtons.forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === tabId));
  tabPanels.forEach(p => p.classList.toggle('active', p.id === `panel-${tabId}`));
}

// ---------------------------------------------------------------------------
// 3. Live & Stage View Monitors
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

  const titleStr = state.title || 'Screen Ready';
  liveTitleText.textContent = titleStr;
  const firstLine = (state.lines && state.lines.length > 0) ? state.lines[0] : (state.reference || '');
  liveLineText.textContent = firstLine || 'Ready for presentation';
}

function highlightActiveInDecks(state) {
  if (!state) return;

  // Highlight in song slide deck
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

  // Highlight in vertical Bible chapter slide deck
  const verticalCards = document.querySelectorAll('.slide-card-vertical');
  verticalCards.forEach((card) => {
    const bNum = Number(card.getAttribute('data-book-num'));
    const cNum = Number(card.getAttribute('data-ch-num'));
    const vNum = Number(card.getAttribute('data-verse-num'));
    const isLiveVerse = state.verseInfo &&
      Number(state.verseInfo.bookNum) === bNum &&
      Number(state.verseInfo.chNum) === cNum &&
      Number(state.verseInfo.verseNum) === vNum &&
      state.status === 'live';

    card.classList.toggle('is-live', isLiveVerse);
    const livePill = card.querySelector('.sc-live-pill');
    if (livePill) {
      livePill.style.display = isLiveVerse ? 'inline-block' : 'none';
    }
  });

  // Highlight active tile in verse list
  if (bibleVersesList && state.verseInfo && state.status === 'live') {
    const vButtons = bibleVersesList.querySelectorAll('.vv-num-btn');
    vButtons.forEach((btn) => {
      const vNum = Number(btn.getAttribute('data-verse-num'));
      btn.classList.toggle('active', vNum === Number(state.verseInfo.verseNum));
    });
  }
}

// ---------------------------------------------------------------------------
// 4. Songs Management & Library
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
      <div class="song-actions" style="display: flex; gap: 4px; align-items: center;">
        <button class="btn-icon-tiny btn-edit-song" title="Edit Song" data-id="${song.id}">✏️</button>
        <button class="btn-icon-tiny btn-delete-song" title="Delete Song" data-id="${song.id}">🗑️</button>
      </div>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.closest('.btn-edit-song') || e.target.closest('.btn-delete-song')) return;
      document.querySelectorAll('.song-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      selectSong(song.id);
    });

    const editBtn = item.querySelector('.btn-edit-song');
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditSongModal(song.id);
    });

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

async function selectSong(songId, autoPresent = false) {
  try {
    const res = await fetch(`/api/songs/${songId}`);
    const song = await res.json();
    currentSong = song;
    currentSongSlides = song.slides || [];
    activeSongSlideIndex = 1;

    activeSongTitle.textContent = song.name;
    deckTypeBadge.textContent = 'SONG';
    deckTypeBadge.style.color = '#38bdf8';
    deckTypeBadge.style.borderColor = 'rgba(56, 189, 248, 0.4)';
    activeSongCatBadge.textContent = song.cat || 'General';
    activeSongCatBadge.style.display = 'inline-block';
    activeSlideCountIndicator.textContent = `${currentSongSlides.length} slides`;
    btnDeckEditSong.style.display = 'inline-block';

    renderSlideDeck(currentSong, currentSongSlides);

    if (autoPresent && currentSongSlides.length > 0) {
      presentSlide(song, 1, currentSongSlides[0]);
    }
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

    const isLive = liveState && Number(liveState.songId) === Number(song.id) && Number(liveState.slideIndex) === Number(slide.slideIndex) && liveState.status === 'live';
    if (isLive) card.classList.add('active-live');

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
// 5. VerseVIEW 10 Bible System (3-Column Selectable Lists & Vertical Deck)
// ---------------------------------------------------------------------------
async function initBible() {
  try {
    const res = await fetch('/api/bible/versions');
    bibleVersions = await res.json();
    
    if (selectVersion) {
      selectVersion.innerHTML = '';
      bibleVersions.forEach((ver) => {
        const opt = document.createElement('option');
        opt.value = ver.id;
        opt.textContent = ver.available ? ver.name : `${ver.name} (DB missing)`;
        if (!ver.available) opt.style.color = '#94a3b8';
        selectVersion.appendChild(opt);
      });
    }

    const firstAvailable = bibleVersions.find(v => v.available) || bibleVersions[0];
    if (firstAvailable) {
      selectedVersionId = firstAvailable.id;
      if (selectVersion) selectVersion.value = firstAvailable.id;
      if (bibleSearchVersionLabel) bibleSearchVersionLabel.textContent = firstAvailable.name;
      await loadBibleBooks(selectedVersionId);
    }

    // Initialize Testament filter tabs
    if (testamentTabs) {
      const tButtons = testamentTabs.querySelectorAll('.vv-tt-btn');
      tButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          tButtons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          testamentFilter = btn.getAttribute('data-testament') || 'all';
          renderBibleBooksList();
        });
      });
    }

    // Initialize Book Search filter
    if (bibleBookFilter) {
      bibleBookFilter.addEventListener('input', (e) => {
        bookSearchFilter = (e.target.value || '').trim().toLowerCase();
        renderBibleBooksList();
      });
    }

    // Version dropdown listener
    if (selectVersion) {
      selectVersion.addEventListener('change', async (e) => {
        selectedVersionId = e.target.value;
        const verObj = bibleVersions.find(v => v.id === selectedVersionId);
        if (bibleSearchVersionLabel && verObj) bibleSearchVersionLabel.textContent = verObj.name;
        await loadBibleBooks(selectedVersionId, selectedBookNum, selectedChapterNum, selectedVerseNum);
      });
    }

    renderRecentVersesStrip();
  } catch (err) {
    console.error('Error initializing Bible system:', err);
  }
}

async function loadBibleBooks(versionId, targetBookNum = null, targetChapter = null, targetVerse = null) {
  try {
    const res = await fetch(`/api/bible/${versionId}/books`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      if (bibleBooksList) {
        bibleBooksList.innerHTML = `<div style="padding: 16px; font-size: 11px; color: var(--text-muted); text-align: center;">${escapeHtml(errData.error || 'Database missing for this version')}</div>`;
      }
      if (bibleChaptersList) bibleChaptersList.innerHTML = '';
      if (bibleVersesList) bibleVersesList.innerHTML = '';
      return;
    }
    const data = await res.json();
    allBibleBooks = data.books || [];
    renderBibleBooksList();

    // Default select specified book or John (43) or first book
    let initialBook = null;
    if (targetBookNum) {
      initialBook = allBibleBooks.find(b => Number(b.bookNum) === Number(targetBookNum));
    }
    if (!initialBook) {
      initialBook = allBibleBooks.find(b => Number(b.bookNum) === 43) || allBibleBooks[0];
    }

    if (initialBook) {
      await selectBibleBook(initialBook.bookNum, initialBook.name, targetChapter || 3, targetVerse || 16);
    }
  } catch (err) {
    console.error('Error loading Bible books:', err);
  }
}

function renderBibleBooksList() {
  if (!bibleBooksList) return;
  bibleBooksList.innerHTML = '';

  let list = allBibleBooks;

  // Filter by testament
  if (testamentFilter === 'ot') {
    list = list.filter(b => Number(b.bookNum) <= 39);
  } else if (testamentFilter === 'nt') {
    list = list.filter(b => Number(b.bookNum) >= 40);
  }

  // Filter by text search
  if (bookSearchFilter) {
    list = list.filter(b => {
      const nameMatch = b.name.toLowerCase().includes(bookSearchFilter);
      const numMatch = String(b.bookNum) === bookSearchFilter;
      return nameMatch || numMatch;
    });
  }

  if (list.length === 0) {
    bibleBooksList.innerHTML = '<div style="padding: 14px; font-size: 11px; color: var(--text-muted); text-align: center;">No matching books</div>';
    return;
  }

  list.forEach((b) => {
    const item = document.createElement('div');
    item.className = 'vv-book-item';
    if (Number(b.bookNum) === Number(selectedBookNum)) {
      item.classList.add('active');
    }
    item.setAttribute('data-book-num', b.bookNum);

    item.innerHTML = `
      <div style="display: flex; align-items: center; min-width: 0;">
        <span class="book-num">${b.bookNum}</span>
        <span class="book-name" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(b.name)}</span>
      </div>
    `;

    item.addEventListener('click', () => {
      selectBibleBook(b.bookNum, b.name);
    });

    bibleBooksList.appendChild(item);
  });
}

async function selectBibleBook(bookNum, bookName, targetChapter = null, targetVerse = null) {
  selectedBookNum = Number(bookNum);
  selectedBookName = bookName;

  // Update active book styling in list
  if (bibleBooksList) {
    const items = bibleBooksList.querySelectorAll('.vv-book-item');
    items.forEach((it) => {
      const itNum = Number(it.getAttribute('data-book-num'));
      it.classList.toggle('active', itNum === selectedBookNum);
    });
  }

  try {
    const res = await fetch(`/api/bible/${selectedVersionId}/chapters?bookNum=${selectedBookNum}`);
    const chapters = await res.json();

    if (bibleChaptersCount) {
      bibleChaptersCount.textContent = `${chapters.length} Ch`;
    }

    renderBibleChaptersList(chapters);

    // Determine chosen chapter
    let chosenCh = targetChapter;
    if (!chosenCh || !chapters.includes(Number(chosenCh))) {
      chosenCh = chapters.includes(1) ? 1 : chapters[0];
    }

    if (chosenCh !== undefined) {
      await selectBibleChapter(chosenCh, targetVerse);
    }
  } catch (err) {
    console.error('Error selecting Bible book:', err);
  }
}

function renderBibleChaptersList(chapters) {
  if (!bibleChaptersList) return;
  bibleChaptersList.innerHTML = '';

  chapters.forEach((ch) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'vv-num-btn';
    btn.setAttribute('data-ch-num', ch);
    btn.textContent = ch;

    if (Number(ch) === Number(selectedChapterNum)) {
      btn.classList.add('active');
    }

    btn.addEventListener('click', () => {
      selectBibleChapter(ch);
    });

    bibleChaptersList.appendChild(btn);
  });
}

async function selectBibleChapter(chNum, targetVerse = null) {
  selectedChapterNum = Number(chNum);

  // Update active chapter tile styling
  if (bibleChaptersList) {
    const btns = bibleChaptersList.querySelectorAll('.vv-num-btn');
    btns.forEach((btn) => {
      const c = Number(btn.getAttribute('data-ch-num'));
      btn.classList.toggle('active', c === selectedChapterNum);
    });
  }

  try {
    // 1. Fetch verse numbers for the verse list column
    const resVerses = await fetch(`/api/bible/${selectedVersionId}/verses?bookNum=${selectedBookNum}&chNum=${selectedChapterNum}`);
    const verseNumbers = await resVerses.json();

    if (bibleVersesCount) {
      bibleVersesCount.textContent = `${verseNumbers.length} Vs`;
    }

    renderBibleVersesList(verseNumbers);

    // 2. Fetch full text for the chapter to display all verses in right slides deck vertically
    const resText = await fetch(`/api/bible/${selectedVersionId}/text?bookNum=${selectedBookNum}&chNum=${selectedChapterNum}`);
    const data = await resText.json();
    currentChapterVerses = data.verses || [];

    // 3. Render all verses vertically one by one in the center slide deck
    renderChapterVersesDeck(currentChapterVerses, data.bookName || selectedBookName, selectedChapterNum);

    // 4. If target verse specified, scroll to it without auto-broadcasting
    if (targetVerse) {
      selectBibleVerse(targetVerse, false);
    } else if (currentChapterVerses.length > 0) {
      // Highlight verse 1 in list without force presenting
      selectBibleVerse(1, false);
    }
  } catch (err) {
    console.error('Error selecting Bible chapter:', err);
  }
}

function renderBibleVersesList(verseNumbers) {
  if (!bibleVersesList) return;
  bibleVersesList.innerHTML = '';

  verseNumbers.forEach((v) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'vv-num-btn';
    btn.setAttribute('data-verse-num', v);
    btn.textContent = v;

    if (Number(v) === Number(selectedVerseNum)) {
      btn.classList.add('active');
    }

    // Synchronized scrolling to slide without immediate broadcast
    btn.addEventListener('click', () => {
      selectBibleVerse(v, false);
    });

    bibleVersesList.appendChild(btn);
  });
}

function renderChapterVersesDeck(verses, bookName, chNum) {
  currentPresentationType = 'bible';
  currentSong = null;

  const verObj = bibleVersions.find(v => v.id === selectedVersionId);
  const verName = verObj ? verObj.name : 'Bible';

  // Update Deck Header
  activeSongTitle.textContent = `${bookName} Chapter ${chNum}`;
  deckTypeBadge.textContent = 'BIBLE';
  deckTypeBadge.style.color = '#10b981';
  deckTypeBadge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
  activeSongCatBadge.textContent = verName;
  activeSongCatBadge.style.display = 'inline-block';
  activeSlideCountIndicator.textContent = `${verses.length} verses`;
  btnDeckEditSong.style.display = 'none';

  slideDeckContainer.innerHTML = '';

  if (!verses || verses.length === 0) {
    slideDeckContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 48px;">No verses available in this chapter.</div>';
    return;
  }

  // Render all verses vertically one by one
  verses.forEach((v) => {
    const card = document.createElement('div');
    card.className = 'slide-card-vertical';
    card.setAttribute('data-book-num', v.bookNum);
    card.setAttribute('data-ch-num', v.chNum);
    card.setAttribute('data-verse-num', v.verseNum);
    card.id = `slide-verse-${v.verseNum}`;

    const isLive = liveState && liveState.verseInfo &&
      Number(liveState.verseInfo.bookNum) === Number(v.bookNum) &&
      Number(liveState.verseInfo.chNum) === Number(v.chNum) &&
      Number(liveState.verseInfo.verseNum) === Number(v.verseNum) &&
      liveState.status === 'live';

    if (isLive) card.classList.add('is-live');
    if (Number(v.verseNum) === Number(selectedVerseNum)) card.classList.add('active');

    card.innerHTML = `
      <div class="sc-header">
        <span class="sc-index-badge">${escapeHtml(bookName)} ${v.chNum}:${v.verseNum}</span>
        <span class="sc-live-pill" style="display: ${isLive ? 'inline-block' : 'none'};">LIVE</span>
      </div>
      <div class="sc-text-main">${escapeHtml(v.word)}</div>
    `;

    // Clicking anywhere on the slide presents it live
    card.addEventListener('click', () => {
      selectBibleVerse(v.verseNum, false);
      presentBibleVerse(selectedVersionId, selectedBookName, v);
    });

    slideDeckContainer.appendChild(card);
  });
}

function selectBibleVerse(verseNum, doPresent = true) {
  selectedVerseNum = Number(verseNum);

  // 1. Update Verse column tile highlight
  if (bibleVersesList) {
    const btns = bibleVersesList.querySelectorAll('.vv-num-btn');
    btns.forEach((btn) => {
      const v = Number(btn.getAttribute('data-verse-num'));
      btn.classList.toggle('active', v === selectedVerseNum);
    });
  }

  // 2. Highlight card in right slide deck and scroll to it smoothly
  const targetCard = document.getElementById(`slide-verse-${selectedVerseNum}`);
  if (targetCard) {
    const allCards = slideDeckContainer.querySelectorAll('.slide-card-vertical');
    allCards.forEach(c => c.classList.remove('active'));
    targetCard.classList.add('active');
    targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // 3. Present the verse if requested
  if (doPresent) {
    const verseObj = currentChapterVerses.find(v => Number(v.verseNum) === selectedVerseNum);
    if (verseObj) {
      presentBibleVerse(selectedVersionId, selectedBookName, verseObj);
    }
  }
}

function presentBibleVerse(versionId, bookName, verseObj) {
  const verObj = bibleVersions.find(v => v.id === versionId);
  const verName = verObj ? verObj.name : 'Bible';
  const refText = `${bookName} ${verseObj.chNum}:${verseObj.verseNum} (${verName})`;

  const payload = {
    type: 'bible',
    title: `${bookName} ${verseObj.chNum}:${verseObj.verseNum}`,
    reference: refText,
    lines: [verseObj.word],
    rawSlide: verseObj.word,
    slideIndex: verseObj.verseNum,
    totalSlides: currentChapterVerses.length || 1,
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

  // Update header indicator
  activeSlideCountIndicator.textContent = `Verse ${verseObj.verseNum} of ${currentChapterVerses.length}`;

  // Add to Recent Verses
  addRecentVerse({
    versionId,
    bookNum: verseObj.bookNum,
    bookName,
    chNum: verseObj.chNum,
    verseNum: verseObj.verseNum,
    ref: `${bookName} ${verseObj.chNum}:${verseObj.verseNum}`
  });
}

// ---------------------------------------------------------------------------
// 6. Quick Scripture Reference Jump & Recent Verses
// ---------------------------------------------------------------------------
if (btnQuickRefGo) {
  btnQuickRefGo.addEventListener('click', handleQuickRefGo);
}
if (bibleRefQuickInput) {
  bibleRefQuickInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleQuickRefGo();
  });
}

async function handleQuickRefGo() {
  const ref = (bibleRefQuickInput.value || '').trim();
  if (!ref) return;

  // Regex for parsing: [Book Name] [Chapter]:[Verse] or [Book Name] [Chapter]
  const match = ref.match(/^([1-3]?\s*[\p{L}\s]+?)\s*(\d+)[:\s.]?(\d+)?$/u);
  if (!match) {
    alert('Please enter reference in format: Book Chapter:Verse (e.g. John 3:16 or Gen 1:1)');
    return;
  }

  const queryBook = match[1].trim().toLowerCase();
  const queryCh = Number(match[2]);
  const queryVerse = match[3] ? Number(match[3]) : 1;

  // Find book in allBibleBooks
  let matchedBook = allBibleBooks.find((b) => {
    const bName = b.name.toLowerCase();
    return bName === queryBook || bName.startsWith(queryBook) || bName.includes(queryBook);
  });

  if (!matchedBook) {
    alert(`Could not find book matching "${queryBook}".`);
    return;
  }

  await selectBibleBook(matchedBook.bookNum, matchedBook.name, queryCh, queryVerse);
}

function renderRecentVersesStrip() {
  if (!bibleRecentStrip) return;
  bibleRecentStrip.innerHTML = '<span style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">Recent:</span>';

  recentVerses.slice(0, 6).forEach((rv) => {
    const chip = document.createElement('span');
    chip.className = 'vv-recent-chip';
    chip.textContent = rv.ref;
    chip.title = `Jump to ${rv.ref}`;
    chip.addEventListener('click', async () => {
      await selectBibleBook(rv.bookNum, rv.bookName, rv.chNum, rv.verseNum);
    });
    bibleRecentStrip.appendChild(chip);
  });
}

function addRecentVerse(rv) {
  recentVerses = recentVerses.filter(item => item.ref !== rv.ref);
  recentVerses.unshift(rv);
  if (recentVerses.length > 10) recentVerses.pop();
  try {
    localStorage.setItem('verseview_recent_verses', JSON.stringify(recentVerses));
  } catch (e) {}
  renderRecentVersesStrip();
}

// ---------------------------------------------------------------------------
// 7. Bible Word Search
// ---------------------------------------------------------------------------
if (btnRunBibleSearch) {
  btnRunBibleSearch.addEventListener('click', performBibleSearch);
}
if (bibleFullSearchInput) {
  bibleFullSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') performBibleSearch();
  });
}

async function performBibleSearch() {
  const query = (bibleFullSearchInput.value || '').trim();
  if (!query) return;

  bibleSearchStatus.textContent = 'Searching...';
  bibleSearchResultsContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 24px;">Searching Scripture database...</div>';

  try {
    const res = await fetch(`/api/bible/${selectedVersionId}/search?q=${encodeURIComponent(query)}`);
    const results = await res.json();
    bibleSearchStatus.textContent = `${results.length} results found`;

    if (!results || results.length === 0) {
      bibleSearchResultsContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 24px;">No verses found matching "${escapeHtml(query)}".</div>`;
      return;
    }

    bibleSearchResultsContainer.innerHTML = '';
    results.forEach((r) => {
      const card = document.createElement('div');
      card.className = 'verse-card';

      // Highlight keyword in text
      const regex = new RegExp(`(${query})`, 'gi');
      const highlighted = escapeHtml(r.word).replace(regex, '<mark style="background: #0284c7; color: #fff; padding: 0 2px; border-radius: 2px;">$1</mark>');

      card.innerHTML = `
        <div class="verse-header">
          <span class="verse-ref">${escapeHtml(r.reference)}</span>
          <div style="display: flex; gap: 4px;">
            <button class="btn-primary btn-search-pres" style="padding: 2px 8px; font-size: 11px;">Present</button>
          </div>
        </div>
        <div class="verse-text">${highlighted}</div>
      `;

      card.querySelector('.btn-search-pres').addEventListener('click', async (e) => {
        e.stopPropagation();
        await selectBibleBook(r.bookNum, r.bookName, r.chNum, r.verseNum);
      });

      card.addEventListener('click', async () => {
        await selectBibleBook(r.bookNum, r.bookName, r.chNum, r.verseNum);
      });

      bibleSearchResultsContainer.appendChild(card);
    });
  } catch (err) {
    console.error('Error during Bible search:', err);
    bibleSearchStatus.textContent = 'Search failed';
    bibleSearchResultsContainer.innerHTML = '<div style="color: #ef4444; text-align: center; padding: 24px;">Failed to perform search.</div>';
  }
}

// ---------------------------------------------------------------------------
// 8. Toolbar Actions (Blank, Clear, Show, Prev, Next)
// ---------------------------------------------------------------------------
function triggerBlank() {
  if (socket) socket.emit('action:blank');
}
function triggerClear() {
  if (socket) socket.emit('action:clear');
}
function triggerShow() {
  if (socket) socket.emit('action:show');
}
function triggerPrev() {
  if (currentPresentationType === 'song' && currentSong && currentSongSlides.length > 0) {
    const prevIdx = activeSongSlideIndex > 1 ? activeSongSlideIndex - 1 : 1;
    presentSlide(currentSong, prevIdx, currentSongSlides[prevIdx - 1]);
  } else if (currentPresentationType === 'bible' && currentChapterVerses.length > 0) {
    const prevVerse = Math.max(1, selectedVerseNum - 1);
    selectBibleVerse(prevVerse, true);
  }
}
function triggerNext() {
  if (currentPresentationType === 'song' && currentSong && currentSongSlides.length > 0) {
    const nextIdx = activeSongSlideIndex < currentSongSlides.length ? activeSongSlideIndex + 1 : currentSongSlides.length;
    presentSlide(currentSong, nextIdx, currentSongSlides[nextIdx - 1]);
  } else if (currentPresentationType === 'bible' && currentChapterVerses.length > 0) {
    const nextVerse = Math.min(currentChapterVerses.length, selectedVerseNum + 1);
    selectBibleVerse(nextVerse, true);
  }
}

btnBlankScreen.addEventListener('click', triggerBlank);
btnClearText.addEventListener('click', triggerClear);
btnShowSlide.addEventListener('click', triggerShow);
btnPrevSlide.addEventListener('click', triggerPrev);
btnNextSlide.addEventListener('click', triggerNext);

// Keyboard navigation (VerseVIEW standard hotkeys)
window.addEventListener('keydown', (e) => {
  if (['input', 'textarea', 'select'].includes(e.target.tagName.toLowerCase())) return;

  if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
    e.preventDefault();
    triggerNext();
  } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
    e.preventDefault();
    triggerPrev();
  } else if (e.key === 'b' || e.key === 'B') {
    triggerBlank();
  } else if (e.key === 'c' || e.key === 'C') {
    triggerClear();
  } else if (e.key === 's' || e.key === 'S') {
    triggerShow();
  }
});

// ---------------------------------------------------------------------------
// 9. Add / Edit Song Modal Management
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

if (btnDeckEditSong) {
  btnDeckEditSong.addEventListener('click', () => {
    if (currentSong) openEditSongModal(currentSong.id);
  });
}

function closeSongModal() {
  songModal.style.display = 'none';
}

btnCloseSongModal.addEventListener('click', closeSongModal);
btnCancelSongModal.addEventListener('click', closeSongModal);

btnInsertSlide.addEventListener('click', () => insertAtCursor(modalInputLyrics, '<slide>'));
btnInsertBr.addEventListener('click', () => insertAtCursor(modalInputLyrics, '<BR>'));
btnAutoFormatStanzas.addEventListener('click', () => {
  const val = modalInputLyrics.value;
  modalInputLyrics.value = val.replace(/\n\s*\n/g, '<slide>\n').replace(/\n/g, '<BR>\n');
});

btnSaveSong.addEventListener('click', async () => {
  const title = modalInputTitle.value.trim();
  const cat = modalInputCat.value.trim() || 'General';
  const lyrics = modalInputLyrics.value.trim();
  const lyrics2 = modalInputLyrics2.value.trim();
  const songId = modalSongId.value;

  if (!title) {
    alert('Please enter a song title.');
    modalInputTitle.focus();
    return;
  }

  const payload = { name: title, cat, lyrics, lyrics2 };
  try {
    let res;
    if (songId) {
      res = await fetch(`/api/songs/${songId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch('/api/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to save');
    }

    const saved = await res.json();
    closeSongModal();
    await loadCategories();
    await loadSongs(songSearchInput.value, selectedCategory);
    selectSong(saved.id);
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

// Debounce Search
let searchDebounce = null;
songSearchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    loadSongs(songSearchInput.value, selectedCategory);
  }, 200);
});

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

// ---------------------------------------------------------------------------
// 10. Workspace Resizer Splitter
// ---------------------------------------------------------------------------
function initResizer() {
  const workspace = document.getElementById('vv-workspace');
  const resizer = document.getElementById('vv-resizer');
  if (!workspace || !resizer) return;

  const savedWidth = localStorage.getItem('vv_left_panel_width');
  if (savedWidth) {
    workspace.style.setProperty('--left-panel-width', `${savedWidth}px`);
  }

  let isDragging = false;
  let startX = 0;
  let startWidth = 0;

  resizer.addEventListener('mousedown', (e) => {
    isDragging = true;
    resizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    startX = e.clientX;
    const currentWidth = parseInt(getComputedStyle(workspace).getPropertyValue('--left-panel-width') || '420', 10);
    startWidth = currentWidth || 420;
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const delta = e.clientX - startX;
    const newWidth = Math.min(Math.max(260, startWidth + delta), 850);
    workspace.style.setProperty('--left-panel-width', `${newWidth}px`);
  });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      resizer.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const finalWidth = parseInt(workspace.style.getPropertyValue('--left-panel-width'), 10);
      if (finalWidth) {
        localStorage.setItem('vv_left_panel_width', finalWidth);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// 11. Initial Boot
// ---------------------------------------------------------------------------
initResizer();
initTabNavigation();
loadCategories();
loadSongs();
initBible();
