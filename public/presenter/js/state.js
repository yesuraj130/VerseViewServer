// ===========================================================================
// VerseVIEW 10 Presenter — State, DOM References & Common Utilities
// ===========================================================================

// Initialize Socket.io
const socket = (typeof io !== 'undefined') ? io() : null;

// Application State
let liveState = null;
let currentPresentationType = 'song'; // 'song' | 'bible'
let currentSong = null;
let currentSongSlides = [];
let activeSongSlideIndex = 1;

// Bible Application State
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
// Cached DOM Elements
// ---------------------------------------------------------------------------
const serverStatusDot = document.getElementById('server-status-dot');
const liveStatusBadge = document.getElementById('live-status-badge');
const liveTitleText = document.getElementById('live-title-text');
const liveLineText = document.getElementById('live-line-text');
const btnClear = document.getElementById('btn-clear');
const btnPrevSlide = document.getElementById('btn-prev-slide');
const btnNextSlide = document.getElementById('btn-next-slide');

const tabButtons = document.querySelectorAll('.vv-tab-btn');
const tabPanels = document.querySelectorAll('.vv-tab-panel');

const songListContainer = document.getElementById('song-list-container');
const songSearchInput = document.getElementById('song-search-input');
const categoryChips = document.getElementById('category-chips');

const selectVersion = document.getElementById('select-version');
const bibleRefQuickInput = document.getElementById('bible-ref-quick-input');
const btnQuickRefGo = document.getElementById('btn-quick-ref-go');
const bibleRecentStrip = document.getElementById('bible-recent-strip');
const bibleBooksList = document.getElementById('bible-books-list');
const bibleChaptersList = document.getElementById('bible-chapters-list');
const bibleVersesList = document.getElementById('bible-verses-list');
const bibleBookFilter = document.getElementById('bible-book-filter');
const testamentTabs = document.getElementById('testament-tabs');

const bibleFullSearchInput = document.getElementById('bible-full-search-input');
const btnRunBibleSearch = document.getElementById('btn-run-bible-search');
const bibleSearchResultsContainer = document.getElementById('bible-search-results-container');
const bibleSearchStatus = document.getElementById('bible-search-status');
const bibleSearchVersionLabel = document.getElementById('bible-search-version-label');

const slideDeckContainer = document.getElementById('slide-deck-container');
const activeSongTitle = document.getElementById('active-song-title');
const activeSongCatBadge = document.getElementById('active-song-cat-badge');
const deckTypeBadge = document.getElementById('deck-type-badge');
const activeSlideCountIndicator = document.getElementById('active-slide-count-indicator');
const btnDeckEditSong = document.getElementById('btn-deck-edit-song');

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
// Common Utility Functions
// ---------------------------------------------------------------------------
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function insertAtCursor(textarea, text) {
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const val = textarea.value;
  textarea.value = val.substring(0, start) + text + val.substring(end);
  textarea.selectionStart = textarea.selectionEnd = start + text.length;
  textarea.focus();
}
