// ===========================================================================
// Presenter Console — Songs Management & Slide Deck Controller
// ===========================================================================

async function loadSongs(q = '')
{
  try
  {
    let url = `/api/songs?`;
    if (q) url += `q=${encodeURIComponent(q)}`;

    const res = await fetch(url);
    const songs = await res.json();
    renderSongList(songs);

    if (!currentSong && songs.length > 0)
    {
      let songToSelect = songs[0];
      try
      {
        const savedSongId = localStorage.getItem('last_browsed_song_id');
        if (savedSongId)
        {
          const match = songs.find(s => Number(s.id) === Number(savedSongId));
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

function renderSongList(songs)
{
  if (!songListContainer) return;
  songListContainer.innerHTML = '';
  if (!songs || songs.length === 0)
  {
    songListContainer.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">No songs found. Click "+ Add Song" above.</div>';
    return;
  }

  songs.forEach((song) =>
  {
    const item = document.createElement('div');
    item.className = 'song-item';
    item.setAttribute('data-id', song.id);
    if (currentSong && Number(currentSong.id) === Number(song.id))
    {
      item.classList.add('selected');
    }

    const previewLine = song.firstLine ? escapeHtml(song.firstLine) : '&nbsp;';

    item.innerHTML = `
      <div class="song-item-info">
        <div class="song-item-name">${escapeHtml(song.name)}</div>
        <div class="song-item-preview">${previewLine}</div>
      </div>
    `;

    item.addEventListener('click', () =>
    {
      document.querySelectorAll('.song-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      selectSong(song.id);
    });

    songListContainer.appendChild(item);
  });

  if (typeof highlightActiveInDecks === 'function' && liveState)
  {
    highlightActiveInDecks(liveState);
  }
}

async function selectSong(songId, autoPresent = false)
{
  try
  {
    localStorage.setItem('last_browsed_song_id', songId);
  }
  catch (e) {}

  try
  {
    const res = await fetch(`/api/songs/${songId}`);
    const song = await res.json();
    currentSong = song;
    currentSongSlides = song.slides || [];
    activeSongSlideIndex = 1;
    currentPresentationType = 'song';

    if (activeSongTitle) activeSongTitle.textContent = song.name;
    if (activeSlideCountIndicator)
    {
      activeSlideCountIndicator.textContent = `${currentSongSlides.length} slides`;
    }
    if (btnDeckEditSong) btnDeckEditSong.style.display = 'inline-block';

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

  // Determine longest line across all slides to set the optimal grid column width
  let maxChars = 0;
  slides.forEach(s =>
  {
    (s.lines || []).forEach(l =>
    {
      if (l.length > maxChars) maxChars = l.length;
    });
  });
  const colWidth = Math.max(260, Math.min(650, Math.round(maxChars * 8.8 + 44)));
  targetContainer.style.setProperty('--song-deck-col-width', `${colWidth}px`);

  slides.forEach((slide) =>
  {
    const card = document.createElement('div');
    card.className = 'slide-card';
    card.setAttribute('data-slide-index', slide.slideIndex);

    const isLive = liveState && Number(liveState.songId) === Number(song.id) && Number(liveState.slideIndex) === Number(slide.slideIndex) && liveState.status === 'live';
    if (isLive) card.classList.add('active-live');

    const linesHtml = slide.lines.map(line => `<div>${escapeHtml(line)}</div>`).join('');

    card.innerHTML = `
      <div class="slide-card-header">
        <span class="slide-card-num">Slide ${slide.slideIndex}</span>
        <span class="slide-card-badge" style="${isLive ? 'display: inline-block;' : 'display: none;'}">LIVE</span>
      </div>
      <div class="slide-card-content">
        ${linesHtml}
      </div>
    `;

    card.addEventListener('click', () =>
    {
      presentSlide(song, slide.slideIndex, slide);
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
  let maxChars = 0;
  editorSlideTexts.forEach(text =>
  {
    (text || '').split(/\r?\n/).forEach(l =>
    {
      if (l.length > maxChars) maxChars = l.length;
    });
  });
  const colWidth = Math.max(240, Math.min(600, Math.round(maxChars * 8.5 + 40)));
  editorSlidesList.style.setProperty('--editor-deck-col-width', `${colWidth}px`);
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
    card.setAttribute('data-index', index);

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
    if (modalInputLyrics2) modalInputLyrics2.value = '';
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
