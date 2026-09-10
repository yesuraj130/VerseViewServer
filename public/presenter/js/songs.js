// ===========================================================================
// Presenter Console — Songs Management & Slide Deck Controller
// ===========================================================================

async function loadSongs(songSearchText = '')
{
  try
  {
    let url = `/api/songs?`;
    if (songSearchText) url += `q=${encodeURIComponent(songSearchText)}`;

    const songsSearchFetchResult = await fetch(url);
    const songsSearchResultJson = await songsSearchFetchResult.json();
    renderSongList(songsSearchResultJson);

    if (!currentSong && songsSearchResultJson.length > 0)
    {
      let songToSelect = songsSearchResultJson[0];
      try
      {
        const savedSongId = localStorage.getItem('last_browsed_song_id');
        if (savedSongId)
        {
          const match = songsSearchResultJson.find(s => Number(s.id) === Number(savedSongId));
          if (match) songToSelect = match;
        }
      }
      catch (e) {}
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
  if (currentSong && Number(currentSong.id) === Number(song.id))
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
  try
  {
    localStorage.setItem('last_browsed_song_id', songId);
  }
  catch (e) {}

  if (songVirtualItems)
  {
    songVirtualItems.querySelectorAll('.song-item').forEach((i) =>
    {
      const isSel = Number(i.getAttribute('data-id')) === Number(songId);
      i.classList.toggle('selected', isSel);
    });
  }

  scrollToSong(songId, false);

  try
  {
    const res = await fetch(`/api/songs/${songId}`);
    const song = await res.json();
    currentSong = song;
    currentSongSlides = song.slides || [];
    activeSongSlideIndex = 1;
    currentPresentationType = 'song';

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
      activeSlideCountIndicator.textContent = `${currentSongSlides.length} slides`;
    }
    if (btnDeckEditSong) btnDeckEditSong.style.display = 'inline-flex';

    renderSlideDeck(currentSong, currentSongSlides);

    if (window.innerWidth <= 768 && typeof setMobilePaneMode === 'function')
    {
      if (window.currentMobilePaneMode !== 'both')
      {
        setMobilePaneMode('deck');
      }
    }

    if (autoPresent && currentSongSlides.length > 0)
    {
      presentSlide(song, 1, currentSongSlides[0]);
    }
  }
  catch (err)
  {
    console.error('Error selecting song:', err);
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

function updateSongDeckColumnWidth()
{
  const targetContainer = document.getElementById('slide-deck-songs') || slideDeckContainer;
  if (!targetContainer || !currentSongSlides || currentSongSlides.length === 0) return;

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
  currentSongSlides.forEach(s =>
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
      presentSlide(song, slide.slideIndex, { ...slide, lines });
    });

    targetContainer.appendChild(card);
  });
}

function presentSlide(song, slideIndex, slideObj)
{
  activeSongSlideIndex = slideIndex;
  const total = currentSongSlides.length;
  const payload = {
    type: 'song',
    title: song.name,
    reference: `${song.cat || 'Song'} • Slide ${slideIndex} of ${total}`,
    lines: slideObj.lines,
    rawSlide: slideObj.rawSlide,
    slideIndex: slideIndex,
    totalSlides: total,
    songId: song.id,
    font: song.font || 'Baloo Thambi 2',
    font2: song.font2 || '',
    verseInfo: null
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
let editorSlideTexts = []; // Array of string contents (lines with standard newlines)

function lyricsToSlideTexts(lyricsStr)
{
  if (!lyricsStr || !lyricsStr.trim()) return [''];
  const rawParts = lyricsStr.split('<slide>');
  const list = rawParts.map(part =>
  {
    // Replace <BR> (case-insensitive) with newline
    return part.replace(/<br\s*\/?>/gi, '\n').trim();
  }).filter((text, idx) => idx === 0 || text.length > 0);
  return list.length > 0 ? list : [''];
}

function slideTextsToLyrics(slideArr)
{
  return slideArr
    .map(txt => txt.trim())
    .filter(Boolean)
    .map(txt =>
    {
      const lines = txt.split(/\r?\n/).map(l => l.trim());
      while (lines.length > 0 && !lines[0]) lines.shift();
      while (lines.length > 0 && !lines[lines.length - 1]) lines.pop();
      return lines.join('<BR>');
    })
    .filter(Boolean)
    .join('<slide>');
}

function autoFitTextarea(textarea)
{
  if (!textarea) return;
  textarea.style.height = 'auto';
  const fittedH = Math.max(42, textarea.scrollHeight);
  textarea.style.height = `${fittedH}px`;
  textarea.style.overflowY = 'hidden';
}

function autoFitAllEditorTextareas()
{
  if (!editorSlidesList) return;
  const textareas = editorSlidesList.querySelectorAll('.editor-slide-textarea');
  textareas.forEach(ta => autoFitTextarea(ta));
}

function updateEditorGridColumnWidth()
{
  if (!editorSlidesList) return;
  const allLines = [];
  editorSlideTexts.forEach(text =>
  {
    (text || '').split(/\r?\n/).forEach(l =>
    {
      if (l && l.trim()) allLines.push(l.trim());
    });
  });

  const maxLineWidth = measureMaxLineWidth(allLines, '13px system-ui, -apple-system, sans-serif');
  const naturalColWidth = Math.max(220, Math.ceil(maxLineWidth * 1.06 + 44));

  const clientWidth = editorSlidesList.clientWidth;
  const availWidth = clientWidth > 24 ? (clientWidth - 24) : 800;

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

  editorSlidesList.style.setProperty('--editor-deck-col-width', `${colWidth}px`);
  editorSlidesList.classList.toggle('wrap-lines', wrapText);
}

function renderEditorSlides()
{
  if (!editorSlidesList) return;
  editorSlidesList.innerHTML = '';

  if (editorSlideTexts.length === 0)
  {
    editorSlideTexts = [''];
  }

  if (modalSlidesCounter)
  {
    modalSlidesCounter.textContent = `${editorSlideTexts.length} ${editorSlideTexts.length === 1 ? 'slide' : 'slides'}`;
  }

  updateEditorGridColumnWidth();

  editorSlideTexts.forEach((text, index) =>
  {
    const card = document.createElement('div');
    card.className = 'editor-slide-card';

    card.innerHTML = `
      <div class="editor-slide-header">
        <span class="editor-slide-badge">Slide ${index + 1} of ${editorSlideTexts.length}</span>
        <div class="editor-slide-actions">
          <button type="button" class="btn-card-tool btn-move-up" title="Move Up" ${index === 0 ? 'disabled style="opacity:0.3;cursor:not-allowed;"' : ''}>↑</button>
          <button type="button" class="btn-card-tool btn-move-down" title="Move Down" ${index === editorSlideTexts.length - 1 ? 'disabled style="opacity:0.3;cursor:not-allowed;"' : ''}>↓</button>
          <button type="button" class="btn-card-tool btn-delete-card" title="Delete Slide" ${editorSlideTexts.length <= 1 ? 'disabled style="opacity:0.3;cursor:not-allowed;"' : ''}>&times;</button>
        </div>
      </div>
      <textarea class="editor-slide-textarea" placeholder="Type slide lines here...">${escapeHtml(text)}</textarea>
    `;

    const textarea = card.querySelector('.editor-slide-textarea');
    autoFitTextarea(textarea);

    textarea.addEventListener('input', () =>
    {
      editorSlideTexts[index] = textarea.value;
      autoFitTextarea(textarea);
      updateEditorGridColumnWidth();
    });

    const btnUp = card.querySelector('.btn-move-up');
    if (btnUp && index > 0)
    {
      btnUp.addEventListener('click', () =>
      {
        syncEditorSlideTextsFromDom();
        const tmp = editorSlideTexts[index - 1];
        editorSlideTexts[index - 1] = editorSlideTexts[index];
        editorSlideTexts[index] = tmp;
        renderEditorSlides();
      });
    }

    const btnDown = card.querySelector('.btn-move-down');
    if (btnDown && index < editorSlideTexts.length - 1)
    {
      btnDown.addEventListener('click', () =>
      {
        syncEditorSlideTextsFromDom();
        const tmp = editorSlideTexts[index + 1];
        editorSlideTexts[index + 1] = editorSlideTexts[index];
        editorSlideTexts[index] = tmp;
        renderEditorSlides();
      });
    }

    const btnDel = card.querySelector('.btn-delete-card');
    if (btnDel && editorSlideTexts.length > 1)
    {
      btnDel.addEventListener('click', () =>
      {
        syncEditorSlideTextsFromDom();
        editorSlideTexts.splice(index, 1);
        renderEditorSlides();
      });
    }

    editorSlidesList.appendChild(card);
  });
}

function syncEditorSlideTextsFromDom()
{
  if (!editorSlidesList) return;
  const textareas = editorSlidesList.querySelectorAll('.editor-slide-textarea');
  textareas.forEach((ta, idx) =>
  {
    if (idx < editorSlideTexts.length)
    {
      editorSlideTexts[idx] = ta.value;
    }
  });
}

if (btnAddEmptySlide)
{
  btnAddEmptySlide.addEventListener('click', () =>
  {
    syncEditorSlideTextsFromDom();
    editorSlideTexts.push('');
    renderEditorSlides();
    // Scroll to bottom and focus new slide
    setTimeout(() =>
    {
      if (editorSlidesList)
      {
        editorSlidesList.scrollTop = editorSlidesList.scrollHeight;
        const textareas = editorSlidesList.querySelectorAll('.editor-slide-textarea');
        if (textareas.length > 0)
        {
          textareas[textareas.length - 1].focus();
        }
      }
    }, 50);
  });
}

// Generate Slides (Bulk Edit) handling
if (btnGenerateSlides)
{
  btnGenerateSlides.addEventListener('click', () =>
  {
    syncEditorSlideTextsFromDom();
    // Formats all slides in a single textbox separated by two blank lines (\n\n\n)
    const combined = editorSlideTexts
      .map(s => s.trim())
      .filter(Boolean)
      .join('\n\n\n');
    if (bulkSlidesTextarea)
    {
      bulkSlidesTextarea.value = combined;
    }
    if (bulkSlidesModal)
    {
      bulkSlidesModal.style.display = 'flex';
      setTimeout(() => { if (bulkSlidesTextarea) bulkSlidesTextarea.focus(); }, 50);
    }
  });
}

function closeBulkModal()
{
  if (bulkSlidesModal) bulkSlidesModal.style.display = 'none';
}

if (btnCloseBulkModal) btnCloseBulkModal.addEventListener('click', closeBulkModal);
if (btnCancelBulkModal) btnCancelBulkModal.addEventListener('click', closeBulkModal);

if (btnApplyBulkSlides)
{
  btnApplyBulkSlides.addEventListener('click', () =>
  {
    if (bulkSlidesTextarea)
    {
      const raw = bulkSlidesTextarea.value || '';
      // Delimited by two or more blank lines (two empty lines between slides)
      // Single blank lines remain within the same slide
      const sections = raw.split(/\r?\n(?:\s*\r?\n){2,}/);
      const parsed = sections
        .map(sec => sec.trim())
        .filter(Boolean);

      editorSlideTexts = parsed.length > 0 ? parsed : [''];
      renderEditorSlides();
    }
    closeBulkModal();
  });
}

if (btnOpenAddSong)
{
  btnOpenAddSong.addEventListener('click', () =>
  {
    modalSongId.value = '';
    modalSongTitle.textContent = 'Add New Song';
    if (modalInputTitle) modalInputTitle.value = '';
    if (modalInputTitle2) modalInputTitle2.value = '';
    if (modalInputCat) modalInputCat.value = '';
    if (modalInputFont) modalInputFont.value = '';
    if (modalInputTags) modalInputTags.value = '';
    editorSlideTexts = [''];
    renderEditorSlides();
    if (btnDeleteModalSong) btnDeleteModalSong.style.display = 'none';
    songModal.style.display = 'flex';
    requestAnimationFrame(() => {
      autoFitAllEditorTextareas();
    });
    setTimeout(() => {
      autoFitAllEditorTextareas();
    }, 50);
    if (modalInputTitle) modalInputTitle.focus();
  });
}

if (btnDeckEditSong)
{
  btnDeckEditSong.addEventListener('click', () =>
  {
    if (currentSong) openEditSongModal(currentSong.id);
  });
}

function closeSongModal()
{
  if (songModal) songModal.style.display = 'none';
}

if (btnCloseSongModal) btnCloseSongModal.addEventListener('click', closeSongModal);
if (btnCancelSongModal) btnCancelSongModal.addEventListener('click', closeSongModal);

if (btnSaveSong)
{
  btnSaveSong.addEventListener('click', async () =>
  {
    syncEditorSlideTextsFromDom();
    const title = modalInputTitle ? modalInputTitle.value.trim() : '';
    const title2 = modalInputTitle2 ? modalInputTitle2.value.trim() : '';
    const cat = modalInputCat ? modalInputCat.value.trim() || 'General' : 'General';
    const font = modalInputFont ? modalInputFont.value.trim() : '';
    const tags = modalInputTags ? modalInputTags.value.trim() : '';
    const songId = modalSongId ? modalSongId.value : '';

    const lyrics = slideTextsToLyrics(editorSlideTexts);

    if (!title)
    {
      alert('Please enter a song title.');
      if (modalInputTitle) modalInputTitle.focus();
      return;
    }

    if (!lyrics)
    {
      alert('Please enter at least one slide of lyrics.');
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
      closeSongModal();
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

async function openEditSongModal(songId)
{
  try
  {
    const res = await fetch(`/api/songs/${songId}`);
    const song = await res.json();
    modalSongId.value = song.id;
    modalSongTitle.textContent = 'Edit Song';
    if (modalInputTitle) modalInputTitle.value = song.name || '';
    if (modalInputTitle2) modalInputTitle2.value = song.title2 || '';
    if (modalInputCat) modalInputCat.value = song.cat || '';
    if (modalInputFont) modalInputFont.value = song.font || '';
    if (modalInputTags) modalInputTags.value = song.tags || '';

    editorSlideTexts = lyricsToSlideTexts(song.lyrics || '');
    renderEditorSlides();

    if (btnDeleteModalSong)
    {
      btnDeleteModalSong.style.display = 'inline-flex';
      btnDeleteModalSong.onclick = async () =>
      {
        if (confirm(`Are you sure you want to delete song "${song.name}"? This action cannot be undone.`))
        {
          await deleteSong(song.id);
          closeSongModal();
        }
      };
    }

    songModal.style.display = 'flex';
    requestAnimationFrame(() => {
      autoFitAllEditorTextareas();
    });
    setTimeout(() => {
      autoFitAllEditorTextareas();
    }, 50);
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
      if (currentSong && Number(currentSong.id) === Number(songId))
      {
        currentSong = null;
        if (slideDeckContainer)
        {
          slideDeckContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 48px;">Select a song from the library on the left.</div>';
        }
        if (activeSongTitle) activeSongTitle.textContent = 'Select a Song';
        if (btnDeckEditSong) btnDeckEditSong.style.display = 'none';
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
    if (btnClearSongSearch)
    {
      btnClearSongSearch.style.display = songSearchInput.value ? 'flex' : 'none';
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

  if (btnClearSongSearch)
  {
    btnClearSongSearch.addEventListener('click', () =>
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
  updateEditorGridColumnWidth();
});

if (typeof ResizeObserver !== 'undefined')
{
  const songsDeckEl = document.getElementById('slide-deck-songs');
  if (songsDeckEl)
  {
    new ResizeObserver(() => updateSongDeckColumnWidth()).observe(songsDeckEl);
  }
  if (editorSlidesList)
  {
    new ResizeObserver(() => updateEditorGridColumnWidth()).observe(editorSlidesList);
  }
}
