// ===========================================================================
// Presenter Console — Bible 3-Column Browser & Scripture Presentation
// ===========================================================================

const bibleStructureCache = new Map(); // Cached from /api/bible/{versionId}/structure
const bibleChapterTextCache = new Map(); // Cached from /api/bible/${versionId}/text
const maxBibleChapterTextCache = 20; // Caps in-memory text cache to ~80-100 KB total

// Fetch and cache the Bible structure (chapter/verse counts) for a specific version
async function loadBibleStructure(versionId)
{
  if (bibleStructureCache.has(versionId)) return bibleStructureCache.get(versionId);
  

  try
  {
    const bibleVersionStructureFetchResult = await fetch(`/api/bible/${versionId}/structure`);
    if (bibleVersionStructureFetchResult.ok)
    {
      const bibleVersionStructureJson = await bibleVersionStructureFetchResult.json();
      const bibleVersionStructure = bibleVersionStructureJson.books || [];
      bibleStructureCache.set(versionId, bibleVersionStructure);
      return bibleVersionStructure;
    }
  }
  catch (err)
  {
    console.warn(`Could not load Bible structure for ${versionId}:`, err);
  }

  return null;
}

async function initBible()
{
  try
  {
    const bibleVersionsFetchResult = await fetch('/api/bible/versions');
    bibleVersions = await bibleVersionsFetchResult.json();

    if (bibleVersionSelectionDropdown)
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

    //Get selected version from localStorage or first available or first
    const targetBibleVersion = bibleVersions.find(bibleVersion => bibleVersion.id === selectedBibleVersionId && bibleVersion.available) || bibleVersions.find(bibleVersion => bibleVersion.available) || bibleVersions[0];
    if (targetBibleVersion)
    {
      selectedBibleVersionId = targetBibleVersion.id;
      if (bibleVersionSelectionDropdown) bibleVersionSelectionDropdown.value = targetBibleVersion.id;
      
      // Load Bible structure (chapter/verse counts) for this version
      await loadBibleStructure(selectedBibleVersionId);
      
      await loadBibleBooks(selectedBibleVersionId, selectedBookNumber, selectedChapterNumber, selectedVerseNumber);
    }

    // Version dropdown change listener
    if (bibleVersionSelectionDropdown)
    {
      bibleVersionSelectionDropdown.addEventListener('change', async (e) =>
      {
        selectedBibleVersionId = e.target.value;
        bibleChapterTextCache.clear();
        const verObj = bibleVersions.find(v => v.id === selectedBibleVersionId);
        
        // Load Bible structure for new version
        await loadBibleStructure(selectedBibleVersionId);
        
        await loadBibleBooks(selectedBibleVersionId, selectedBookNumber, selectedChapterNumber, selectedVerseNumber);
      });
    }

    renderRecentVersesStrip();
  }
  catch (err)
  {
    console.error('Error initializing Bible system:', err);
  }
}

async function loadBibleBooks(targetVersionId, targetBookNumber, targetChapterNumber, targetVerseNumber)
{
  try
  {
    const bibleBooksFetchResult = await fetch(`/api/bible/${targetVersionId}/books`);
    if (!bibleBooksFetchResult.ok)
    {
      const errorData = await bibleBooksFetchResult.json().catch(() => ({}));
      if (bibleBooksList)  bibleBooksList.innerHTML = `${escapeHtml(errorData.error || 'Database missing for this version')}`;
      if (bibleChaptersList) bibleChaptersList.innerHTML = '';
      if (bibleVersesList) bibleVersesList.innerHTML = '';
      return;
    }
    const bibleBooksJson = await bibleBooksFetchResult.json();
    selectedBibleVersionBooks = bibleBooksJson.books || [];
    renderBibleBooksList(bibleBooksJson.books);

    let initialBook = null;
    const bookNumberToFind = (targetBookNumber !== null && targetBookNumber !== undefined) ? targetBookNumber : 1;
    if (bookNumberToFind) initialBook = selectedBibleVersionBooks.find(book => Number(book.bookNum) === Number(bookNumberToFind));
    if (!initialBook) initialBook = selectedBibleVersionBooks.find(book => Number(book.bookNum) === 0) || selectedBibleVersionBooks[0];
    
    if (initialBook)
    {
      const initialChapter = (targetChapterNumber !== null && targetChapterNumber !== undefined) ? targetChapterNumber : 1;
      const initialVerse = (targetVerseNumber !== null && targetVerseNumber !== undefined) ? targetVerseNumber : 1;
      await selectBibleBook(initialBook.bookNum, initialChapter, initialVerse);
    }
  }
  catch (err)
  {
    console.error('Error loading Bible books:', err);
  }
}


async function selectBibleBook(targetBookNumber)
{
  selectedBookNumber = targetBookNumber;
  setSelectedIndexInList(bibleBooksList, targetBookNumber - 1);

  // Load chapters for the selected book
  const selectedBibleVersionStructure = bibleStructureCache.get(selectedBibleVersionId);
  if (selectedBibleVersionStructure && selectedBibleVersionStructure[selectedBookNumber - 1])
  {
    const chaptersCount = selectedBibleVersionStructure[selectedBookNumber - 1].length;
    renderBibleChaptersList(chaptersCount);
  }
  else
  {
    // If structure is not available, clear chapters and verses
    if (bibleChaptersList) bibleChaptersList.innerHTML = '';
    if (bibleVersesList) bibleVersesList.innerHTML = '';
    if (slideDeckBible) slideDeckBible.innerHTML = '';
    console.warn(`Bible structure not available for version ${selectedBibleVersionId} book ${selectedBookNumber}`);
  }
}

async function selectBibleChapter(targetChapterNumber)
{  
  selectedChapterNumber = targetChapterNumber;
  setSelectedIndexInList(bibleChaptersList, targetChapterNumber - 1);

  // Load verses for the selected chapter
  const selectedBibleVersionStructure = bibleStructureCache.get(targetVersionId);
  if (selectedBibleVersionStructure && selectedBibleVersionStructure[targetBookNumber - 1] && selectedBibleVersionStructure[targetBookNumber - 1][targetChapterNumber - 1])
  {
    const verseCount = selectedBibleVersionStructure[targetBookNumber - 1][targetChapterNumber - 1];
    renderBibleVersesList(verseCount);
  }
  else
  {
    // If structure is not available, clear verses
    if (bibleVersesList) bibleVersesList.innerHTML = '';
    console.warn(`Bible structure not available for version ${targetVersionId} book ${targetBookNumber} chapter ${targetChapterNumber}`);
  }

  // Load verse slides for the selected chapter
  const cacheKey = `${selectedBibleVersionId}:${selectedBookNumber}:${targetChapterNumber}`;
  const cachedBibleChapterText = bibleChapterTextCache.get(cacheKey);
  if (cachedBibleChapterText && cachedBibleChapterText.verses && cachedBibleChapterText.verses.length > 0)
  {
    renderChapterVersesText(cachedBibleChapterText.verses);
  }
  else
  {
    //Not available in cache, fetch from server
    if (slideDeckBible) slideDeckBible.innerHTML = '';
    await fetchAndloadVerseSlides(selectedBibleVersionId, selectedBookNumber, targetChapterNumber);
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
    const chapterTextFetchResult = await fetch(`/api/bible/${localBibleVersionId}/text?bookNum=${localBookNumber}&chNum=${localChapterNumber}`);
    
    // Guard against race conditions if user navigated away before response returned
    if (localFetchId !== currentBibleChapterTextFetchId) return;
    
    if (!chapterTextFetchResult.ok)
    { 
      // If fetch fails, clear the verse text area and log error
      if (slideDeckBible) slideDeckBible.innerHTML = 'Error loading verses';
      console.error(`Failed to fetch Bible text for ${localBibleVersionId} book ${localBookNumber} chapter ${localChapterNumber}:`, chapterTextFetchResult.statusText);
      return;
    }

    const chapterTextJson = await chapterTextFetchResult.json();
    if (chapterTextJson && chapterTextJson.verses && chapterTextJson.verses.length > 0)
    {
      //Add to cache
      if (bibleChapterTextCache.size >= maxBibleChapterTextCache)
      {
        const oldestKey = bibleChapterTextCache.keys().next().value;
        if (oldestKey) bibleChapterTextCache.delete(oldestKey);
      }
      const cacheKey = `${localBibleVersionId}:${localBookNumber}:${localChapterNumber}`;
      bibleChapterTextCache.set(cacheKey, chapterTextJson);

      renderChapterVersesText(chapterTextJson.verses);
    }
    else
    {
      if (slideDeckBible) slideDeckBible.innerHTML = 'No verses available';
    }
  }
  catch (err)
  {
    console.error('Error fetching Bible text:', err);
  }
}

function selectBibleVerse(targetVerseNumber)
{
  selectedVerseNumber = targetVerseNumber;
  setSelectedIndexInList(bibleVersesList, targetVerseNumber - 1);
}

function selectVerseSlide(targetVerseNumber)
{
  setSelectedIndexInList(slideDeckBible, targetVerseNumber - 1);
  smoothScrollToIndexInList(slideDeckBible, targetVerseNumber - 1);
}

function scrollToIndexInList(container, index)
{
  if (container)
  {
    if (index === 0)
    {
      container.scrollTop = 0;
    }
    else 
    {
      const activeVerseButton = container.children[index];
      if (activeVerseButton)
      {
        activeVerseButton.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      }
      else
      {
        container.scrollTop = 0;
      }
    }
  }
}

function smoothScrollToIndexInList(container, index)
{
  if (container)
  {
    const targetChild = container.children[index];
    if (targetChild) smoothScrollToElement(container, targetChild, 200, true);
  }
}

function setSelectedIndexInList(container, activeIndex)
{
  if (container)
  {
    const verseButtons = container.children;
    for (let i = 0; i < verseButtons.length; i++)
    {
      verseButtons[i].classList.toggle('active', i === activeIndex);
    }
  }
}

function renderBibleBooksList(bibleBooks)
{
  bibleBooksList.innerHTML = '';

  //change to foreach loop to avoid issues with let in for loop and closures
  bibleBooks.forEach((book) =>
  {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'book-btn book-item';
    button.title = `${book.name}`;
    button.innerHTML = `${escapeHtml(book.name.trim())}`;

    button.addEventListener('click', () =>
    {
      if (selectedBookNumber === book.bookNum) return;
      selectBibleBook(book.bookNum);

      selectBibleChapter(1);
      scrollToIndexInList(bibleChaptersList, 0);

      selectBibleVerse(1);
      selectVerseSlide(1);
      scrollToIndexInList(bibleVersesList, 0);
      smoothScrollToIndexInList(slideDeckBible, 0);
    });

    bibleBooksList.appendChild(button);
  }); 
}

function renderBibleChaptersList(chaptersCount)
{
  bibleChaptersList.innerHTML = '';

  const chapters = Array.from({ length: chaptersCount }, (_, i) => i + 1);
  chapters.forEach((chapterNumber) =>
  {
    const chapterButton = document.createElement('button');
    chapterButton.type = 'button';
    chapterButton.className = 'num-btn';
    chapterButton.textContent = chapterNumber;
    
    chapterButton.addEventListener('click', () =>
    {
      if (selectedChapterNumber === chapterNumber) return;
      selectBibleChapter(chapterNumber);
      scrollToIndexInList(bibleChaptersList, 0);

      selectBibleVerse(1);
      selectVerseSlide(1);
      scrollToIndexInList(bibleVersesList, 0);
      smoothScrollToIndexInList(slideDeckBible, 0);
    });

    bibleChaptersList.appendChild(chapterButton);
  });
}

function renderBibleVersesList(verseNumbers)
{
  bibleVersesList.innerHTML = '';

  verseNumbers.forEach((verseNumber) =>
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
  });
}

function renderChapterVersesText(bibleChapterVersesText)
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
      presentBibleVerse(selectedBibleVersionId, verseText);
    });

    slideDeckBible.appendChild(verseSlide);
  });
}



function presentBibleVerse(bibleVersionId, bibleVerse)
{
  const payload = {
    type: 'bible',
    verseInfo: {
      version: bibleVersionId,
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

  const book = selectedBibleVersionBooks[bibleVerse.bookNum - 1];
  const bookName = book ? book.name : '';
  addRecentVerse({
    versionId: bibleVersionId,
    bookNum: bibleVerse.bookNum,
    chNum: bibleVerse.chNum,
    verseNum: bibleVerse.verseNum,
    ref: `${bookName} ${bibleVerse.chNum}:${bibleVerse.verseNum}`
  });
}


function renderRecentVersesStrip()
{
  if (!bibleRecentStrip) return;
  bibleRecentStrip.innerHTML = '<span style="font-size: 10px; font-weight: 700; color: var(--color-font-dim); text-transform: uppercase;">Recent:</span>';

  recentVerses.slice(0, 6).forEach((rv) =>
  {
    const chip = document.createElement('span');
    chip.className = 'recent-chip';
    chip.textContent = rv.ref;
    chip.title = `Jump to ${rv.ref}`;
    chip.addEventListener('click', async () =>
    {
      await selectBibleBook(rv.bookNum, rv.chNum, rv.verseNum);
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
