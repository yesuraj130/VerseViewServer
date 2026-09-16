// ===========================================================================
// Presenter Console — Songs Browser & Slide Deck Presentation
// ===========================================================================

let songsCache = null;
let selectedSongId = 1;
let selectedSongSlide = 0;
const songSlidesTextCache = new Map(); // Cached from /api/songs/${songId}
const maxSongSlidesTextCache = 50; // Caps in-memory song cache to ~50 songs
let currentSongSlidesFetchId = 0;


function loadSongLocalStorage()
{
  try
  {
    const savedSongId = localStorage.getItem('last_browsed_song_id');
    if (savedSongId)
    {
      selectedSongId = savedSongId;
    }
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
    const localSongId = selectedSongId;
    const localFetchId = ++currentSongSlidesFetchId;

    const songsFetchUrl = '/api/songs';
    const songsFetchResult = await fetch(songsFetchUrl);
    const songsFetchResultJson = await songsFetchResult.json();

    songsCache = songsFetchResultJson;

    if (localFetchId === currentSongSlidesFetchId)
    {
      loadSongsList();

      setSelectedDataItemInList(songListContainer, 'data-id', localSongId);
      scrollToDataItemInList(songListContainer, 'data-id', localSongId);

      await loadSongSlides();
    }
  }
  catch (err)
  {
    console.error('Error initializing Songs system:', err);
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

  if (songSearchQuery && songSearchQuery.trim().length > 0)
  {
    const songsToRender = songsCache.filter(song =>
    {
      const name = (song.name || '').toLowerCase();
      const firstLine = (song.firstLine || '').toLowerCase();
      const cat = (song.cat || '').toLowerCase();
      return name.includes(songSearchQuery) || firstLine.includes(songSearchQuery) || cat.includes(songSearchQuery);
    });
    renderSongsList(songsToRender);
  }
  else
  {
    renderSongsList(songsCache);
  }
}

async function reloadSongsCache()
{
  try
  {
    const res = await fetch('/api/songs');
    songsCache = (await res.json()) || [];
  }
  catch (err)
  {
    console.error('Error reloading songs cache:', err);
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
  saveLastBrowsedSong(targetSongId);
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
  
  const slides = song.slides;
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
      <span class="slide-card-badge" style="${isLive ? 'display: inline-block;' : 'display: none;'}">LIVE</span>
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

function presentSlide(slide)
{
  const songId = (song && song.id !== undefined) ? song.id : song;
  const payload = {
    type: 'song',
    songId: slide.songId,
    slideIndex: slide.slideIndex
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
    });
  }
}

function lyricsToTextareaValue(lyricsStr)
{
  if (!lyricsStr) return '';
  const slides = lyricsStr.split('<slide>').filter(s => s.trim().length > 0);
  return slides.map(s => s.replace(/<br\s*\/?>/gi, '\n').trim()).join('\n\n\n');
}

function textareaValueToLyrics(rawText)
{
  if (!rawText || !rawText.trim()) return '';
  const sections = rawText.split(/\r?\n(?:\s*\r?\n){2,}/);
  return sections
    .map(sec => sec.trim())
    .filter(Boolean)
    .map(sec => {
      const lines = sec.split(/\r?\n/).map(l => l.trim());
      while (lines.length > 0 && !lines[0]) lines.shift();
      while (lines.length > 0 && !lines[lines.length - 1]) lines.pop();
      return lines.join('<BR>');
    })
    .filter(Boolean)
    .join('<slide>');
}

function closeEditSongDialog()
{
  if (editSongDialog) editSongDialog.style.display = 'none';
}

function initSongEditorEvents()
{
  if (buttonOpenAddSong)
  {
    buttonOpenAddSong.addEventListener('click', () =>
    {
      if (editSongIdHiddenInput) editSongIdHiddenInput.value = '';
      if (editSongDialogHeading) editSongDialogHeading.textContent = 'Add New Song';
      if (editSongTitleTextbox) editSongTitleTextbox.value = '';
      if (editSongSecondaryTitleTextbox) editSongSecondaryTitleTextbox.value = '';
      if (editSongCategoryTextbox) editSongCategoryTextbox.value = '';
      if (editSongFontTextbox) editSongFontTextbox.value = '';
      if (editSongTagsTextbox) editSongTagsTextbox.value = '';
      if (editSongLyricsTextarea) editSongLyricsTextarea.value = '';
      if (buttonDeleteSongDialog) buttonDeleteSongDialog.style.display = 'none';
      if (editSongDialog) editSongDialog.style.display = 'flex';
      if (editSongTitleTextbox) editSongTitleTextbox.focus();
    });
  }

  if (buttonDeckEditSong)
  {
    buttonDeckEditSong.addEventListener('click', () =>
    {
      if (selectedSongId) openEditSongDialog(selectedSongId);
    });
  }

  if (buttonCloseEditSongDialog) buttonCloseEditSongDialog.addEventListener('click', closeEditSongDialog);
  if (buttonCancelEditSongDialog) buttonCancelEditSongDialog.addEventListener('click', closeEditSongDialog);

  if (buttonSaveSong)
  {
    buttonSaveSong.addEventListener('click', async () =>
    {
      const title = editSongTitleTextbox ? editSongTitleTextbox.value.trim() : '';
      const title2 = editSongSecondaryTitleTextbox ? editSongSecondaryTitleTextbox.value.trim() : '';
      const cat = editSongCategoryTextbox ? editSongCategoryTextbox.value.trim() || 'General' : 'General';
      const font = editSongFontTextbox ? editSongFontTextbox.value.trim() : '';
      const tags = editSongTagsTextbox ? editSongTagsTextbox.value.trim() : '';
      const songId = editSongIdHiddenInput ? editSongIdHiddenInput.value : '';
      const lyrics = textareaValueToLyrics(editSongLyricsTextarea ? editSongLyricsTextarea.value : '');

      if (!title)
      {
        alert('Please enter a song title.');
        if (editSongTitleTextbox) editSongTitleTextbox.focus();
        return;
      }

      if (!lyrics)
      {
        alert('Please enter at least one slide of lyrics.');
        if (editSongLyricsTextarea) editSongLyricsTextarea.focus();
        return;
      }

      const payload = {
        name: title,
        title2,
        cat,
        font,
        tags,
        lyrics
      };

      try
      {
        let res;
        if (songId)
        {
          res = await fetch(`/api/songs/${songId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        }
        else
        {
          res = await fetch('/api/songs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        }

        if (!res.ok)
        {
          const err = await res.json();
          throw new Error(err.error || 'Failed to save');
        }

        const saved = await res.json();
        songSlidesTextCache.set(Number(saved.id), saved);
        closeEditSongDialog();
        await reloadSongsCache();
        loadSongsList(songSearchInput ? songSearchInput.value : '');
        selectSong(saved.id);
        await loadSongSlides();
      }
      catch (err)
      {
        console.error('Error saving song:', err);
        alert('Failed to save song: ' + err.message);
      }
    });
  }
}

async function openEditSongDialog(songId)
{
  try
  {
    let song = songSlidesTextCache.get(Number(songId));
    if (!song)
    {
      const res = await fetch(`/api/songs/${songId}`);
      song = await res.json();
      songSlidesTextCache.set(Number(songId), song);
    }
    if (editSongIdHiddenInput) editSongIdHiddenInput.value = song.id;
    if (editSongDialogHeading) editSongDialogHeading.textContent = 'Edit Song';
    if (editSongTitleTextbox) editSongTitleTextbox.value = song.name || '';
    if (editSongSecondaryTitleTextbox) editSongSecondaryTitleTextbox.value = song.title2 || '';
    if (editSongCategoryTextbox) editSongCategoryTextbox.value = song.cat || '';
    if (editSongFontTextbox) editSongFontTextbox.value = song.font || '';
    if (editSongTagsTextbox) editSongTagsTextbox.value = song.tags || '';
    if (editSongLyricsTextarea) editSongLyricsTextarea.value = lyricsToTextareaValue(song.lyrics || '');

    if (buttonDeleteSongDialog)
    {
      buttonDeleteSongDialog.style.display = 'inline-flex';
      buttonDeleteSongDialog.onclick = async () =>
      {
        if (confirm(`Are you sure you want to delete song "${song.name}"? This action cannot be undone.`))
        {
          await deleteSong(song.id);
          closeEditSongDialog();
        }
      };
    }

    if (editSongDialog) editSongDialog.style.display = 'flex';
    if (editSongLyricsTextarea) editSongLyricsTextarea.focus();
  }
  catch (err)
  {
    console.error('Error loading song for edit:', err);
  }
}

async function deleteSong(songId)
{
  try
  {
    const res = await fetch(`/api/songs/${songId}`, { method: 'DELETE' });
    if (res.ok)
    {
      songSlidesTextCache.delete(Number(songId));
      if (selectedSongId && Number(selectedSongId) === Number(songId))
      {
        selectedSongId = null;
        if (slideDeckSongs)
        {
          slideDeckSongs.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 48px;">Select a song from the library on the left.</div>';
        }
        if (activeSongTitle) activeSongTitle.textContent = 'Select a Song';
        if (buttonDeckEditSong) buttonDeckEditSong.style.display = 'none';
        if (activeSlideCountIndicator) activeSlideCountIndicator.textContent = '0 slides';
      }
      await reloadSongsCache();
      loadSongsList(songSearchInput ? songSearchInput.value : '');
    }
  }
  catch (err)
  {
    console.error('Error deleting song:', err);
  }
}
//#endregion
