// ===========================================================================
// Presenter Console — Songs Browser & Slide Deck Presentation (Virtualized)
// Supports Instant Tamil Phonetic Title Search & Server Content/Lyrics Search
// ===========================================================================

let songsCache = null;
let selectedSongId = 0;
let selectedSongSlide = 0;
const songSlidesTextCache = new Map(); // Cached from /api/songs/${songId}
const maxSongSlidesTextCache = 50; // Caps in-memory song cache to ~50 songs
let currentSongSlidesFetchId = 0;

// Virtual List Constants and State
const SONG_ITEM_HEIGHT = 42; // Fixed height in px matching .song-searchresult
const SONG_BUFFER_COUNT = 8; // Number of buffer items above and below viewport
let currentFilteredSongs = [];
let currentSearchQuery = '';
let isContentSearchMode = false;
let virtualScrollAnimationId = null;
let virtualLastRenderRange = { start: -1, end: -1 };

// Song DOM References
let songListContainer = null;
let songSearchInput = null;
let buttonClearSongSearch = null;
let buttonExecuteSongSearch = null;
let songSearchStatusBar = null;
let songSearchStatusSpinner = null;
let songSearchStatusText = null;
let slideDeckSongs = null;
let slideDeckContainer = null;
let activeSongTitle = null;
let buttonDeckEditSong = null;
let contentSearchAbortController = null;

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
  buttonExecuteSongSearch = document.getElementById('btn-execute-song-search');
  songSearchStatusBar = document.getElementById('song-search-status-bar');
  songSearchStatusSpinner = document.getElementById('song-search-status-spinner');
  songSearchStatusText = document.getElementById('song-search-status-text');
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
    const targetSongId = selectedSongId;

    // Concurrently fetch songs catalog and pre-fetch initial song slides in parallel
    const [songsFetchResultJson, targetSongData] = await Promise.all([
      fetch('/api/songs').then(r => (r.ok ? r.json() : [])).catch(() => []),
      targetSongId ? fetch(`/api/songs/${targetSongId}`).then(r => (r.ok ? r.json() : null)).catch(() => null) : Promise.resolve(null)
    ]);

    if (songsFetchResultJson && songsFetchResultJson.length > 0)
    {
      songsCache = songsFetchResultJson;
      if (selectedSongId === 0) selectedSongId = songsFetchResultJson[0].id;
    }

    if (targetSongData && targetSongData.id)
    {
      songSlidesTextCache.set(Number(targetSongData.id), targetSongData);
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
      if (!isContentSearchMode)
      {
        loadSongsList(currentSearchQuery, false);
      }
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
  if (contentSearchAbortController)
  {
    contentSearchAbortController.abort();
    contentSearchAbortController = null;
  }

  if (!songsCache)
  {
    console.warn('Songs cache not available');
    return;
  }

  isContentSearchMode = false;
  if (songSearchStatusBar) songSearchStatusBar.style.display = 'none';
  if (songSearchStatusSpinner) songSearchStatusSpinner.style.display = 'none';

  const rawQuery = (songSearchQuery !== undefined ? songSearchQuery : (songSearchInput ? songSearchInput.value : '')).trim();
  currentSearchQuery = rawQuery;

  if (rawQuery.length > 0)
  {
    const queryLower = rawQuery.toLowerCase();
    const qPattern = window.TamilPhonetic ? window.TamilPhonetic.compileQueryPattern(rawQuery) : null;

    currentFilteredSongs = songsCache.filter(song =>
    {
      const name = song.name || '';
      const rawTitle2 = (song.title2 || '').trim();
      // title2 is optional and can be empty or literal "null"
      const title2 = (rawTitle2 && rawTitle2.toLowerCase() !== 'null') ? rawTitle2 : '';
      const firstLine = song.firstLine || '';

      // Direct substring match first across title 1, title 2 (if present), and first line
      if (!rawQuery.includes('*'))
      {
        if (name.toLowerCase().includes(queryLower) ||
            (title2 && title2.toLowerCase().includes(queryLower)) ||
            (firstLine && firstLine.toLowerCase().includes(queryLower)))
        {
          return true;
        }
      }

      // Phonetic pattern and wildcard match on song title 1, title 2, and first line
      if (window.TamilPhonetic && qPattern && qPattern.wordItems.length > 0)
      {
        if (window.TamilPhonetic.matchWithPrecomputedKeys(name, qPattern, rawQuery).matched ||
            (title2 && window.TamilPhonetic.matchWithPrecomputedKeys(title2, qPattern, rawQuery).matched) ||
            (firstLine && window.TamilPhonetic.matchWithPrecomputedKeys(firstLine, qPattern, rawQuery).matched))
        {
          return true;
        }
      }

      return false;
    });

    // Standard alphabetical sorting by song title (Name)
    currentFilteredSongs.sort((a, b) =>
    {
      const aName = (a.name || '').toLowerCase();
      const bName = (b.name || '').toLowerCase();
      return aName.localeCompare(bName);
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
  if (viewportHeight === 0) return;

  const scrollTop = songListContainer.scrollTop;
  const rawStartIndex = Math.floor(scrollTop / SONG_ITEM_HEIGHT);
  const rawEndIndex = Math.ceil((scrollTop + viewportHeight) / SONG_ITEM_HEIGHT);

  const startIndex = Math.max(0, rawStartIndex - SONG_BUFFER_COUNT);
  const endIndex = Math.min(totalCount, rawEndIndex + SONG_BUFFER_COUNT);

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

    const rawFont = song.font;
    const effectiveFont = (typeof window.getEffectiveSongFont === 'function')
      ? window.getEffectiveSongFont(rawFont)
      : (rawFont || 'Baloo Thambi 2');
    const itemFontFamily = `"${effectiveFont}", 'Baloo Thambi 2', 'Baloo Thambi', 'Mukta Malar', 'Noto Sans Tamil', var(--font-display)`;

    const classes = ['song-searchresult'];
    if (isSelected) classes.push('selected');
    if (isLive) classes.push('live');

    const displayName = song.name || '';
    
    // Highlight matched characters in song title
    const highlightedName = (currentSearchQuery && window.TamilPhonetic)
      ? window.TamilPhonetic.highlightMatchedCharacters(displayName, currentSearchQuery)
      : escapeHtml(displayName);

    // In content search mode, show matched line with highlights; in title/firstLine search mode, show clean first line with highlights if matched
    let previewLineHtml = '&nbsp;';
    if (isContentSearchMode && song.matchedLine)
    {
      const highlightedMatch = (currentSearchQuery && window.TamilPhonetic)
        ? window.TamilPhonetic.highlightMatchedCharacters(song.matchedLine, currentSearchQuery)
        : escapeHtml(song.matchedLine);
      const slideBadge = song.matchedSlideIndex ? `<span style="opacity: 0.75; font-size: 10px; margin-right: 4px;">[S${song.matchedSlideIndex}]</span>` : '';
      previewLineHtml = `${slideBadge}${highlightedMatch}`;
    }
    else if (song.firstLine)
    {
      previewLineHtml = (currentSearchQuery && window.TamilPhonetic)
        ? window.TamilPhonetic.highlightMatchedCharacters(song.firstLine, currentSearchQuery)
        : escapeHtml(song.firstLine);
    }

    const titleAttr = escapeHtml(song.matchedLine || song.firstLine || song.name || '');

    html += `
      <div class="${classes.join(' ')}" data-id="${song.id}" data-matched-slide="${song.matchedSlideIndex || 1}">
        <div class="song-searchresult-name" style="font-family: ${songFontFamily};">
          ${highlightedName}
        </div>
        <div class="song-searchresult-previewfirstline" style="font-family: ${songFontFamily};" title="${titleAttr}">
          ${previewLineHtml}
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

  songListContainer.addEventListener('scroll', () =>
  {
    if (virtualScrollAnimationId) cancelAnimationFrame(virtualScrollAnimationId);
    virtualScrollAnimationId = requestAnimationFrame(() =>
    {
      updateVirtualSongList(false);
    });
  }, { passive: true });

  songListContainer.addEventListener('click', async (event) =>
  {
    const item = event.target.closest('.song-searchresult');
    if (!item) return;

    const targetSongId = Number(item.getAttribute('data-id'));
    const matchedSlide = Number(item.getAttribute('data-matched-slide')) || 1;
    if (!targetSongId) return;

    selectSong(targetSongId, false);
    const isLoaded = await loadSongSlides();
    if (isLoaded && slideDeckSongs)
    {
      // If user clicked a content search result with a matched slide index, jump to it
      if (isContentSearchMode && matchedSlide > 1)
      {
        selectSongSlide(matchedSlide);
        scrollToIndexInList(slideDeckSongs, matchedSlide - 1);
      }
      else
      {
        selectSongSlide(0);
      }
    }
  });

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

  const rawFont = song.font;
  const effectiveFont = (typeof window.getEffectiveSongFont === 'function')
    ? window.getEffectiveSongFont(rawFont)
    : (rawFont || 'Baloo Thambi 2');
  const songFontFamily = `"${effectiveFont}", 'Baloo Thambi 2', 'Baloo Thambi', 'Mukta Malar', 'Noto Sans Tamil', var(--font-display)`;
  const standardTitleFontFamily = `'Baloo Thambi 2', 'Baloo Thambi', 'Mukta Malar', 'Noto Sans Tamil', var(--font-display)`;

  activeSongTitle.textContent = song.name;
  activeSongTitle.style.fontFamily = standardTitleFontFamily;
  
  if (buttonDeckEditSong) buttonDeckEditSong.style.display = 'inline-flex';

  const slides = song.slides;

  if (slides.length === 0)
  {
    slideDeckSongs.innerHTML = 'This song has no slides.';
    return;
  }

  slides.forEach((slide) =>
  {
    const card = document.createElement('div');
    card.className = 'slide-card';
    card.setAttribute('data-slide-index', slide.slideIndex);

    const isLiveSong = window.liveState && window.liveState.status === 'live' && window.liveState.type === 'song';
    const isThisSlideLive = isLiveSong &&
      Number(window.liveState.songId) === Number(song.id) &&
      Number(window.liveState.slideIndex) === Number(slide.slideIndex);

    if (isThisSlideLive)
    {
      card.classList.add('live');
    }

    const lines = slide.lines;
    const linesHtml = lines.map(line => {
      const trimmed = line ? line.trim() : '';
      if (!trimmed) return `<div class="slide-line-gap">&nbsp;</div>`;
      
      // Highlight matched search characters on slides if in content search mode or query active
      const highlightedLine = (currentSearchQuery && window.TamilPhonetic)
        ? window.TamilPhonetic.highlightMatchedCharacters(line, currentSearchQuery)
        : escapeHtml(line);

      return `<div>${highlightedLine}</div>`;
    }).join('');

    card.innerHTML = `
      <span class="slide-card-badge" style="display: ${isThisSlideLive ? 'inline-block' : 'none'};">LIVE</span>
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

  if (typeof highlightActiveInDecks === 'function' && window.liveState)
  {
    highlightActiveInDecks(window.liveState);
  }
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
  if (!container || !container.children) return;
  if (index === 0) container.scrollTop = 0;
  else 
  {
    const activeItem = container.children[index];
    if (activeItem) activeItem.scrollIntoView({ block: 'nearest', behavior: 'auto' }); 
  }
}

function setSelectedIndexInList(container, activeIndex)
{
  if (!container || !container.children) return;
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

//#region Server-Side Song Content Search Engine
async function executeContentSearch()
{
  const query = (songSearchInput ? songSearchInput.value : '').trim();
  if (!query)
  {
    loadSongsList('', true);
    return;
  }

  // Cancel any existing search in progress
  if (contentSearchAbortController)
  {
    contentSearchAbortController.abort();
    contentSearchAbortController = null;
  }

  contentSearchAbortController = new AbortController();
  const currentController = contentSearchAbortController;
  currentSearchQuery = query;

  if (buttonExecuteSongSearch)
  {
    buttonExecuteSongSearch.classList.add('active');
  }

  if (!songSearchStatusBar) songSearchStatusBar = document.getElementById('song-search-status-bar');
  if (!songSearchStatusSpinner) songSearchStatusSpinner = document.getElementById('song-search-status-spinner');
  if (!songSearchStatusText) songSearchStatusText = document.getElementById('song-search-status-text');

  if (songSearchStatusBar)
  {
    songSearchStatusBar.style.display = 'flex';
    if (songSearchStatusSpinner)
    {
      songSearchStatusSpinner.style.display = 'inline-flex';
    }
    if (songSearchStatusText)
    {
      songSearchStatusText.textContent = `Searching lyrics for "${query}"...`;
    }
  }

  isContentSearchMode = true;
  currentFilteredSongs = [];
  if (songListContainer)
  {
    songListContainer.scrollTop = 0;
  }
  updateVirtualSongList(true);

  try
  {
    const response = await fetch(`/api/songs/search?q=${encodeURIComponent(query)}`, {
      signal: currentController.signal
    });

    if (!response.ok)
    {
      throw new Error(`Search failed with HTTP ${response.status}`);
    }

    const results = await response.json();
    currentFilteredSongs = Array.isArray(results) ? results : [];

    if (songSearchStatusSpinner)
    {
      songSearchStatusSpinner.style.display = 'none';
    }

    if (songSearchStatusBar && songSearchStatusText)
    {
      const count = currentFilteredSongs.length;
      songSearchStatusText.textContent = `${count} ${count === 1 ? 'song' : 'songs'} matched lyrics for "${query}"`;
    }

    updateVirtualSongList(false);

    // Auto-select first result if available
    if (currentFilteredSongs.length > 0)
    {
      const first = currentFilteredSongs[0];
      selectSong(first.id, false);
      loadSongSlides().then(isLoaded =>
      {
        if (isLoaded && first.matchedSlideIndex > 1 && slideDeckSongs)
        {
          selectSongSlide(first.matchedSlideIndex);
          scrollToIndexInList(slideDeckSongs, first.matchedSlideIndex - 1);
        }
      });
    }
  }
  catch (err)
  {
    if (err.name === 'AbortError')
    {
      return; // gracefully cancelled by another user action
    }
    console.error('Error executing song lyrics search:', err);
    if (songSearchStatusSpinner)
    {
      songSearchStatusSpinner.style.display = 'none';
    }
    if (songSearchStatusText)
    {
      songSearchStatusText.textContent = `Search error: ${err.message}`;
    }
  }
  finally
  {
    if (buttonExecuteSongSearch)
    {
      buttonExecuteSongSearch.classList.remove('active');
    }
    if (contentSearchAbortController === currentController)
    {
      contentSearchAbortController = null;
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

  // 1. Live Client-Side Filtering as user types (Title & Phonetic Title matching)
  songSearchInput.addEventListener('input', () =>
  {
    const query = songSearchInput.value;
    updateClearButtonVisibility();
    loadSongsList(query, true);
  });

  // 2. Keyboard shortcuts (Enter triggers server lyrics search, Escape clears)
  songSearchInput.addEventListener('keydown', (e) =>
  {
    if (e.key === 'Enter')
    {
      e.preventDefault();
      executeContentSearch();
    }
    else if (e.key === 'Escape' && songSearchInput.value)
    {
      e.preventDefault();
      songSearchInput.value = '';
      updateClearButtonVisibility();
      loadSongsList('', true);
    }
  });

  // 3. Clear button click
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

  // 4. Search submit button click (Server-side lyrics content search)
  if (buttonExecuteSongSearch)
  {
    buttonExecuteSongSearch.addEventListener('click', (e) =>
    {
      e.preventDefault();
      executeContentSearch();
    });
  }
}
//#endregion

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
