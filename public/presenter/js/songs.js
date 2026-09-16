// ===========================================================================
// Presenter Console — Songs Browser & Slide Deck Presentation
// ===========================================================================

let songsCache = null;
let selectedSongId = 0;
let selectedSongSlide = 0;
const songSlidesTextCache = new Map(); // Cached from /api/songs/${songId}
const maxSongSlidesTextCache = 50; // Caps in-memory song cache to ~50 songs
let currentSongSlidesFetchId = 0;

// Song DOM References (Assigned inside initSongs)
let songListContainer = null;
let songSearchInput = null;
let buttonClearSongSearch = null;
let slideDeckSongs = null;
let slideDeckContainer = null;
let activeSongTitle = null;
let activeSlideCountIndicator = null;
let buttonDeckEditSong = null;


function loadSongLocalStorage()
{
  try
  {
      selectedSongId = Number(localStorage.getItem('selectedSongId'));
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
  activeSlideCountIndicator = document.getElementById('active-slide-count-indicator');
  buttonDeckEditSong = document.getElementById('btn-deck-edit-song');

  // Read Song configuration from LocalStorage
  loadSongLocalStorage();

  // Attach search and editor event listeners
  initSongSearchEvents();
  initSongEditorEvents();

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

      setSelectedDataItemInList(songListContainer, 'data-id', selectedSongId);
      scrollToDataItemInList(songListContainer, 'data-id', selectedSongId);

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

//#region Loading
function loadSongsList(songSearchQuery)
{
  if (!songsCache)
  {
    console.warn('Songs cache not available');
    return;
  }

  const query = (songSearchQuery || '').trim().toLowerCase();

  if (query.length > 0)
  {
    const songsToRender = songsCache.filter(song =>
    {
      const name = (song.name || '').toLowerCase();
      const title2 = (song.title2 || '').toLowerCase();
      return name.includes(query) || title2.includes(query);
    });
    renderSongsList(songsToRender);
  }
  else
  {
    renderSongsList(songsCache);
  }
}

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
//#endregion

//#region Selection
function selectSong(targetSongId)
{
  selectedSongId = targetSongId;
  localStorage.setItem('selectedSongId', selectedSongId);

  setSelectedDataItemInList(songListContainer, 'data-id', selectedSongId);
}

function selectSongSlide(targetSlideIndex)
{
  selectedSongSlide = targetSlideIndex;
  setSelectedIndexInList(slideDeckSongs, targetSlideIndex - 1);
}
//#endregion

//#region Rendering

function renderSongsList(songs)
{
  songListContainer.innerHTML = '';

  if (!songs || songs.length === 0)
  {
    songListContainer.innerHTML = 'No songs found';
    return;
  }

  songs.forEach((song) =>
  {
    const item = document.createElement('div');
    item.className = 'song-item';
    item.setAttribute('data-id', song.id);

    if (selectedSongId === song.id) item.classList.add('selected');
    
    const songFontFamily = `'Baloo Thambi 2', 'Baloo Thambi', 'Mukta Malar', 'Noto Sans Tamil', var(--font-display)`;
    const displayName = song.name;
    const previewLine = song.firstLine ? escapeHtml(song.firstLine) : '&nbsp;';

    item.innerHTML = `
      <div class="song-item-info">
        <div class="song-item-name" style="font-family: ${songFontFamily};">
          <span class="song-name-text">${escapeHtml(displayName)}</span>
        </div>
        <div class="song-item-preview" style="font-family: ${songFontFamily};">${previewLine}</div>
      </div>
    `;

    item.addEventListener('click', async () =>
    {
      if (selectedSongId === Number(song.id)) return;
      selectSong(song.id);
      const isLoaded = await loadSongSlides();
      if (isLoaded && slideDeckSongs)
      {
        selectSongSlide(0);
      }
    });

    songListContainer.appendChild(item);
  });
}

function renderSongSlides(song)
{
  slideDeckSongs.innerHTML = '';

  activeSongTitle.textContent = song.name;
  activeSongTitle.style.fontFamily = `'Baloo Thambi 2', 'Baloo Thambi', 'Mukta Malar', 'Noto Sans Tamil', var(--font-display)`;
  
  if (buttonDeckEditSong) buttonDeckEditSong.style.display = 'inline-flex';

  const slides = song.slides;
  if (activeSlideCountIndicator)
  {
    activeSlideCountIndicator.textContent = `${slides.length} slide${slides.length === 1 ? '' : 's'}`;
  }

  if (slides.length === 0)
  {
    slideDeckSongs.innerHTML = 'This song has no slides.';
    return;
  }

  //updateSongDeckColumnWidth();

  const songFontFamily = `'Baloo Thambi 2', 'Baloo Thambi', 'Mukta Malar', 'Noto Sans Tamil', var(--font-display)`;

  slides.forEach((slide) =>
  {
    const card = document.createElement('div');
    card.className = 'slide-card';

    const lines = slide.lines;
    const linesHtml = lines.map(line => `<div>${escapeHtml(line)}</div>`).join('');

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
//#endregion

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

//#region List Scrolling and Selection
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
    items[i].classList.toggle('active', i === activeIndex);
  }
}
function setSelectedDataItemInList(container, attributeName, attributeValue)
{
  const items = container.children;
  for (let i = 0; i < items.length; i++)
  {
    const item = items[i];
    const isMatch = Number(item.getAttribute(attributeName)) === attributeValue;
    item.classList.toggle('selected', isMatch);
  }
}
function scrollToDataItemInList(container, attributeName, attributeValue)
{
  const items = container.children;
  for (let i = 0; i < items.length; i++)
  {
    const item = items[i];
    const isMatch = Number(item.getAttribute(attributeName)) === attributeValue;
    if (isMatch)
    {
      item.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      break;
    }
  }
}
//#endregion

//#region Song Search & Editor Dialog
function initSongSearchEvents()
{
  songSearchInput.addEventListener('input', () =>
  {
    buttonClearSongSearch.style.display = songSearchInput.value ? 'flex' : 'none';   
    loadSongsList(songSearchInput.value);
  });

  if (buttonClearSongSearch)
  {
    buttonClearSongSearch.addEventListener('click', () =>
    {
      songSearchInput.value = '';
      songSearchInput.focus();
      buttonClearSongSearch.style.display = 'none';   
      loadSongsList('');
    });
  }
}
//#endregion

