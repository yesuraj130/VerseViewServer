// ===========================================================================
// Presenter Console — Songs Browser & Slide Deck Presentation (Virtualized)
// ===========================================================================

let songsCache = null;
let selectedSongId = 0;
let selectedSongSlide = 0;
const songSlidesTextCache = new Map(); // Cached from /api/songs/${songId}
const maxSongSlidesTextCache = 50; // Caps in-memory song cache to ~50 songs
let currentSongSlidesFetchId = 0;

// Virtual List Constants and State
const SONG_ITEM_HEIGHT = 42; // Fixed height in px matching .song-searchresult
const SONG_BUFFER_COUNT = 8; // Number of buffer items above and below the viewport
let currentFilteredSongs = [];
let virtualScrollAnimationId = null;
let virtualLastRenderRange = { start: -1, end: -1 };

// Song DOM References (Assigned inside initSongs)
let songListContainer = null;
let songSearchInput = null;
let buttonClearSongSearch = null;
let slideDeckSongs = null;
let slideDeckContainer = null;
let activeSongTitle = null;
let buttonDeckEditSong = null;

function loadSongLocalStorage()
{
  try
  {
    selectedSongId = Number(localStorage.getItem('selectedSongId')) || 0;
  }
  catch (e) {}
}

async function initSongs()
{
  // Assign Songs DOM elements
  songSearchInput = document.getElementById('song-search-input');
  buttonClearSongSearch = document.getElementById('btn-clear-song-search');
  songListContainer = document.getElementById('song-list-container');
  slideDeckSongs = document.getElementById('slide-deck-songs');
  slideDeckContainer = slideDeckSongs;
  activeSongTitle = document.getElementById('active-song-title');
  buttonDeckEditSong = document.getElementById('btn-deck-edit-song');

  // Read Song configuration from LocalStorage
  loadSongLocalStorage();

  // Attach search, virtual list, and editor event listeners
  initSongSearchEvents();
  initSongEditorEvents();
  initVirtualSongListEvents();

  try
  {
    const localFetchId = ++currentSongSlidesFetchId;

    const songsFetchUrl = '/api/songs';
    const songsFetchResult = await fetch(songsFetchUrl);
    const songsFetchResultJson = await songsFetchResult.json();

    if (songsFetchResultJson && songsFetchResultJson.length > 0)
    {
      songsCache = songsFetchResultJson;
      if (selectedSongId === 0) selectedSongId = songsFetchResultJson[0].id;
    }

    if (localFetchId === currentSongSlidesFetchId)
    {
      loadSongsList();

      if (selectedSongId)
      {
        scrollToSongInList(selectedSongId);
      }

      await loadSongSlides();
    }
  }
  catch (err)
  {
    console.error('Error initializing Songs system:', err);
  }
}

async function reloadSongsCache()
{
  try
  {
    const songsFetchUrl = '/api/songs';
    const songsFetchResult = await fetch(songsFetchUrl);
    const songsFetchResultJson = await songsFetchResult.json();

    if (songsFetchResultJson && songsFetchResultJson.length > 0)
    {
      songsCache = songsFetchResultJson;
    }
  }
  catch (err)
  {
    console.error('Error reloading songs cache:', err);
  }
}

//#region Virtualized Songs List Engine
function loadSongsList(songSearchQuery, resetScroll = false)
{
  if (!songsCache)
  {
    console.warn('Songs cache not available');
    return;
  }

  const query = (songSearchQuery !== undefined ? songSearchQuery : (songSearchInput ? songSearchInput.value : '')).trim().toLowerCase();

  if (query.length > 0)
  {
    currentFilteredSongs = songsCache.filter(song =>
    {
      const name = (song.name || '').toLowerCase();
      const title2 = (song.title2 || '').toLowerCase();
      const firstLine = (song.firstLine || '').toLowerCase();
      const tags = (song.tags || '').toLowerCase();
      return name.includes(query) || title2.includes(query) || firstLine.includes(query) || tags.includes(query);
    });
  }
  else
  {
    currentFilteredSongs = songsCache.slice();
  }

  if (resetScroll && songListContainer)
  {
    songListContainer.scrollTop = 0;
  }

  updateVirtualSongList(true);
}

function updateVirtualSongList(force = false)
{
  if (!songListContainer) return;

  const totalCount = currentFilteredSongs.length;

  if (totalCount === 0)
  {
    songListContainer.innerHTML = '<div style="padding: 24px 16px; font-size: 13px; color: var(--color-font-muted); text-align: center;">No songs found</div>';
    virtualLastRenderRange = { start: -1, end: -1 };
    return;
  }

  const viewportHeight = songListContainer.clientHeight;
  // If the songs tab is hidden, clientHeight is 0; defer rendering until visible
  if (viewportHeight === 0) return;

  const scrollTop = songListContainer.scrollTop;
  const rawStartIndex = Math.floor(scrollTop / SONG_ITEM_HEIGHT);
  const rawEndIndex = Math.ceil((scrollTop + viewportHeight) / SONG_ITEM_HEIGHT);

  const startIndex = Math.max(0, rawStartIndex - SONG_BUFFER_COUNT);
  const endIndex = Math.min(totalCount, rawEndIndex + SONG_BUFFER_COUNT);

  // If the visible index range hasn't shifted and this isn't a forced render, skip DOM operations
  if (!force && startIndex === virtualLastRenderRange.start && endIndex === virtualLastRenderRange.end)
  {
    return;
  }

  virtualLastRenderRange = { start: startIndex, end: endIndex };

  const topPadding = startIndex * SONG_ITEM_HEIGHT;
  const bottomPadding = Math.max(0, (totalCount - endIndex) * SONG_ITEM_HEIGHT);

  const songFontFamily = `'Baloo Thambi 2', 'Baloo Thambi', 'Mukta Malar', 'Noto Sans Tamil', var(--font-display)`;

  const currentLiveSongId = (window.liveState && window.liveState.status === 'live' && window.liveState.type === 'song')
    ? Number(window.liveState.songId)
    : (typeof liveState !== 'undefined' && liveState && liveState.status === 'live' && liveState.type === 'song')
      ? Number(liveState.songId)
      : null;

  let html = `<div class="virtual-spacer-top" style="height: ${topPadding}px;"></div>`;

  for (let i = startIndex; i < endIndex; i++)
  {
    const song = currentFilteredSongs[i];
    const isSelected = selectedSongId && Number(selectedSongId) === Number(song.id);
    const isLive = currentLiveSongId && currentLiveSongId === Number(song.id);

    const classes = ['song-searchresult'];
    if (isSelected) classes.push('selected');
    if (isLive) classes.push('live');

    const displayName = song.name || '';
    const previewLine = song.firstLine ? escapeHtml(song.firstLine) : '&nbsp;';

    html += `
      <div class="${classes.join(' ')}" data-id="${song.id}">
        <div class="song-searchresult-name" style="font-family: ${songFontFamily};">
          ${escapeHtml(displayName)}
        </div>
        <div class="song-searchresult-previewfirstline" style="font-family: ${songFontFamily};" title="${escapeHtml(song.firstLine || '')}">
          ${previewLine}
        </div>
      </div>
    `;
  }

  html += `<div class="virtual-spacer-bottom" style="height: ${bottomPadding}px;"></div>`;

  songListContainer.innerHTML = html;
}

window.updateVirtualSongList = updateVirtualSongList;

function initVirtualSongListEvents()
{
  if (!songListContainer) return;

  // 1. Smooth, throttled scroll listener utilizing requestAnimationFrame
  songListContainer.addEventListener('scroll', () =>
  {
    if (virtualScrollAnimationId) cancelAnimationFrame(virtualScrollAnimationId);
    virtualScrollAnimationId = requestAnimationFrame(() =>
    {
      updateVirtualSongList(false);
    });
  }, { passive: true });

  // 2. High-performance event delegation for clicking song rows
  songListContainer.addEventListener('click', async (event) =>
  {
    const item = event.target.closest('.song-searchresult');
    if (!item) return;

    const targetSongId = Number(item.getAttribute('data-id'));
    if (!targetSongId || selectedSongId === targetSongId) return;

    selectSong(targetSongId, false);
    const isLoaded = await loadSongSlides();
    if (isLoaded && slideDeckSongs)
    {
      selectSongSlide(0);
    }
  });

  // 3. ResizeObserver adapts the virtual buffer immediately when splitter or window resizes
  if (window.ResizeObserver)
  {
    const songListResizeObserver = new ResizeObserver(() =>
    {
      if (songListContainer && songListContainer.clientHeight > 0)
      {
        updateVirtualSongList(true);
      }
    });
    songListResizeObserver.observe(songListContainer);
  }
}

function scrollToSongInList(targetSongId)
{
  if (!songListContainer || !currentFilteredSongs || currentFilteredSongs.length === 0) return;

  const index = currentFilteredSongs.findIndex(s => Number(s.id) === Number(targetSongId));
  if (index >= 0)
  {
    const itemTop = index * SONG_ITEM_HEIGHT;
    const viewportHeight = songListContainer.clientHeight || 400;
    const targetScroll = Math.max(0, itemTop - (viewportHeight / 2) + (SONG_ITEM_HEIGHT / 2));
    songListContainer.scrollTop = targetScroll;
    updateVirtualSongList(true);
  }
}

window.scrollToSongInList = scrollToSongInList;
//#endregion

async function loadSongSlides()
{
  const cachedSong = songSlidesTextCache.get(selectedSongId);
  if (cachedSong && cachedSong.slides && cachedSong.slides.length > 0)
  {
    renderSongSlides(cachedSong);
    return true;
  }
  else
  {
    if (slideDeckSongs) slideDeckSongs.innerHTML = '';
    return await fetchAndLoadSongSlides(selectedSongId);
  }
}

async function fetchAndLoadSongSlides(targetSongId)
{
  const localSongId = Number(targetSongId);
  const localFetchId = ++currentSongSlidesFetchId;

  try
  {
    const songFetchResult = await fetch(`/api/songs/${localSongId}`);

    // Guard against race conditions if user clicked another song before response returned
    if (localFetchId !== currentSongSlidesFetchId) return false;

    if (!songFetchResult.ok)
    {
      if (slideDeckSongs) slideDeckSongs.innerHTML = 'Error loading song slides';
      console.error(`Failed to fetch song ${localSongId}:`, songFetchResult.statusText);
      return false;
    }

    const song = await songFetchResult.json();
    if (song && song.slides && song.slides.length > 0)
    {
      // Add to cache with bounded LRU eviction
      if (songSlidesTextCache.size >= maxSongSlidesTextCache)
      {
        const oldestKey = songSlidesTextCache.keys().next().value;
        if (oldestKey) songSlidesTextCache.delete(oldestKey);
      }
      songSlidesTextCache.set(localSongId, song);

      renderSongSlides(song);
      return true;
    }
    else
    {
      if (slideDeckSongs) slideDeckSongs.innerHTML = 'No slides available.';
      return false;
    }
  }
  catch (err)
  {
    console.error('Error fetching song slides:', err);
    return false;
  }
}

//#region Selection
function selectSong(targetSongId, scrollIntoView = false)
{
  selectedSongId = Number(targetSongId);
  localStorage.setItem('selectedSongId', selectedSongId);

  updateVirtualSongList(true);

  if (scrollIntoView)
  {
    scrollToSongInList(selectedSongId);
  }
}

function selectSongSlide(targetSlideIndex)
{
  selectedSongSlide = targetSlideIndex;
  setSelectedIndexInList(slideDeckSongs, targetSlideIndex - 1);
}
//#endregion

//#region Slide Deck Rendering
function renderSongSlides(song)
{
  slideDeckSongs.innerHTML = '';

  activeSongTitle.textContent = song.name;
  activeSongTitle.style.fontFamily = `'Baloo Thambi 2', 'Baloo Thambi', 'Mukta Malar', 'Noto Sans Tamil', var(--font-display)`;
  
  if (buttonDeckEditSong) buttonDeckEditSong.style.display = 'inline-flex';

  const slides = song.slides;

  if (slides.length === 0)
  {
    slideDeckSongs.innerHTML = 'This song has no slides.';
    return;
  }

  const songFontFamily = `'Baloo Thambi 2', 'Baloo Thambi', 'Mukta Malar', 'Noto Sans Tamil', var(--font-display)`;

  slides.forEach((slide) =>
  {
    const card = document.createElement('div');
    card.className = 'slide-card';

    const lines = slide.lines;
    const linesHtml = lines.map(line => {
      const trimmed = line ? line.trim() : '';
      return trimmed ? `<div>${escapeHtml(line)}</div>` : `<div class="slide-line-gap">&nbsp;</div>`;
    }).join('');

    card.innerHTML = `
      <span class="slide-card-badge">LIVE</span>
      <div class="slide-card-content" style="font-family: ${songFontFamily};">
        ${linesHtml}
      </div>
    `;

    card.addEventListener('click', () =>
    {
      selectSongSlide(slide.slideIndex);
      presentSlide(slide);
    });

    slideDeckSongs.appendChild(card);
  });
}

function presentSlide(slide, slideIndexOverride)
{
  const targetSongId = slide ? (slide.songId || slide.songid || slide.id || selectedSongId) : selectedSongId;
  const targetSlideIndex = slideIndexOverride !== undefined ? slideIndexOverride : (slide ? slide.slideIndex : 1);
  const payload = {
    type: 'song',
    songId: targetSongId,
    slideIndex: targetSlideIndex
  };

  if (socket)
  {
    socket.emit('action:present', payload);
  }
  else
  {
    fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }
}
//#endregion

//#region List Scrolling and Selection Helpers
function scrollToIndexInList(container, index)
{
  if (index === 0) container.scrollTop = 0;
  else 
  {
    const activeItem = container.children[index];
    if (activeItem) activeItem.scrollIntoView({ block: 'nearest', behavior: 'auto' }); 
  }
}

function smoothScrollToIndexInList(container, index)
{
  const targetChild = container.children[index];
  if (targetChild && typeof smoothScrollToElement === 'function')
  {
    smoothScrollToElement(container, targetChild, 200, true);
  }
}

function setSelectedIndexInList(container, activeIndex)
{
  const items = container.children;
  for (let i = 0; i < items.length; i++)
  {
    items[i].classList.toggle('selected', i === activeIndex);
  }
}

function setSelectedDataItemInList(container, attributeName, attributeValue)
{
  if (container === songListContainer && attributeName === 'data-id')
  {
    selectedSongId = Number(attributeValue);
    updateVirtualSongList(true);
    return;
  }
  const items = container.children;
  for (let i = 0; i < items.length; i++)
  {
    const item = items[i];
    const isMatch = Number(item.getAttribute(attributeName)) === Number(attributeValue);
    item.classList.toggle('selected', isMatch);
  }
}

function scrollToDataItemInList(container, attributeName, attributeValue)
{
  if (container === songListContainer && attributeName === 'data-id')
  {
    scrollToSongInList(attributeValue);
    return;
  }
  const items = container.children;
  for (let i = 0; i < items.length; i++)
  {
    const item = items[i];
    const isMatch = Number(item.getAttribute(attributeName)) === Number(attributeValue);
    if (isMatch)
    {
      item.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      break;
    }
  }
}
//#endregion

//#region Song Search Input Events
function initSongSearchEvents()
{
  if (!songSearchInput) return;

  const updateClearButtonVisibility = () =>
  {
    if (buttonClearSongSearch)
    {
      buttonClearSongSearch.style.display = songSearchInput.value ? 'flex' : 'none';
    }
  };

  updateClearButtonVisibility();

  songSearchInput.addEventListener('input', () =>
  {
    const query = songSearchInput.value;
    updateClearButtonVisibility();
    loadSongsList(query, true);
  });

  songSearchInput.addEventListener('keydown', (e) =>
  {
    if (e.key === 'Escape' && songSearchInput.value)
    {
      e.preventDefault();
      songSearchInput.value = '';
      updateClearButtonVisibility();
      loadSongsList('', true);
    }
  });

  if (buttonClearSongSearch)
  {
    buttonClearSongSearch.addEventListener('click', () =>
    {
      songSearchInput.value = '';
      songSearchInput.focus();
      updateClearButtonVisibility();
      loadSongsList('', true);
    });
  }
}
//#endregion
