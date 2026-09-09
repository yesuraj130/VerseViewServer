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

// Jump to active live slide on clicking live indicator
async function jumpToLiveSlide()
{
  if (!liveState || liveState.status === 'clear' || liveState.type === 'none') return;

  if (liveState.type === 'song' && liveState.songId)
  {
    switchTab('songs');
    if (!currentSong || Number(currentSong.id) !== Number(liveState.songId))
    {
      await selectSong(liveState.songId, false);
    }
    const slideIdx = Number(liveState.slideIndex) || 1;
    activeSongSlideIndex = slideIdx;

    const card = slideDeckContainer ? slideDeckContainer.querySelector(`.slide-card[data-slide-index="${slideIdx}"]`) : null;
    if (card && slideDeckContainer)
    {
      slideDeckContainer.querySelectorAll('.slide-card').forEach(c => c.classList.remove('active-card'));
      card.classList.add('active-card');
      smoothScrollToElement(slideDeckContainer, card, 200);
    }
  }
  else if (liveState.type === 'bible' && liveState.verseInfo)
  {
    switchTab('bible');
    const vInfo = liveState.verseInfo;
    const verId = vInfo.versionId || selectedVersionId;

    if (verId !== selectedVersionId)
    {
      selectedVersionId = verId;
      if (selectVersion) selectVersion.value = verId;
      if (bibleSearchVersionLabel)
      {
        const verObj = (typeof bibleVersions !== 'undefined') ? bibleVersions.find(v => v.id === verId) : null;
        if (verObj) bibleSearchVersionLabel.textContent = verObj.name;
      }
      if (typeof saveLastBrowsedBible === 'function') saveLastBrowsedBible();
      await loadBibleBooks(selectedVersionId, vInfo.bookNum, vInfo.chNum, vInfo.verseNum);
    }
    else
    {
      if (Number(selectedBookNum) !== Number(vInfo.bookNum))
      {
        await selectBibleBook(vInfo.bookNum, vInfo.bookName, vInfo.chNum, vInfo.verseNum);
      }
      else if (Number(selectedChapterNum) !== Number(vInfo.chNum))
      {
        await selectBibleChapter(vInfo.chNum, vInfo.verseNum);
      }
      else
      {
        selectBibleVerse(vInfo.verseNum, false);
      }
    }
  }
}

if (liveIndicatorPill)
{
  liveIndicatorPill.addEventListener('click', jumpToLiveSlide);
}

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
let currentMobilePaneMode = 'browser';
window.currentMobilePaneMode = 'browser';

function setMobilePaneMode(mode)
{
  if (!['browser', 'deck', 'both'].includes(mode)) return;
  currentMobilePaneMode = mode;
  window.currentMobilePaneMode = mode;

  const switcherBtns = document.querySelectorAll('.mobile-pane-btn');
  switcherBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-mode') === mode));

  const workspaceViews = document.querySelectorAll('.workspace-tab-view');
  workspaceViews.forEach(v => {
    v.classList.remove('mobile-mode-browser', 'mobile-mode-deck', 'mobile-mode-both');
    v.classList.add(`mobile-mode-${mode}`);
  });

  try
  {
    localStorage.setItem('presenter_mobile_pane_mode', mode);
  }
  catch (e) {}
}

function initMobilePaneSwitcher()
{
  const switcherBtns = document.querySelectorAll('.mobile-pane-btn');
  switcherBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-mode');
      setMobilePaneMode(mode);
    });
  });

  let initialMode = 'browser';
  try
  {
    const savedMode = localStorage.getItem('presenter_mobile_pane_mode');
    if (savedMode && ['browser', 'deck', 'both'].includes(savedMode))
    {
      initialMode = savedMode;
    }
  }
  catch (e) {}

  setMobilePaneMode(initialMode);
}

// ---------------------------------------------------------------------------
// Header Collapse Toggle System
// ---------------------------------------------------------------------------
function updateCollapseButtons(collapsed)
{
  const toggleBtns = document.querySelectorAll('.btn-collapse-toggle');
  toggleBtns.forEach(btn => {
    const iconSpan = btn.querySelector('.collapse-icon');
    const textSpan = btn.querySelector('.collapse-text');
    if (collapsed)
    {
      btn.classList.add('collapsed');
      btn.setAttribute('title', 'Expand Top Bar Controls');
      if (iconSpan) iconSpan.textContent = '▼';
      if (textSpan) textSpan.textContent = 'Expand';
    }
    else
    {
      btn.classList.remove('collapsed');
      btn.setAttribute('title', 'Collapse Top Bar Controls');
      if (iconSpan) iconSpan.textContent = '▲';
      if (textSpan) textSpan.textContent = 'Top Bar';
    }
  });
}

function initHeaderCollapseToggle()
{
  const toggleBtns = document.querySelectorAll('.btn-collapse-toggle');
  const appContainer = document.querySelector('.presenter-app');
  if (!appContainer) return;

  try
  {
    const isCollapsed = localStorage.getItem('presenter_header_collapsed') === 'true';
    if (isCollapsed)
    {
      appContainer.classList.add('header-collapsed');
      updateCollapseButtons(true);
    }
  }
  catch (e) {}

  toggleBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const collapsed = appContainer.classList.toggle('header-collapsed');
      updateCollapseButtons(collapsed);
      try
      {
        localStorage.setItem('presenter_header_collapsed', collapsed ? 'true' : 'false');
      }
      catch (e) {}
    });
  });

  const miniPrev = document.getElementById('btn-mini-prev');
  const miniNext = document.getElementById('btn-mini-next');
  const miniClear = document.getElementById('btn-mini-clear');

  if (miniPrev && btnPrevSlide) miniPrev.addEventListener('click', () => btnPrevSlide.click());
  if (miniNext && btnNextSlide) miniNext.addEventListener('click', () => btnNextSlide.click());
  if (miniClear && btnClear) miniClear.addEventListener('click', () => btnClear.click());
}

function initTabNavigation()
{
  initMobilePaneSwitcher();
  initHeaderCollapseToggle();

  tabButtons.forEach((btn) =>
  {
    btn.addEventListener('click', () =>
    {
      const targetTab = btn.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });

  try
  {
    const savedTab = localStorage.getItem('presenter_active_tab');
    if (savedTab && ['songs', 'bible', 'biblesearch', 'search'].includes(savedTab))
    {
      switchTab(savedTab);
    }
  }
  catch (e) {}
}

function switchTab(tabId)
{
  if (tabId === 'search') tabId = 'biblesearch';

  tabButtons.forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === tabId));
  
  const workspaceViews = document.querySelectorAll('.workspace-tab-view');
  workspaceViews.forEach(v => v.classList.toggle('active', v.id === `workspace-${tabId}`));

  if (tabId === 'songs' && typeof updateVirtualSongList === 'function')
  {
    updateVirtualSongList(true);
  }

  try
  {
    localStorage.setItem('presenter_active_tab', tabId);
  }
  catch (e) {}
}

// ---------------------------------------------------------------------------
// 3. Draggable Workspace Resizer Splitter (Desktop & Mobile Both Splitbar)
// ---------------------------------------------------------------------------
function initResizer()
{
  const workspace = document.getElementById('presenter-workspace');
  const resizers = document.querySelectorAll('.resizer-handle');
  if (!workspace || resizers.length === 0) return;

  const savedWidth = localStorage.getItem('presenter_left_panel_width') || localStorage.getItem('vv_left_panel_width');
  if (savedWidth)
  {
    workspace.style.setProperty('--left-panel-width', `${savedWidth}px`);
  }

  const savedMobileHeight = localStorage.getItem('presenter_mobile_browser_height');
  if (savedMobileHeight)
  {
    workspace.style.setProperty('--mobile-browser-pane-height', savedMobileHeight);
  }

  let isDragging = false;
  let isMobileHorizontalDrag = false;
  let activeResizer = null;
  let startPos = 0;
  let startDim = 0;
  let containerDim = 0;

  function onDragStart(e)
  {
    const resizer = e.currentTarget;
    const parentTab = resizer.closest('.workspace-tab-view');
    isMobileHorizontalDrag = parentTab ? parentTab.classList.contains('mobile-mode-both') : false;

    isDragging = true;
    activeResizer = resizer;
    resizer.classList.add('dragging');
    document.body.style.userSelect = 'none';

    if (isMobileHorizontalDrag)
    {
      document.body.style.cursor = 'row-resize';
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      startPos = clientY;
      const browserPane = parentTab.querySelector('.browser-pane');
      startDim = browserPane ? browserPane.getBoundingClientRect().height : 180;
      containerDim = parentTab.getBoundingClientRect().height;
    }
    else
    {
      document.body.style.cursor = 'col-resize';
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      startPos = clientX;
      const currentWidth = parseInt(getComputedStyle(workspace).getPropertyValue('--left-panel-width') || '420', 10);
      startDim = currentWidth || 420;
    }
  }

  function onDragMove(e)
  {
    if (!isDragging) return;

    if (isMobileHorizontalDrag)
    {
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const deltaY = clientY - startPos;
      const minH = 80;
      const maxH = containerDim > 0 ? containerDim - 80 : 500;
      const newHeight = Math.min(Math.max(minH, startDim + deltaY), maxH);
      workspace.style.setProperty('--mobile-browser-pane-height', `${newHeight}px`);
    }
    else
    {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const deltaX = clientX - startPos;
      const newWidth = Math.min(Math.max(260, startDim + deltaX), 850);
      workspace.style.setProperty('--left-panel-width', `${newWidth}px`);
      if (typeof updateSongDeckColumnWidth === 'function') updateSongDeckColumnWidth();
    }
  }

  function onDragEnd()
  {
    if (isDragging)
    {
      isDragging = false;
      if (activeResizer) activeResizer.classList.remove('dragging');
      activeResizer = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      if (typeof updateSongDeckColumnWidth === 'function') updateSongDeckColumnWidth();

      if (isMobileHorizontalDrag)
      {
        const finalHeight = workspace.style.getPropertyValue('--mobile-browser-pane-height');
        if (finalHeight) localStorage.setItem('presenter_mobile_browser_height', finalHeight);
      }
      else
      {
        const finalWidth = parseInt(workspace.style.getPropertyValue('--left-panel-width'), 10);
        if (finalWidth) localStorage.setItem('presenter_left_panel_width', finalWidth);
      }
    }
  }

  resizers.forEach((resizer) =>
  {
    resizer.addEventListener('mousedown', onDragStart);
    resizer.addEventListener('touchstart', onDragStart, { passive: true });
  });

  window.addEventListener('mousemove', onDragMove);
  window.addEventListener('touchmove', onDragMove, { passive: true });
  window.addEventListener('mouseup', onDragEnd);
  window.addEventListener('touchend', onDragEnd);
  window.addEventListener('touchcancel', onDragEnd);
}
