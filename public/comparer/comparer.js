/**
 * Song Database Comparer — Client-Side Engine
 * 100% Client-Side SQLite Database Comparison & Visual Diffing
 * VerseView Suite
 */

(function() {
  'use strict';

  // State
  let dbA = { file: null, name: 'Database A (Reference)', songs: new Map(), list: [], size: 0 };
  let dbB = { file: null, name: 'Database B (Modified)', songs: new Map(), list: [], size: 0 };
  let comparisonResults = null;
  let activeTab = 'all'; // 'all' | 'added' | 'removed' | 'modified' | 'unchanged'
  let activeSubFilter = 'all'; // 'all' | 'lyrics' | 'title' | 'cat' | 'font' | 'duplicates' | 'unique'
  let searchQuery = '';
  let currentPage = 1;
  const PAGE_SIZE = 25;
  let currentModalSongId = null;
  let modalViewMode = 'side-by-side'; // 'side-by-side' | 'unified'

  // sql.js instance
  let SQL = null;
  let isSqlJsLoading = false;

  // DOM Elements
  const el = {};

  function initElements() {
    el.dropA = document.getElementById('dropzone-a');
    el.dropB = document.getElementById('dropzone-b');
    el.fileInputA = document.getElementById('file-input-a');
    el.fileInputB = document.getElementById('file-input-b');
    el.btnLoadServerA = document.getElementById('btn-load-server-a');
    el.btnLoadServerB = document.getElementById('btn-load-server-b');
    el.btnSwapDbs = document.getElementById('btn-swap-dbs');

    el.cardInfoA = document.getElementById('card-info-a');
    el.cardInfoB = document.getElementById('card-info-b');
    el.titleA = document.getElementById('title-db-a');
    el.titleB = document.getElementById('title-db-b');
    el.subA = document.getElementById('sub-db-a');
    el.subB = document.getElementById('sub-db-b');

    // Summary Tabs
    el.summaryGrid = document.getElementById('comparer-summary-grid');
    el.tabAll = document.getElementById('tab-summary-all');
    el.tabAdded = document.getElementById('tab-summary-added');
    el.tabRemoved = document.getElementById('tab-summary-removed');
    el.tabModified = document.getElementById('tab-summary-modified');
    el.tabUnchanged = document.getElementById('tab-summary-unchanged');

    el.countAll = document.getElementById('count-summary-all');
    el.countAdded = document.getElementById('count-summary-added');
    el.countRemoved = document.getElementById('count-summary-removed');
    el.countModified = document.getElementById('count-summary-modified');
    el.countUnchanged = document.getElementById('count-summary-unchanged');

    // Workspace & Toolbar
    el.searchInput = document.getElementById('comparer-search-input');
    el.filterChipsContainer = document.getElementById('comparer-filter-chips');
    el.listContainer = document.getElementById('comparer-list-container');
    el.workspaceTitle = document.getElementById('comparer-workspace-title');
    el.workspaceSubtitle = document.getElementById('comparer-workspace-subtitle');

    // Footer
    el.footerInfo = document.getElementById('comparer-footer-info');
    el.footerPagination = document.getElementById('comparer-footer-pagination');
    el.btnExportReport = document.getElementById('btn-export-report');
    el.btnExportJson = document.getElementById('btn-export-json');

    // Modal
    el.modalOverlay = document.getElementById('diff-modal-overlay');
    el.modalCloseBtn = document.getElementById('btn-close-diff-modal');
    el.modalTitle = document.getElementById('diff-modal-title');
    el.modalBadgeGroup = document.getElementById('diff-modal-badges');
    el.modalMetaStrip = document.getElementById('diff-modal-metastrip');
    el.modalDiffBody = document.getElementById('diff-modal-body');
    el.btnPrevChange = document.getElementById('btn-diff-modal-prev');
    el.btnNextChange = document.getElementById('btn-diff-modal-next');
    el.btnToggleViewMode = document.getElementById('btn-toggle-diff-mode');
  }

  // Toast Notification
  function showToast(message, type = 'info') {
    const existing = document.getElementById('comparer-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'comparer-toast';
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.background = type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : type === 'warn' ? '#f59e0b' : '#0284c7';
    toast.style.color = '#ffffff';
    toast.style.padding = '10px 18px';
    toast.style.borderRadius = '8px';
    toast.style.fontSize = '13px';
    toast.style.fontWeight = '600';
    toast.style.boxShadow = '0 10px 20px rgba(0,0,0,0.5)';
    toast.style.zIndex = '9999';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '8px';
    toast.innerHTML = (type === 'error' ? '⚠️ ' : type === 'success' ? '✅ ' : 'ℹ️ ') + escapeHtml(message);

    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  function escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // ---------------------------------------------------------------------------
  // SQLite Loading via WebAssembly (sql.js)
  // ---------------------------------------------------------------------------
  async function initSql() {
    if (SQL) return SQL;
    if (isSqlJsLoading) {
      while (isSqlJsLoading) {
        await new Promise(r => setTimeout(r, 50));
      }
      return SQL;
    }

    isSqlJsLoading = true;
    try {
      if (typeof window.initSqlJs === 'function') {
        SQL = await window.initSqlJs({
          locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/${file}`
        });
      } else {
        // Dynamically load sql.js script
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/sql-wasm.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
        SQL = await window.initSqlJs({
          locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/${file}`
        });
      }
      isSqlJsLoading = false;
      return SQL;
    } catch (err) {
      console.warn('Primary sql.js load failed, trying jsdelivr fallback:', err);
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/sql.js@1.12.0/dist/sql-wasm.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
        SQL = await window.initSqlJs({
          locateFile: file => `https://cdn.jsdelivr.net/npm/sql.js@1.12.0/dist/${file}`
        });
        isSqlJsLoading = false;
        return SQL;
      } catch (err2) {
        isSqlJsLoading = false;
        throw new Error('Could not load SQLite WebAssembly engine: ' + err2.message);
      }
    }
  }

  /**
   * Reads SQLite Database ArrayBuffer and extracts songs list
   */
  async function parseSongsDatabase(arrayBuffer, fileName = 'songs.db') {
    const sqlEngine = await initSql();
    const u8 = new Uint8Array(arrayBuffer);
    const db = new sqlEngine.Database(u8);

    // Discover table name (default 'sm', or 'songs')
    const tableRes = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    let tableName = 'sm';
    if (tableRes.length > 0 && tableRes[0].values.length > 0) {
      const names = tableRes[0].values.map(v => v[0]);
      if (names.includes('sm')) tableName = 'sm';
      else if (names.includes('songs')) tableName = 'songs';
      else tableName = names[0];
    }

    // Query all rows
    const res = db.exec(`SELECT * FROM "${tableName}"`);
    if (!res || res.length === 0) {
      db.close();
      return { songsMap: new Map(), songsList: [], tableName, totalCount: 0 };
    }

    const columns = res[0].columns;
    const values = res[0].values;
    const songsMap = new Map();
    const songsList = [];

    for (const row of values) {
      const item = {};
      columns.forEach((col, idx) => {
        item[col] = row[idx];
      });

      const songObj = {
        id: Number(item.id) || 0,
        name: (item.name || '').trim(),
        title2: (item.title2 || '').trim(),
        cat: (item.cat || '').trim(),
        font: (item.font || '').trim(),
        font2: (item.font2 || '').trim(),
        key: (item.key || '').trim(),
        notes: (item.notes || '').trim(),
        tags: (item.tags || '').trim(),
        lyrics: item.lyrics || '',
        lyrics2: item.lyrics2 || '',
        // Normalizations for similarity/diffing
        _normTitle: normalizeText(item.name || ''),
        _normLyrics: normalizeText(item.lyrics || ''),
        _slideCount: countSlides(item.lyrics || '')
      };

      if (songObj.id) {
        songsMap.set(songObj.id, songObj);
        songsList.push(songObj);
      }
    }

    db.close();
    return {
      songsMap,
      songsList,
      tableName,
      totalCount: songsList.length
    };
  }

  function countSlides(lyrics) {
    if (!lyrics) return 1;
    const parts = lyrics.split(/<slide>/i).filter(p => p.trim().length > 0);
    return Math.max(1, parts.length);
  }

  function normalizeText(text) {
    if (!text) return '';
    return String(text)
      .replace(/<[^>]+>/g, ' ')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  // ---------------------------------------------------------------------------
  // N-Gram & Text Similarity for Duplicate Reason Tagging
  // ---------------------------------------------------------------------------
  function getNGrams(str, n = 3) {
    const set = new Set();
    const s = ' ' + str + ' ';
    for (let i = 0; i <= s.length - n; i++) {
      set.add(s.substring(i, i + n));
    }
    return set;
  }

  function calculateDiceSimilarity(setA, setB) {
    if (!setA || !setB || setA.size === 0 || setB.size === 0) return 0;
    let matches = 0;
    for (const item of setA) {
      if (setB.has(item)) matches++;
    }
    return (2 * matches) / (setA.size + setB.size);
  }

  // ---------------------------------------------------------------------------
  // Comparison Engine (Added, Removed, Modified, Reason Tagging)
  // ---------------------------------------------------------------------------
  function runComparison() {
    if (dbA.songs.size === 0 && dbB.songs.size === 0) {
      comparisonResults = null;
      renderWorkspace();
      return;
    }

    const added = [];
    const removed = [];
    const modified = [];
    const unchanged = [];

    // Precompute N-grams for DB B songs for rapid similarity check of removed songs
    const dbB_ngrams = new Map();
    const dbB_lyricsMap = new Map(); // normLyrics -> song
    const dbB_titleMap = new Map(); // normTitle -> song

    for (const songB of dbB.list) {
      if (songB._normLyrics) {
        dbB_ngrams.set(songB.id, getNGrams(songB._normLyrics, 3));
        if (!dbB_lyricsMap.has(songB._normLyrics)) {
          dbB_lyricsMap.set(songB._normLyrics, songB);
        }
      }
      if (songB._normTitle && !dbB_titleMap.has(songB._normTitle)) {
        dbB_titleMap.set(songB._normTitle, songB);
      }
    }

    // 1. Iterate over DB A (Find Removed, Modified, and Unchanged)
    for (const [id, songA] of dbA.songs.entries()) {
      if (!dbB.songs.has(id)) {
        // Song is REMOVED in DB B!
        // Now analyze WHY it was removed: Was it a duplicate cleaned?
        const removalReason = analyzeRemovalReason(songA, dbB.list, dbB_lyricsMap, dbB_titleMap, dbB_ngrams);
        removed.push({
          type: 'removed',
          id,
          songA,
          songB: null,
          removalReason,
          changes: ['Song removed from database']
        });
      } else {
        // Song exists in both DB A and DB B (Check for Modifications)
        const songB = dbB.songs.get(id);
        const fieldDiffs = detectFieldDifferences(songA, songB);

        if (fieldDiffs.hasChanges) {
          modified.push({
            type: 'modified',
            id,
            songA,
            songB,
            fieldDiffs,
            changes: fieldDiffs.changeSummary
          });
        } else {
          unchanged.push({
            type: 'unchanged',
            id,
            songA,
            songB,
            changes: []
          });
        }
      }
    }

    // 2. Iterate over DB B (Find Added Songs)
    for (const [id, songB] of dbB.songs.entries()) {
      if (!dbA.songs.has(id)) {
        // Song is ADDED in DB B!
        // Heuristic: Check if this added song matches an old song in DB A (e.g. re-indexed)
        const potentialOrigin = findPotentialOriginInA(songB, dbA.list);
        added.push({
          type: 'added',
          id,
          songA: null,
          songB,
          potentialOrigin,
          changes: ['New song added to database']
        });
      }
    }

    // Sort all arrays by song ID
    added.sort((a, b) => a.id - b.id);
    removed.sort((a, b) => a.id - b.id);
    modified.sort((a, b) => a.id - b.id);
    unchanged.sort((a, b) => a.id - b.id);

    const allDiffs = [...added, ...removed, ...modified].sort((a, b) => a.id - b.id);

    comparisonResults = {
      added,
      removed,
      modified,
      unchanged,
      allDiffs,
      stats: {
        totalA: dbA.songs.size,
        totalB: dbB.songs.size,
        addedCount: added.length,
        removedCount: removed.length,
        modifiedCount: modified.length,
        unchangedCount: unchanged.length,
        totalDiffs: allDiffs.length,
        duplicatesCleanedCount: removed.filter(r => r.removalReason && r.removalReason.isDuplicate).length
      }
    };

    updateSummaryCards();
    renderWorkspace();
  }

  /**
   * Analyzes why a song was removed from DB B.
   * Detects if it was an exact duplicate, same lyrics, near-duplicate, or pure deletion.
   */
  function analyzeRemovalReason(songA, dbBList, dbBLyricsMap, dbBTitleMap, dbBNgrams) {
    if (!songA) return { tag: 'Deleted', desc: 'Deleted from database', isDuplicate: false };

    // 1. Exact match with a song in DB B (Same Title AND Same Lyrics)
    if (songA._normTitle && songA._normLyrics) {
      for (const songB of dbBList) {
        if (songB._normTitle === songA._normTitle && songB._normLyrics === songA._normLyrics) {
          return {
            tag: `Removed as Exact Duplicate of #${songB.id}`,
            desc: `Identical title & lyrics to active song #${songB.id} ("${songB.name}") in new database.`,
            badgeClass: 'badge-dup-tag',
            isDuplicate: true,
            matchType: 'exact',
            matchingSong: songB
          };
        }
      }
    }

    // 2. Duplicate Lyrics with a song in DB B (Same Lyrics, Different Title)
    if (songA._normLyrics && dbBLyricsMap.has(songA._normLyrics)) {
      const songB = dbBLyricsMap.get(songA._normLyrics);
      return {
        tag: `Removed as Duplicate Lyrics of #${songB.id}`,
        desc: `Identical song content to active song #${songB.id} ("${songB.name}"). Title was "${songA.name}".`,
        badgeClass: 'badge-dup-tag',
        isDuplicate: true,
        matchType: 'lyrics',
        matchingSong: songB
      };
    }

    // 3. Near-Duplicate / High Content Similarity (70%+ match)
    if (songA._normLyrics && songA._normLyrics.length > 20) {
      const ngramsA = getNGrams(songA._normLyrics, 3);
      let bestMatch = null;
      let highestSim = 0;

      for (const songB of dbBList) {
        const ngramsB = dbBNgrams.get(songB.id);
        if (ngramsB) {
          const sim = calculateDiceSimilarity(ngramsA, ngramsB);
          if (sim > highestSim && sim >= 0.70) {
            highestSim = sim;
            bestMatch = songB;
          }
        }
      }

      if (bestMatch) {
        const pct = Math.round(highestSim * 100);
        return {
          tag: `Removed: ${pct}% Similar to #${bestMatch.id}`,
          desc: `High similarity (${pct}%) to active song #${bestMatch.id} ("${bestMatch.name}"). Cleaned as near-duplicate.`,
          badgeClass: 'badge-dup-similar',
          isDuplicate: true,
          matchType: 'similar',
          similarity: pct,
          matchingSong: bestMatch
        };
      }
    }

    // 4. Same Title, different lyrics
    if (songA._normTitle && dbBTitleMap.has(songA._normTitle)) {
      const songB = dbBTitleMap.get(songA._normTitle);
      return {
        tag: `Removed: Same Title as #${songB.id}`,
        desc: `Another song with the same title exists as #${songB.id} in the new database.`,
        badgeClass: 'badge-dup-similar',
        isDuplicate: true,
        matchType: 'title',
        matchingSong: songB
      };
    }

    // 5. Unique Song Deleted / Pruned
    return {
      tag: 'Pruned / Unique Song Deleted',
      desc: 'No matching or duplicate song found in the new database. Song was intentionally removed.',
      badgeClass: 'badge-removed',
      isDuplicate: false,
      matchType: 'unique'
    };
  }

  function findPotentialOriginInA(songB, dbAList) {
    if (!songB || !dbAList) return null;
    for (const songA of dbAList) {
      if (songA._normTitle === songB._normTitle && songA._normLyrics === songB._normLyrics) {
        return { matchType: 'exact', originId: songA.id, songA };
      }
    }
    return null;
  }

  /**
   * Compares all fields between songA and songB
   */
  function detectFieldDifferences(songA, songB) {
    const fields = [
      { key: 'name', label: 'Title' },
      { key: 'title2', label: 'Secondary Title' },
      { key: 'cat', label: 'Category' },
      { key: 'font', label: 'Font' },
      { key: 'font2', label: 'Secondary Font' },
      { key: 'key', label: 'Musical Key' },
      { key: 'notes', label: 'Notes' },
      { key: 'tags', label: 'Tags' },
      { key: 'lyrics', label: 'Lyrics' },
      { key: 'lyrics2', label: 'Secondary Lyrics' }
    ];

    const diffs = {};
    const changeSummary = [];
    let hasChanges = false;

    for (const field of fields) {
      const valA = songA[field.key] || '';
      const valB = songB[field.key] || '';
      const isChanged = valA !== valB;

      diffs[field.key] = {
        label: field.label,
        valA,
        valB,
        isChanged
      };

      if (isChanged) {
        hasChanges = true;
        changeSummary.push(field.label);
      }
    }

    return {
      hasChanges,
      diffs,
      changeSummary,
      isLyricsChanged: diffs.lyrics.isChanged || diffs.lyrics2.isChanged,
      isTitleChanged: diffs.name.isChanged || diffs.title2.isChanged,
      isFontChanged: diffs.font.isChanged || diffs.font2.isChanged,
      isCatChanged: diffs.cat.isChanged,
      isMetaChanged: diffs.key.isChanged || diffs.notes.isChanged || diffs.tags.isChanged
    };
  }

  // ---------------------------------------------------------------------------
  // Word & Line Diff Algorithm (Token Myers / LCS)
  // ---------------------------------------------------------------------------
  function tokenizeForDiff(text) {
    if (!text) return [];
    // Split by words, spaces, HTML tags, punctuation
    return text.match(/<slide>|<BR>|[^\s<.,;:!?'"’“”\-—_()\[\]{}#$*&^%@~`+=|\\/]+|\s+|[.,;:!?'"’“”\-—_()\[\]{}#$*&^%@~`+=|\\/]/gi) || [];
  }

  function computeWordDiff(textA, textB) {
    const tokensA = tokenizeForDiff(textA || '');
    const tokensB = tokenizeForDiff(textB || '');

    const n = tokensA.length;
    const m = tokensB.length;

    // Fast-path identical
    if (textA === textB) {
      return tokensA.map(t => ({ type: 'same', text: t }));
    }

    // Dynamic Programming LCS for token diff
    // Cap matrix to avoid lag on huge lyrics (> 2000 tokens)
    if (n > 1200 || m > 1200) {
      return computeLineDiff(textA, textB);
    }

    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) {
        if (tokensA[i] === tokensB[j]) {
          dp[i + 1][j + 1] = dp[i][j] + 1;
        } else {
          dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
      }
    }

    // Backtrack to build diff ops
    let i = n;
    let j = m;
    const result = [];

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && tokensA[i - 1] === tokensB[j - 1]) {
        result.unshift({ type: 'same', text: tokensA[i - 1] });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        result.unshift({ type: 'add', text: tokensB[j - 1] });
        j--;
      } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
        result.unshift({ type: 'del', text: tokensA[i - 1] });
        i--;
      }
    }

    return result;
  }

  function computeLineDiff(textA, textB) {
    const linesA = (textA || '').split('\n');
    const linesB = (textB || '').split('\n');
    const result = [];

    const maxLines = Math.max(linesA.length, linesB.length);
    for (let i = 0; i < maxLines; i++) {
      const lA = linesA[i];
      const lB = linesB[i];

      if (lA === lB) {
        result.push({ type: 'same', text: (lA || '') + '\n' });
      } else {
        if (lA !== undefined) result.push({ type: 'del', text: lA + '\n' });
        if (lB !== undefined) result.push({ type: 'add', text: lB + '\n' });
      }
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Rendering UI
  // ---------------------------------------------------------------------------
  function updateSummaryCards() {
    if (!comparisonResults) {
      el.countAll.textContent = '0';
      el.countAdded.textContent = '0';
      el.countRemoved.textContent = '0';
      el.countModified.textContent = '0';
      el.countUnchanged.textContent = '0';
      return;
    }

    const { stats } = comparisonResults;
    el.countAll.textContent = stats.totalDiffs.toLocaleString();
    el.countAdded.textContent = stats.addedCount.toLocaleString();
    el.countRemoved.textContent = stats.removedCount.toLocaleString();
    el.countModified.textContent = stats.modifiedCount.toLocaleString();
    el.countUnchanged.textContent = stats.unchangedCount.toLocaleString();
  }

  function getFilteredItems() {
    if (!comparisonResults) return [];

    let list = [];
    if (activeTab === 'all') {
      list = comparisonResults.allDiffs;
    } else if (activeTab === 'added') {
      list = comparisonResults.added;
    } else if (activeTab === 'removed') {
      list = comparisonResults.removed;
    } else if (activeTab === 'modified') {
      list = comparisonResults.modified;
    } else if (activeTab === 'unchanged') {
      list = comparisonResults.unchanged;
    }

    // Apply sub-filters
    if (activeSubFilter === 'lyrics') {
      list = list.filter(item => item.fieldDiffs && item.fieldDiffs.isLyricsChanged);
    } else if (activeSubFilter === 'title') {
      list = list.filter(item => item.fieldDiffs && item.fieldDiffs.isTitleChanged);
    } else if (activeSubFilter === 'cat') {
      list = list.filter(item => item.fieldDiffs && item.fieldDiffs.isCatChanged);
    } else if (activeSubFilter === 'font') {
      list = list.filter(item => item.fieldDiffs && item.fieldDiffs.isFontChanged);
    } else if (activeSubFilter === 'duplicates') {
      list = list.filter(item => item.removalReason && item.removalReason.isDuplicate);
    } else if (activeSubFilter === 'unique') {
      list = list.filter(item => item.removalReason && !item.removalReason.isDuplicate);
    }

    // Apply search query
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(item => {
        const idStr = String(item.id);
        const nameA = item.songA ? item.songA.name.toLowerCase() : '';
        const nameB = item.songB ? item.songB.name.toLowerCase() : '';
        const catA = item.songA ? (item.songA.cat || '').toLowerCase() : '';
        const catB = item.songB ? (item.songB.cat || '').toLowerCase() : '';
        const lyricsA = item.songA ? (item.songA.lyrics || '').toLowerCase() : '';
        const lyricsB = item.songB ? (item.songB.lyrics || '').toLowerCase() : '';
        const reason = item.removalReason ? item.removalReason.tag.toLowerCase() : '';

        return idStr.includes(q) ||
          nameA.includes(q) || nameB.includes(q) ||
          catA.includes(q) || catB.includes(q) ||
          lyricsA.includes(q) || lyricsB.includes(q) ||
          reason.includes(q);
      });
    }

    return list;
  }

  function renderFilterChips() {
    let chips = [];

    if (activeTab === 'modified') {
      chips = [
        { id: 'all', label: 'All Modifications' },
        { id: 'lyrics', label: '📝 Lyrics Changed' },
        { id: 'title', label: '🏷️ Title Changed' },
        { id: 'cat', label: '📁 Category Changed' },
        { id: 'font', label: '🔤 Font / Encoding Changed' }
      ];
    } else if (activeTab === 'removed') {
      chips = [
        { id: 'all', label: 'All Removed Songs' },
        { id: 'duplicates', label: '🏷️ Cleaned Duplicates Only' },
        { id: 'unique', label: '🗑️ Unique Deletions Only' }
      ];
    } else {
      chips = [
        { id: 'all', label: 'All Items' }
      ];
    }

    el.filterChipsContainer.innerHTML = chips.map(c => `
      <button class="filter-chip ${activeSubFilter === c.id ? 'active' : ''}" data-filter="${c.id}">
        ${escapeHtml(c.label)}
      </button>
    `).join('');

    el.filterChipsContainer.querySelectorAll('.filter-chip').forEach(btn => {
      btn.addEventListener('click', (e) => {
        activeSubFilter = e.currentTarget.dataset.filter;
        currentPage = 1;
        renderFilterChips();
        renderWorkspace();
      });
    });
  }

  function renderWorkspace() {
    if (!comparisonResults) {
      el.workspaceTitle.textContent = 'Upload or Select Databases to Compare';
      el.workspaceSubtitle.textContent = 'Drag & drop two VerseView songs.db files above, or click "Load Server DB".';
      el.listContainer.innerHTML = `
        <div class="comparer-empty-state">
          <div class="empty-state-icon">⚖️</div>
          <div class="empty-state-title">No Databases Loaded for Comparison</div>
          <div class="empty-state-desc">
            Load <strong>Database A</strong> (Original / Reference) and <strong>Database B</strong> (Modified / Target) to perform an automated client-side SQLite diff inspection.
          </div>
          <div style="display: flex; gap: 10px;">
            <button class="btn-primary" onclick="document.getElementById('btn-load-server-a').click(); document.getElementById('btn-load-server-b').click();" style="padding: 8px 18px; font-size: 13px;">
              ⚡ Quick Load Server DB for A &amp; B
            </button>
          </div>
        </div>
      `;
      el.footerInfo.textContent = 'Ready';
      el.footerPagination.innerHTML = '';
      return;
    }

    const filteredItems = getFilteredItems();
    const totalItems = filteredItems.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    currentPage = Math.min(currentPage, totalPages);

    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filteredItems.slice(startIndex, startIndex + PAGE_SIZE);

    // Update Titles
    const tabLabels = {
      all: 'All Differences (Added, Removed & Modified)',
      added: 'Songs Added (New in Database B)',
      removed: 'Songs Removed (Missing in Database B)',
      modified: 'Songs Modified (Content or Metadata Differences)',
      unchanged: 'Unchanged Songs (Identical in Both Databases)'
    };
    el.workspaceTitle.textContent = tabLabels[activeTab] || 'Comparison Results';
    el.workspaceSubtitle.textContent = `Showing ${pageItems.length} of ${totalItems} matching items (Page ${currentPage} of ${totalPages})`;

    if (totalItems === 0) {
      el.listContainer.innerHTML = `
        <div class="comparer-empty-state">
          <div class="empty-state-icon">🔍</div>
          <div class="empty-state-title">No matching songs found</div>
          <div class="empty-state-desc">
            No items found matching the current search query or active filter. Try resetting search or selecting another tab.
          </div>
        </div>
      `;
      el.footerInfo.textContent = '0 items found';
      el.footerPagination.innerHTML = '';
      return;
    }

    // Render Cards
    el.listContainer.innerHTML = pageItems.map(item => renderSongCard(item)).join('');

    // Attach card event listeners
    el.listContainer.querySelectorAll('.btn-open-diff-modal').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const songId = Number(e.currentTarget.dataset.id);
        openDiffModal(songId);
      });
    });

    // Render Pagination
    renderPagination(totalItems, totalPages);
  }

  function renderSongCard(item) {
    const isAdded = item.type === 'added';
    const isRemoved = item.type === 'removed';
    const isModified = item.type === 'modified';
    const isUnchanged = item.type === 'unchanged';

    const cardClass = isAdded ? 'card-added' : isRemoved ? 'card-removed' : isModified ? 'card-modified' : 'card-unchanged';
    const song = item.songB || item.songA;

    // Header Badges
    let typeBadge = '';
    if (isAdded) {
      typeBadge = `<span class="badge-diff badge-added">➕ Added</span>`;
    } else if (isRemoved) {
      typeBadge = `<span class="badge-diff badge-removed">➖ Removed</span>`;
    } else if (isModified) {
      typeBadge = `<span class="badge-diff badge-modified">Δ Modified (${item.changes.join(', ')})</span>`;
    } else {
      typeBadge = `<span class="badge-diff badge-unchanged">= Unchanged</span>`;
    }

    // Removal Reason Tag
    let reasonTagHtml = '';
    if (isRemoved && item.removalReason) {
      const r = item.removalReason;
      reasonTagHtml = `
        <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px; flex-wrap: wrap;">
          <span class="${escapeHtml(r.badgeClass || 'badge-dup-tag')}">${escapeHtml(r.tag)}</span>
          <span style="font-size: 11px; color: #94a3b8;">${escapeHtml(r.desc)}</span>
        </div>
      `;
    }

    // Snippet Preview
    let snippetHtml = '';
    if (isModified && item.songA && item.songB) {
      const lyricsDiff = item.fieldDiffs && item.fieldDiffs.isLyricsChanged;
      const snippetA = extractFirstLines(item.songA.lyrics);
      const snippetB = extractFirstLines(item.songB.lyrics);

      snippetHtml = `
        <div class="diff-snippet-grid">
          <div>
            <div class="snippet-col-label">
              <span>Database A (Old)</span>
              <span style="color: #94a3b8;">${escapeHtml(item.songA.name)}</span>
            </div>
            <div class="snippet-text">${escapeHtml(snippetA)}</div>
          </div>
          <div>
            <div class="snippet-col-label">
              <span>Database B (New)</span>
              <span style="color: #94a3b8;">${escapeHtml(item.songB.name)}</span>
            </div>
            <div class="snippet-text">${escapeHtml(snippetB)}</div>
          </div>
        </div>
      `;
    } else if (isRemoved && item.songA) {
      const snippetA = extractFirstLines(item.songA.lyrics);
      snippetHtml = `
        <div style="background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 8px 12px; font-size: 12px; color: #94a3b8;">
          <strong style="color: #cbd5e1;">Lyrics Preview:</strong> ${escapeHtml(snippetA)}
        </div>
      `;
    } else if (isAdded && item.songB) {
      const snippetB = extractFirstLines(item.songB.lyrics);
      snippetHtml = `
        <div style="background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 8px 12px; font-size: 12px; color: #94a3b8;">
          <strong style="color: #cbd5e1;">Lyrics Preview:</strong> ${escapeHtml(snippetB)}
        </div>
      `;
    }

    return `
      <div class="song-diff-card ${cardClass}" data-id="${item.id}">
        <div class="card-top-row">
          <div class="card-title-group">
            <span class="song-id-badge">ID #${item.id}</span>
            <span class="song-title-main">${escapeHtml(song.name || 'Untitled Song')}</span>
            ${song.title2 ? `<span style="font-size: 13px; color: #94a3b8;">(${escapeHtml(song.title2)})</span>` : ''}
            ${song.cat ? `<span class="song-category-pill">${escapeHtml(song.cat)}</span>` : ''}
            ${typeBadge}
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <button class="btn-primary btn-open-diff-modal" data-id="${item.id}" style="font-size: 12px; padding: 5px 12px; display: inline-flex; align-items: center; gap: 5px;">
              👁️ View Side-by-Side Diff
            </button>
          </div>
        </div>
        ${reasonTagHtml}
        ${snippetHtml}
      </div>
    `;
  }

  function extractFirstLines(lyrics, maxLines = 2) {
    if (!lyrics) return '';
    const clean = lyrics.replace(/<slide>/gi, ' \n ').replace(/<BR>/gi, ' \n ').replace(/<[^>]+>/g, ' ');
    const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
    return lines.slice(0, maxLines).join(' / ');
  }

  function renderPagination(totalItems, totalPages) {
    el.footerInfo.textContent = `Total: ${totalItems.toLocaleString()} items`;

    if (totalPages <= 1) {
      el.footerPagination.innerHTML = '';
      return;
    }

    el.footerPagination.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <button class="btn-secondary" id="btn-page-prev" ${currentPage <= 1 ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px;">&larr; Prev</button>
        <span style="font-size: 12px; color: #cbd5e1;">Page <strong>${currentPage}</strong> of <strong>${totalPages}</strong></span>
        <button class="btn-secondary" id="btn-page-next" ${currentPage >= totalPages ? 'disabled' : ''} style="padding: 4px 10px; font-size: 12px;">Next &rarr;</button>
      </div>
    `;

    document.getElementById('btn-page-prev')?.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        renderWorkspace();
      }
    });

    document.getElementById('btn-page-next')?.addEventListener('click', () => {
      if (currentPage < totalPages) {
        currentPage++;
        renderWorkspace();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Diff Modal Popup (Full Lyrics & Metadata Side-by-Side)
  // ---------------------------------------------------------------------------
  function openDiffModal(songId) {
    currentModalSongId = songId;
    const songA = dbA.songs.get(songId) || null;
    const songB = dbB.songs.get(songId) || null;

    if (!songA && !songB) return;

    const mainSong = songB || songA;
    el.modalTitle.innerHTML = `ID #${songId} — ${escapeHtml(mainSong.name)}`;

    // Build Badges
    const isAdded = !songA && !!songB;
    const isRemoved = !!songA && !songB;
    const isModified = !!songA && !!songB;

    let badgeHtml = '';
    if (isAdded) badgeHtml = `<span class="badge-diff badge-added">➕ Added in DB B</span>`;
    else if (isRemoved) badgeHtml = `<span class="badge-diff badge-removed">➖ Removed from DB B</span>`;
    else badgeHtml = `<span class="badge-diff badge-modified">Δ Modified</span>`;

    el.modalBadgeGroup.innerHTML = badgeHtml;

    // Metadata comparison strip
    renderModalMetadataStrip(songA, songB);

    // Full Lyrics side-by-side diff
    renderModalLyricsDiff(songA, songB);

    el.modalOverlay.style.display = 'flex';
  }

  function closeDiffModal() {
    el.modalOverlay.style.display = 'none';
    currentModalSongId = null;
  }

  function renderModalMetadataStrip(songA, songB) {
    const fields = [
      { key: 'cat', label: 'Category' },
      { key: 'font', label: 'Font' },
      { key: 'key', label: 'Key' },
      { key: 'notes', label: 'Notes' },
      { key: 'title2', label: 'Title 2' }
    ];

    el.modalMetaStrip.innerHTML = fields.map(f => {
      const valA = songA ? (songA[f.key] || '—') : '—';
      const valB = songB ? (songB[f.key] || '—') : '—';
      const isDiff = valA !== valB;

      return `
        <div style="background: ${isDiff ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.03)'}; border: 1px solid ${isDiff ? '#f59e0b' : '#334155'}; padding: 4px 10px; border-radius: 6px;">
          <strong style="color: #94a3b8;">${escapeHtml(f.label)}:</strong> 
          ${isDiff ? `<span style="color: #fca5a5; text-decoration: line-through;">${escapeHtml(valA)}</span> &rarr; <span style="color: #6ee7b7; font-weight: 700;">${escapeHtml(valB)}</span>` : `<span style="color: #cbd5e1;">${escapeHtml(valA)}</span>`}
        </div>
      `;
    }).join('');
  }

  function renderModalLyricsDiff(songA, songB) {
    const rawLyricsA = songA ? songA.lyrics : '';
    const rawLyricsB = songB ? songB.lyrics : '';

    const slidesA = rawLyricsA ? rawLyricsA.split(/<slide>/i) : [];
    const slidesB = rawLyricsB ? rawLyricsB.split(/<slide>/i) : [];
    const maxSlides = Math.max(slidesA.length, slidesB.length);

    let leftPaneHtml = '';
    let rightPaneHtml = '';

    for (let s = 0; s < maxSlides; s++) {
      const slideTextA = slidesA[s] || '';
      const slideTextB = slidesB[s] || '';

      const wordDiff = computeWordDiff(slideTextA, slideTextB);

      // Render Left (DB A - showing removals)
      let slideContentA = '';
      if (slideTextA) {
        slideContentA = wordDiff.filter(d => d.type !== 'add').map(d => {
          if (d.type === 'del') {
            return `<span class="diff-del-word">${escapeHtml(d.text)}</span>`;
          }
          if (d.text === '<BR>' || d.text === '<br>') {
            return '<br>';
          }
          return escapeHtml(d.text);
        }).join('');
      } else {
        slideContentA = '<em style="color: #64748b;">(Slide does not exist in Database A)</em>';
      }

      leftPaneHtml += `
        <div class="diff-slide-block">
          <div class="diff-slide-header">
            <span>SLIDE ${s + 1}</span>
            <span style="font-size: 10px; color: #64748b;">DB A</span>
          </div>
          <div class="diff-line">${slideContentA}</div>
        </div>
      `;

      // Render Right (DB B - showing additions)
      let slideContentB = '';
      if (slideTextB) {
        slideContentB = wordDiff.filter(d => d.type !== 'del').map(d => {
          if (d.type === 'add') {
            return `<span class="diff-add-word">${escapeHtml(d.text)}</span>`;
          }
          if (d.text === '<BR>' || d.text === '<br>') {
            return '<br>';
          }
          return escapeHtml(d.text);
        }).join('');
      } else {
        slideContentB = '<em style="color: #64748b;">(Slide does not exist in Database B)</em>';
      }

      rightPaneHtml += `
        <div class="diff-slide-block">
          <div class="diff-slide-header">
            <span>SLIDE ${s + 1}</span>
            <span style="font-size: 10px; color: #64748b;">DB B</span>
          </div>
          <div class="diff-line">${slideContentB}</div>
        </div>
      `;
    }

    el.modalDiffBody.innerHTML = `
      <div class="diff-pane" id="diff-pane-a">
        <div class="diff-pane-header">
          <span style="color: #38bdf8;">Database A: ${escapeHtml(dbA.name)}</span>
          <span style="font-size: 11px; color: #94a3b8;">${slidesA.length} Slides</span>
        </div>
        ${leftPaneHtml}
      </div>
      <div class="diff-pane" id="diff-pane-b">
        <div class="diff-pane-header">
          <span style="color: #c084fc;">Database B: ${escapeHtml(dbB.name)}</span>
          <span style="font-size: 11px; color: #94a3b8;">${slidesB.length} Slides</span>
        </div>
        ${rightPaneHtml}
      </div>
    `;

    // Synchronized scrolling
    const paneA = document.getElementById('diff-pane-a');
    const paneB = document.getElementById('diff-pane-b');
    let isSyncingA = false;
    let isSyncingB = false;

    paneA.addEventListener('scroll', () => {
      if (!isSyncingA) {
        isSyncingB = true;
        paneB.scrollTop = paneA.scrollTop;
      }
      isSyncingA = false;
    });

    paneB.addEventListener('scroll', () => {
      if (!isSyncingB) {
        isSyncingA = true;
        paneA.scrollTop = paneB.scrollTop;
      }
      isSyncingB = false;
    });
  }

  function navigateModalChange(direction) {
    if (!comparisonResults) return;
    const items = getFilteredItems();
    if (items.length === 0) return;

    const currentIndex = items.findIndex(item => item.id === currentModalSongId);
    let nextIndex = 0;

    if (direction === 'next') {
      nextIndex = currentIndex >= items.length - 1 ? 0 : currentIndex + 1;
    } else {
      nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
    }

    openDiffModal(items[nextIndex].id);
  }

  // ---------------------------------------------------------------------------
  // Export Report
  // ---------------------------------------------------------------------------
  function exportReportHtml() {
    if (!comparisonResults) {
      showToast('No comparison data to export', 'warn');
      return;
    }

    const { stats, added, removed, modified } = comparisonResults;
    const now = new Date().toLocaleString();

    let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Song Database Comparison Report - VerseView</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #090e1a; color: #f8fafc; padding: 24px; }
    h1 { color: #38bdf8; font-size: 22px; }
    .meta { color: #94a3b8; font-size: 13px; margin-bottom: 24px; }
    .stats { display: flex; gap: 16px; margin-bottom: 24px; }
    .stat-card { background: #1e293b; padding: 12px 18px; border-radius: 8px; border: 1px solid #334155; }
    .stat-val { font-size: 20px; font-weight: 800; color: #fff; }
    .stat-lbl { font-size: 11px; color: #94a3b8; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
    th, td { border: 1px solid #334155; padding: 8px 12px; text-align: left; }
    th { background: #0f172a; color: #cbd5e1; }
    .tag-added { color: #34d399; font-weight: bold; }
    .tag-removed { color: #f87171; font-weight: bold; }
    .tag-modified { color: #fbbf24; font-weight: bold; }
  </style>
</head>
<body>
  <h1>VerseView Song Database Comparison Audit Report</h1>
  <div class="meta">Generated: ${now} | DB A: ${escapeHtml(dbA.name)} (${stats.totalA} songs) vs DB B: ${escapeHtml(dbB.name)} (${stats.totalB} songs)</div>
  <div class="stats">
    <div class="stat-card"><div class="stat-val">${stats.addedCount}</div><div class="stat-lbl">Added</div></div>
    <div class="stat-card"><div class="stat-val">${stats.removedCount}</div><div class="stat-lbl">Removed</div></div>
    <div class="stat-card"><div class="stat-val">${stats.modifiedCount}</div><div class="stat-lbl">Modified</div></div>
    <div class="stat-card"><div class="stat-val">${stats.unchangedCount}</div><div class="stat-lbl">Unchanged</div></div>
  </div>
  <h2>Detailed Differences (${stats.totalDiffs} total)</h2>
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Type</th>
        <th>Title (DB A &rarr; DB B)</th>
        <th>Category</th>
        <th>Details / Reason</th>
      </tr>
    </thead>
    <tbody>
      ${[...added, ...removed, ...modified].map(item => {
        const titleA = item.songA ? item.songA.name : '—';
        const titleB = item.songB ? item.songB.name : '—';
        const cat = (item.songB || item.songA).cat || '—';
        let detail = item.changes.join(', ');
        if (item.removalReason) detail = item.removalReason.tag;
        return `
          <tr>
            <td>#${item.id}</td>
            <td class="tag-${item.type}">${item.type.toUpperCase()}</td>
            <td>${escapeHtml(titleA)} ${titleA !== titleB && titleB !== '—' ? `&rarr; <strong>${escapeHtml(titleB)}</strong>` : ''}</td>
            <td>${escapeHtml(cat)}</td>
            <td>${escapeHtml(detail)}</td>
          </tr>
        `;
      }).join('')}
    </tbody>
  </table>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `VerseView_DB_Comparison_${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Report downloaded as HTML', 'success');
  }

  function exportReportJson() {
    if (!comparisonResults) {
      showToast('No comparison data to export', 'warn');
      return;
    }

    const payload = {
      timestamp: new Date().toISOString(),
      databaseA: { name: dbA.name, total: dbA.songs.size },
      databaseB: { name: dbB.name, total: dbB.songs.size },
      statistics: comparisonResults.stats,
      added: comparisonResults.added.map(i => ({ id: i.id, title: i.songB.name, cat: i.songB.cat })),
      removed: comparisonResults.removed.map(i => ({ id: i.id, title: i.songA.name, cat: i.songA.cat, reason: i.removalReason })),
      modified: comparisonResults.modified.map(i => ({ id: i.id, titleA: i.songA.name, titleB: i.songB.name, changes: i.changes }))
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `VerseView_DB_Comparison_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Report downloaded as JSON', 'success');
  }

  // ---------------------------------------------------------------------------
  // Event Handlers & File Upload Listeners
  // ---------------------------------------------------------------------------
  async function handleFileUpload(file, target) {
    if (!file) return;
    try {
      showToast(`Loading ${file.name}...`, 'info');
      const buffer = await file.arrayBuffer();
      const parsed = await parseSongsDatabase(buffer, file.name);

      if (target === 'A') {
        dbA.file = file;
        dbA.name = file.name;
        dbA.songs = parsed.songsMap;
        dbA.list = parsed.songsList;
        dbA.size = file.size;

        el.dropA.classList.add('loaded');
        el.titleA.textContent = file.name;
        el.subA.innerHTML = `<span>📊 ${parsed.totalCount.toLocaleString()} songs</span> • <span>💾 ${formatBytes(file.size)}</span>`;
      } else {
        dbB.file = file;
        dbB.name = file.name;
        dbB.songs = parsed.songsMap;
        dbB.list = parsed.songsList;
        dbB.size = file.size;

        el.dropB.classList.add('loaded-b');
        el.titleB.textContent = file.name;
        el.subB.innerHTML = `<span>📊 ${parsed.totalCount.toLocaleString()} songs</span> • <span>💾 ${formatBytes(file.size)}</span>`;
      }

      showToast(`Loaded ${parsed.totalCount} songs from ${file.name}`, 'success');
      runComparison();
    } catch (err) {
      console.error('Error parsing database file:', err);
      showToast('Failed to parse SQLite file: ' + err.message, 'error');
    }
  }

  async function loadServerDb(target) {
    try {
      showToast('Fetching active server songs.db...', 'info');
      const res = await fetch('/data/songs.db');
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + res.statusText);

      const buffer = await res.arrayBuffer();
      const parsed = await parseSongsDatabase(buffer, 'Server songs.db');

      if (target === 'A') {
        dbA.file = null;
        dbA.name = 'Server songs.db';
        dbA.songs = parsed.songsMap;
        dbA.list = parsed.songsList;
        dbA.size = buffer.byteLength;

        el.dropA.classList.add('loaded');
        el.titleA.textContent = 'Active Server songs.db';
        el.subA.innerHTML = `<span>📊 ${parsed.totalCount.toLocaleString()} songs</span> • <span>💾 ${formatBytes(buffer.byteLength)}</span>`;
      } else {
        dbB.file = null;
        dbB.name = 'Server songs.db';
        dbB.songs = parsed.songsMap;
        dbB.list = parsed.songsList;
        dbB.size = buffer.byteLength;

        el.dropB.classList.add('loaded-b');
        el.titleB.textContent = 'Active Server songs.db';
        el.subB.innerHTML = `<span>📊 ${parsed.totalCount.toLocaleString()} songs</span> • <span>💾 ${formatBytes(buffer.byteLength)}</span>`;
      }

      showToast(`Loaded ${parsed.totalCount} songs from server database`, 'success');
      runComparison();
    } catch (err) {
      console.error('Error fetching server database:', err);
      showToast('Could not load server songs.db: ' + err.message, 'error');
    }
  }

  function swapDatabases() {
    if (dbA.songs.size === 0 && dbB.songs.size === 0) {
      showToast('No databases loaded to swap', 'warn');
      return;
    }

    const temp = { ...dbA };
    dbA = { ...dbB };
    dbB = { ...temp };

    // Update UI headers
    el.titleA.textContent = dbA.name;
    el.subA.innerHTML = `<span>📊 ${dbA.songs.size.toLocaleString()} songs</span> • <span>💾 ${formatBytes(dbA.size)}</span>`;
    el.titleB.textContent = dbB.name;
    el.subB.innerHTML = `<span>📊 ${dbB.songs.size.toLocaleString()} songs</span> • <span>💾 ${formatBytes(dbB.size)}</span>`;

    el.dropA.classList.toggle('loaded', dbA.songs.size > 0);
    el.dropB.classList.toggle('loaded-b', dbB.songs.size > 0);

    showToast('Swapped Database A and Database B', 'info');
    runComparison();
  }

  function setupEventListeners() {
    // Dropzone A
    el.dropA.addEventListener('click', (e) => {
      if (e.target.closest('.btn-db-quick')) return;
      el.fileInputA.click();
    });
    el.fileInputA.addEventListener('change', (e) => {
      if (e.target.files[0]) handleFileUpload(e.target.files[0], 'A');
    });
    el.btnLoadServerA.addEventListener('click', (e) => {
      e.stopPropagation();
      loadServerDb('A');
    });

    // Dropzone B
    el.dropB.addEventListener('click', (e) => {
      if (e.target.closest('.btn-db-quick')) return;
      el.fileInputB.click();
    });
    el.fileInputB.addEventListener('change', (e) => {
      if (e.target.files[0]) handleFileUpload(e.target.files[0], 'B');
    });
    el.btnLoadServerB.addEventListener('click', (e) => {
      e.stopPropagation();
      loadServerDb('B');
    });

    // Drag and Drop
    [el.dropA, el.dropB].forEach((dropzone, idx) => {
      const target = idx === 0 ? 'A' : 'B';
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('drag-over');
      });
      dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('drag-over');
      });
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
        if (e.dataTransfer.files[0]) handleFileUpload(e.dataTransfer.files[0], target);
      });
    });

    // Swap Button
    el.btnSwapDbs.addEventListener('click', swapDatabases);

    // Summary Tabs
    const tabs = [
      { element: el.tabAll, id: 'all' },
      { element: el.tabAdded, id: 'added' },
      { element: el.tabRemoved, id: 'removed' },
      { element: el.tabModified, id: 'modified' },
      { element: el.tabUnchanged, id: 'unchanged' }
    ];

    tabs.forEach(t => {
      t.element.addEventListener('click', () => {
        tabs.forEach(item => item.element.classList.remove('active'));
        t.element.classList.add('active');
        activeTab = t.id;
        activeSubFilter = 'all';
        currentPage = 1;
        renderFilterChips();
        renderWorkspace();
      });
    });

    // Search Input
    el.searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      currentPage = 1;
      renderWorkspace();
    });

    // Modal Events
    el.modalCloseBtn.addEventListener('click', closeDiffModal);
    const returnBtnTop = document.getElementById('btn-return-diff-modal');
    if (returnBtnTop) returnBtnTop.addEventListener('click', closeDiffModal);
    const returnBtnBottom = document.getElementById('btn-bottom-return-diff');
    if (returnBtnBottom) returnBtnBottom.addEventListener('click', closeDiffModal);

    el.modalOverlay.addEventListener('click', (e) => {
      if (e.target === el.modalOverlay) closeDiffModal();
    });

    el.btnPrevChange.addEventListener('click', () => navigateModalChange('prev'));
    el.btnNextChange.addEventListener('click', () => navigateModalChange('next'));

    window.addEventListener('keydown', (e) => {
      if (el.modalOverlay.style.display === 'flex') {
        if (e.key === 'Escape') closeDiffModal();
        if (e.key === 'ArrowLeft') navigateModalChange('prev');
        if (e.key === 'ArrowRight') navigateModalChange('next');
      }
    });

    // Fullscreen Toggle
    const btnFullscreen = document.getElementById('btn-fullscreen-comparer');
    const textFullscreen = document.getElementById('fullscreen-text-comparer');
    if (btnFullscreen) {
      btnFullscreen.addEventListener('click', () => {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
          const docEl = document.documentElement;
          if (docEl.requestFullscreen) docEl.requestFullscreen().catch(() => {});
          else if (docEl.webkitRequestFullscreen) docEl.webkitRequestFullscreen();
        } else {
          if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        }
      });

      const updateFsState = () => {
        const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
        btnFullscreen.title = isFs ? 'Exit Fullscreen Mode (Esc)' : 'Toggle Fullscreen Mode';
        if (textFullscreen) textFullscreen.textContent = isFs ? 'Exit Full' : 'Fullscreen';
        btnFullscreen.classList.toggle('active', isFs);
      };

      document.addEventListener('fullscreenchange', updateFsState);
      document.addEventListener('webkitfullscreenchange', updateFsState);
    }

    // Export Buttons
    el.btnExportReport.addEventListener('click', exportReportHtml);
    el.btnExportJson.addEventListener('click', exportReportJson);
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    initElements();
    setupEventListeners();
    renderFilterChips();
    renderWorkspace();

    // Auto-load sql.js in background so first comparison is instant
    initSql().catch(err => console.log('sql.js background prep:', err.message));
  });

})();
