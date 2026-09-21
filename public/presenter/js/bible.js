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
    const localVersionId = selectedBibleVersionId || 'tamil';
    const localBookNumber = selectedBookNumber || 1;
    const localChapterNumber = selectedChapterNumber || 1;
    const localVerseNumber = selectedVerseNumber || 1;
    const localFetchId = ++currentBibleChapterTextFetchId;

    // Fast unified roundtrip: fetch versions list, structure, and current chapter text all at once
    const bibleFetchUrl = `/api/bible/versions?returnVersion=true&returnBibleStructure=true&versionId=${encodeURIComponent(localVersionId)}&bookNumber=${localBookNumber}&chapterNumber=${localChapterNumber}`;
    const bibleFetchResult = await fetch(bibleFetchUrl);
    const bibleFetchResultJson = await bibleFetchResult.json();

    bibleVersionsCache = bibleFetchResultJson.versions || [];

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

    if (bibleFetchResultJson.bibleStructure)
    {
      bibleStructureCache.set(localVersionId, bibleFetchResultJson.bibleStructure);
    }
    if (bibleFetchResultJson.chapterTexts)
    {
      bibleChapterTextCache.set(`${localVersionId}:${localBookNumber}:${localChapterNumber}`, bibleFetchResultJson.chapterTexts);
    }

    // If activeVersion changed from localVersionId because local was unavailable, pre-fetch structure
    if (selectedBibleVersionId !== localVersionId && !bibleStructureCache.has(selectedBibleVersionId))
    {
      ensureBibleStructure(selectedBibleVersionId);
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

    initBibleSearchTabEvents();
  }
  catch (err)
  {
    console.error('Error initializing Bible system:', err);
  }
}

// ---------------------------------------------------------------------------
// Bible Scripture Search Tab Logic
// ---------------------------------------------------------------------------
let currentBibleSearchAbortCtrl = null;
let isBibleSearchTabEventsInitialized = false;

function initBibleSearchTabEvents()
{
  if (isBibleSearchTabEventsInitialized) return;
  isBibleSearchTabEventsInitialized = true;

  const input = document.getElementById('bible-search-tab-input');
  const btnClear = document.getElementById('btn-clear-bible-tab-search');
  const btnExecute = document.getElementById('btn-execute-bible-tab-search');

  if (btnClear && input)
  {
    btnClear.addEventListener('click', () =>
    {
      input.value = '';
      btnClear.style.display = 'none';
      input.focus();
      renderBibleTabSearchResults([], '');
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
    });

    input.addEventListener('keydown', (e) =>
    {
      if (e.key === 'Enter')
      {
        e.preventDefault();
        const query = input.value.trim();
        if (query)
        {
          executeBibleTabSearch(query);
        }
      }
    });
  }

  if (btnExecute && input)
  {
    btnExecute.addEventListener('click', () =>
    {
      const query = input.value.trim();
      if (query)
      {
        executeBibleTabSearch(query);
      }
    });
  }
}

async function executeBibleTabSearch(query)
{
  const resultsList = document.getElementById('bible-search-tab-results-list');
  const statusBar = document.getElementById('bible-search-tab-status-bar');
  const spinIcon = document.getElementById('bible-tab-search-spin-icon');

  if (!query)
  {
    if (statusBar) statusBar.style.display = 'none';
    if (resultsList)
    {
      resultsList.innerHTML = `<div class="bible-search-empty-state" style="padding: 48px 16px; text-align: center; color: var(--color-font-muted); font-size: 13px; line-height: 1.6;">Type a word in Tamil or English phonetics (e.g. <em>anbu</em>, <em>visuvasam</em>) and click 🔍 or press Enter to search.</div>`;
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
    const url = `/api/bible/search?q=${encodeURIComponent(query)}&versionId=${encodeURIComponent(selectedBibleVersionId)}&limit=100`;
    const res = await fetch(url, { signal: currentBibleSearchAbortCtrl.signal });
    if (!res.ok) throw new Error('Search failed');
    const results = await res.json();

    if (spinIcon) spinIcon.classList.remove('spinning');
    renderBibleTabSearchResults(results, query);
  }
  catch (err)
  {
    if (err.name === 'AbortError') return;
    if (spinIcon) spinIcon.classList.remove('spinning');
    console.error('Error during Bible search:', err);
    if (resultsList)
    {
      resultsList.innerHTML = `<div class="bible-search-empty-state" style="padding: 24px; color: var(--color-red);">Error: ${escapeHtml(err.message)}</div>`;
    }
  }
}

function renderBibleTabSearchResults(results, query)
{
  const resultsList = document.getElementById('bible-search-tab-results-list');
  const statusBar = document.getElementById('bible-search-tab-status-bar');
  const countText = document.getElementById('bible-search-tab-count-text');

  if (!resultsList) return;

  resultsList.innerHTML = '';

  if (!results || results.length === 0)
  {
    if (statusBar) statusBar.style.display = 'none';
    resultsList.innerHTML = `<div class="bible-search-empty-state" style="padding: 48px 16px; text-align: center; color: var(--color-font-muted); font-size: 13px;">No matching verses found for "${escapeHtml(query)}". Try a different Tamil phonetic spelling or word.</div>`;
    return;
  }

  if (statusBar) statusBar.style.display = 'flex';
  if (countText)
  {
    if (results.length >= 100)
    {
      countText.textContent = `100+ verses found (showing top 100)`;
    }
    else
    {
      countText.textContent = `${results.length} verse${results.length === 1 ? '' : 's'} found`;
    }
  }

  results.forEach((verse) =>
  {
    const refText = verse.reference || `${verse.bookName} ${verse.chNum}:${verse.verseNum}`;
    let highlightedVerseText = escapeHtml(verse.word);

    if (window.TamilPhonetic && typeof window.TamilPhonetic.highlightMatchedCharacters === 'function')
    {
      highlightedVerseText = window.TamilPhonetic.highlightMatchedCharacters(verse.word, query);
    }

    const verseSlide = document.createElement('div');
    verseSlide.className = 'slide-card';
    if (verse.versionId) verseSlide.setAttribute('data-version-id', verse.versionId);
    if (verse.bookNum) verseSlide.setAttribute('data-book-num', verse.bookNum);
    if (verse.chNum) verseSlide.setAttribute('data-ch-num', verse.chNum);
    if (verse.verseNum) verseSlide.setAttribute('data-verse-num', verse.verseNum);

    verseSlide.innerHTML = `
      <span class="slide-card-badge">LIVE</span>
      <div class="slide-card-content">
        <div class="verse-number bible-slide-reference">${escapeHtml(refText)}</div>
        <div class="bible-slide-text">${highlightedVerseText}</div>
      </div>
    `;

    verseSlide.addEventListener('click', () =>
    {
      presentBibleVerse({
        versionId: verse.versionId,
        bookNum: verse.bookNum,
        chNum: verse.chNum,
        verseNum: verse.verseNum,
        word: verse.word
      });
    });

    resultsList.appendChild(verseSlide);
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

  const tabInput = document.getElementById('bible-search-tab-input');
  if (tabInput && tabInput.value.trim())
  {
    executeBibleTabSearch(tabInput.value.trim());
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

    if (typeof highlightActiveInDecks === 'function' && (window.liveState || (typeof liveState !== 'undefined' ? liveState : null)))
    {
      highlightActiveInDecks(window.liveState || liveState);
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

function isSameBibleVersion(v1, v2)
{
  if (!v1 || !v2) return false;
  const clean1 = String(v1).replace(/\.db$/i, '').trim().toLowerCase();
  const clean2 = String(v2).replace(/\.db$/i, '').trim().toLowerCase();
  return clean1 === clean2;
}

function getLiveBibleVerseInfo()
{
  const state = window.liveState || (typeof liveState !== 'undefined' ? liveState : null);
  if (state && state.status === 'live' && state.type === 'bible' && state.verseInfo)
  {
    return state.verseInfo;
  }
  return null;
}

function renderBibleBooksList(booksNames)
{
  if (!bibleBooksList) return;
  bibleBooksList.innerHTML = '';

  const liveVerse = getLiveBibleVerseInfo();
  const isVersionLive = liveVerse && isSameBibleVersion(liveVerse.versionId || liveVerse.version, selectedBibleVersionId);

  for (let i = 0; i < booksNames.length; i++)
  {
    const bookNumber = i + 1;
    const bookName = booksNames[i];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'book-button book-item';
    button.title = `${bookName}`;
    button.innerHTML = `${escapeHtml(bookName.trim())}`;

    if (isVersionLive && Number(liveVerse.bookNum) === bookNumber)
    {
      button.classList.add('live');
    }

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

  const liveVerse = getLiveBibleVerseInfo();
  const isVersionLive = liveVerse && isSameBibleVersion(liveVerse.versionId || liveVerse.version, selectedBibleVersionId);
  const isCurrentBookLive = isVersionLive && Number(liveVerse.bookNum) === Number(selectedBookNumber);

  for (let chapterNumber = 1; chapterNumber <= chaptersCount; chapterNumber++)
  {
    const chapterButton = document.createElement('button');
    chapterButton.type = 'button';
    chapterButton.className = 'number-button';
    chapterButton.textContent = chapterNumber;

    if (isCurrentBookLive && Number(liveVerse.chNum) === chapterNumber)
    {
      chapterButton.classList.add('live');
    }

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

  const liveVerse = getLiveBibleVerseInfo();
  const isVersionLive = liveVerse && isSameBibleVersion(liveVerse.versionId || liveVerse.version, selectedBibleVersionId);
  const isCurrentChapterLive = isVersionLive &&
    Number(liveVerse.bookNum) === Number(selectedBookNumber) &&
    Number(liveVerse.chNum) === Number(selectedChapterNumber);

  for (let verseNumber = 1; verseNumber <= versesCount; verseNumber++)
  {
    const verseButton = document.createElement('button');
    verseButton.type = 'button';
    verseButton.className = 'number-button';
    verseButton.textContent = verseNumber;

    if (isCurrentChapterLive && Number(liveVerse.verseNum) === verseNumber)
    {
      verseButton.classList.add('live');
    }

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

  const effectiveBibleFont = (typeof window.getEffectiveBibleFont === 'function')
    ? window.getEffectiveBibleFont(selectedBibleVersionId)
    : 'Baloo Thambi 2';
  const bibleFontFamily = `"${effectiveBibleFont}", 'Baloo Thambi 2', 'Baloo Thambi', 'Mukta Malar', 'Noto Sans Tamil', var(--font-display)`;

  const liveVerse = getLiveBibleVerseInfo();
  const isVersionLive = liveVerse && isSameBibleVersion(liveVerse.versionId || liveVerse.version, selectedBibleVersionId);
  const isCurrentChapterLive = isVersionLive &&
    Number(liveVerse.bookNum) === Number(selectedBookNumber) &&
    Number(liveVerse.chNum) === Number(selectedChapterNumber);

  bibleChapterVersesText.forEach((verseText) =>
  {
    const verseSlide = document.createElement('div');
    verseSlide.className = 'slide-card';

    const isThisVerseLive = isCurrentChapterLive && Number(liveVerse.verseNum) === Number(verseText.verseNum);
    if (isThisVerseLive)
    {
      verseSlide.classList.add('live');
    }

    verseSlide.innerHTML = `
      <span class="slide-card-badge" style="display: ${isThisVerseLive ? 'inline-block' : 'none'};">LIVE</span>
      <div class="slide-card-content" style="font-family: ${bibleFontFamily};"><span class="verse-number">${verseText.verseNum}</span>${escapeHtml(verseText.word)}</div>
    `;

    verseSlide.addEventListener('click', () =>
    {
      selectBibleVerse(verseText.verseNum, false);
      scrollToIndexInList(bibleVersesList, verseText.verseNum - 1);
      presentBibleVerse(verseText);
    });

    slideDeckBible.appendChild(verseSlide);
  });

  if (typeof highlightActiveInDecks === 'function' && (window.liveState || (typeof liveState !== 'undefined' ? liveState : null)))
  {
    highlightActiveInDecks(window.liveState || liveState);
  }
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
window.initBibleSearchTabEvents = initBibleSearchTabEvents;
window.executeBibleTabSearch = executeBibleTabSearch;
window.getStorageItem = getStorageItem;
window.setStorageItem = setStorageItem;
