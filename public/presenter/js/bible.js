// ===========================================================================
// Presenter Console — Bible 3-Column Browser & Scripture Presentation
// ===========================================================================

let selectedBibleVersionStructure = null; // Cached from /api/bible/{versionId}/structure
const bibleStructureCache = new Map(); // Cache indexed by versionId

const bibleChapterTextCache = new Map();
const MAX_BIBLE_CACHE_CHAPTERS = 20; // Caps in-memory text cache to ~80-100 KB total
let currentBibleTextFetchId = 0;

// Fetch and cache the Bible structure (chapter/verse counts) for a specific version
async function loadBibleStructure(versionId)
{
  if (bibleStructureCache.has(versionId))
  {
    selectedBibleVersionStructure = bibleStructureCache.get(versionId);
    return selectedBibleVersionStructure;
  }

  try
  {
    const bibleVersionStructureFetchResult = await fetch(`/api/bible/${versionId}/structure`);
    if (bibleVersionStructureFetchResult.ok)
    {
      const bibleVersionStructureJson = await bibleVersionStructureFetchResult.json();
      const bibleVersionStructure = bibleVersionStructureJson.books || [];
      bibleStructureCache.set(versionId, bibleVersionStructure);
      selectedBibleVersionStructure = bibleVersionStructure;
      return selectedBibleVersionStructure;
    }
  }
  catch (err)
  {
    console.warn(`Could not load Bible structure for ${versionId}:`, err);
  }

  selectedBibleVersionStructure = null;
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
    renderBibleBooksList();

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

function renderBibleBooksList()
{
  if (!bibleBooksList) return;
  bibleBooksList.innerHTML = '';

  let list = selectedBibleVersionBooks;

  for (let i = 0; i < list.length; i++)
  {
    const book = list[i];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'book-btn book-item';
    if (Number(book.bookNum) === Number(selectedBookNumber)) button.classList.add('active');
    button.title = `${book.name}`;
    button.innerHTML = `${escapeHtml(book.name.trim())}`;

    button.addEventListener('click', () =>
    {
      selectBibleBook(book.bookNum);
    });

    bibleBooksList.appendChild(button);
  }

  if (liveState) highlightActiveInDecks(liveState);  
}

async function selectBibleBook(targetBookNumber, targetChapterNumber, targetVerseNumber)
{
  selectedBookNumber = Number(targetBookNumber);
  selectedChapterNumber = Number(targetChapterNumber);
  selectedVerseNumber = Number(targetVerseNumber);

  saveLastBrowsedBible();

  if (bibleBooksList)
  {
    const bookChildren = bibleBooksList.children;
    for (let i = 0; i < bookChildren.length; i++)
    {
      const bookObj = selectedBibleVersionBooks[i];
      const isSelected = bookObj ? Number(bookObj.bookNum) === selectedBookNumber : (i + 1 === selectedBookNumber);
      bookChildren[i].classList.toggle('active', isSelected);
    }
  }

  // Instant zero-delay chapter resolution from loaded book metadata or bible structure
  const bibleBook = selectedBibleVersionBooks.find(b => Number(b.bookNum) === selectedBookNumber);
  let chapterCount = 1;
  if (bibleBook && bibleBook.chapterCount) chapterCount = bibleBook.chapterCount;
  else if (selectedBibleVersionStructure && selectedBibleVersionStructure[selectedBookNumber - 1]) chapterCount = selectedBibleVersionStructure[selectedBookNumber - 1].length;
  
  const chapters = Array.from({ length: chapterCount }, (_, i) => i + 1);
  renderBibleChaptersList(chapters);

  let chosenChapterNumber = targetChapterNumber ? Number(targetChapterNumber) : 1;
  if (chosenChapterNumber < 1 || chosenChapterNumber > chapterCount) chosenChapterNumber = 1;
  
  // Scroll chapter column to top when resetting to chapter 1, or into view if specific target
  if (bibleChaptersList)
  {
    if (chosenChapterNumber === 1)
    {
      bibleChaptersList.scrollTop = 0;
    }
    else
    {
      const activeChapterButton = bibleChaptersList.children[chosenChapterNumber - 1];
      if (activeChapterButton)
      {
        activeChapterButton.scrollIntoView({ block: 'nearest', behavior: 'auto' });   
      }
      else
      {
        bibleChaptersList.scrollTop = 0;
      }
    }
  }

  // Select chapter immediately
  await selectBibleChapter(chosenChapterNumber, targetVerseNumber);
}

function renderBibleChaptersList(chapters)
{
  if (!bibleChaptersList) return;
  bibleChaptersList.innerHTML = '';

  chapters.forEach((chapter) =>
  {
    const chapterButton = document.createElement('button');
    chapterButton.type = 'button';
    chapterButton.className = 'num-btn';
    chapterButton.textContent = chapter;

    if (Number(chapter) === Number(selectedChapterNumber)) chapterButton.classList.add('active');
    
    chapterButton.addEventListener('click', () =>
    {
      selectBibleChapter(chapter);
    });

    bibleChaptersList.appendChild(chapterButton);
  });

  if (liveState) highlightActiveInDecks(liveState); 
}

async function selectBibleChapter(targetChapterNumber, targetVerseNumber)
{
  selectedChapterNumber = Number(targetChapterNumber);
  saveLastBrowsedBible();

  if (bibleChaptersList)
  {
    for (let i = 0; i < bibleChaptersList.children.length; i++)
    {
      bibleChaptersList.children[i].classList.toggle('active', (i + 1) === selectedChapterNumber);
    }
  }

  // Instant zero-delay verse resolution from book metadata or bible structure
  const bibleBook = selectedBibleVersionBooks.find(book => Number(book.bookNum) === selectedBookNumber);
  let verseCount = 0;
  if (bibleBook && bibleBook.verseCounts && bibleBook.verseCounts[selectedChapterNumber - 1])
  {
    verseCount = bibleBook.verseCounts[selectedChapterNumber - 1];
  }
  else if (selectedBibleVersionStructure && selectedBibleVersionStructure[selectedBookNumber - 1] && selectedBibleVersionStructure[selectedBookNumber - 1][selectedChapterNumber - 1])
  {
    verseCount = selectedBibleVersionStructure[selectedBookNumber - 1][selectedChapterNumber - 1];
  }

  const verseNumbers = Array.from({ length: verseCount }, (_, i) => i + 1);
  renderBibleVersesList(verseNumbers);

  let chosenVerseNumber = (targetVerseNumber !== null && targetVerseNumber !== undefined) ? Number(targetVerseNumber) : 1;
  if (chosenVerseNumber < 1 || chosenVerseNumber > verseCount) chosenVerseNumber = 1;
  selectedVerseNumber = chosenVerseNumber;

  // Highlight verse button immediately and scroll to top on reset to 1
  if (bibleVersesList)
  {
    if (chosenVerseNumber === 1)
    {
      bibleVersesList.scrollTop = 0;
    }
    else
    {
      const activeVerseButton = bibleVersesList.children[chosenVerseNumber - 1];
      if (activeVerseButton)
      {
        activeVerseButton.scrollIntoView({ block: 'nearest', behavior: 'auto' });   
      }
      else
      {
        bibleVersesList.scrollTop = 0;
      }
    }
  }

  // If chapter text was already loaded previously, render immediately without fetch
  if (cachedBibleChapterText)
  {
    currentChapterVerses = cachedBibleChapterText.verses || [];
    renderChapterVersesText(currentChapterVerses);
    selectBibleVerse(chosenVerseNumber);
    return;
  }

  // Fetch chapter text asynchronously in background
  const fetchId = ++currentBibleTextFetchId;
  const targetBookNum = selectedBookNumber;
  const targetChNum = selectedChapterNumber;

  try
  {
    const resText = await fetch(`/api/bible/${selectedBibleVersionId}/text?bookNum=${targetBookNum}&chNum=${targetChNum}`);
    if (!resText.ok) return;
    const data = await resText.json();

    // Cache with bounded LRU eviction to prevent memory accumulation
    if (bibleChapterTextCache.size >= MAX_BIBLE_CACHE_CHAPTERS)
    {
      const oldestKey = bibleChapterTextCache.keys().next().value;
      if (oldestKey) bibleChapterTextCache.delete(oldestKey);
    }
    bibleChapterTextCache.set(cacheKey, data);

    // Guard against race conditions if user navigated away before response returned
    if (fetchId === currentBibleTextFetchId && selectedBookNumber === targetBookNum && selectedChapterNumber === targetChNum)
    {
      currentChapterVerses = data.verses || [];

      // If exact verses count differs from cached estimate, update buttons seamlessly
      if (currentChapterVerses.length > 0 && currentChapterVerses.length !== verseCount)
      {
        const exactVerseNums = currentChapterVerses.map(v => v.verseNum);
        renderBibleVersesList(exactVerseNums);
        if (bibleVersesList)
        {
          for (let i = 0; i < bibleVersesList.children.length; i++)
          {
            bibleVersesList.children[i].classList.toggle('active', (i + 1) === selectedVerseNumber);
          }
          if (chosenVerseNumber === 1)
          {
            bibleVersesList.scrollTop = 0;
          }
        }
      }

      renderChapterVersesText(currentChapterVerses);
      selectBibleVerse(chosenVerseNumber);
    }
  }
  catch (err)
  {
    console.error('Error fetching Bible text:', err);
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
    btn.textContent = v;

    if (Number(v) === Number(selectedVerseNumber))
    {
      btn.classList.add('active');
    }

    btn.addEventListener('click', () =>
    {
      selectBibleVerse(v);
    });

    bibleVersesList.appendChild(btn);
  });

  if (typeof highlightActiveInDecks === 'function' && liveState)
  {
    highlightActiveInDecks(liveState);
  }
}

function renderChapterVersesText(bibleChapterVersesText)
{
  // currentPresentationType = 'bible';

  if (!slideDeckBible) return;
  slideDeckBible.innerHTML = '';

  if (!bibleChapterVersesText || bibleChapterVersesText.length === 0)
  {
    slideDeckBible.innerHTML = 'No verses available in this chapter';
    return;
  }

  bibleChapterVersesText.forEach((verse) =>
  {
    const verseSlide = document.createElement('div');
    verseSlide.className = 'slide-card-vertical';

    const isLive = liveState && liveState.verseInfo &&
      Number(liveState.verseInfo.bookNum) === Number(verse.bookNum) &&
      Number(liveState.verseInfo.chNum) === Number(verse.chNum) &&
      Number(liveState.verseInfo.verseNum) === Number(verse.verseNum) &&
      liveState.status === 'live';

    if (isLive) verseSlide.classList.add('is-live');
    if (Number(verse.verseNum) === Number(selectedVerseNumber)) verseSlide.classList.add('active');

    verseSlide.innerHTML = `
      <span class="sc-live-pill" style="display: ${isLive ? 'inline-block' : 'none'};">LIVE</span>
      <div class="sc-text-main"><span class="sc-verse-num">${verse.verseNum}</span>${escapeHtml(verse.word)}</div>
    `;

    verseSlide.addEventListener('click', () =>
    {
      presentBibleVerse(selectedBibleVersionId, verse);
    });

    slideDeckBible.appendChild(verseSlide);
  });
}

function selectBibleVerse(targetVerseNumber)
{
  selectedVerseNumber = Number(targetVerseNumber);
  saveLastBrowsedBible();

  if (bibleVersesList)
  {
    for (let i = 0; i < bibleVersesList.children.length; i++)
    {
      bibleVersesList.children[i].classList.toggle('active', (i + 1) === selectedVerseNumber);
    }
  }

  if (slideDeckBible)
  {
    for (let i = 0; i < slideDeckBible.children.length; i++)
    {
      slideDeckBible.children[i].classList.toggle('active', (i + 1) === selectedVerseNumber);
    }
    const targetCard = slideDeckBible.children[selectedVerseNumber - 1];
    if (targetCard)
    {
      smoothScrollToElement(slideDeckBible, targetCard, 200, true);
    }
  }
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
