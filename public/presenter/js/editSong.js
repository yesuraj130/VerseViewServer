// ===========================================================================
// Presenter Console — Song Creation & Editing (Add / Edit / Delete Dialog)
// ===========================================================================

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

function openAddSongDialog()
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
}

async function openEditSongDialog(songId)
{
  try
  {
    let song = (typeof songSlidesTextCache !== 'undefined' && songSlidesTextCache)
      ? songSlidesTextCache.get(Number(songId))
      : null;

    if (!song)
    {
      const res = await fetch(`/api/songs/${songId}`);
      if (!res.ok) throw new Error('Failed to fetch song details');
      song = await res.json();
      if (typeof songSlidesTextCache !== 'undefined' && songSlidesTextCache)
      {
        songSlidesTextCache.set(Number(songId), song);
      }
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

function closeEditSongDialog()
{
  if (editSongDialog) editSongDialog.style.display = 'none';
}

async function handleSaveSong()
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
    if (typeof songSlidesTextCache !== 'undefined' && songSlidesTextCache)
    {
      songSlidesTextCache.set(Number(saved.id), saved);
    }

    closeEditSongDialog();

    if (typeof reloadSongsCache === 'function')
    {
      await reloadSongsCache();
    }
    if (typeof loadSongsList === 'function')
    {
      loadSongsList(songSearchInput ? songSearchInput.value : '');
    }
    if (typeof selectSong === 'function')
    {
      selectSong(saved.id);
    }
    if (typeof loadSongSlides === 'function')
    {
      await loadSongSlides();
    }
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
      if (typeof songSlidesTextCache !== 'undefined' && songSlidesTextCache)
      {
        songSlidesTextCache.delete(Number(songId));
      }

      if (typeof selectedSongId !== 'undefined' && Number(selectedSongId) === Number(songId))
      {
        selectedSongId = null;
        if (typeof slideDeckSongs !== 'undefined' && slideDeckSongs)
        {
          slideDeckSongs.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 48px;">Select a song from the library on the left.</div>';
        }
        if (typeof activeSongTitle !== 'undefined' && activeSongTitle)
        {
          activeSongTitle.textContent = 'Select a Song';
        }
        if (typeof buttonDeckEditSong !== 'undefined' && buttonDeckEditSong)
        {
          buttonDeckEditSong.style.display = 'none';
        }
        if (typeof activeSlideCountIndicator !== 'undefined' && activeSlideCountIndicator)
        {
          activeSlideCountIndicator.textContent = '0 slides';
        }
      }

      if (typeof reloadSongsCache === 'function')
      {
        await reloadSongsCache();
      }
      if (typeof loadSongsList === 'function')
      {
        loadSongsList(songSearchInput ? songSearchInput.value : '');
      }
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

  if (buttonOpenAddSong)
  {
    buttonOpenAddSong.addEventListener('click', openAddSongDialog);
  }

  if (buttonDeckEditSong)
  {
    buttonDeckEditSong.addEventListener('click', () =>
    {
      if (typeof selectedSongId !== 'undefined' && selectedSongId)
      {
        openEditSongDialog(selectedSongId);
      }
    });
  }

  if (buttonCloseEditSongDialog)
  {
    buttonCloseEditSongDialog.addEventListener('click', closeEditSongDialog);
  }

  if (buttonCancelEditSongDialog)
  {
    buttonCancelEditSongDialog.addEventListener('click', closeEditSongDialog);
  }

  if (buttonSaveSong)
  {
    buttonSaveSong.addEventListener('click', handleSaveSong);
  }
}
