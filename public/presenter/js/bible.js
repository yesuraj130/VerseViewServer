// ===========================================================================
// Presenter Console — Bible 3-Column Browser & Scripture Presentation
// ===========================================================================

let bibleVersionsCache = null;
const bibleStructureCache = new Map();
const bibleChapterTextCache = new Map();
const maxBibleChapterTextCache = 20;

// DOM Elements
let bibleVersionSelectionDropdown = null;
let bibleRecentStrip = null;
let bibleBooksList = null;
let bibleChaptersList = null;
let bibleVersesList = null;
let slideDeckBible = null;

let currentBibleChapterTextFetchId = 0;
let bibleVersionChangeHandlerAttached = false;

// ---------------------------------------------------------------------------
// LocalStorage Helpers (Reading & Writing with Safe Fallbacks)
// ---------------------------------------------------------------------------
function getStorageItem(key, defaultValue = null)
{
  try
  {
    const val = localStorage.getItem(key);
    if (val === null || val === undefined || val === 'null' || val === 'undefined')
    {
      return defaultValue;
    }
    return val;
  }
  catch (e)
  {
    return defaultValue;
  }
}

function getNumericStorageItem(key, defaultValue = 1)
{
  const val = Number(getStorageItem(key, defaultValue));
  return (val && val > 0) ? val : defaultValue;
}

function setStorageItem(key, value)
{
  try
  {
    if (value === null || value === undefined)
    {
      localStorage.removeItem(key);
    }
    else
    {
      localStorage.setItem(key, String(value));
    }
  }
  catch (e) {}
}

function loadBibleLocalStorage()
{
  selectedBibleVersionId = getStorageItem('selectedBibleVersionId', 'tamil');
  selectedBookNumber = getNumericStorageItem('selectedBookNumber', 1);
  selectedChapterNumber = getNumericStorageItem('selectedChapterNumber', 1);
  selectedVerseNumber = getNumericStorageItem('selectedVerseNumber', 1);
}

async function ensureBibleStructure(versionId)
{
  if (!versionId) return null;
  if (bibleStructureCache.has(versionId))
  {
    return bibleStructureCache.get(versionId);
  }

  try
  {
    const res = await fetch(`/api/bible/versions?returnBibleStructure=true&versionId=${encodeURIComponent(versionId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.bibleStructure)
    {
      bibleStructureCache.set(versionId, data.bibleStructure);
      return data.bibleStructure;
    }
  }
  catch (err)
  {
    console.error(`Error fetching Bible structure for ${versionId}:`, err);
  }
  return null;
}

async function initBible()
{
  bibleVersionSelectionDropdown = document.getElementById('bibleVersionSelectionDropdown');
  bibleRecentStrip = document.getElementById('bible-recent-strip');
  bibleBooksList = document.getElementById('bible-books-list');
  bibleChaptersList = document.getElementById('bible-chapters-list');
  bibleVersesList = document.getElementById('bible-verses-list');
  slideDeckBible = document.getElementById('slide-deck-bible');

  loadBibleLocalStorage();

  try
  {
    const versionsRes = await fetch('/api/bible/versions?returnVersion=true');
    const versionsData = await versionsRes.json();
    bibleVersionsCache = versionsData.versions || [];

    let activeVersion = bibleVersionsCache.find(v => v.id === selectedBibleVersionId);
    if (!activeVersion || !activeVersion.available)
    {
      const availableVer = bibleVersionsCache.find(v => v.available);
      if (availableVer)
      {
        selectedBibleVersionId = availableVer.id;
        activeVersion = availableVer;
      }
      else if (activeVersion)
      {
        selectedBibleVersionId = activeVersion.id;
      }
      else if (bibleVersionsCache[0])
      {
        selectedBibleVersionId = bibleVersionsCache[0].id;
      }
      else
      {
        selectedBibleVersionId = 'tamil';
      }
    }

    loadBibleVersions();
    addChangeEventToBibleVersionDropdown();
    selectBibleVersion(selectedBibleVersionId);

    const localVersionId = selectedBibleVersionId;
    const localBookNumber = selectedBookNumber || 1;
    const localChapterNumber = selectedChapterNumber || 1;
    const localVerseNumber = selectedVerseNumber || 1;
    const localFetchId = ++currentBibleChapterTextFetchId;

    const bibleFetchUrl = `/api/bible/versions?returnBibleStructure=true&versionId=${encodeURIComponent(localVersionId)}&bookNumber=${localBookNumber}&chapterNumber=${localChapterNumber}`;
    const bibleFetchResult = await fetch(bibleFetchUrl);
    const bibleFetchResultJson = await bibleFetchResult.json();

    if (bibleFetchResultJson.bibleStructure)
    {
      bibleStructureCache.set(localVersionId, bibleFetchResultJson.bibleStructure);
    }
    if (bibleFetchResultJson.chapterTexts)
    {
      bibleChapterTextCache.set(`${localVersionId}:${localBookNumber}:${localChapterNumber}`, bibleFetchResultJson.chapterTexts);
    }

    if (localFetchId === currentBibleChapterTextFetchId)
    {
      loadBibleBooks();
      setSelectedIndexInList(bibleBooksList, localBookNumber - 1);
      scrollToIndexInList(bibleBooksList, localBookNumber - 1);

      loadBibleChapter();
      setSelectedIndexInList(bibleChaptersList, localChapterNumber - 1);
      scrollToIndexInList(bibleChaptersList, localChapterNumber - 1);

      loadBibleVersesList();
      setSelectedIndexInList(bibleVersesList, localVerseNumber - 1);
      scrollToIndexInList(bibleVersesList, localVerseNumber - 1);

      const isLoaded = await loadBibleVersesSlide();
      if (isLoaded)
      {
        setSelectedIndexInList(slideDeckBible, localVerseNumber - 1);
        scrollToIndexInList(slideDeckBible, localVerseNumber - 1);
      }
    }

    initBibleSearchEvents();
  }
  catch (err)
  {
    console.error('Error initializing Bible system:', err);
  }
}

// ---------------------------------------------------------------------------
// Bible Scripture Search Modal Logic
// ---------------------------------------------------------------------------
let bibleSearchDebounceTimer = null;
let currentBibleSearchAbortCtrl = null;
let isBibleSearchEventsInitialized = false;

function openBibleSearchDialog()
{
  const dialog = document.getElementById('bible-search-dialog');
  const input = document.getElementById('bible-search-input');
  const badge = document.getElementById('bible-search-version-badge');

  if (!dialog || !input) return;

  if (badge)
  {
    let verName = selectedBibleVersionId;
    if (bibleVersionsCache)
    {
      const found = bibleVersionsCache.find(v => v.id === selectedBibleVersionId);
      if (found) verName = found.name;
    }
    badge.textContent = verName;
  }

  dialog.style.display = 'flex';
  setTimeout(() => {
    input.focus();
    input.select();
  }, 50);

  if (input.value.trim())
  {
    executeBibleSearch(input.value.trim());
  }
}

function closeBibleSearchDialog()
{
  const dialog = document.getElementById('bible-search-dialog');
  if (dialog) dialog.style.display = 'none';
}

function initBibleSearchEvents()
{
  if (isBibleSearchEventsInitialized) return;
  isBibleSearchEventsInitialized = true;

  const dialog = document.getElementById('bible-search-dialog');
  const input = document.getElementById('bible-search-input');
  const btnClose = document.getElementById('btn-close-bible-search-dialog');
  const btnClear = document.getElementById('btn-clear-bible-search');
  const btnOpen = document.getElementById('btn-open-bible-search');

  if (btnOpen)
  {
    btnOpen.addEventListener('click', openBibleSearchDialog);
  }

  if (btnClose)
  {
    btnClose.addEventListener('click', closeBibleSearchDialog);
  }

  if (dialog)
  {
    dialog.addEventListener('click', (e) =>
    {
      if (e.target === dialog) closeBibleSearchDialog();
    });
  }

  if (btnClear && input)
  {
    btnClear.addEventListener('click', () =>
    {
      input.value = '';
      btnClear.style.display = 'none';
      input.focus();
      renderBibleSearchResults([], '');
    });
  }

  if (input)
  {
    input.addEventListener('input', () =>
    {
      const query = input.value;
      if (btnClear)
      {
        btnClear.style.display = query.length > 0 ? 'inline-flex' : 'none';
      }

      if (bibleSearchDebounceTimer) clearTimeout(bibleSearchDebounceTimer);
      bibleSearchDebounceTimer = setTimeout(() =>
      {
        executeBibleSearch(query.trim());
      }, 150);
    });

    input.addEventListener('keydown', (e) =>
    {
      if (e.key === 'Escape')
      {
        closeBibleSearchDialog();
      }
      else if (e.key === 'Enter')
      {
        const resultsList = document.getElementById('bible-search-results-list');
        const firstResult = resultsList ? resultsList.querySelector('.bible-search-result-item') : null;
        if (firstResult)
        {
          firstResult.click();
        }
      }
    });
  }

  window.addEventListener('keydown', (e) =>
  {
    if (e.key === 'Escape')
    {
      const d = document.getElementById('bible-search-dialog');
      if (d && d.style.display === 'flex')
      {
        closeBibleSearchDialog();
      }
    }
  });
}

async function executeBibleSearch(query)
{
  const resultsList = document.getElementById('bible-search-results-list');
  const summaryBox = document.getElementById('bible-search-results-summary');
  const countText = document.getElementById('bible-search-count-text');
  const spinIcon = document.getElementById('bible-search-spin-icon');

  if (!query)
  {
    if (summaryBox) summaryBox.style.display = 'none';
    if (resultsList)
    {
      resultsList.innerHTML = '<div class="bible-search-empty-state">Type a word in Tamil or English phonetics (e.g. anbu, visuvasam) or a scripture reference (e.g. John 3:16) to search.</div>';
    }
    return;
  }

  if (currentBibleSearchAbortCtrl)
  {
    currentBibleSearchAbortCtrl.abort();
  }
  currentBibleSearchAbortCtrl = new AbortController();

  if (spinIcon) spinIcon.classList.add('spinning');

  try
  {
    const url = `/api/bible/search?q=${encodeURIComponent(query)}&versionId=${encodeURIComponent(selectedBibleVersionId)}&limit=50`;
    const res = await fetch(url, { signal: currentBibleSearchAbortCtrl.signal });
    if (!res.ok) throw new Error('Search failed');
    const results = await res.json();

    if (spinIcon) spinIcon.classList.remove('spinning');
    renderBibleSearchResults(results, query);
  }
  catch (err)
  {
    if (err.name === 'AbortError') return;
    if (spinIcon) spinIcon.classList.remove('spinning');
    console.error('Error during Bible search:', err);
    if (resultsList)
    {
      resultsList.innerHTML = `<div class="bible-search-empty-state" style="color: var(--color-red);">Error: ${escapeHtml(err.message)}</div>`;
    }
  }
}

function renderBibleSearchResults(results, query)
{
  const resultsList = document.getElementById('bible-search-results-list');
  const summaryBox = document.getElementById('bible-search-results-summary');
  const countText = document.getElementById('bible-search-count-text');

  if (!resultsList) return;
  resultsList.innerHTML = '';

  if (!results || results.length === 0)
  {
    if (summaryBox) summaryBox.style.display = 'none';
    resultsList.innerHTML = `<div class="bible-search-empty-state">No matching verses found for "${escapeHtml(query)}". Try different Tamil phonetic spelling or scripture reference.</div>`;
    return;
  }

  if (summaryBox) summaryBox.style.display = 'flex';
  if (countText) countText.textContent = `${results.length} verse${results.length === 1 ? '' : 's'} found`;

  results.forEach((verse) =>
  {
    const itemEl = document.createElement('div');
    itemEl.className = 'bible-search-result-item';

    const refText = verse.reference || `${verse.bookName} ${verse.chNum}:${verse.verseNum}`;
    let highlightedVerseText = escapeHtml(verse.word);

    if (window.TamilPhonetic && typeof window.TamilPhonetic.highlightMatchedCharacters === 'function')
    {
      highlightedVerseText = window.TamilPhonetic.highlightMatchedCharacters(verse.word, query);
    }

    itemEl.innerHTML = `
      <div class="bible-search-item-header">
        <span class="bible-search-ref-badge">${escapeHtml(refText)}</span>
      </div>
      <div class="bible-search-verse-text">${highlightedVerseText}</div>
    `;

    // Click triggers live slide instantly, matches 3-column browser state, and closes modal
    itemEl.addEventListener('click', async () =>
    {
      presentBibleVerse({
        versionId: verse.versionId,
        bookNum: verse.bookNum,
        chNum: verse.chNum,
        verseNum: verse.verseNum,
        word: verse.word
      });

      closeBibleSearchDialog();

      if (verse.bookNum && verse.chNum && verse.verseNum)
      {
        await selectBibleBook(verse.bookNum, verse.chNum, verse.verseNum);
      }
    });

    resultsList.appendChild(itemEl);
  });
}

//#region Loading
function loadBibleVersions()
{
  if (!bibleVersionSelectionDropdown) return;
  if (bibleVersionsCache)
  {
    renderBibleVersionsDropdown(bibleVersionsCache);
  }
  else
  {
    console.warn('Bible versions cache not available');
  }
}

async function loadBibleBooks(targetVersionId, targetBookNum, targetChNum, targetVerseNum)
{
  if (targetVersionId && targetVersionId !== selectedBibleVersionId)
  {
    await changeBibleVersion(targetVersionId);
    if (targetBookNum)
    {
      await selectBibleBook(targetBookNum, targetChNum || 1, targetVerseNum || 1);
    }
    return;
  }

  const selectedVersion = bibleVersionsCache ? bibleVersionsCache.find(v => v.id === selectedBibleVersionId) : null;
  let bookNames = selectedVersion ? (selectedVersion.booknames || selectedVersion.books) : null;

  if (!bookNames || bookNames.length === 0)
  {
    const selectedBibleVersionStructure = bibleStructureCache.get(selectedBibleVersionId);
    if (selectedBibleVersionStructure && selectedBibleVersionStructure.bookNames)
    {
      bookNames = selectedBibleVersionStructure.bookNames;
    }
  }

  if (bookNames && bookNames.length > 0)
  {
    selectedBibleVersionBooks = bookNames.map((name, idx) => ({ bookNum: idx + 1, name }));
    window.selectedBibleVersionBooks = selectedBibleVersionBooks;
    renderBibleBooksList(bookNames);
    setSelectedIndexInList(bibleBooksList, (selectedBookNumber || 1) - 1);
  }
  else
  {
    console.warn(`Book names not available for version ${selectedBibleVersionId}`);
  }

  if (targetBookNum)
  {
    await selectBibleBook(targetBookNum, targetChNum || 1, targetVerseNum || 1);
  }
}

function loadBibleChapter()
{
  const selectedBibleVersionStructure = bibleStructureCache.get(selectedBibleVersionId);
  const books = selectedBibleVersionStructure?.books || (Array.isArray(selectedBibleVersionStructure) ? selectedBibleVersionStructure : null);

  if (books && books[selectedBookNumber - 1])
  {
    const chaptersCount = books[selectedBookNumber - 1].length;
    renderBibleChaptersList(chaptersCount);
  }
  else
  {
    if (bibleChaptersList) bibleChaptersList.innerHTML = '';
    console.warn(`Bible structure not available for version ${selectedBibleVersionId} book ${selectedBookNumber}`);
  }
}

function loadBibleVersesList()
{
  const selectedBibleVersionStructure = bibleStructureCache.get(selectedBibleVersionId);
  const books = selectedBibleVersionStructure?.books || (Array.isArray(selectedBibleVersionStructure) ? selectedBibleVersionStructure : null);

  if (books && books[selectedBookNumber - 1] && books[selectedBookNumber - 1][selectedChapterNumber - 1])
  {
    const verseCount = books[selectedBookNumber - 1][selectedChapterNumber - 1];
    renderBibleVersesList(verseCount);
  }
  else
  {
    if (bibleVersesList) bibleVersesList.innerHTML = '';
    console.warn(`Bible structure not available for version ${selectedBibleVersionId} book ${selectedBookNumber} chapter ${selectedChapterNumber}`);
  }
}

async function loadBibleVersesSlide()
{
  const cacheKey = `${selectedBibleVersionId}:${selectedBookNumber}:${selectedChapterNumber}`;
  const cachedBibleChapterText = bibleChapterTextCache.get(cacheKey);

  if (cachedBibleChapterText && cachedBibleChapterText.verses && cachedBibleChapterText.verses.length > 0)
  {
    renderBibleVersesSlides(cachedBibleChapterText.verses);
    return true;
  }
  else
  {
    if (slideDeckBible) slideDeckBible.innerHTML = '';
    return await fetchAndloadVerseSlides(selectedBibleVersionId, selectedBookNumber, selectedChapterNumber);
  }
}

async function fetchAndloadVerseSlides(targetVersionId, targetBookNumber, targetChapterNumber)
{
  const localBibleVersionId = targetVersionId;
  const localBookNumber = targetBookNumber;
  const localChapterNumber = targetChapterNumber;
  const localFetchId = ++currentBibleChapterTextFetchId;

  try
  {
    const chapterTextFetchResult = await fetch(`/api/bible/versions?versionId=${encodeURIComponent(localBibleVersionId)}&bookNumber=${localBookNumber}&chapterNumber=${localChapterNumber}`);

    if (localFetchId !== currentBibleChapterTextFetchId) return false;

    if (!chapterTextFetchResult.ok)
    {
      if (slideDeckBible) slideDeckBible.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--color-font-muted);">Error loading verses</div>';
      console.error(`Failed to fetch Bible text for ${localBibleVersionId} book ${localBookNumber} chapter ${localChapterNumber}`);
      return false;
    }

    const json = await chapterTextFetchResult.json();
    const chapterTexts = json.chapterTexts;

    if (chapterTexts && chapterTexts.verses && chapterTexts.verses.length > 0)
    {
      if (bibleChapterTextCache.size >= maxBibleChapterTextCache)
      {
        const oldestKey = bibleChapterTextCache.keys().next().value;
        if (oldestKey) bibleChapterTextCache.delete(oldestKey);
      }

      const cacheKey = `${localBibleVersionId}:${localBookNumber}:${localChapterNumber}`;
      bibleChapterTextCache.set(cacheKey, chapterTexts);

      renderBibleVersesSlides(chapterTexts.verses);
      return true;
    }
    else
    {
      if (slideDeckBible) slideDeckBible.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--color-font-muted);">No verses available for this chapter</div>';
      return false;
    }
  }
  catch (err)
  {
    console.error('Error fetching Bible text:', err);
    return false;
  }
}
//#endregion

//#region Selection & Navigation
function selectBibleVersion(targetVersionId)
{
  selectedBibleVersionId = targetVersionId;
  window.selectedBibleVersionId = targetVersionId;
  setStorageItem('selectedBibleVersionId', selectedBibleVersionId);

  if (bibleVersionSelectionDropdown)
  {
    bibleVersionSelectionDropdown.value = targetVersionId;
  }
}

async function changeBibleVersion(targetVersionId)
{
  if (!targetVersionId) return;
  selectedBibleVersionId = targetVersionId;
  window.selectedBibleVersionId = targetVersionId;
  setStorageItem('selectedBibleVersionId', selectedBibleVersionId);

  if (bibleVersionSelectionDropdown)
  {
    bibleVersionSelectionDropdown.value = targetVersionId;
  }

  await ensureBibleStructure(targetVersionId);
  await loadBibleBooks();

  const struct = bibleStructureCache.get(targetVersionId);
  const books = struct?.books || (Array.isArray(struct) ? struct : null);

  if (books && books.length > 0)
  {
    if (selectedBookNumber > books.length || selectedBookNumber < 1)
    {
      selectedBookNumber = 1;
      window.selectedBookNumber = selectedBookNumber;
      setStorageItem('selectedBookNumber', selectedBookNumber);
    }
    setSelectedIndexInList(bibleBooksList, selectedBookNumber - 1);
    scrollToIndexInList(bibleBooksList, selectedBookNumber - 1);

    loadBibleChapter();
    const chCount = books[selectedBookNumber - 1]?.length || 1;
    if (selectedChapterNumber > chCount || selectedChapterNumber < 1)
    {
      selectedChapterNumber = 1;
      window.selectedChapterNumber = selectedChapterNumber;
      setStorageItem('selectedChapterNumber', selectedChapterNumber);
    }
    setSelectedIndexInList(bibleChaptersList, selectedChapterNumber - 1);
    scrollToIndexInList(bibleChaptersList, selectedChapterNumber - 1);

    loadBibleVersesList();
    const vCount = books[selectedBookNumber - 1]?.[selectedChapterNumber - 1] || 1;
    if (selectedVerseNumber > vCount || selectedVerseNumber < 1)
    {
      selectedVerseNumber = 1;
      window.selectedVerseNumber = selectedVerseNumber;
      setStorageItem('selectedVerseNumber', selectedVerseNumber);
    }
    setSelectedIndexInList(bibleVersesList, selectedVerseNumber - 1);
    scrollToIndexInList(bibleVersesList, selectedVerseNumber - 1);

    const isLoaded = await loadBibleVersesSlide();
    if (isLoaded)
    {
      setSelectedIndexInList(slideDeckBible, selectedVerseNumber - 1);
      scrollToIndexInList(slideDeckBible, selectedVerseNumber - 1);
    }
  }
  else
  {
    if (bibleChaptersList) bibleChaptersList.innerHTML = '<div style="padding: 8px; font-size: 11px; color: var(--color-font-muted);">DB missing</div>';
    if (bibleVersesList) bibleVersesList.innerHTML = '';
    if (slideDeckBible) slideDeckBible.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--color-font-muted);">This Bible version database is not available on the server.</div>';
  }
}

async function selectBibleBook(targetBookNumber, targetChapterNumber = 1, targetVerseNumber = 1)
{
  selectedBookNumber = Number(targetBookNumber);
  window.selectedBookNumber = selectedBookNumber;
  setStorageItem('selectedBookNumber', selectedBookNumber);

  setSelectedIndexInList(bibleBooksList, selectedBookNumber - 1);
  scrollToIndexInList(bibleBooksList, selectedBookNumber - 1);

  loadBibleChapter();
  await selectBibleChapter(targetChapterNumber, targetVerseNumber);
}

async function selectBibleChapter(targetChapterNumber, targetVerseNumber = 1)
{
  selectedChapterNumber = Number(targetChapterNumber);
  window.selectedChapterNumber = selectedChapterNumber;
  setStorageItem('selectedChapterNumber', selectedChapterNumber);

  setSelectedIndexInList(bibleChaptersList, selectedChapterNumber - 1);
  scrollToIndexInList(bibleChaptersList, selectedChapterNumber - 1);

  loadBibleVersesList();
  selectBibleVerse(targetVerseNumber, true);
  scrollToIndexInList(bibleVersesList, targetVerseNumber - 1);

  const isLoaded = await loadBibleVersesSlide();
  if (isLoaded)
  {
    setSelectedIndexInList(slideDeckBible, targetVerseNumber - 1);
    smoothScrollToIndexInList(slideDeckBible, targetVerseNumber - 1);
  }
}

function selectBibleVerse(targetVerseNumber, syncSlide = true)
{
  selectedVerseNumber = Number(targetVerseNumber);
  window.selectedVerseNumber = selectedVerseNumber;
  setStorageItem('selectedVerseNumber', selectedVerseNumber);

  setSelectedIndexInList(bibleVersesList, selectedVerseNumber - 1);
  if (syncSlide)
  {
    selectVerseSlide(selectedVerseNumber);
  }
}

function selectVerseSlide(targetVerseNumber)
{
  setSelectedIndexInList(slideDeckBible, targetVerseNumber - 1);
}
//#endregion

//#region Rendering
function renderBibleVersionsDropdown(bibleVersions)
{
  if (!bibleVersionSelectionDropdown) return;
  bibleVersionSelectionDropdown.innerHTML = '';

  bibleVersions.forEach((bibleVersion) =>
  {
    const bibleVersionOption = document.createElement('option');
    bibleVersionOption.value = bibleVersion.id;
    bibleVersionOption.textContent = bibleVersion.available ? bibleVersion.name : `${bibleVersion.name} (DB missing)`;
    bibleVersionSelectionDropdown.appendChild(bibleVersionOption);
  });

  if (selectedBibleVersionId)
  {
    bibleVersionSelectionDropdown.value = selectedBibleVersionId;
  }
}

function addChangeEventToBibleVersionDropdown()
{
  if (!bibleVersionSelectionDropdown || bibleVersionChangeHandlerAttached) return;

  bibleVersionSelectionDropdown.addEventListener('change', async (e) =>
  {
    if (selectedBibleVersionId === e.target.value) return;
    await changeBibleVersion(e.target.value);
  });

  bibleVersionChangeHandlerAttached = true;
}

function renderBibleBooksList(booksNames)
{
  if (!bibleBooksList) return;
  bibleBooksList.innerHTML = '';

  for (let i = 0; i < booksNames.length; i++)
  {
    const bookNumber = i + 1;
    const bookName = booksNames[i];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'book-button book-item';
    button.title = `${bookName}`;
    button.innerHTML = `${escapeHtml(bookName.trim())}`;

    button.addEventListener('click', async () =>
    {
      if (selectedBookNumber === bookNumber) return;
      await selectBibleBook(bookNumber, 1, 1);
    });

    bibleBooksList.appendChild(button);
  }
}

function renderBibleChaptersList(chaptersCount)
{
  if (!bibleChaptersList) return;
  bibleChaptersList.innerHTML = '';

  for (let chapterNumber = 1; chapterNumber <= chaptersCount; chapterNumber++)
  {
    const chapterButton = document.createElement('button');
    chapterButton.type = 'button';
    chapterButton.className = 'number-button';
    chapterButton.textContent = chapterNumber;

    chapterButton.addEventListener('click', async () =>
    {
      if (selectedChapterNumber === chapterNumber) return;
      await selectBibleChapter(chapterNumber, 1);
    });

    bibleChaptersList.appendChild(chapterButton);
  }
}

function renderBibleVersesList(versesCount)
{
  if (!bibleVersesList) return;
  bibleVersesList.innerHTML = '';

  for (let verseNumber = 1; verseNumber <= versesCount; verseNumber++)
  {
    const verseButton = document.createElement('button');
    verseButton.type = 'button';
    verseButton.className = 'number-button';
    verseButton.textContent = verseNumber;

    verseButton.addEventListener('click', () =>
    {
      if (selectedVerseNumber === verseNumber) return;
      selectBibleVerse(verseNumber, true);
      scrollToIndexInList(bibleVersesList, verseNumber - 1);
      smoothScrollToIndexInList(slideDeckBible, verseNumber - 1);
    });

    bibleVersesList.appendChild(verseButton);
  }
}

function renderBibleVersesSlides(bibleChapterVersesText)
{
  if (!slideDeckBible) return;
  slideDeckBible.innerHTML = '';

  bibleChapterVersesText.forEach((verseText) =>
  {
    const verseSlide = document.createElement('div');
    verseSlide.className = 'slide-card';

    verseSlide.innerHTML = `
      <span class="slide-card-badge" style="display: none">LIVE</span>
      <div class="slide-card-content"><span class="verse-number">${verseText.verseNum}</span>${escapeHtml(verseText.word)}</div>
    `;

    verseSlide.addEventListener('click', () =>
    {
      selectBibleVerse(verseText.verseNum, false);
      scrollToIndexInList(bibleVersesList, verseText.verseNum - 1);
      presentBibleVerse(verseText);
    });

    slideDeckBible.appendChild(verseSlide);
  });
}
//#endregion

function presentBibleVerse(bibleVerse)
{
  selectVerseSlide(bibleVerse.verseNum);
  const versionId = bibleVerse.versionId || selectedBibleVersionId;
  const bookNum = Number(bibleVerse.bookNum || selectedBookNumber || 1);
  const chNum = Number(bibleVerse.chNum || selectedChapterNumber || 1);
  const verseNum = Number(bibleVerse.verseNum || 1);

  let bookName = `Book ${bookNum}`;
  if (typeof selectedBibleVersionBooks !== 'undefined' && selectedBibleVersionBooks && selectedBibleVersionBooks[bookNum - 1])
  {
    bookName = selectedBibleVersionBooks[bookNum - 1].name;
  }

  const payload = {
    type: 'bible',
    title: `${bookName} ${chNum}:${verseNum}`,
    verseInfo: {
      version: versionId,
      bookNum: bookNum,
      chNum: chNum,
      verseNum: verseNum
    }
  };

  if (typeof socket !== 'undefined' && socket)
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
  if (index <= 0)
  {
    container.scrollTop = 0;
  }
  else
  {
    const activeItem = container.children[index];
    if (activeItem)
    {
      activeItem.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    }
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
  const children = container.children;
  for (let i = 0; i < children.length; i++)
  {
    children[i].classList.toggle('selected', i === activeIndex);
  }
}
//#endregion

// Expose globally for controls and socket synchronization
window.initBible = initBible;
window.loadBibleBooks = loadBibleBooks;
window.selectBibleBook = selectBibleBook;
window.selectBibleChapter = selectBibleChapter;
window.selectBibleVerse = selectBibleVerse;
window.selectVerseSlide = selectVerseSlide;
window.changeBibleVersion = changeBibleVersion;
window.openBibleSearchDialog = openBibleSearchDialog;
window.closeBibleSearchDialog = closeBibleSearchDialog;
window.getStorageItem = getStorageItem;
window.setStorageItem = setStorageItem;
