// ===========================================================================
// Presenter Console — Song Creation & Editing (Add / Edit / Delete Dialog)
// ===========================================================================

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
  // Slides are separated by 2 or more blank lines (two line spacer: \n\n\n+)
  const sections = rawText.split(/\r?\n(?:\s*\r?\n){2,}/);
  const slides = sections
    .map(sec => sec.trim())
    .filter(Boolean)
    .map(sec => {
      // Split into lines while preserving internal single line gaps
      const lines = sec.split(/\r?\n/).map(l => l.trim());
      while (lines.length > 0 && !lines[0]) lines.shift();
      while (lines.length > 0 && !lines[lines.length - 1]) lines.pop();
      return lines.join('<BR>');
    })
    .filter(Boolean);

  if (slides.length === 0) return '';
  return slides.join('<slide>') + '<slide>';
}

function openAddSongDialog()
{
  editSongIdHiddenInput.value = '';
  editSongDialogHeading.textContent = 'Add New Song';
  editSongTitleTextbox.value = '';
  editSongSecondaryTitleTextbox.value = '';
  editSongFontTextbox.value = '';
  editSongLyricsTextarea.value = '';
  buttonDeleteSongDialog.style.display = 'none';
  editSongDialog.style.display = 'flex';
  editSongTitleTextbox.focus();
}

async function openEditSongDialog(songId)
{
  try
  {
    let song = songSlidesTextCache.get(Number(songId));

    if (!song)
    {
      const res = await fetch(`/api/songs/${songId}`);
      if (!res.ok) throw new Error('Failed to fetch song details');
      song = await res.json();
      songSlidesTextCache.set(Number(songId), song);
    }

    editSongIdHiddenInput.value = song.id;
    editSongDialogHeading.textContent = 'Edit Song';
    editSongTitleTextbox.value = song.name || '';
    editSongSecondaryTitleTextbox.value = song.title2 || '';
    editSongFontTextbox.value = song.font || '';
    editSongLyricsTextarea.value = lyricsToTextareaValue(song.lyrics || '');

    buttonDeleteSongDialog.style.display = 'inline-flex';
    buttonDeleteSongDialog.onclick = async () =>
    {
      if (confirm(`Are you sure you want to delete song "${song.name}"? This action cannot be undone.`))
      {
        await deleteSong(song.id);
        closeEditSongDialog();
      }
    };

    editSongDialog.style.display = 'flex';
    editSongLyricsTextarea.focus();
  }
  catch (err)
  {
    console.error('Error loading song for edit:', err);
  }
}

function closeEditSongDialog()
{
  editSongDialog.style.display = 'none';
}

async function handleSaveSong()
{
  const title = editSongTitleTextbox.value.trim();
  const title2 = editSongSecondaryTitleTextbox.value.trim();
  const font = editSongFontTextbox.value.trim();
  const songId = editSongIdHiddenInput.value;
  const lyrics = textareaValueToLyrics(editSongLyricsTextarea.value);

  if (!title)
  {
    alert('Please enter a song title.');
    editSongTitleTextbox.focus();
    return;
  }

  if (!lyrics)
  {
    alert('Please enter at least one slide of lyrics.');
    editSongLyricsTextarea.focus();
    return;
  }

  const payload = {
    name: title,
    title2,
    font,
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
    songSlidesTextCache.delete(Number(saved.id));

    closeEditSongDialog();

    await reloadSongsCache();
    loadSongsList(songSearchInput.value);
    selectSong(saved.id);
    await loadSongSlides();
  }
  catch (err)
  {
    console.error('Error saving song:', err);
    alert('Failed to save song: ' + err.message);
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

      if (Number(selectedSongId) === Number(songId))
      {
        selectedSongId = null;
        slideDeckSongs.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 48px;">Select a song from the library on the left.</div>';
        activeSongTitle.textContent = 'Select a Song';
        buttonDeckEditSong.style.display = 'none';
      }

      await reloadSongsCache();
      loadSongsList(songSearchInput.value);
    }
  }
  catch (err)
  {
    console.error('Error deleting song:', err);
  }
}

let isSongEditorEventsInitialized = false;

function initSongEditorEvents()
{
  if (isSongEditorEventsInitialized) return;
  isSongEditorEventsInitialized = true;

  buttonOpenAddSong.addEventListener('click', openAddSongDialog);

  buttonDeckEditSong.addEventListener('click', () =>
  {
    if (selectedSongId)
    {
      openEditSongDialog(selectedSongId);
    }
  });

  buttonCloseEditSongDialog.addEventListener('click', closeEditSongDialog);
  buttonCancelEditSongDialog.addEventListener('click', closeEditSongDialog);
  buttonSaveSong.addEventListener('click', handleSaveSong);
}
