// ===========================================================================
// Presenter Console — Bible 3-Column Browser & Scripture Presentation
// ===========================================================================

async function initBible()
{
  try
  {
    const res = await fetch('/api/bible/versions');
    bibleVersions = await res.json();

    if (selectVersion)
    {
      selectVersion.innerHTML = '';
      bibleVersions.forEach((ver) =>
      {
        const opt = document.createElement('option');
        opt.value = ver.id;
        opt.textContent = ver.available ? ver.name : `${ver.name} (DB missing)`;
        if (!ver.available) opt.style.color = '#94a3b8';
        selectVersion.appendChild(opt);
      });
    }

    const targetVer = bibleVersions.find(v => v.id === selectedVersionId && v.available) ||
                      bibleVersions.find(v => v.available) ||
                      bibleVersions[0];
    if (targetVer)
    {
      selectedVersionId = targetVer.id;
      if (selectVersion) selectVersion.value = targetVer.id;
      if (bibleSearchVersionLabel) bibleSearchVersionLabel.textContent = targetVer.name;
      await loadBibleBooks(selectedVersionId, selectedBookNum, selectedChapterNum, selectedVerseNum);
    }

    // Initialize Testament filter tabs
    if (testamentTabs)
    {
      const tButtons = testamentTabs.querySelectorAll('.testament-btn');
      tButtons.forEach((btn) =>
      {
        btn.addEventListener('click', () =>
        {
          tButtons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          testamentFilter = btn.getAttribute('data-testament') || 'all';
          renderBibleBooksList();
        });
      });
    }

    // Initialize Book Search filter
    if (bibleBookFilter)
    {
      bibleBookFilter.addEventListener('input', (e) =>
      {
        bookSearchFilter = (e.target.value || '').trim().toLowerCase();
        renderBibleBooksList();
      });
    }

    // Version dropdown change listener
    if (selectVersion)
    {
      selectVersion.addEventListener('change', async (e) =>
      {
        selectedVersionId = e.target.value;
        const verObj = bibleVersions.find(v => v.id === selectedVersionId);
        if (bibleSearchVersionLabel && verObj) bibleSearchVersionLabel.textContent = verObj.name;
        await loadBibleBooks(selectedVersionId, selectedBookNum, selectedChapterNum, selectedVerseNum);
      });
    }

    renderRecentVersesStrip();
  }
  catch (err)
  {
    console.error('Error initializing Bible system:', err);
  }
}

async function loadBibleBooks(versionId, targetBookNum = null, targetChapter = null, targetVerse = null)
{
  try
  {
    const res = await fetch(`/api/bible/${versionId}/books`);
    if (!res.ok)
    {
      const errData = await res.json().catch(() => ({}));
      if (bibleBooksList)
      {
        bibleBooksList.innerHTML = `<div style="padding: 16px; font-size: 11px; color: var(--text-muted); text-align: center;">${escapeHtml(errData.error || 'Database missing for this version')}</div>`;
      }
      if (bibleChaptersList) bibleChaptersList.innerHTML = '';
      if (bibleVersesList) bibleVersesList.innerHTML = '';
      return;
    }
    const data = await res.json();
    allBibleBooks = data.books || [];
    renderBibleBooksList();

    let initialBook = null;
    const bookNumToFind = (targetBookNum !== null && targetBookNum !== undefined) ? targetBookNum : selectedBookNum;
    if (bookNumToFind)
    {
      initialBook = allBibleBooks.find(b => Number(b.bookNum) === Number(bookNumToFind));
    }
    if (!initialBook)
    {
      initialBook = allBibleBooks.find(b => Number(b.bookNum) === 43) || allBibleBooks[0];
    }

    if (initialBook)
    {
      const ch = (targetChapter !== null && targetChapter !== undefined) ? targetChapter : selectedChapterNum;
      const v = (targetVerse !== null && targetVerse !== undefined) ? targetVerse : selectedVerseNum;
      await selectBibleBook(initialBook.bookNum, initialBook.name, ch, v);
    }
  }
  catch (err)
  {
    console.error('Error loading Bible books:', err);
  }
}

const STANDARD_ENGLISH_BOOK_ABBR = {
  1: 'Gen', 2: 'Exo', 3: 'Lev', 4: 'Num', 5: 'Deu', 6: 'Jos', 7: 'Jdg', 8: 'Rut', 9: '1Sa', 10: '2Sa',
  11: '1Ki', 12: '2Ki', 13: '1Ch', 14: '2Ch', 15: 'Ezr', 16: 'Neh', 17: 'Est', 18: 'Job', 19: 'Psa', 20: 'Pro',
  21: 'Ecc', 22: 'Sng', 23: 'Isa', 24: 'Jer', 25: 'Lam', 26: 'Eze', 27: 'Dan', 28: 'Hos', 29: 'Joe', 30: 'Amo',
  31: 'Oba', 32: 'Jon', 33: 'Mic', 34: 'Nah', 35: 'Hab', 36: 'Zep', 37: 'Hag', 38: 'Zec', 39: 'Mal',
  40: 'Mat', 41: 'Mrk', 42: 'Luk', 43: 'Jhn', 44: 'Act', 45: 'Rom', 46: '1Co', 47: '2Co', 48: 'Gal', 49: 'Eph',
  50: 'Php', 51: 'Col', 52: '1Th', 53: '2Th', 54: '1Ti', 55: '2Ti', 56: 'Tit', 57: 'Phm', 58: 'Heb', 59: 'Jas',
  60: '1Pe', 61: '2Pe', 62: '1Jn', 63: '2Jn', 64: '3Jn', 65: 'Jud', 66: 'Rev'
};

function getShortBookName(name, bookNum)
{
  if (!name) return '';
  const num = Number(bookNum);
  const trimmed = name.trim();

  // If standard English book name:
  if (STANDARD_ENGLISH_BOOK_ABBR[num] && /^[1-3]?\s*[A-Za-z\s]+$/.test(trimmed))
  {
    return STANDARD_ENGLISH_BOOK_ABBR[num];
  }

  // Use Intl.Segmenter for Indic / Unicode scripts to preserve combining characters accurately
  if (typeof Intl !== 'undefined' && Intl.Segmenter)
  {
    try
    {
      const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      const numMatch = trimmed.match(/^([1-3]|I{1,3})\s*(.*)$/i);
      if (numMatch && numMatch[2])
      {
        const prefix = numMatch[1];
        const restSegments = Array.from(segmenter.segment(numMatch[2].trim())).map(s => s.segment);
        return prefix + restSegments.slice(0, 3).join('');
      }
      const segments = Array.from(segmenter.segment(trimmed)).map(s => s.segment);
      return segments.slice(0, 4).join('');
    }
    catch (e) {}
  }

  // Fallback for environments without Intl.Segmenter
  const numMatch = trimmed.match(/^([1-3]|I{1,3})\s*(.*)$/i);
  if (numMatch && numMatch[2])
  {
    return numMatch[1] + numMatch[2].slice(0, 3);
  }
  return trimmed.slice(0, 4);
}

function renderBibleBooksList()
{
  if (!bibleBooksList) return;
  bibleBooksList.innerHTML = '';

  let list = allBibleBooks;

  if (testamentFilter === 'ot')
  {
    list = list.filter(b => Number(b.bookNum) <= 39);
  }
  else if (testamentFilter === 'nt')
  {
    list = list.filter(b => Number(b.bookNum) >= 40);
  }

  if (bookSearchFilter)
  {
    list = list.filter(b =>
    {
      const nameMatch = b.name.toLowerCase().includes(bookSearchFilter);
      const numMatch = String(b.bookNum) === bookSearchFilter;
      return nameMatch || numMatch;
    });
  }

  if (list.length === 0)
  {
    bibleBooksList.innerHTML = '<div style="grid-column: 1/-1; padding: 14px; font-size: 11px; color: var(--text-muted); text-align: center;">No matching books</div>';
    return;
  }

  list.forEach((b) =>
  {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'book-btn book-item';
    if (Number(b.bookNum) === Number(selectedBookNum))
    {
      btn.classList.add('active');
    }
    btn.setAttribute('data-book-num', b.bookNum);
    btn.title = `${b.bookNum}. ${b.name}`;

    btn.innerHTML = `<span>${escapeHtml(b.name.trim())}</span>`;

    btn.addEventListener('click', () =>
    {
      selectBibleBook(b.bookNum, b.name);
    });

    bibleBooksList.appendChild(btn);
  });

  if (typeof highlightActiveInDecks === 'function' && liveState)
  {
    highlightActiveInDecks(liveState);
  }
}

async function selectBibleBook(bookNum, bookName, targetChapter = null, targetVerse = null)
{
  selectedBookNum = Number(bookNum);
  selectedBookName = bookName;
  if (typeof saveLastBrowsedBible === 'function') saveLastBrowsedBible();

  if (bibleBooksList)
  {
    bibleBooksList.querySelectorAll('.book-item').forEach((it) =>
    {
      const itNum = Number(it.getAttribute('data-book-num'));
      it.classList.toggle('active', itNum === selectedBookNum);
    });
  }

  try
  {
    const res = await fetch(`/api/bible/${selectedVersionId}/chapters?bookNum=${selectedBookNum}`);
    const chapters = await res.json();
    renderBibleChaptersList(chapters);

    let chosenCh = targetChapter;
    if (!chosenCh || !chapters.includes(Number(chosenCh)))
    {
      chosenCh = chapters.includes(1) ? 1 : chapters[0];
    }

    if (chosenCh !== undefined)
    {
      await selectBibleChapter(chosenCh, targetVerse);
    }
  }
  catch (err)
  {
    console.error('Error selecting Bible book:', err);
  }
}

function renderBibleChaptersList(chapters)
{
  if (!bibleChaptersList) return;
  bibleChaptersList.innerHTML = '';

  chapters.forEach((ch) =>
  {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'num-btn';
    btn.setAttribute('data-ch-num', ch);
    btn.textContent = ch;

    if (Number(ch) === Number(selectedChapterNum))
    {
      btn.classList.add('active');
    }

    btn.addEventListener('click', () =>
    {
      selectBibleChapter(ch);
    });

    bibleChaptersList.appendChild(btn);
  });

  if (typeof highlightActiveInDecks === 'function' && liveState)
  {
    highlightActiveInDecks(liveState);
  }
}

async function selectBibleChapter(chNum, targetVerse = null)
{
  selectedChapterNum = Number(chNum);
  if (typeof saveLastBrowsedBible === 'function') saveLastBrowsedBible();

  if (bibleChaptersList)
  {
    bibleChaptersList.querySelectorAll('.num-btn').forEach((btn) =>
    {
      const c = Number(btn.getAttribute('data-ch-num'));
      btn.classList.toggle('active', c === selectedChapterNum);
    });
  }

  try
  {
    const resVerses = await fetch(`/api/bible/${selectedVersionId}/verses?bookNum=${selectedBookNum}&chNum=${selectedChapterNum}`);
    const verseNumbers = await resVerses.json();
    renderBibleVersesList(verseNumbers);

    const resText = await fetch(`/api/bible/${selectedVersionId}/text?bookNum=${selectedBookNum}&chNum=${selectedChapterNum}`);
    const data = await resText.json();
    currentChapterVerses = data.verses || [];

    renderChapterVersesDeck(currentChapterVerses, data.bookName || selectedBookName, selectedChapterNum);

    if (targetVerse)
    {
      selectBibleVerse(targetVerse, false);
    }
    else if (currentChapterVerses.length > 0)
    {
      selectBibleVerse(1, false);
    }
  }
  catch (err)
  {
    console.error('Error selecting Bible chapter:', err);
  }
}

function renderBibleVersesList(verseNumbers)
{
  if (!bibleVersesList) return;
  bibleVersesList.innerHTML = '';

  verseNumbers.forEach((v) =>
  {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'num-btn';
    btn.setAttribute('data-verse-num', v);
    btn.textContent = v;

    if (Number(v) === Number(selectedVerseNum))
    {
      btn.classList.add('active');
    }

    btn.addEventListener('click', () =>
    {
      selectBibleVerse(v, false, true);
    });

    bibleVersesList.appendChild(btn);
  });

  if (typeof highlightActiveInDecks === 'function' && liveState)
  {
    highlightActiveInDecks(liveState);
  }
}

function renderChapterVersesDeck(verses, bookName, chNum)
{
  currentPresentationType = 'bible';

  const verObj = bibleVersions.find(v => v.id === selectedVersionId);
  const verName = verObj ? verObj.name : 'Bible';

  if (activeBibleTitle) activeBibleTitle.textContent = `${bookName} Chapter ${chNum}`;
  if (activeBibleVerBadge) activeBibleVerBadge.textContent = verName;
  if (activeSlideCountIndicatorBible)
  {
    activeSlideCountIndicatorBible.textContent = `${verses ? verses.length : 0} verses`;
  }

  const targetContainer = slideDeckBible || slideDeckContainer;
  if (!targetContainer) return;
  targetContainer.innerHTML = '';

  if (!verses || verses.length === 0)
  {
    targetContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 48px;">No verses available in this chapter.</div>';
    return;
  }

  verses.forEach((v) =>
  {
    const card = document.createElement('div');
    card.className = 'slide-card-vertical';
    card.setAttribute('data-book-num', v.bookNum);
    card.setAttribute('data-ch-num', v.chNum);
    card.setAttribute('data-verse-num', v.verseNum);
    card.id = `slide-verse-${v.verseNum}`;

    const isLive = liveState && liveState.verseInfo &&
      Number(liveState.verseInfo.bookNum) === Number(v.bookNum) &&
      Number(liveState.verseInfo.chNum) === Number(v.chNum) &&
      Number(liveState.verseInfo.verseNum) === Number(v.verseNum) &&
      liveState.status === 'live';

    if (isLive) card.classList.add('is-live');
    if (Number(v.verseNum) === Number(selectedVerseNum)) card.classList.add('active');

    card.innerHTML = `
      <div class="sc-header">
        <span class="sc-index-badge">${escapeHtml(bookName)} ${v.chNum}:${v.verseNum}</span>
        <span class="sc-live-pill" style="display: ${isLive ? 'inline-block' : 'none'};">LIVE</span>
      </div>
      <div class="sc-text-main">${escapeHtml(v.word)}</div>
    `;

    card.addEventListener('click', () =>
    {
      presentBibleVerse(selectedVersionId, selectedBookName, v);
    });

    targetContainer.appendChild(card);
  });
}

function selectBibleVerse(verseNum, doPresent = false, userInitiated = false)
{
  selectedVerseNum = Number(verseNum);
  if (typeof saveLastBrowsedBible === 'function') saveLastBrowsedBible();

  if (userInitiated && window.innerWidth <= 768 && typeof setMobilePaneMode === 'function')
  {
    if (window.currentMobilePaneMode !== 'both')
    {
      setMobilePaneMode('deck');
    }
  }

  if (bibleVersesList)
  {
    bibleVersesList.querySelectorAll('.num-btn').forEach((btn) =>
    {
      const v = Number(btn.getAttribute('data-verse-num'));
      btn.classList.toggle('active', v === selectedVerseNum);
    });
  }

  const targetContainer = slideDeckBible || slideDeckContainer;
  const targetCard = targetContainer ? targetContainer.querySelector(`#slide-verse-${selectedVerseNum}`) : null;
  if (targetCard && targetContainer)
  {
    targetContainer.querySelectorAll('.slide-card-vertical').forEach(c => c.classList.remove('active'));
    targetCard.classList.add('active');
    smoothScrollToElement(targetContainer, targetCard, 200, true);
  }

  if (doPresent)
  {
    const verseObj = currentChapterVerses.find(v => Number(v.verseNum) === selectedVerseNum);
    if (verseObj)
    {
      presentBibleVerse(selectedVersionId, selectedBookName, verseObj);
    }
  }
}

function presentBibleVerse(versionId, bookName, verseObj)
{
  const verObj = bibleVersions.find(v => v.id === versionId);
  const verName = verObj ? verObj.name : 'Bible';
  const refText = `${bookName} ${verseObj.chNum}:${verseObj.verseNum} (${verName})`;

  const payload = {
    type: 'bible',
    title: `${bookName} ${verseObj.chNum}:${verseObj.verseNum}`,
    reference: refText,
    lines: [verseObj.word],
    rawSlide: verseObj.word,
    slideIndex: verseObj.verseNum,
    totalSlides: currentChapterVerses.length || 1,
    songId: null,
    verseInfo: {
      bookNum: verseObj.bookNum,
      chNum: verseObj.chNum,
      verseNum: verseObj.verseNum,
      version: versionId
    }
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

  if (activeSlideCountIndicator)
  {
    activeSlideCountIndicator.textContent = `Verse ${verseObj.verseNum} of ${currentChapterVerses.length}`;
  }

  addRecentVerse({
    versionId,
    bookNum: verseObj.bookNum,
    bookName,
    chNum: verseObj.chNum,
    verseNum: verseObj.verseNum,
    ref: `${bookName} ${verseObj.chNum}:${verseObj.verseNum}`
  });
}

// ---------------------------------------------------------------------------
// Quick Scripture Reference Jump & Recent History
// ---------------------------------------------------------------------------
if (btnQuickRefGo) btnQuickRefGo.addEventListener('click', handleQuickRefGo);
if (bibleRefQuickInput)
{
  bibleRefQuickInput.addEventListener('keydown', (e) =>
  {
    if (e.key === 'Enter') handleQuickRefGo();
  });
}

async function handleQuickRefGo()
{
  const ref = (bibleRefQuickInput.value || '').trim();
  if (!ref) return;

  const match = ref.match(/^([1-3]?\s*[\p{L}\s]+?)\s*(\d+)[:\s.]?(\d+)?$/u);
  if (!match)
  {
    alert('Please enter reference in format: Book Chapter:Verse (e.g. John 3:16 or Gen 1:1)');
    return;
  }

  const queryBook = match[1].trim().toLowerCase();
  const queryCh = Number(match[2]);
  const queryVerse = match[3] ? Number(match[3]) : 1;

  const matchedBook = allBibleBooks.find((b) =>
  {
    const bName = b.name.toLowerCase();
    return bName === queryBook || bName.startsWith(queryBook) || bName.includes(queryBook);
  });

  if (!matchedBook)
  {
    alert(`Could not find book matching "${queryBook}".`);
    return;
  }

  await selectBibleBook(matchedBook.bookNum, matchedBook.name, queryCh, queryVerse);
}

function renderRecentVersesStrip()
{
  if (!bibleRecentStrip) return;
  bibleRecentStrip.innerHTML = '<span style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">Recent:</span>';

  recentVerses.slice(0, 6).forEach((rv) =>
  {
    const chip = document.createElement('span');
    chip.className = 'recent-chip';
    chip.textContent = rv.ref;
    chip.title = `Jump to ${rv.ref}`;
    chip.addEventListener('click', async () =>
    {
      await selectBibleBook(rv.bookNum, rv.bookName, rv.chNum, rv.verseNum);
    });
    bibleRecentStrip.appendChild(chip);
  });
}

function addRecentVerse(rv)
{
  recentVerses = recentVerses.filter(item => item.ref !== rv.ref);
  recentVerses.unshift(rv);
  if (recentVerses.length > 10) recentVerses.pop();
  try
  {
    localStorage.setItem('recent_bible_verses', JSON.stringify(recentVerses));
  }
  catch (e)
  {
  }
  renderRecentVersesStrip();
}
