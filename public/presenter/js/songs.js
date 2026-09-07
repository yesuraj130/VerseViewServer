// ===========================================================================
// Presenter Console — Songs Management & Slide Deck Controller
// ===========================================================================

let selectedCategory = 'All';

async function loadCategories()
{
  try
  {
    const res = await fetch('/api/categories');
    const categories = await res.json();
    renderCategoryChips(categories);
  }
  catch (err)
  {
    console.error('Error loading categories:', err);
  }
}

function renderCategoryChips(categories)
{
  if (!categoryChips) return;
  categoryChips.innerHTML = '<span class="chip active" data-cat="All">All</span>';
  categories.forEach((cat) =>
  {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.setAttribute('data-cat', cat);
    chip.textContent = cat;
    chip.addEventListener('click', () =>
    {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      selectedCategory = cat;
      loadSongs(songSearchInput ? songSearchInput.value : '', selectedCategory);
    });
    categoryChips.appendChild(chip);
  });

  const allChip = categoryChips.querySelector('[data-cat="All"]');
  if (allChip)
  {
    allChip.addEventListener('click', () =>
    {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      allChip.classList.add('active');
      selectedCategory = 'All';
      loadSongs(songSearchInput ? songSearchInput.value : '', 'All');
    });
  }
}

async function loadSongs(q = '', cat = 'All')
{
  try
  {
    let url = `/api/songs?`;
    if (q) url += `q=${encodeURIComponent(q)}&`;
    if (cat && cat !== 'All') url += `cat=${encodeURIComponent(cat)}`;

    const res = await fetch(url);
    const songs = await res.json();
    renderSongList(songs);

    if (!currentSong && songs.length > 0)
    {
      selectSong(songs[0].id);
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
    if (currentSong && currentSong.id === song.id)
    {
      item.classList.add('selected');
    }

    item.innerHTML = `
      <div class="song-item-info">
        <div class="song-item-name">${escapeHtml(song.name)}</div>
        <div class="song-item-meta">
          <span>${escapeHtml(song.cat || 'General')}</span>
          <span>•</span>
          <span>${song.slideCount} slides</span>
        </div>
      </div>
      <div class="song-actions" style="display: flex; gap: 4px; align-items: center;">
        <button class="btn-icon-tiny btn-edit-song" title="Edit Song" data-id="${song.id}">✏️</button>
        <button class="btn-icon-tiny btn-delete-song" title="Delete Song" data-id="${song.id}">🗑️</button>
      </div>
    `;

    item.addEventListener('click', (e) =>
    {
      if (e.target.closest('.btn-edit-song') || e.target.closest('.btn-delete-song')) return;
      document.querySelectorAll('.song-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      selectSong(song.id);
    });

    const editBtn = item.querySelector('.btn-edit-song');
    editBtn.addEventListener('click', (e) =>
    {
      e.stopPropagation();
      openEditSongModal(song.id);
    });

    const delBtn = item.querySelector('.btn-delete-song');
    delBtn.addEventListener('click', (e) =>
    {
      e.stopPropagation();
      if (confirm(`Delete song "${song.name}"?`))
      {
        deleteSong(song.id);
      }
    });

    songListContainer.appendChild(item);
  });
}

async function selectSong(songId, autoPresent = false)
{
  try
  {
    const res = await fetch(`/api/songs/${songId}`);
    const song = await res.json();
    currentSong = song;
    currentSongSlides = song.slides || [];
    activeSongSlideIndex = 1;
    currentPresentationType = 'song';

    if (activeSongTitle) activeSongTitle.textContent = song.name;
    if (deckTypeBadge)
    {
      deckTypeBadge.textContent = 'SONG';
      deckTypeBadge.style.color = '#38bdf8';
      deckTypeBadge.style.borderColor = 'rgba(56, 189, 248, 0.4)';
    }
    if (activeSongCatBadge)
    {
      activeSongCatBadge.textContent = song.cat || 'General';
      activeSongCatBadge.style.display = 'inline-block';
    }
    if (activeSlideCountIndicator)
    {
      activeSlideCountIndicator.textContent = `${currentSongSlides.length} slides`;
    }
    if (btnDeckEditSong) btnDeckEditSong.style.display = 'inline-block';

    renderSlideDeck(currentSong, currentSongSlides);

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
  if (!slideDeckContainer) return;
  slideDeckContainer.innerHTML = '';
  if (!slides || slides.length === 0)
  {
    slideDeckContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 48px;">This song has no slides.</div>';
    return;
  }

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
        <span class="slide-card-num">Slide ${slide.slideIndex} of ${slides.length}</span>
        ${isLive ? '<span class="slide-card-badge">LIVE</span>' : ''}
      </div>
      <div class="slide-card-content">
        ${linesHtml}
      </div>
    `;

    card.addEventListener('click', () =>
    {
      presentSlide(song, slide.slideIndex, slide);
    });

    slideDeckContainer.appendChild(card);
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
if (btnOpenAddSong)
{
  btnOpenAddSong.addEventListener('click', () =>
  {
    modalSongId.value = '';
    modalSongTitle.textContent = 'Add New Song';
    modalInputTitle.value = '';
    modalInputCat.value = '';
    modalInputLyrics.value = '';
    modalInputLyrics2.value = '';
    songModal.style.display = 'flex';
    modalInputTitle.focus();
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

if (btnInsertSlide) btnInsertSlide.addEventListener('click', () => insertAtCursor(modalInputLyrics, '<slide>'));
if (btnInsertBr) btnInsertBr.addEventListener('click', () => insertAtCursor(modalInputLyrics, '<BR>'));
if (btnAutoFormatStanzas)
{
  btnAutoFormatStanzas.addEventListener('click', () =>
  {
    const val = modalInputLyrics.value;
    modalInputLyrics.value = val.replace(/\n\s*\n/g, '<slide>\n').replace(/\n/g, '<BR>\n');
  });
}

if (btnSaveSong)
{
  btnSaveSong.addEventListener('click', async () =>
  {
    const title = modalInputTitle.value.trim();
    const cat = modalInputCat.value.trim() || 'General';
    const lyrics = modalInputLyrics.value.trim();
    const lyrics2 = modalInputLyrics2.value.trim();
    const songId = modalSongId.value;

    if (!title)
    {
      alert('Please enter a song title.');
      modalInputTitle.focus();
      return;
    }

    const payload = { name: title, cat, lyrics, lyrics2 };
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
      await loadCategories();
      await loadSongs(songSearchInput ? songSearchInput.value : '', selectedCategory);
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
    modalInputTitle.value = song.name;
    modalInputCat.value = song.cat || '';
    modalInputLyrics.value = song.lyrics || '';
    modalInputLyrics2.value = song.lyrics2 || '';
    songModal.style.display = 'flex';
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
      if (currentSong && currentSong.id === songId)
      {
        currentSong = null;
        if (slideDeckContainer)
        {
          slideDeckContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 48px;">Select a song from the library on the left.</div>';
        }
        if (activeSongTitle) activeSongTitle.textContent = 'Select a Song';
        if (activeSongCatBadge) activeSongCatBadge.style.display = 'none';
      }
      await loadCategories();
      await loadSongs(songSearchInput ? songSearchInput.value : '', selectedCategory);
    }
  }
  catch (err)
  {
    console.error('Error deleting song:', err);
  }
}

// Debounced Song Search
let searchDebounce = null;
if (songSearchInput)
{
  songSearchInput.addEventListener('input', () =>
  {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() =>
    {
      loadSongs(songSearchInput.value, selectedCategory);
    }, 200);
  });
}
