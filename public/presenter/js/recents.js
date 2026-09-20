// ===========================================================================
// Presenter Console — Recents Timeline System
// ===========================================================================

let recentsDays = [];
let recentsHasMore = false;
let recentsNextBeforeDate = null;
let recentsIsLoading = false;
let recentsTodayDateStr = new Date().toISOString().slice(0, 10);
const recentsCollapsedDates = new Set();

let lastClientRecordedKey = null;
let lastClientRecordedTime = 0;

function formatRecentDateHeader(dateStr, isToday)
{
  if (isToday)
  {
    try
    {
      const d = new Date(dateStr + 'T00:00:00');
      const dayName = d.toLocaleDateString(undefined, { weekday: 'long' });
      const monthDay = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      return `Today — ${dayName}, ${monthDay}`;
    }
    catch (e)
    {
      return 'Today';
    }
  }

  try
  {
    const d = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr + 'T00:00:00');
    const diffDays = Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 1)
    {
      const dayName = d.toLocaleDateString(undefined, { weekday: 'long' });
      const monthDay = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      return `Yesterday — ${dayName}, ${monthDay}`;
    }

    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  }
  catch (e)
  {
    return dateStr;
  }
}

function formatRecentTime(timeStr, createdAt)
{
  if (timeStr)
  {
    try
    {
      const parts = timeStr.split(':');
      if (parts.length >= 2)
      {
        let hours = Number(parts[0]);
        const minutes = parts[1];
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        return `${hours}:${minutes} ${ampm}`;
      }
    }
    catch (e) {}
  }

  if (createdAt)
  {
    try
    {
      const d = new Date(createdAt);
      if (!isNaN(d.getTime()))
      {
        return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      }
    }
    catch (e) {}
  }

  return '';
}

async function fetchRecents(beforeDate = null)
{
  if (recentsIsLoading) return;
  recentsIsLoading = true;

  const loadMoreBtn = document.getElementById('btn-recents-load-more');
  if (loadMoreBtn && beforeDate)
  {
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = 'Loading days...';
  }

  try
  {
    const url = `/api/recents${beforeDate ? `?before_date=${encodeURIComponent(beforeDate)}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.todayDate)
    {
      recentsTodayDateStr = data.todayDate;
    }

    if (!beforeDate)
    {
      recentsDays = data.days || [];
      // Today is expanded, previous days collapsed by default
      recentsCollapsedDates.clear();
      recentsDays.forEach((d) =>
      {
        if (!d.isToday)
        {
          recentsCollapsedDates.add(d.date);
        }
      });
    }
    else
    {
      const newDays = data.days || [];
      newDays.forEach((nd) =>
      {
        const existingIdx = recentsDays.findIndex(d => d.date === nd.date);
        if (existingIdx >= 0)
        {
          recentsDays[existingIdx] = nd;
        }
        else
        {
          recentsDays.push(nd);
          recentsCollapsedDates.add(nd.date);
        }
      });
    }

    recentsHasMore = Boolean(data.hasMore);
    recentsNextBeforeDate = data.nextBeforeDate || null;

    renderRecentsTimeline();
  }
  catch (err)
  {
    console.error('Failed to load recents:', err);
  }
  finally
  {
    recentsIsLoading = false;
    if (loadMoreBtn)
    {
      loadMoreBtn.disabled = false;
      loadMoreBtn.textContent = 'Load More Days';
    }
  }
}

function projectRecentSong(item)
{
  const songId = Number(item.song_id);
  const slideIndex = Math.max(1, Number(item.slide_index) || 1);

  const payload = {
    type: 'song',
    songId: songId,
    slideIndex: slideIndex
  };

  if (typeof socket !== 'undefined' && socket && socket.connected)
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

  // Synchronize song selection in songs browser if loaded
  if (typeof selectSongById === 'function')
  {
    try
    {
      selectSongById(songId, slideIndex);
    }
    catch (e) {}
  }
}

function projectRecentBible(item)
{
  const versionId = item.bible_version || 'tamil';
  const bookNum = Number(item.book_num) || 1;
  const chNum = Number(item.chapter_num) || 1;
  const verseNum = Number(item.verse_num) || 1;

  const payload = {
    type: 'bible',
    title: item.title || `Book ${bookNum} ${chNum}:${verseNum}`,
    verseInfo: {
      version: versionId,
      bookNum: bookNum,
      chNum: chNum,
      verseNum: verseNum
    }
  };

  if (typeof socket !== 'undefined' && socket && socket.connected)
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

  // Synchronize bible selection in scripture browser if available
  if (typeof selectBibleBook === 'function')
  {
    try
    {
      selectBibleBook(bookNum, chNum, verseNum);
    }
    catch (e) {}
  }
}

function isRecentItemLive(item, state)
{
  if (!state || state.status !== 'live' || !state.type) return false;

  if (item.item_type === 'song' && state.type === 'song')
  {
    const stateSongId = Number(state.songId);
    const stateSlideIndex = Number(state.slideIndex) || 1;
    return stateSongId === Number(item.song_id) && stateSlideIndex === Number(item.slide_index);
  }

  if (item.item_type === 'bible' && state.type === 'bible' && state.verseInfo)
  {
    const v = state.verseInfo;
    const vVersion = String(v.version || v.versionId || '').replace(/\.db$/i, '').trim().toLowerCase();
    const itemVersion = String(item.bible_version || '').replace(/\.db$/i, '').trim().toLowerCase();

    return Number(v.bookNum) === Number(item.book_num) &&
           Number(v.chNum) === Number(item.chapter_num) &&
           Number(v.verseNum) === Number(item.verse_num) &&
           (!vVersion || !itemVersion || vVersion === itemVersion);
  }

  return false;
}

function renderRecentsTimeline()
{
  const container = document.getElementById('recents-timeline-list');
  const totalBadge = document.getElementById('recents-total-badge');
  const footerBar = document.getElementById('recents-footer-bar');
  const toggleAllBtn = document.getElementById('btn-recents-toggle-all');

  if (!container) return;

  const totalItemsCount = recentsDays.reduce((acc, d) => acc + (d.items ? d.items.length : 0), 0);
  if (totalBadge)
  {
    totalBadge.textContent = `${totalItemsCount} item${totalItemsCount === 1 ? '' : 's'}`;
  }

  if (footerBar)
  {
    footerBar.style.display = recentsHasMore ? 'flex' : 'none';
  }

  if (recentsDays.length === 0 || totalItemsCount === 0)
  {
    container.innerHTML = `
      <div class="recents-empty-state">
        <svg class="vv-icon recents-empty-icon" viewBox="0 0 24 24" width="40" height="40" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        <div class="recents-empty-title">No Recent Projections</div>
        <div class="recents-empty-text">Songs and scripture verses you present will automatically appear here grouped by day for instant recall.</div>
      </div>
    `;
    if (toggleAllBtn) toggleAllBtn.style.display = 'none';
    return;
  }

  if (toggleAllBtn) toggleAllBtn.style.display = 'inline-flex';

  const currentLive = window.liveState || (typeof liveState !== 'undefined' ? liveState : null);

  let html = '';

  recentsDays.forEach((dayGroup) =>
  {
    const dateStr = dayGroup.date;
    const isCollapsed = recentsCollapsedDates.has(dateStr);
    const items = dayGroup.items || [];
    const dateTitle = formatRecentDateHeader(dateStr, dayGroup.isToday);

    html += `
      <section class="recents-day-section ${isCollapsed ? 'collapsed' : 'expanded'}" data-date="${escapeHtml(dateStr)}" id="recents-day-${escapeHtml(dateStr)}">
        <button type="button" class="recents-day-header" data-toggle-date="${escapeHtml(dateStr)}" title="Click to collapse / expand">
          <div class="recents-day-header-left">
            <svg class="vv-icon recents-chevron-icon" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
            <span class="recents-day-title">${escapeHtml(dateTitle)}</span>
          </div>
          <span class="recents-day-count-badge">${items.length} item${items.length === 1 ? '' : 's'}</span>
        </button>

        <div class="recents-day-items" style="${isCollapsed ? 'display: none;' : ''}">
    `;

    items.forEach((item) =>
    {
      const isSong = item.item_type === 'song';
      let cardInnerHtml = '';
      const timeDisplay = formatRecentTime(item.time_str, item.created_at);
      const timeHtml = timeDisplay ? `<span class="slide-card-time">${escapeHtml(timeDisplay)}</span>` : '';

      if (isSong)
      {
        const titleWithSecondary = item.title2 ? `${item.title} (${item.title2})` : item.title;
        const slideNum = item.slide_index || 1;
        const songTitle = titleWithSecondary ? `${titleWithSecondary} - Slide ${slideNum}` : `Slide ${slideNum}`;

        // Song in recent: title firstline bold with distinct color, content second line onwards
        const rawSnippet = item.snippet || '';
        const lines = rawSnippet.split(/\r?\n|<br\s*\/?>/i).map(l => l.trim()).filter(Boolean);
        const contentLinesHtml = lines.length > 0
          ? lines.map(line => `<div>${escapeHtml(line)}</div>`).join('')
          : '';

        const fontStyle = item.font ? ` style="font-family: '${escapeHtml(item.font)}', var(--font-display);"` : '';

        cardInnerHtml = `
          <div class="slide-card-content"${fontStyle}>
            <div class="slide-card-header-row">
              <div class="verse-number song-recent-title">${escapeHtml(songTitle)}</div>
              ${timeHtml}
            </div>
            <div class="slide-card-snippet-content">${contentLinesHtml}</div>
          </div>
        `;
      }
      else
      {
        // Bible verse: remove version suffix like "(Tamil (BSI))", reference on first line with distinct color
        let ref = item.title || item.reference || `${item.book_name || 'Scripture'} ${item.chapter_num}:${item.verse_num}`;
        ref = ref.replace(/\s*\([^)]*\)\s*$/, '').trim();

        const snippetText = item.snippet ? escapeHtml(item.snippet) : '';

        cardInnerHtml = `
          <div class="slide-card-content">
            <div class="slide-card-header-row">
              <div class="verse-number bible-slide-reference">${escapeHtml(ref)}</div>
              ${timeHtml}
            </div>
            <div class="bible-slide-text">${snippetText}</div>
          </div>
        `;
      }

      html += `
        <div class="slide-card"
             data-recent-id="${item.id}"
             data-item-type="${item.item_type}"
             title="Click to present live immediately"
             tabindex="0"
             role="button">
          ${cardInnerHtml}
        </div>
      `;
    });

    html += `
        </div>
      </section>
    `;
  });

  container.innerHTML = html;

  // Attach click listeners
  // 1. Accordion Header Toggle
  const headerButtons = container.querySelectorAll('[data-toggle-date]');
  headerButtons.forEach((btn) =>
  {
    btn.addEventListener('click', (e) =>
    {
      e.stopPropagation();
      const dateStr = btn.getAttribute('data-toggle-date');
      toggleDateSection(dateStr);
    });
  });

  // 2. Card click: Go Live directly without selection or live highlight!
  const cards = container.querySelectorAll('.slide-card');
  cards.forEach((card) =>
  {
    card.addEventListener('click', () =>
    {
      const id = Number(card.getAttribute('data-recent-id'));
      const item = findRecentItemById(id);
      if (!item) return;

      if (item.item_type === 'song')
      {
        projectRecentSong(item);
      }
      else if (item.item_type === 'bible')
      {
        projectRecentBible(item);
      }
    });

    card.addEventListener('keydown', (e) =>
    {
      if (e.key === 'Enter' || e.key === ' ')
      {
        e.preventDefault();
        card.click();
      }
    });
  });
}

function findRecentItemById(id)
{
  for (const day of recentsDays)
  {
    if (day.items)
    {
      const match = day.items.find(i => Number(i.id) === Number(id));
      if (match) return match;
    }
  }
  return null;
}

function toggleDateSection(dateStr)
{
  if (recentsCollapsedDates.has(dateStr))
  {
    recentsCollapsedDates.delete(dateStr);
  }
  else
  {
    recentsCollapsedDates.add(dateStr);
  }

  const section = document.getElementById(`recents-day-${dateStr}`);
  if (section)
  {
    const isCollapsed = recentsCollapsedDates.has(dateStr);
    section.classList.toggle('collapsed', isCollapsed);
    section.classList.toggle('expanded', !isCollapsed);
    const itemsContainer = section.querySelector('.recents-day-items');
    if (itemsContainer)
    {
      itemsContainer.style.display = isCollapsed ? 'none' : '';
    }
  }
}

function toggleAllDates()
{
  const toggleBtn = document.getElementById('btn-recents-toggle-all');
  const allCollapsed = recentsDays.every(d => recentsCollapsedDates.has(d.date));

  if (allCollapsed)
  {
    recentsCollapsedDates.clear();
    if (toggleBtn) toggleBtn.textContent = 'Collapse All';
  }
  else
  {
    recentsDays.forEach(d => recentsCollapsedDates.add(d.date));
    if (toggleBtn) toggleBtn.textContent = 'Expand All';
  }

  renderRecentsTimeline();
}

// Intercept live projection feed to immediately update Today's section
function handleLiveStateForRecents(state)
{
  if (!state || state.status !== 'live' || !state.type) return;
  if (state.type !== 'song' && state.type !== 'bible') return;

  // Deduplication check: ignore duplicate within 1 minute
  let key = '';
  if (state.type === 'song')
  {
    key = `song_${state.songId}_${state.slideIndex || 1}`;
  }
  else if (state.type === 'bible' && state.verseInfo)
  {
    const v = state.verseInfo;
    key = `bible_${v.version || ''}_${v.bookNum}_${v.chNum}_${v.verseNum}`;
  }

  const now = Date.now();
  if (key && key === lastClientRecordedKey && (now - lastClientRecordedTime < 60000))
  {
    // Duplicate projection within 1 minute, skip adding duplicate card
    return;
  }

  lastClientRecordedKey = key;
  lastClientRecordedTime = now;

  // Build the local recent item representation
  const nowObj = new Date();
  const timeStr = nowObj.toTimeString().slice(0, 5);

  let newItem = null;
  if (state.type === 'song')
  {
    newItem = {
      id: now, // Unique temporary id
      item_type: 'song',
      song_id: state.songId,
      slide_index: Number(state.slideIndex) || 1,
      total_slides: Number(state.totalSlides) || 1,
      title: state.title || 'Song #' + state.songId,
      title2: '',
      snippet: Array.isArray(state.lines) ? state.lines.join('\n') : (state.snippet || ''),
      created_at: nowObj.toISOString(),
      time_str: timeStr
    };
  }
  else if (state.type === 'bible')
  {
    const v = state.verseInfo || {};
    const cleanTitle = (state.title || state.reference || 'Scripture').replace(/\s*\([^)]*\)\s*$/, '').trim();
    newItem = {
      id: now,
      item_type: 'bible',
      bible_version: v.version || 'tamil',
      book_num: v.bookNum || 1,
      chapter_num: v.chNum || 1,
      verse_num: v.verseNum || 1,
      book_name: cleanTitle.split(' ')[0] || 'Scripture',
      title: cleanTitle,
      reference: cleanTitle,
      snippet: (Array.isArray(state.lines) && state.lines[0]) ? state.lines[0] : (state.snippet || ''),
      created_at: nowObj.toISOString(),
      time_str: timeStr
    };
  }

  if (newItem)
  {
    let todayGroup = recentsDays.find(d => d.isToday || d.date === recentsTodayDateStr);
    if (!todayGroup)
    {
      todayGroup = {
        date: recentsTodayDateStr,
        isToday: true,
        items: []
      };
      recentsDays.unshift(todayGroup);
      recentsCollapsedDates.delete(recentsTodayDateStr);
    }

    // Prepend to Today's list
    todayGroup.items.unshift(newItem);
    renderRecentsTimeline();
  }
}

function highlightActiveInRecents(state)
{
  // Live highlight, selection, and live badge/pill are not required for recent tab
}

function initRecents()
{
  const loadMoreBtn = document.getElementById('btn-recents-load-more');
  if (loadMoreBtn)
  {
    loadMoreBtn.addEventListener('click', () =>
    {
      if (recentsNextBeforeDate)
      {
        fetchRecents(recentsNextBeforeDate);
      }
    });
  }

  const toggleAllBtn = document.getElementById('btn-recents-toggle-all');
  if (toggleAllBtn)
  {
    toggleAllBtn.addEventListener('click', toggleAllDates);
  }

  // Initial fetch of recents
  fetchRecents();
}

function onRecentsTabOpened()
{
  if (recentsDays.length === 0 && !recentsIsLoading)
  {
    fetchRecents();
  }
}

window.initRecents = initRecents;
window.fetchRecents = fetchRecents;
window.handleLiveStateForRecents = handleLiveStateForRecents;
window.highlightActiveInRecents = highlightActiveInRecents;
window.onRecentsTabOpened = onRecentsTabOpened;
