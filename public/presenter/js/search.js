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
    const res = await fetch(`/api/bible/${selectedVersionId}/search?q=${encodeURIComponent(query)}`);
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
        const highlighted = escapeHtml(r.word).replace(regex, '<mark style="background: #0284c7; color: #fff; padding: 0 2px; border-radius: 2px;">$1</mark>');

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
            await selectBibleBook(r.bookNum, r.bookName, r.chNum, r.verseNum);
          });
        }

        card.addEventListener('click', async () =>
        {
          await selectBibleBook(r.bookNum, r.bookName, r.chNum, r.verseNum);
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
      bibleSearchResultsContainer.innerHTML = '<div style="color: #ef4444; text-align: center; padding: 24px;">Failed to perform search.</div>';
    }
  }
}
