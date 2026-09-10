// ===========================================================================
// Presenter Console — Bible Word / Phrase Search
// ===========================================================================

if (btnRunBibleSearch)
{
  btnRunBibleSearch.addEventListener('click', performBibleSearch);
}
if (bibleFullSearchInput)
{
  bibleFullSearchInput.addEventListener('keydown', (e) =>
  {
    if (e.key === 'Enter') performBibleSearch();
  });
}

async function performBibleSearch()
{
  const query = (bibleFullSearchInput ? bibleFullSearchInput.value : '').trim();
  if (!query) return;

  if (bibleSearchStatus) bibleSearchStatus.textContent = 'Searching...';
  if (bibleSearchResultsContainer)
  {
    bibleSearchResultsContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 24px;">Searching Scripture database...</div>';
  }

  try
  {
    const res = await fetch(`/api/bible/${selectedBibleVersionId}/search?q=${encodeURIComponent(query)}`);
    const results = await res.json();
    if (bibleSearchStatus) bibleSearchStatus.textContent = `${results.length} results found`;

    if (!results || results.length === 0)
    {
      if (bibleSearchResultsContainer)
      {
        bibleSearchResultsContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 24px;">No verses found matching "${escapeHtml(query)}".</div>`;
      }
      return;
    }

    if (bibleSearchResultsContainer)
    {
      bibleSearchResultsContainer.innerHTML = '';
      results.forEach((r) =>
      {
        const card = document.createElement('div');
        card.className = 'verse-card';

        // Highlight matched keyword
        const regex = new RegExp(`(${query})`, 'gi');
        const highlighted = escapeHtml(r.word).replace(regex, '<mark style="background: var(--color-blue); color: #fff; padding: 0 2px; border-radius: 2px;">$1</mark>');

        card.innerHTML = `
          <div class="verse-header">
            <span class="verse-ref">${escapeHtml(r.reference)}</span>
            <div style="display: flex; gap: 4px;">
              <button class="btn-primary btn-search-pres" style="padding: 2px 8px; font-size: 11px;">Present</button>
            </div>
          </div>
          <div class="verse-text">${highlighted}</div>
        `;

        const presBtn = card.querySelector('.btn-search-pres');
        if (presBtn)
        {
          presBtn.addEventListener('click', async (e) =>
          {
            e.stopPropagation();
            displaySearchVerseDeck(r);
            if (typeof presentBibleVerse === 'function')
            {
              presentBibleVerse(selectedBibleVersionId, {
                bookNum: r.bookNum,
                chNum: r.chNum,
                verseNum: r.verseNum,
                word: r.word
              });
            }
          });
        }

        card.addEventListener('click', async () =>
        {
          displaySearchVerseDeck(r);
          if (window.innerWidth <= 768 && typeof setMobilePaneMode === 'function')
          {
            if (window.currentMobilePaneMode !== 'both')
            {
              setMobilePaneMode('deck');
            }
          }
          if (typeof presentBibleVerse === 'function')
          {
            presentBibleVerse(selectedBibleVersionId, {
              bookNum: r.bookNum,
              chNum: r.chNum,
              verseNum: r.verseNum,
              word: r.word
            });
          }
        });

        bibleSearchResultsContainer.appendChild(card);
      });
    }
  }
  catch (err)
  {
    console.error('Error during Bible search:', err);
    if (bibleSearchStatus) bibleSearchStatus.textContent = 'Search failed';
    if (bibleSearchResultsContainer)
    {
      bibleSearchResultsContainer.innerHTML = '<div style="color: var(--color-red); text-align: center; padding: 24px;">Failed to perform search.</div>';
    }
  }
}

function displaySearchVerseDeck(r)
{
  if (activeSearchTitle) activeSearchTitle.textContent = r.reference;
  if (activeSlideCountIndicatorSearch) activeSlideCountIndicatorSearch.textContent = '1 verse';

  if (slideDeckSearch)
  {
    slideDeckSearch.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'slide-card-vertical active';
    card.innerHTML = `
      <span class="sc-live-pill" style="display: inline-block;">LIVE</span>
      <div class="sc-text-main"><span class="sc-verse-num">${escapeHtml(r.reference)}</span>${escapeHtml(r.word)}</div>
      <div style="margin-top: 6px; display: flex; gap: 8px;">
        <button class="btn-secondary btn-sm btn-open-ch" style="padding: 3px 8px; font-size: 11px;">Open Full Chapter in Bible Tab</button>
      </div>
    `;

    const btnOpenCh = card.querySelector('.btn-open-ch');
    if (btnOpenCh)
    {
      btnOpenCh.addEventListener('click', async () =>
      {
        if (typeof switchTab === 'function') switchTab('bible');
        if (typeof selectBibleBook === 'function')
        {
          await selectBibleBook(r.bookNum, r.chNum, r.verseNum);
        }
      });
    }

    slideDeckSearch.appendChild(card);
  }
}
