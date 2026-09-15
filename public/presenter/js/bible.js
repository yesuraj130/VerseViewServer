// ===========================================================================
// Presenter Console — Bible 3-Column Browser & Scripture Presentation
// ===========================================================================

let bibleVersionsCache = null;
const bibleStructureCache = new Map(); // Cached from /api/bible/{versionId}/structure
const bibleChapterTextCache = new Map(); // Cached from /api/bible/${versionId}/text
const maxBibleChapterTextCache = 20; // Caps in-memory text cache to ~80-100 KB total


async function initBible()
{
  try
  {
    const localVersionId = selectedBibleVersionId;
    const localBookNumber = selectedBookNumber;
    const localChapterNumber = selectedChapterNumber;
    const localFetchId = ++currentBibleChapterTextFetchId;

    const bibleFetchUrl = `/api/bible/versions?returnVersion=true&returnBibleStructure=true&versionId=${encodeURIComponent(localVersionId)}&bookNumber=${localBookNumber}&chapterNumber=${localChapterNumber}`;
    const bibleFetchResult = await fetch(bibleFetchUrl);
    const bibleFetchResultJson = await bibleFetchResult.json();

    bibleVersionsCache = bibleFetchResultJson.versions;
    bibleStructureCache.set(localVersionId, bibleFetchResultJson.bibleStructure);
    bibleChapterTextCache.set(`${localVersionId}:${localBookNumber}:${localChapterNumber}`, bibleFetchResultJson.chapterTexts);

    if (localFetchId === currentBibleChapterTextFetchId)
    {
      loadBibleVersions();
      addChangeEventToBibleVersionDropdown();
      selectBibleVersion(localVersionId);

      loadBibleBooks();
      selectBibleBook(localBookNumber);
      loadBibleChapter();

      selectBibleChapter(localChapterNumber);
      loadBibleVersesList();

      selectBibleVerse(1);

      const isLoaded = await loadBibleVersesSlide();
      if (isLoaded) setSelectedIndexInList(slideDeckBible, 0);
    }
  
  }
  catch (err)
  {
    console.error('Error initializing Bible system:', err);
  }
}

//#region Loading
function loadBibleVersions()
{
  if (bibleVersionsCache) renderBibleVersionsDropdown(bibleVersionsCache);
  else console.warn('Bible versions cache not available'); 
}

function loadBibleBooks()
{
  const selectedVersion = bibleVersionsCache ? bibleVersionsCache.find(v => v.id === selectedBibleVersionId) : null;
  const bookNames = selectedVersion ? (selectedVersion.booknames || selectedVersion.books) : null;
  if (bookNames && bookNames.length > 0)
  {
    renderBibleBooksList(bookNames);
  }
  else
  {
    const selectedBibleVersionStructure = bibleStructureCache.get(selectedBibleVersionId);
    if (selectedBibleVersionStructure && selectedBibleVersionStructure.bookNames)
    {
      renderBibleBooksList(selectedBibleVersionStructure.bookNames);
    }
    else
    {
      console.warn(`Book names not available for version ${selectedBibleVersionId}`);
    }
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
    console.warn(`Bible structure not available for version ${selectedBibleVersionId} book ${selectedBookNumber}`);
  }
}

function loadBibleVersesList()
{
  // Load verses for the selected chapter
  const selectedBibleVersionStructure = bibleStructureCache.get(selectedBibleVersionId);
  const books = selectedBibleVersionStructure?.books || (Array.isArray(selectedBibleVersionStructure) ? selectedBibleVersionStructure : null);
  if (books && books[selectedBookNumber - 1] && books[selectedBookNumber - 1][selectedChapterNumber - 1])
  {
    const verseCount = books[selectedBookNumber - 1][selectedChapterNumber - 1];
    renderBibleVersesList(verseCount);
  }
  else
  {
    // If structure is not available, clear verses
    if (bibleVersesList) bibleVersesList.innerHTML = '';
    console.warn(`Bible structure not available for version ${selectedBibleVersionId} book ${selectedBookNumber} chapter ${selectedChapterNumber}`);
  }
}

async function loadBibleVersesSlide()
{
  // Load verse slides for the selected chapter
  const cacheKey = `${selectedBibleVersionId}:${selectedBookNumber}:${selectedChapterNumber}`;
  const cachedBibleChapterText = bibleChapterTextCache.get(cacheKey);
  if (cachedBibleChapterText && cachedBibleChapterText.verses && cachedBibleChapterText.verses.length > 0)
  {
    renderBibleVersesSlides(cachedBibleChapterText.verses);
    return true;
  }
  else
  {
    //Not available in cache, fetch from server
    if (slideDeckBible) slideDeckBible.innerHTML = '';
    return await fetchAndloadVerseSlides(selectedBibleVersionId, selectedBookNumber, selectedChapterNumber);
  }
}

let currentBibleChapterTextFetchId = 0;
async function fetchAndloadVerseSlides(targetVersionId, targetBookNumber, targetChapterNumber)
{
  const localBibleVersionId = targetVersionId;
  const localBookNumber = targetBookNumber;
  const localChapterNumber = targetChapterNumber;
  const localFetchId = ++currentBibleChapterTextFetchId;

  try
  {
    const chapterTextFetchResult = await fetch(`/api/bible/versions?versionId=${encodeURIComponent(localBibleVersionId)}&bookNumber=${localBookNumber}&chapterNumber=${localChapterNumber}`);
    
    // Guard against race conditions if user navigated away before response returned
    if (localFetchId !== currentBibleChapterTextFetchId) return false;
    
    if (!chapterTextFetchResult.ok)
    { 
      // If fetch fails, clear the verse text area and log error
      if (slideDeckBible) slideDeckBible.innerHTML = 'Error loading verses';
      console.error(`Failed to fetch Bible text for ${localBibleVersionId} book ${localBookNumber} chapter ${localChapterNumber}:`, chapterTextFetchResult.statusText);
      return false;
    }

    const json = await chapterTextFetchResult.json();
    const chapterTexts = json.chapterTexts;
    if (chapterTexts && chapterTexts.verses && chapterTexts.verses.length > 0)
    {
      // Add to cache
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
      if (slideDeckBible) slideDeckBible.innerHTML = 'No verses available';
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

//#region Selection
function selectBibleVersion(targetVersionId)
{
  selectedBibleVersionId = targetVersionId;
  if (bibleVersionSelectionDropdown) bibleVersionSelectionDropdown.value = targetVersionId;
  saveLastBrowsedBible();
}

function selectBibleBook(targetBookNumber)
{
  selectedBookNumber = targetBookNumber;
  setSelectedIndexInList(bibleBooksList, targetBookNumber - 1);
  saveLastBrowsedBible();
}

function selectBibleChapter(targetChapterNumber)
{  
  selectedChapterNumber = targetChapterNumber;
  setSelectedIndexInList(bibleChaptersList, targetChapterNumber - 1);
  saveLastBrowsedBible();
}

function selectBibleVerse(targetVerseNumber)
{
  selectedVerseNumber = targetVerseNumber;
  setSelectedIndexInList(bibleVersesList, targetVerseNumber - 1);
  saveLastBrowsedBible();
}

function selectVerseSlide(targetVerseNumber)
{
  setSelectedIndexInList(slideDeckBible, targetVerseNumber - 1);
  smoothScrollToIndexInList(slideDeckBible, targetVerseNumber - 1);
}
//#endregion

//#region Rendering
function renderBibleVersionsDropdown(bibleVersions)
{
  bibleVersionSelectionDropdown.innerHTML = '';
  bibleVersions.forEach((bibleVersion) =>
  {
    const bibleVersionOption = document.createElement('option');
    bibleVersionOption.value = bibleVersion.id;
    bibleVersionOption.textContent = bibleVersion.available ? bibleVersion.name : `${bibleVersion.name} (DB missing)`;
    bibleVersionSelectionDropdown.appendChild(bibleVersionOption);
  });
}

let bibleVersionChangeHandlerAttached = false;
function addChangeEventToBibleVersionDropdown()
{
  if (!bibleVersionSelectionDropdown || bibleVersionChangeHandlerAttached) return;
  bibleVersionSelectionDropdown.addEventListener('change', async (e) =>
  {
    if (selectedBibleVersionId === e.target.value) return;

    selectedBibleVersionId = e.target.value;
    saveLastBrowsedBible();

    loadBibleBooks();
    loadBibleChapter();
    loadBibleVersesList();
    await loadBibleVersesSlide();
  });
  bibleVersionChangeHandlerAttached = true;
}

function renderBibleBooksList(booksNames)
{
  bibleBooksList.innerHTML = '';

  let bookNumber = 0;
  booksNames.forEach(bookName =>
  {
    bookNumber++;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'book-btn book-item';
    button.title = `${bookName}`;
    button.innerHTML = `${escapeHtml(bookName.trim())}`;

    button.addEventListener('click', async () =>
    {
      if (selectedBookNumber === bookNumber) return;
      selectBibleBook(bookNumber);
      loadBibleChapter();

      selectBibleChapter(1);
      scrollToIndexInList(bibleChaptersList, 0);
      loadBibleVersesList();

      selectBibleVerse(1);
      scrollToIndexInList(bibleVersesList, 0);

      const isLoaded = await loadBibleVersesSlide();
      if (isLoaded)
      {
        setSelectedIndexInList(slideDeckBible, 0);
        smoothScrollToIndexInList(slideDeckBible, 0);
      }
    });

    bibleBooksList.appendChild(button);
  }); 
}

function renderBibleChaptersList(chaptersCount)
{
  bibleChaptersList.innerHTML = '';

  for (let chapterNumber = 1; chapterNumber <= chaptersCount; chapterNumber++)
  {
    const chapterButton = document.createElement('button');
    chapterButton.type = 'button';
    chapterButton.className = 'num-btn';
    chapterButton.textContent = chapterNumber;
    
    chapterButton.addEventListener('click', async () =>
    {
      if (selectedChapterNumber === chapterNumber) return;
      selectBibleChapter(chapterNumber);
      loadBibleVersesList();

      selectBibleVerse(1);
      scrollToIndexInList(bibleVersesList, 0);

      const isLoaded = await loadBibleVersesSlide();
      if (isLoaded)
      {
        setSelectedIndexInList(slideDeckBible, 0);
        smoothScrollToIndexInList(slideDeckBible, 0);
      }
    });
    bibleChaptersList.appendChild(chapterButton);
  }
}

function renderBibleVersesList(versesCount)
{
  bibleVersesList.innerHTML = '';

  for (let verseNumber = 1; verseNumber <= versesCount; verseNumber++)
  {
    const verseButton = document.createElement('button');
    verseButton.type = 'button';
    verseButton.className = 'num-btn';
    verseButton.textContent = verseNumber;

    verseButton.addEventListener('click', () =>
    {
      if (selectedVerseNumber === verseNumber) return;
      selectBibleVerse(verseNumber);
      selectVerseSlide(verseNumber);
      scrollToIndexInList(bibleVersesList, verseNumber - 1);
      smoothScrollToIndexInList(slideDeckBible, verseNumber - 1);
    });

    bibleVersesList.appendChild(verseButton);
  }
}

function renderBibleVersesSlides(bibleChapterVersesText)
{
  slideDeckBible.innerHTML = '';

  bibleChapterVersesText.forEach((verseText) =>
  {
    const verseSlide = document.createElement('div');
    verseSlide.className = 'slide-card-vertical';

    // const isLive = liveState && liveState.verseInfo &&
    //   Number(liveState.verseInfo.bookNum) === Number(verse.bookNum) &&
    //   Number(liveState.verseInfo.chNum) === Number(verse.chNum) &&
    //   Number(liveState.verseInfo.verseNum) === Number(verse.verseNum) &&
    //   liveState.status === 'live';

    verseSlide.innerHTML = `
      <span class="sc-live-pill" style="display: none">LIVE</span>
      <div class="sc-text-main"><span class="sc-verse-num">${verseText.verseNum}</span>${escapeHtml(verseText.word)}</div>
    `;

    verseSlide.addEventListener('click', () =>
    {
      presentBibleVerse(verseText);
    });

    slideDeckBible.appendChild(verseSlide);
  });
}
//#endregion

function presentBibleVerse(bibleVerse)
{
  const payload = {
    type: 'bible',
    verseInfo: {
      version: bibleVerse.versionId,
      bookNum: bibleVerse.bookNum,
      chNum: bibleVerse.chNum,
      verseNum: bibleVerse.verseNum
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

}

//#region List Scrolling and Selection
function scrollToIndexInList(container, index)
{
  if (index === 0) container.scrollTop = 0;
  else 
  {
    const activeVerseButton = container.children[index];
    if (activeVerseButton) activeVerseButton.scrollIntoView({ block: 'nearest', behavior: 'auto' }); 
  }
}

function smoothScrollToIndexInList(container, index)
{
  const targetChild = container.children[index];
  if (targetChild) smoothScrollToElement(container, targetChild, 200, true);
}

function setSelectedIndexInList(container, activeIndex)
{
    const verseButtons = container.children;
    for (let i = 0; i < verseButtons.length; i++)
    {
      verseButtons[i].classList.toggle('active', i === activeIndex);
    }
}
//#endregion