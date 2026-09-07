// ===========================================================================
// Presenter Console — Controls, Hotkeys, Tabs & Workspace Resizer
// ===========================================================================

// ---------------------------------------------------------------------------
// 1. Toolbar Actions
// ---------------------------------------------------------------------------
function triggerClear()
{
  if (socket) socket.emit('action:clear');
}

function triggerPrev()
{
  if (currentPresentationType === 'song' && currentSong && currentSongSlides.length > 0)
  {
    const prevIdx = activeSongSlideIndex > 1 ? activeSongSlideIndex - 1 : 1;
    presentSlide(currentSong, prevIdx, currentSongSlides[prevIdx - 1]);
  }
  else if (currentPresentationType === 'bible' && currentChapterVerses.length > 0)
  {
    const prevVerse = Math.max(1, selectedVerseNum - 1);
    selectBibleVerse(prevVerse, true);
  }
}

function triggerNext()
{
  if (currentPresentationType === 'song' && currentSong && currentSongSlides.length > 0)
  {
    const nextIdx = activeSongSlideIndex < currentSongSlides.length ? activeSongSlideIndex + 1 : currentSongSlides.length;
    presentSlide(currentSong, nextIdx, currentSongSlides[nextIdx - 1]);
  }
  else if (currentPresentationType === 'bible' && currentChapterVerses.length > 0)
  {
    const nextVerse = Math.min(currentChapterVerses.length, selectedVerseNum + 1);
    selectBibleVerse(nextVerse, true);
  }
}

// Event Listeners for Toolbar Buttons
if (btnClear) btnClear.addEventListener('click', triggerClear);
if (btnPrevSlide) btnPrevSlide.addEventListener('click', triggerPrev);
if (btnNextSlide) btnNextSlide.addEventListener('click', triggerNext);

// Global Keyboard Navigation Hotkeys
window.addEventListener('keydown', (e) =>
{
  if (['input', 'textarea', 'select'].includes(e.target.tagName.toLowerCase())) return;

  if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ')
  {
    e.preventDefault();
    triggerNext();
  }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp')
  {
    e.preventDefault();
    triggerPrev();
  }
  else if (e.key === 'c' || e.key === 'C' || e.key === 'Escape')
  {
    triggerClear();
  }
});

// ---------------------------------------------------------------------------
// 2. Tab Navigation System
// ---------------------------------------------------------------------------
function initTabNavigation()
{
  tabButtons.forEach((btn) =>
  {
    btn.addEventListener('click', () =>
    {
      const targetTab = btn.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });
}

function switchTab(tabId)
{
  tabButtons.forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === tabId));
  tabPanels.forEach(p => p.classList.toggle('active', p.id === `panel-${tabId}`));
}

// ---------------------------------------------------------------------------
// 3. Draggable Workspace Resizer Splitter
// ---------------------------------------------------------------------------
function initResizer()
{
  const workspace = document.getElementById('presenter-workspace');
  const resizer = document.getElementById('resizer-handle');
  if (!workspace || !resizer) return;

  const savedWidth = localStorage.getItem('presenter_left_panel_width') || localStorage.getItem('vv_left_panel_width');
  if (savedWidth)
  {
    workspace.style.setProperty('--left-panel-width', `${savedWidth}px`);
  }

  let isDragging = false;
  let startX = 0;
  let startWidth = 0;

  resizer.addEventListener('mousedown', (e) =>
  {
    isDragging = true;
    resizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    startX = e.clientX;
    const currentWidth = parseInt(getComputedStyle(workspace).getPropertyValue('--left-panel-width') || '420', 10);
    startWidth = currentWidth || 420;
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) =>
  {
    if (!isDragging) return;
    const delta = e.clientX - startX;
    const newWidth = Math.min(Math.max(260, startWidth + delta), 850);
    workspace.style.setProperty('--left-panel-width', `${newWidth}px`);
  });

  window.addEventListener('mouseup', () =>
  {
    if (isDragging)
    {
      isDragging = false;
      resizer.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const finalWidth = parseInt(workspace.style.getPropertyValue('--left-panel-width'), 10);
      if (finalWidth)
      {
        localStorage.setItem('presenter_left_panel_width', finalWidth);
      }
    }
  });
}
