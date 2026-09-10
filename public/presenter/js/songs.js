// ===========================================================================
// Presenter Console — Songs Management & Slide Deck Controller
// ===========================================================================

// Song Slides in-memory text cache
const songSlidesTextCache = new Map();
const MAX_SONG_CACHE_COUNT = 50; // Caps in-memory song cache to ~50 songs

async function loadSongs(songSearchText = '')
{
  try
  {
    let url = `/api/songs?`;
    if (songSearchText) url += `q=${encodeURIComponent(songSearchText)}`;

    const songsSearchFetchResult = await fetch(url);
    const songsSearchResultJson = await songsSearchFetchResult.json();
    renderSongList(songsSearchResultJson);

    if (!selectedSongId && songsSearchResultJson.length > 0)
    {
      let songToSelect = songsSearchResultJson[0];
      if (lastBrowsedSongId)
      {
        const match = songsSearchResultJson.find(s => Number(s.id) === Number(lastBrowsedSongId));
        if (match) songToSelect = match;
      }
      selectSong(songToSelect.id);
    }
  }
  catch (err)
  {
    console.error('Error loading songs:', err);
  }
}

function getSongFontFamily(fontName)
{
  const f = (fontName || '').trim();
  if (!f || f === 'Tamil Bible' || f === 'Tamil-Ananthi' || f === 'Latha' || f === 'Mukta Malar' || f === 'Baloo Thambi' || f === 'Baloo Thambi 2')
  {
    return `'Baloo Thambi 2', 'Baloo Thambi', 'Mukta Malar', 'Noto Sans Tamil', var(--font-display)`;
  }
  return `"${f}", 'Baloo Thambi 2', 'Baloo Thambi', 'Mukta Malar', var(--font-display)`;
}

let allLoadedSongs = [];
let songVirtualSpacer = null;
let songVirtualItems = null;
let virtualScrollRaf = null;
let lastRenderedStart = -1;
let lastRenderedEnd = -1;

function getSongRowHeight()
{
  return window.innerWidth <= 900 ? 58 : 54;
}

function isLandscape()
{
  if (typeof window !== 'undefined' && window.matchMedia)  return window.matchMedia('(orientation: landscape)').matches;
  return window.innerWidth > window.innerHeight;
}

function isHighDpi()
{
  return typeof window !== 'undefined' && window.devicePixelRatio >= 2;
}

function createSongItemElement(song)
{
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

  const isConverted = Boolean(song.isConverted);

  // Only slides are decoded - titles and song names are preserved as-is
  const displayName = song.name;
  let previewLine = song.firstLine ? escapeHtml(song.firstLine) : '&nbsp;';
  const songFontFamily = getSongFontFamily(song.font);

  item.innerHTML = `
    <div class="song-item-info">
      <div class="song-item-name" style="font-family: ${songFontFamily};">
        <span class="song-name-text">${escapeHtml(displayName)}</span>
        ${isConverted ? '<span class="song-unicode-tag" title="Converted to Unicode">Unicode</span>' : ''}
      </div>
      <div class="song-item-preview" style="font-family: ${songFontFamily};">${previewLine}</div>
    </div>
  `;

  item.addEventListener('click', () =>
  {
    if (songVirtualItems)
    {
      songVirtualItems.querySelectorAll('.song-item').forEach(i => i.classList.remove('selected'));
    }
    item.classList.add('selected');
    selectSong(song.id);
  });

  return item;
}

function updateVirtualSongList(force)
{
  if (!songListContainer || !allLoadedSongs || allLoadedSongs.length === 0) return;

  if (!songVirtualSpacer || !songVirtualItems || !songVirtualSpacer.parentNode)
  {
    songListContainer.innerHTML = '';
    songVirtualSpacer = document.createElement('div');
    songVirtualSpacer.className = 'song-virtual-spacer';
    songVirtualItems = document.createElement('div');
    songVirtualItems.className = 'song-virtual-items';
    songVirtualSpacer.appendChild(songVirtualItems);
    songListContainer.appendChild(songVirtualSpacer);
    lastRenderedStart = -1;
    lastRenderedEnd = -1;
  }

  const rowHeight = getSongRowHeight();
  const totalHeight = allLoadedSongs.length * rowHeight;
  songVirtualSpacer.style.height = `${totalHeight}px`;

  const scrollTop = songListContainer.scrollTop || 0;
  const clientHeight = songListContainer.clientHeight || 500;
  const overscan = 6;

  let startIndex = Math.floor(scrollTop / rowHeight) - overscan;
  let endIndex = Math.ceil((scrollTop + clientHeight) / rowHeight) + overscan;

  if (startIndex < 0) startIndex = 0;
  if (endIndex >= allLoadedSongs.length) endIndex = allLoadedSongs.length - 1;

  if (!force && startIndex === lastRenderedStart && endIndex === lastRenderedEnd)
  {
    return;
  }

  lastRenderedStart = startIndex;
  lastRenderedEnd = endIndex;

  const offsetY = startIndex * rowHeight;
  songVirtualItems.style.transform = `translateY(${offsetY}px)`;

  const fragment = document.createDocumentFragment();
  for (let i = startIndex; i <= endIndex; i++)
  {
    fragment.appendChild(createSongItemElement(allLoadedSongs[i]));
  }
  songVirtualItems.replaceChildren(fragment);
}

function scrollToSong(songId, center = false)
{
  if (!songListContainer || !allLoadedSongs || allLoadedSongs.length === 0) return;
  const idx = allLoadedSongs.findIndex(s => Number(s.id) === Number(songId));
  if (idx < 0) return;

  const rowHeight = getSongRowHeight();
  const itemTop = idx * rowHeight;
  const clientHeight = songListContainer.clientHeight || 500;

  if (center || itemTop < songListContainer.scrollTop || (itemTop + rowHeight) > (songListContainer.scrollTop + clientHeight))
  {
    const targetScroll = Math.max(0, itemTop - Math.floor(clientHeight / 2) + Math.floor(rowHeight / 2));
    songListContainer.scrollTop = targetScroll;
    updateVirtualSongList(true);
  }
}

function renderSongList(songs)
{
  if (!songListContainer) return;
  allLoadedSongs = songs || [];
  lastRenderedStart = -1;
  lastRenderedEnd = -1;
  songListContainer.scrollTop = 0;

  if (allLoadedSongs.length === 0)
  {
    songListContainer.innerHTML = 'No songs found.';
    songVirtualSpacer = null;
    songVirtualItems = null;
    return;
  }

  updateVirtualSongList(true);
}

if (songListContainer)
{
  songListContainer.addEventListener('scroll', () =>
  {
    if (virtualScrollRaf) return;
    virtualScrollRaf = requestAnimationFrame(() =>
    {
      virtualScrollRaf = null;
      updateVirtualSongList(false);
    });
  }, { passive: true });

  if (typeof ResizeObserver !== 'undefined')
  {
    new ResizeObserver(() => updateVirtualSongList(true)).observe(songListContainer);
  }
}

async function selectSong(songId, autoPresent = false)
{
  selectedSongId = Number(songId);
  saveLastBrowsedSong(songId);

  if (songVirtualItems)
  {
    songVirtualItems.querySelectorAll('.song-item').forEach((i) =>
    {
      const isSel = Number(i.getAttribute('data-id')) === Number(songId);
      i.classList.toggle('selected', isSel);
    });
  }

  scrollToSong(songId, false);

  // If song slides were already cached in memory, render immediately without fetch
  if (songSlidesTextCache.has(Number(songId)))
  {
    const cachedSong = songSlidesTextCache.get(Number(songId));
    displaySongInDeck(cachedSong, autoPresent);
    return;
  }

  try
  {
    const res = await fetch(`/api/songs/${songId}`);
    const song = await res.json();

    // Cache with bounded LRU eviction to prevent memory accumulation
    if (songSlidesTextCache.size >= MAX_SONG_CACHE_COUNT)
    {
      const oldestKey = songSlidesTextCache.keys().next().value;
      if (oldestKey) songSlidesTextCache.delete(oldestKey);
    }
    songSlidesTextCache.set(Number(songId), song);

    // Guard against race conditions if user clicked another song before fetch returned
    if (Number(selectedSongId) === Number(songId))
    {
      displaySongInDeck(song, autoPresent);
    }
  }
  catch (err)
  {
    console.error('Error selecting song:', err);
  }
}

function displaySongInDeck(song, autoPresent = false)
{
  const slides = song.slides || [];

  if (activeSongTitle)
  {
    activeSongTitle.textContent = song.name;
    activeSongTitle.style.fontFamily = getSongFontFamily(song.font);
  }
  if (songUnicodeDeckBadge)
  {
    const isConverted = Boolean(song.isConverted);
    songUnicodeDeckBadge.style.display = isConverted ? 'inline-flex' : 'none';
  }
  if (activeSlideCountIndicator)
  {
    activeSlideCountIndicator.textContent = `${slides.length} slides`;
  }
  if (buttonDeckEditSong) buttonDeckEditSong.style.display = 'inline-flex';

  renderSlideDeck(song, slides);

  if (window.innerWidth <= 768 && typeof setMobilePaneMode === 'function')
  {
    if (window.currentMobilePaneMode !== 'both')
    {
      setMobilePaneMode('deck');
    }
  }

  if (autoPresent && slides.length > 0)
  {
    presentSlide(song, 1);
  }
}

let _measureCanvas = null;
function measureMaxLineWidth(lines, font = '500 14px "Baloo Thambi 2", "Baloo Thambi", "Mukta Malar", system-ui, -apple-system, sans-serif')
{
  if (!lines || lines.length === 0) return 0;
  if (!_measureCanvas)
  {
    _measureCanvas = document.createElement('canvas');
  }
  const ctx = _measureCanvas.getContext('2d');
  ctx.font = font;
  let maxW = 0;
  for (let i = 0; i < lines.length; i++)
  {
    const line = lines[i];
    if (!line) continue;
    const w = ctx.measureText(line).width;
    if (w > maxW) maxW = w;
  }
  return Math.ceil(maxW);
}

function updateSongDeckColumnWidth(slides)
{
  const targetContainer = document.getElementById('slide-deck-songs') || slideDeckContainer;
  const currentSong = selectedSongId ? songSlidesTextCache.get(Number(selectedSongId)) : null;
  const songSlides = slides || (currentSong && currentSong.slides) || [];
  if (!targetContainer || songSlides.length === 0) return;

  const clientWidth = targetContainer.clientWidth;
  const isMobile = window.innerWidth <= 768 || (clientWidth > 0 && clientWidth <= 540);

  if (isMobile)
  {
    targetContainer.style.setProperty('--song-deck-col-width', '100%');
    targetContainer.classList.add('wrap-lines');
    targetContainer.classList.add('mobile-single-col');
    return;
  }

  targetContainer.classList.remove('mobile-single-col');

  const allLines = [];
  songSlides.forEach(s =>
  {
    (s.lines || []).forEach(l =>
    {
      if (l && l.trim()) allLines.push(l.trim());
    });
  });

  const songFontFam = currentSong ? getSongFontFamily(currentSong.font) : 'var(--font-display)';
  const maxLineWidth = measureMaxLineWidth(allLines, `500 14px ${songFontFam}`);
  const naturalColWidth = Math.max(220, Math.ceil(maxLineWidth * 1.06 + 46));

  const availWidth = clientWidth > 40 ? (clientWidth - 40) : 800;

  let colWidth;
  let wrapText = false;

  if (naturalColWidth * 2 + 12 <= availWidth)
  {
    colWidth = naturalColWidth;
    wrapText = false;
  }
  else if (naturalColWidth <= availWidth)
  {
    colWidth = naturalColWidth;
    wrapText = false;
  }
  else
  {
    colWidth = Math.max(180, availWidth);
    wrapText = true;
  }

  targetContainer.style.setProperty('--song-deck-col-width', `${colWidth}px`);
  targetContainer.classList.toggle('wrap-lines', wrapText);
}

function renderSlideDeck(song, slides)
{
  const targetContainer = document.getElementById('slide-deck-songs') || slideDeckContainer;
  if (!targetContainer) return;
  targetContainer.innerHTML = '';
  if (!slides || slides.length === 0)
  {
    targetContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 48px;">This song has no slides.</div>';
    return;
  }

  updateSongDeckColumnWidth();

  const songFontFamily = getSongFontFamily(song ? song.font : '');

  slides.forEach((slide) =>
  {
    const card = document.createElement('div');
    card.className = 'slide-card';

    const isLive = liveState && Number(liveState.songId) === Number(song.id) && Number(liveState.slideIndex) === Number(slide.slideIndex) && liveState.status === 'live';
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
      presentSlide(song, slide.slideIndex);
    });

    targetContainer.appendChild(card);
  });
}

function presentSlide(song, slideIndex)
{
  const payload = {
    type: 'song',
    songId: song.id,
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

// ---------------------------------------------------------------------------
// Song Add / Edit / Delete Modal & Event Listeners
// ---------------------------------------------------------------------------
function lyricsToTextareaValue(lyricsStr)
{
  if (!lyricsStr) return '';
  const slides = lyricsStr.split('<slide>').filter(s => s.trim().length > 0);
  return slides.map(s => {
    return s.replace(/<br\s*\/?>/gi, '\n').trim();
  }).join('\n\n\n');
}

function textareaValueToLyrics(rawText)
{
  if (!rawText || !rawText.trim()) return '';
  // Delimited by two or more blank lines (two empty lines between slides)
  // Single blank lines remain within the same slide
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

function closeEditSongDialog()
{
  if (editSongDialog) editSongDialog.style.display = 'none';
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

    // Only submit changed and supported fields. Hidden / unedited fields remain untouched in DB.
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
      selectSong(saved.id);
    }
    catch (err)
    {
      console.error('Error saving song:', err);
      alert('Failed to save song: ' + err.message);
    }
  });
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
        const targetContainer = document.getElementById('slide-deck-songs') || (typeof slideDeckContainer !== 'undefined' ? slideDeckContainer : null);
        if (targetContainer)
        {
          targetContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 48px;">Select a song from the library on the left.</div>';
        }
        if (activeSongTitle) activeSongTitle.textContent = 'Select a Song';
        if (buttonDeckEditSong) buttonDeckEditSong.style.display = 'none';
        if (activeSlideCountIndicator) activeSlideCountIndicator.textContent = '0 slides';
        if (songUnicodeDeckBadge) songUnicodeDeckBadge.style.display = 'none';
      }
      await loadSongs(songSearchInput ? songSearchInput.value : '');
    }
  }
  catch (err)
  {
    console.error('Error deleting song:', err);
  }
}

// Debounced Song Search & Clear Button
let searchDebounce = null;
if (songSearchInput)
{
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
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() =>
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

// Window and Container Resize Handlers
window.addEventListener('resize', () =>
{
  updateSongDeckColumnWidth();
});

if (typeof ResizeObserver !== 'undefined')
{
  const songsDeckEl = document.getElementById('slide-deck-songs');
  if (songsDeckEl)
  {
    new ResizeObserver(() => updateSongDeckColumnWidth()).observe(songsDeckEl);
  }
}
