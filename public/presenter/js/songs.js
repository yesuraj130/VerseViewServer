// ===========================================================================
// Presenter Console — Songs Browser & Slide Deck Presentation
// ===========================================================================

let songsCache = null;
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
      selectedSongId = Number(savedSongId);
      lastBrowsedSongId = Number(savedSongId);
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

    songsCache = songsFetchResultJson || [];

    if (localFetchId === currentSongSlidesFetchId)
    {
      loadSongsList();

      let targetSongId = localSongId;
      if (!targetSongId && songsCache.length > 0)
      {
        targetSongId = songsCache[0].id;
      }

      if (targetSongId)
      {
        selectSong(targetSongId, false);
        const isLoaded = await loadSongSlides();
        if (isLoaded && slideDeckSongs) setSelectedIndexInList(slideDeckSongs, 0);
      }
    }
  }
  catch (err)
  {
    console.error('Error initializing Songs system:', err);
  }
}

//#region Loading
function loadSongsList()
{
  if (songsCache) renderSongsList(songsCache);
  else console.warn('Songs cache not available');
}

async function loadSongs(songSearchText = '')
{
  try
  {
    let url = '/api/songs';
    if (songSearchText) url += `?q=${encodeURIComponent(songSearchText)}`;

    const songsSearchFetchResult = await fetch(url);
    const songsSearchResultJson = await songsSearchFetchResult.json();

    songsCache = songsSearchResultJson || [];
    renderSongsList(songsCache);

    if (!selectedSongId && songsCache.length > 0)
    {
      let songToSelect = songsCache[0];
      if (lastBrowsedSongId)
      {
        const match = songsCache.find(s => Number(s.id) === Number(lastBrowsedSongId));
        if (match) songToSelect = match;
      }
      selectSong(songToSelect.id, false);
      const isLoaded = await loadSongSlides();
      if (isLoaded && slideDeckSongs) setSelectedIndexInList(slideDeckSongs, 0);
    }
  }
  catch (err)
  {
    console.error('Error loading songs:', err);
  }
}

async function loadSongSlides()
{
  if (!selectedSongId) return false;
  const cachedSong = songSlidesTextCache.get(Number(selectedSongId));
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
      if (slideDeckSongs) slideDeckSongs.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 48px;">Error loading song slides.</div>';
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
      if (slideDeckSongs) slideDeckSongs.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 48px;">No slides available.</div>';
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
async function selectSong(targetSongId, autoLoadSlides = true)
{
  selectedSongId = Number(targetSongId);
  saveLastBrowsedSong(targetSongId);

  if (songListContainer)
  {
    const songItems = songListContainer.children;
    for (let i = 0; i < songItems.length; i++)
    {
      const item = songItems[i];
      const isMatch = Number(item.getAttribute('data-id')) === selectedSongId;
      item.classList.toggle('selected', isMatch);
      if (isMatch)
      {
        item.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      }
    }
  }

  if (autoLoadSlides)
  {
    await loadSongSlides();
  }
}

function selectSongSlide(targetSlideIndex)
{
  if (!slideDeckSongs) return;
  setSelectedIndexInList(slideDeckSongs, targetSlideIndex - 1);
  smoothScrollToIndexInList(slideDeckSongs, targetSlideIndex - 1);
}
//#endregion

//#region Rendering
function getSongFontFamily(fontName)
{
  const f = (fontName || '').trim();
  if (!f || f === 'Tamil Bible' || f === 'Tamil-Ananthi' || f === 'Latha' || f === 'Mukta Malar' || f === 'Baloo Thambi' || f === 'Baloo Thambi 2')
  {
    return `'Baloo Thambi 2', 'Baloo Thambi', 'Mukta Malar', 'Noto Sans Tamil', var(--font-display)`;
  }
  return `"${f}", 'Baloo Thambi 2', 'Baloo Thambi', 'Mukta Malar', var(--font-display)`;
}

function renderSongsList(songs)
{
  if (!songListContainer) return;
  songListContainer.innerHTML = '';

  if (!songs || songs.length === 0)
  {
    songListContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 32px 16px;">No songs found.</div>';
    return;
  }

  for (let i = 0; i < songs.length; i++)
  {
    const song = songs[i];
    const item = document.createElement('div');
    item.className = 'song-item';
    item.setAttribute('data-id', song.id);

    if (selectedSongId && Number(selectedSongId) === Number(song.id))
    {
      item.classList.add('selected');
    }
    if (liveState && liveState.status === 'live' && liveState.type === 'song' && Number(liveState.songId) === Number(song.id))
    {
      item.classList.add('is-live-active');
    }

    const songFontFamily = getSongFontFamily(song.font);
    const displayName = song.name || 'Untitled';
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
      selectSong(song.id, false);
      const isLoaded = await loadSongSlides();
      if (isLoaded && slideDeckSongs)
      {
        setSelectedIndexInList(slideDeckSongs, 0);
        smoothScrollToIndexInList(slideDeckSongs, 0);
      }
    });

    songListContainer.appendChild(item);
  }
}

function renderSongSlides(song)
{
  if (!slideDeckSongs) return;
  slideDeckSongs.innerHTML = '';

  const slides = song.slides || [];

  if (activeSongTitle)
  {
    activeSongTitle.textContent = song.name || 'Untitled';
    activeSongTitle.style.fontFamily = getSongFontFamily(song.font);
  }
  if (activeSlideCountIndicator)
  {
    activeSlideCountIndicator.textContent = `${slides.length} slides`;
  }
  if (buttonDeckEditSong)
  {
    buttonDeckEditSong.style.display = 'inline-flex';
  }

  if (slides.length === 0)
  {
    slideDeckSongs.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 48px;">This song has no slides.</div>';
    return;
  }

  updateSongDeckColumnWidth();

  const songFontFamily = getSongFontFamily(song.font);

  slides.forEach((slide) =>
  {
    const card = document.createElement('div');
    card.className = 'slide-card';

    const isLive = liveState &&
      liveState.status === 'live' &&
      liveState.type === 'song' &&
      Number(liveState.songId) === Number(song.id) &&
      Number(liveState.slideIndex) === Number(slide.slideIndex);

    if (isLive) card.classList.add('active-live');

    const lines = slide.lines || [];
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
      presentSlide(song, slide.slideIndex);
    });

    slideDeckSongs.appendChild(card);
  });
}

function updateSongDeckColumnWidth()
{
  const targetContainer = document.getElementById('slide-deck-songs') || slideDeckSongs;
  if (!targetContainer) return;

  const isMobile = window.innerWidth <= 768;
  if (isMobile)
  {
    targetContainer.style.setProperty('--song-deck-col-width', '100%');
    targetContainer.classList.add('wrap-lines');
    targetContainer.classList.add('mobile-single-col');
  }
  else
  {
    targetContainer.classList.remove('mobile-single-col');
    targetContainer.style.setProperty('--song-deck-col-width', '280px');
    targetContainer.classList.remove('wrap-lines');
  }
}
//#endregion

function presentSlide(song, slideIndex)
{
  const songId = (song && song.id !== undefined) ? song.id : song;
  const payload = {
    type: 'song',
    songId: songId,
    slideIndex: slideIndex
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
  if (!container) return;
  if (index === 0) container.scrollTop = 0;
  else 
  {
    const activeItem = container.children[index];
    if (activeItem) activeItem.scrollIntoView({ block: 'nearest', behavior: 'auto' }); 
  }
}

function smoothScrollToIndexInList(container, index)
{
  if (!container) return;
  const targetChild = container.children[index];
  if (targetChild && typeof smoothScrollToElement === 'function')
  {
    smoothScrollToElement(container, targetChild, 200, true);
  }
}

function setSelectedIndexInList(container, activeIndex)
{
  if (!container) return;
  const items = container.children;
  for (let i = 0; i < items.length; i++)
  {
    items[i].classList.toggle('active', i === activeIndex);
  }
}
//#endregion

//#region Song Search & Editor Dialog
let songSearchDebounce = null;
function initSongSearchEvents()
{
  if (!songSearchInput) return;

  const updateClearBtn = () =>
  {
    if (buttonClearSongSearch)
    {
      buttonClearSongSearch.style.display = songSearchInput.value ? 'flex' : 'none';
    }
  };

  songSearchInput.addEventListener('input', () =>
  {
    updateClearBtn();
    clearTimeout(songSearchDebounce);
    songSearchDebounce = setTimeout(() =>
    {
      loadSongs(songSearchInput.value);
    }, 200);
  });

  if (buttonClearSongSearch)
  {
    buttonClearSongSearch.addEventListener('click', () =>
    {
      songSearchInput.value = '';
      updateClearBtn();
      songSearchInput.focus();
      loadSongs('');
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
        await loadSongs(songSearchInput ? songSearchInput.value : '');
        selectSong(saved.id, false);
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
      await loadSongs(songSearchInput ? songSearchInput.value : '');
    }
  }
  catch (err)
  {
    console.error('Error deleting song:', err);
  }
}
//#endregion

window.addEventListener('resize', () =>
{
  updateSongDeckColumnWidth();
});
