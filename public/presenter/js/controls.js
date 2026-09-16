// ===========================================================================
// Presenter Console — Controls, Hotkeys, Tabs & Workspace Resizer
// ===========================================================================

// Controls DOM References (Assigned inside initControls)
let buttonClear = null;
let buttonPreviousSlide = null;
let buttonNextSlide = null;
let liveIndicatorPill = null;

// ---------------------------------------------------------------------------
// 1. Toolbar Actions
// ---------------------------------------------------------------------------
function triggerClear()
{
  if (socket) socket.emit('action:clear');
}

function triggerPrevious()
{
  if (socket) socket.emit('action:previous');
}

function triggerNext()
{
  if (socket) socket.emit('action:next');
}

function initControls()
{
  // Assign Controls DOM elements
  buttonClear = document.getElementById('btn-clear');
  buttonPreviousSlide = document.getElementById('btn-prev-slide');
  buttonNextSlide = document.getElementById('btn-next-slide');
  liveIndicatorPill = document.getElementById('live-indicator-pill');

  initControlsEvent();
}

function initControlsEvent()
{
  buttonClear.addEventListener('click', triggerClear);
  buttonPreviousSlide.addEventListener('click', triggerPrevious);
  buttonNextSlide.addEventListener('click', triggerNext);
  liveIndicatorPill.addEventListener('click', jumpToLiveSlide);
}

// Jump to active live slide on clicking live indicator
async function jumpToLiveSlide()
{
  if (!liveState || liveState.status === 'clear' || liveState.type === 'none') return;

  if (liveState.type === 'song' && liveState.songId)
  {
    switchTab('songs');
    if (!selectedSongId || Number(selectedSongId) !== Number(liveState.songId))
    {
      selectSong(liveState.songId);
      await loadSongSlides();
    }
    const slideIdx = Number(liveState.slideIndex) || 1;

    if (slideDeckSongs)
    {
      for (let i = 0; i < slideDeckSongs.children.length; i++)
      {
        slideDeckSongs.children[i].classList.toggle('active-card', (i + 1) === slideIdx);
      }
      const targetSongSlide = slideDeckSongs.children[slideIdx - 1];
      if (targetSongSlide)
      {
        smoothScrollToElement(slideDeckContainer, targetSongSlide, 200);
      }
    }
  }
  else if (liveState.type === 'bible' && liveState.verseInfo)
  {
    switchTab('bible');
    const verseInfo = liveState.verseInfo;
    const bibleVersionId = verseInfo.versionId || selectedBibleVersionId;

    if (bibleVersionId !== selectedBibleVersionId)
    {
      selectedBibleVersionId = bibleVersionId;
      if (bibleVersionSelectionDropdown) bibleVersionSelectionDropdown.value = bibleVersionId;
      saveLastBrowsedBible();
      await loadBibleBooks(selectedBibleVersionId, verseInfo.bookNum, verseInfo.chNum, verseInfo.verseNum);
    }
    else
    {
      if (Number(selectedBookNumber) !== Number(verseInfo.bookNum))
      {
        await selectBibleBook(verseInfo.bookNum, verseInfo.chNum, verseInfo.verseNum);
      }
      else if (Number(selectedChapterNumber) !== Number(verseInfo.chNum))
      {
        await selectBibleChapter(verseInfo.chNum, verseInfo.verseNum);
      }
      else if (Number(selectedVerseNumber) !== Number(verseInfo.verseNum))
      {
        selectBibleVerse(verseInfo.verseNum, false);
      }
    }
  }
}



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

  let initialTab = 'songs';
  try
  {
    const savedTab = localStorage.getItem('presenter_active_tab');
    if (savedTab && ['songs', 'bible'].includes(savedTab))
    {
      initialTab = savedTab;
    }
  }
  catch (e) {}

  switchTab(initialTab);
}

function getChildAt(parent, index)
{
  return parent?.children[index] ?? null;
}

function switchTab(tabId)
{
  tabButtons.forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === tabId));
  
  const workspaceViews = document.querySelectorAll('.workspace-tab-view');
  workspaceViews.forEach(v => v.classList.toggle('active', v.id === `workspace-${tabId}`));

  const buttonAddSong = document.getElementById('btn-open-add-song');
  if (buttonAddSong)
  {
    buttonAddSong.style.display = (tabId === 'songs') ? '' : 'none';
  }

  const versionWrap = document.getElementById('wrap-select-version');
  if (versionWrap)
  {
    versionWrap.style.display = (tabId === 'bible') ? 'inline-flex' : 'none';
  }

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
// 3. Draggable Workspace Resizer Splitter (Pointer Events + setPointerCapture)
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

  resizers.forEach((resizer) =>
  {
    let isDragging = false;
    let isMobileHorizontalDrag = false;
    let startPos = 0;
    let startDim = 0;
    let containerDim = 0;

    resizer.addEventListener('pointerdown', (e) =>
    {
      // Only handle primary button / touch contact
      if (e.button !== 0 && e.pointerType === 'mouse') return;

      isDragging = true;
      resizer.setPointerCapture(e.pointerId);
      resizer.classList.add('dragging');
      document.body.style.userSelect = 'none';

      isMobileHorizontalDrag = window.innerWidth <= 768;
      const parentTab = resizer.closest('.workspace-tab-view');

      if (isMobileHorizontalDrag)
      {
        document.body.style.cursor = 'row-resize';
        startPos = e.clientY;
        const browserPane = parentTab ? parentTab.querySelector('.browser-pane') : null;
        startDim = browserPane ? browserPane.getBoundingClientRect().height : 180;
        containerDim = parentTab ? parentTab.getBoundingClientRect().height : 0;
      }
      else
      {
        document.body.style.cursor = 'col-resize';
        startPos = e.clientX;
        const currentWidth = parseInt(getComputedStyle(workspace).getPropertyValue('--left-panel-width') || '420', 10);
        startDim = currentWidth || 420;
      }
    });

    resizer.addEventListener('pointermove', (e) =>
    {
      if (!isDragging) return;

      if (isMobileHorizontalDrag)
      {
        const deltaY = e.clientY - startPos;
        const minH = 80;
        const maxH = containerDim > 0 ? containerDim - 80 : 500;
        const newHeight = Math.min(Math.max(minH, startDim + deltaY), maxH);
        workspace.style.setProperty('--mobile-browser-pane-height', `${newHeight}px`);
      }
      else
      {
        const deltaX = e.clientX - startPos;
        const newWidth = Math.min(Math.max(260, startDim + deltaX), 850);
        workspace.style.setProperty('--left-panel-width', `${newWidth}px`);
        if (typeof updateSongDeckColumnWidth === 'function') updateSongDeckColumnWidth();
      }
    });

    function endDrag(e)
    {
      if (!isDragging) return;
      isDragging = false;

      try
      {
        if (resizer.hasPointerCapture(e.pointerId))
        {
          resizer.releasePointerCapture(e.pointerId);
        }
      }
      catch (err) {}

      resizer.classList.remove('dragging');
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

    resizer.addEventListener('pointerup', endDrag);
    resizer.addEventListener('pointercancel', endDrag);
  });
}
