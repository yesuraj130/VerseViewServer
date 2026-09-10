// ===========================================================================
// Presenter Console — State, DOM References & Common Utilities
// ===========================================================================

// Initialize Socket.io
const socket = (typeof io !== 'undefined') ? io() : null;

// Application State
let liveState = null;
let currentSong = null;
let activeSongSlideIndex = 1;

// Bible Application State
let bibleVersions = [];
let selectedBibleVersionId = 'tamil';
let selectedBibleVersionBooks = [];
let selectedBookNumber = 1;
let selectedChapterNumber = 1;
let selectedVerseNumber = 1;


// Restore Last Browsed Bible from LocalStorage (Option B)
try
{
  const savedLastBible = localStorage.getItem('last_browsed_bible');
  if (savedLastBible)
  {
    const parsed = JSON.parse(savedLastBible);
    if (parsed.versionId) selectedBibleVersionId = parsed.versionId;
    if (parsed.bookNum) selectedBookNumber = Number(parsed.bookNum);
    if (parsed.chapterNum) selectedChapterNumber = Number(parsed.chapterNum);
    if (parsed.verseNum) selectedVerseNumber = Number(parsed.verseNum);
  }
}
catch (e) {}

function saveLastBrowsedBible()
{
  try
  {
    localStorage.setItem('last_browsed_bible', JSON.stringify({
      versionId: selectedBibleVersionId,
      bookNum: selectedBookNumber,
      chapterNum: selectedChapterNumber,
      verseNum: selectedVerseNumber
    }));
  }
  catch (e) {}
}

// Persistent Recent Verses
let recentVerses = [];
try
{
  const savedRecent = localStorage.getItem('recent_bible_verses') || localStorage.getItem('verseview_recent_verses');
  if (savedRecent) recentVerses = JSON.parse(savedRecent);
}
catch (e)
{
  recentVerses = [];
}

// ---------------------------------------------------------------------------
// Cached DOM Elements
// ---------------------------------------------------------------------------
const serverStatusDot = document.getElementById('server-status-dot');
const liveIndicatorPill = document.getElementById('live-indicator-pill');
const liveStatusBadge = document.getElementById('live-status-badge');
const liveTitleText = document.getElementById('live-title-text');
const liveLineText = document.getElementById('live-line-text');
const buttonClear = document.getElementById('btn-clear');
const buttonPreviousSlide = document.getElementById('btn-prev-slide');
const buttonNextSlide = document.getElementById('btn-next-slide');

const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

const songListContainer = document.getElementById('song-list-container');
const songSearchInput = document.getElementById('song-search-input');
const buttonClearSongSearch = document.getElementById('btn-clear-song-search');

const bibleVersionSelectionDropdown = document.getElementById('bibleVersionSelectionDropdown');
const bibleRecentStrip = document.getElementById('bible-recent-strip');
const bibleBooksList = document.getElementById('bible-books-list');
const bibleChaptersList = document.getElementById('bible-chapters-list');
const bibleVersesList = document.getElementById('bible-verses-list');

const bibleFullSearchInput = document.getElementById('bible-full-search-input');
const btnRunBibleSearch = document.getElementById('btn-run-bible-search');
const bibleSearchResultsContainer = document.getElementById('bible-search-results-container');

const slideDeckSongs = document.getElementById('slide-deck-songs');
const slideDeckBible = document.getElementById('slide-deck-bible');
const slideDeckSearch = document.getElementById('slide-deck-search');

const activeSongTitle = document.getElementById('active-song-title');
const songUnicodeDeckBadge = document.getElementById('song-unicode-deck-badge');
const activeSlideCountIndicator = document.getElementById('active-slide-count-indicator');
const btnDeckEditSong = document.getElementById('btn-deck-edit-song');

const activeSearchTitle = document.getElementById('active-search-title');
const activeSearchVerBadge = document.getElementById('active-search-ver-badge');
const activeSlideCountIndicatorSearch = document.getElementById('active-slide-count-indicator-search');

const songModal = document.getElementById('song-modal');
const modalSongTitle = document.getElementById('modal-song-title');
const modalSongId = document.getElementById('modal-song-id');
const modalInputTitle = document.getElementById('modal-input-title');
const modalInputTitle2 = document.getElementById('modal-input-title2');
const modalInputCat = document.getElementById('modal-input-cat');
const modalInputFont = document.getElementById('modal-input-font');
const modalInputTags = document.getElementById('modal-input-tags');
const editorSlidesList = document.getElementById('editor-slides-list');
const modalSlidesCounter = document.getElementById('modal-slides-counter');
const btnGenerateSlides = document.getElementById('btn-generate-slides');
const btnAddEmptySlide = document.getElementById('btn-add-empty-slide');
const btnOpenAddSong = document.getElementById('btn-open-add-song');
const btnCloseSongModal = document.getElementById('btn-close-song-modal');
const btnCancelSongModal = document.getElementById('btn-cancel-song-modal');
const btnSaveSong = document.getElementById('btn-save-song');
const btnDeleteModalSong = document.getElementById('btn-delete-modal-song');

// Generate Slides (Bulk Edit) Modal References
const bulkSlidesModal = document.getElementById('bulk-slides-modal');
const bulkSlidesTextarea = document.getElementById('bulk-slides-textarea');
const btnCloseBulkModal = document.getElementById('btn-close-bulk-modal');
const btnCancelBulkModal = document.getElementById('btn-cancel-bulk-modal');
const btnApplyBulkSlides = document.getElementById('btn-apply-bulk-slides');

// ---------------------------------------------------------------------------
// Common Utility Functions
// ---------------------------------------------------------------------------
function escapeHtml(str)
{
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function insertAtCursor(textarea, text)
{
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const val = textarea.value;
  textarea.value = val.substring(0, start) + text + val.substring(end);
  textarea.selectionStart = textarea.selectionEnd = start + text.length;
  textarea.focus();
}

/**
 * Smoothly scrolls a container to align an element to top (or center) with a fixed duration (default ~220ms).
 */
function smoothScrollToElement(container, targetEl, duration = 220, alignToTop = true)
{
  if (!container || !targetEl) return;

  const containerRect = container.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();

  const startScrollTop = container.scrollTop;
  let targetOffsetTop = 0;

  if (alignToTop)
  {
    // Align target element to top of container (with 6px offset)
    targetOffsetTop = (targetRect.top - containerRect.top) + startScrollTop - 6;
  }
  else
  {
    // Center target element
    targetOffsetTop = (targetRect.top - containerRect.top) + startScrollTop - (container.clientHeight / 2) + (targetEl.clientHeight / 2);
  }

  const distance = Math.max(0, targetOffsetTop) - startScrollTop;

  if (Math.abs(distance) < 2) return;

  const startTime = performance.now();

  function easeInOutCubic(t)
  {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function step(currentTime)
  {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = easeInOutCubic(progress);

    container.scrollTop = startScrollTop + (distance * ease);

    if (progress < 1)
    {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}
