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

  try
  {
    const savedTab = localStorage.getItem('presenter_active_tab');
    if (savedTab && ['songs', 'bible', 'search'].includes(savedTab))
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

  try
  {
    localStorage.setItem('presenter_active_tab', tabId);
  }
  catch (e) {}
}

// ---------------------------------------------------------------------------
// 3. Draggable Workspace Resizer Splitter
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

  let isDragging = false;
  let activeResizer = null;
  let startX = 0;
  let startWidth = 0;

  resizers.forEach((resizer) =>
  {
    resizer.addEventListener('mousedown', (e) =>
    {
      isDragging = true;
      activeResizer = resizer;
      resizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      startX = e.clientX;
      const currentWidth = parseInt(getComputedStyle(workspace).getPropertyValue('--left-panel-width') || '420', 10);
      startWidth = currentWidth || 420;
      e.preventDefault();
    });
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
      if (activeResizer) activeResizer.classList.remove('dragging');
      activeResizer = null;
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
