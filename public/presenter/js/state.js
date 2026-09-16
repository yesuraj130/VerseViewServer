// ===========================================================================
// Presenter Console — State, DOM References & Common Utilities
// ===========================================================================

// Initialize Socket.io
const socket = (typeof io !== 'undefined') ? io() : null;

// Application State
let liveState = null;

// ---------------------------------------------------------------------------
// Cached DOM Elements
// ---------------------------------------------------------------------------
const serverStatusDot = document.getElementById('server-status-dot');
const liveStatusBadge = document.getElementById('live-status-badge');
const liveTitleText = document.getElementById('live-title-text');
const liveLineText = document.getElementById('live-line-text');

const tabButtons = document.querySelectorAll('.tab-btn');



// Song Add / Edit Dialog Elements
const editSongDialog = document.getElementById('edit-song-dialog');
const editSongDialogHeading = document.getElementById('edit-song-dialog-heading');
const editSongIdHiddenInput = document.getElementById('edit-song-id-hidden-input');
const editSongTitleTextbox = document.getElementById('edit-song-title-textbox');
const editSongSecondaryTitleTextbox = document.getElementById('edit-song-secondary-title-textbox');
const editSongFontTextbox = document.getElementById('edit-song-font-textbox');
const editSongLyricsTextarea = document.getElementById('edit-song-lyrics-textarea');
const buttonOpenAddSong = document.getElementById('btn-open-add-song');
const buttonCloseEditSongDialog = document.getElementById('btn-close-edit-song-dialog');
const buttonCancelEditSongDialog = document.getElementById('btn-cancel-edit-song-dialog');
const buttonSaveSong = document.getElementById('btn-save-song');
const buttonDeleteSongDialog = document.getElementById('btn-delete-song-dialog');

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
