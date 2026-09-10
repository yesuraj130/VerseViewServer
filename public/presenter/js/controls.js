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

function triggerPrevious()
{
  // Only control what is currently LIVE (Song or Scripture). If not live, do nothing.
  if (!liveState || liveState.status !== 'live') return;

  if (liveState.type === 'song' && liveState.songId)
  {
    const currentIdx = Number(liveState.slideIndex) || 1;
    const prevIdx = Math.max(1, currentIdx - 1);
    presentSlide({ id: liveState.songId }, prevIdx);
  }
  else if (liveState.type === 'bible' && liveState.verseInfo)
  {
    const vInfo = liveState.verseInfo;
    const prevVerse = Math.max(1, Number(vInfo.verseNum) - 1);
    presentBibleVerse(vInfo.version || selectedBibleVersionId, {
      bookNum: vInfo.bookNum,
      chNum: vInfo.chNum,
      verseNum: prevVerse
    });
    if (Number(selectedBookNumber) === Number(vInfo.bookNum) && Number(selectedChapterNumber) === Number(vInfo.chNum))
    {
      selectBibleVerse(prevVerse, false);
    }
  }
}

function triggerNext()
{
  // Only control what is currently LIVE (Song or Scripture). If not live, do nothing.
  if (!liveState || liveState.status !== 'live') return;

  if (liveState.type === 'song' && liveState.songId)
  {
    const currentIdx = Number(liveState.slideIndex) || 1;
    const total = Number(liveState.totalSlides) || ((selectedSong && selectedSong.slides) ? selectedSong.slides.length : (currentIdx + 1));
    const nextIdx = Math.min(total, currentIdx + 1);
    presentSlide({ id: liveState.songId }, nextIdx);
  }
  else if (liveState.type === 'bible' && liveState.verseInfo)
  {
    const vInfo = liveState.verseInfo;
    const currentVerse = Number(vInfo.verseNum) || 1;
    const totalVerses = (Number(selectedBookNumber) === Number(vInfo.bookNum) && Number(selectedChapterNumber) === Number(vInfo.chNum))
      ? ((bibleVersesList && bibleVersesList.children.length) || (slideDeckBible && slideDeckBible.children.length) || 150)
      : 150;
    const nextVerse = Math.min(totalVerses, currentVerse + 1);
    presentBibleVerse(vInfo.version || selectedBibleVersionId, {
      bookNum: vInfo.bookNum,
      chNum: vInfo.chNum,
      verseNum: nextVerse
    });
    if (Number(selectedBookNumber) === Number(vInfo.bookNum) && Number(selectedChapterNumber) === Number(vInfo.chNum))
    {
      selectBibleVerse(nextVerse, false);
    }
  }
}

// Global Keyboard Navigation Shortcuts
window.addEventListener('keydown', (e) =>
{
  const targetTag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
  if (targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select' || (e.target && e.target.isContentEditable))
  {
    return;
  }

  if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ')
  {
    e.preventDefault();
    triggerNext();
  }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp')
  {
    e.preventDefault();
    triggerPrevious();
  }
  else if (e.key === 'Escape')
  {
    triggerClear();
  }
});

// Event Listeners for Toolbar Buttons
if (buttonClear) buttonClear.addEventListener('click', triggerClear);
if (buttonPreviousSlide) buttonPreviousSlide.addEventListener('click', triggerPrevious);
if (buttonNextSlide) buttonNextSlide.addEventListener('click', triggerNext);

// Event Listeners
if (liveIndicatorPill) liveIndicatorPill.addEventListener('click', jumpToLiveSlide);

// Jump to active live slide on clicking live indicator
async function jumpToLiveSlide()
{
  if (!liveState || liveState.status === 'clear' || liveState.type === 'none') return;

  if (liveState.type === 'song' && liveState.songId)
  {
    switchTab('songs');
    if (!selectedSong || Number(selectedSong.id) !== Number(liveState.songId))
    {
      await selectSong(liveState.songId);
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
// ---------------------------------------------------------------------------
// Header Collapse Toggle System
// ---------------------------------------------------------------------------
function updateCollapseButtons(collapsed)
{
  const buttonCollapseHeader = document.getElementById('btn-collapse-header');
  if (buttonCollapseHeader)
  {
    if (collapsed)
    {
      buttonCollapseHeader.classList.add('collapsed');
      buttonCollapseHeader.setAttribute('title', 'Expand Header & Tabs');
      buttonCollapseHeader.setAttribute('aria-label', 'Expand Header & Tabs');
      buttonCollapseHeader.innerHTML = `
        <svg class="vv-icon" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      `;
    }
    else
    {
      buttonCollapseHeader.classList.remove('collapsed');
      buttonCollapseHeader.setAttribute('title', 'Collapse Header & Tabs');
      buttonCollapseHeader.setAttribute('aria-label', 'Collapse Header & Tabs');
      buttonCollapseHeader.innerHTML = `
        <svg class="vv-icon" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="18 15 12 9 6 15"></polyline>
        </svg>
      `;
    }
  }
}

function initHeaderCollapseToggle()
{
  const buttonCollapseHeader = document.getElementById('btn-collapse-header');
  const appContainer = document.querySelector('.presenter-app');
  if (!appContainer || !buttonCollapseHeader) return;

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

  buttonCollapseHeader.addEventListener('click', (e) => {
    e.stopPropagation();
    const collapsed = appContainer.classList.toggle('header-collapsed');
    updateCollapseButtons(collapsed);
    try
    {
      localStorage.setItem('presenter_header_collapsed', collapsed ? 'true' : 'false');
    }
    catch (e) {}
  });
}

function initTabNavigation()
{
  initHeaderCollapseToggle();

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
    isMobileHorizontalDrag = window.innerWidth <= 768;

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
