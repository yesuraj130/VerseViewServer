/**
 * Duplicate Songs Remover & Song Quality Suite
 * Client-Side Engine
 */

(function() {
  'use strict';

  // State
  let currentActiveTab = 'exact'; // 'exact' | 'diffTitle' | 'similar' | 'errors' | 'bamini'
  let summaryData = null;
  let exactData = null;
  let diffTitleData = null;
  let similarData = null;
  let errorsData = null;
  let baminiData = null;

  let selectedIdsForDelete = new Set();
  let currentBaminiReviewIndex = 0;
  let isEditingBaminiLyrics = false;
  let showBaminiRawKeys = false;
  let similarThreshold = 70;
  let errorCategoryFilter = 'all';
  let searchTerm = '';

  // Pagination state
  let exactPage = 1;
  let diffTitlePage = 1;
  let similarPage = 1;
  let errorsPage = 1;
  const PAGE_SIZE = 25;

  // DOM Elements
  let elements = {};

  function initElements() {
    elements = {
      overlay: document.getElementById('cleaner-suite-overlay'),
      closeBtn: document.getElementById('btn-close-cleaner'),
      refreshBtn: document.getElementById('btn-refresh-cleaner'),
      optExact: document.getElementById('opt-btn-exact'),
      optDiffTitle: document.getElementById('opt-btn-diff-title'),
      optSimilar: document.getElementById('opt-btn-similar'),
      optErrors: document.getElementById('opt-btn-errors'),
      optBamini: document.getElementById('opt-btn-bamini'),

      badgeExact: document.getElementById('badge-count-exact'),
      badgeDiffTitle: document.getElementById('badge-count-diff-title'),
      badgeSimilar: document.getElementById('badge-count-similar'),
      badgeErrors: document.getElementById('badge-count-errors'),
      badgeBamini: document.getElementById('badge-count-bamini'),

      workspaceTitle: document.getElementById('cleaner-workspace-title'),
      workspaceSubtitle: document.getElementById('cleaner-workspace-subtitle'),
      searchInput: document.getElementById('cleaner-search-input'),
      toolbarActions: document.getElementById('cleaner-toolbar-actions'),
      listContainer: document.getElementById('cleaner-list-container'),
      footerLeft: document.getElementById('cleaner-footer-left'),
      footerRight: document.getElementById('cleaner-footer-right'),

      // Irreversible Confirmation Modal
      confirmModal: document.getElementById('cleaner-confirm-dialog'),
      confirmTitle: document.getElementById('confirm-dialog-title'),
      confirmMessage: document.getElementById('confirm-dialog-message'),
      confirmCount: document.getElementById('confirm-dialog-count'),
      btnConfirmCancel: document.getElementById('btn-confirm-cancel'),
      btnConfirmProceed: document.getElementById('btn-confirm-proceed'),

      // Edit Song Modal
      editModal: document.getElementById('cleaner-edit-song-modal'),
      editSongId: document.getElementById('edit-song-id'),
      editSongTitle: document.getElementById('edit-song-title'),
      editSongFont: document.getElementById('edit-song-font'),
      editSongCat: document.getElementById('edit-song-cat'),
      editSongLyrics: document.getElementById('edit-song-lyrics'),
      btnSaveEditSong: document.getElementById('btn-save-edit-song'),
      btnCloseEditSong: document.getElementById('btn-close-edit-song')
    };
  }

  // Toast notifications
  function showToast(message, type = 'success') {
    const existing = document.getElementById('cleaner-toast-notification');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'cleaner-toast-notification';
    toast.style.position = 'fixed';
    toast.style.bottom = '24px';
    toast.style.right = '24px';
    toast.style.background = type === 'error' ? '#ef4444' : type === 'warn' ? '#f59e0b' : '#10b981';
    toast.style.color = '#ffffff';
    toast.style.padding = '12px 20px';
    toast.style.borderRadius = '8px';
    toast.style.fontSize = '14px';
    toast.style.fontWeight = '600';
    toast.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.4)';
    toast.style.zIndex = '9999';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '8px';
    toast.innerHTML = (type === 'error' ? '⚠️ ' : '✅ ') + escapeHtml(message);

    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Convert raw database lyrics (<BR>, <slide>) to human-editable text
  // Each slide separated by 2 blank lines (\n\n\n), each line separated by \n
  function lyricsToTextareaValue(lyricsStr) {
    if (!lyricsStr) return '';
    const slides = lyricsStr.split(/<slide>/i).filter(s => s.trim().length > 0);
    if (slides.length === 0) {
      return lyricsStr.replace(/<br\s*\/?>/gi, '\n').trim();
    }
    return slides.map(s => {
      return s.replace(/<br\s*\/?>/gi, '\n').trim();
    }).join('\n\n\n');
  }

  // Convert human-edited text (2 blank lines between slides, \n between lines) to database format (<BR>, <slide>)
  function textareaValueToLyrics(rawText) {
    if (!rawText || !rawText.trim()) return '';
    const text = rawText.trim();
    if (text.includes('<slide>')) {
      return text;
    }
    // Slides are separated by 2 or more blank lines (two line spacer: \n\n\n+)
    const sections = text.split(/\r?\n(?:\s*\r?\n){2,}/);
    const slides = sections
      .map(sec => sec.trim())
      .filter(Boolean)
      .map(sec => {
        const lines = sec.split(/\r?\n/).map(l => l.trim());
        while (lines.length > 0 && !lines[0]) lines.shift();
        while (lines.length > 0 && !lines[lines.length - 1]) lines.pop();
        return lines.join('<BR>');
      })
      .filter(Boolean);

    if (slides.length === 0) return '';
    return slides.join('<slide>') + '<slide>';
  }

  // Format lyrics for preview display: 2 blank lines between slides, clean line breaks, optional Unicode highlight
  function formatSongLyricsForDisplay(lyricsStr, highlightUnicode = false) {
    if (!lyricsStr) return '';
    const slides = lyricsStr.split(/<slide>/i).filter(s => s.trim().length > 0);
    if (slides.length === 0) {
      let clean = escapeHtml(lyricsStr.replace(/<br\s*\/?>/gi, '\n').trim());
      if (highlightUnicode) {
        clean = clean.replace(/([\u0B80-\u0BFF]+)/g, '<mark class="hl-unicode-text" style="background: rgba(16, 185, 129, 0.28); color: #34d399; padding: 1px 5px; border-radius: 4px; border: 1px solid rgba(16, 185, 129, 0.45); font-weight: 600; font-family: \'Baloo Thambi\', sans-serif;" title="Unicode Tamil Text">$1</mark>');
      }
      return clean;
    }
    return slides.map(slide => {
      const lines = slide.split(/<br\s*\/?>/gi).map(l => l.trim());
      while (lines.length > 0 && !lines[0]) lines.shift();
      while (lines.length > 0 && !lines[lines.length - 1]) lines.pop();
      return lines.map(line => {
        let escaped = escapeHtml(line);
        if (highlightUnicode) {
          escaped = escaped.replace(/([\u0B80-\u0BFF]+)/g, '<mark class="hl-unicode-text" style="background: rgba(16, 185, 129, 0.28); color: #34d399; padding: 1px 5px; border-radius: 4px; border: 1px solid rgba(16, 185, 129, 0.45); font-weight: 600; font-family: \'Baloo Thambi\', sans-serif;" title="Unicode Tamil Text">$1</mark>');
        }
        return escaped;
      }).join('\n');
    }).join('\n\n\n');
  }

  // Load summary for badges
  async function loadSummary(forceRefresh = false) {
    try {
      const res = await fetch(`/api/songs-cleaner/summary${forceRefresh ? '?refresh=true' : ''}`);
      summaryData = await res.json();
      if (elements.badgeExact) {
        elements.badgeExact.textContent = `${summaryData.exactDuplicateSongs || 0} copies`;
      }
      if (elements.badgeDiffTitle) {
        elements.badgeDiffTitle.textContent = `${summaryData.diffTitleDuplicateSongs || 0} copies`;
      }
      if (elements.badgeBamini) {
        elements.badgeBamini.textContent = `${summaryData.baminiClean || 0} ready / ${summaryData.baminiSuspicious || 0} review`;
      }
      const subtitleEl = document.querySelector('.cleaner-subtitle');
      if (subtitleEl && summaryData.totalSongs) {
        subtitleEl.textContent = `VerseView Database Maintenance • ${Number(summaryData.totalSongs).toLocaleString()} Songs in Database`;
      }
    } catch (err) {
      console.warn('Could not load summary:', err);
    }
  }

  // Switch Active Tab
  function switchTab(tabKey) {
    currentActiveTab = tabKey;
    selectedIdsForDelete.clear();
    searchTerm = '';
    exactPage = 1;
    diffTitlePage = 1;
    similarPage = 1;
    errorsPage = 1;
    if (elements.searchInput) elements.searchInput.value = '';

    // Update active tab buttons
    [elements.optExact, elements.optDiffTitle, elements.optSimilar, elements.optErrors, elements.optBamini].forEach(el => {
      if (el) el.classList.remove('active');
    });

    if (tabKey === 'exact' && elements.optExact) elements.optExact.classList.add('active');
    if (tabKey === 'diffTitle' && elements.optDiffTitle) elements.optDiffTitle.classList.add('active');
    if (tabKey === 'similar' && elements.optSimilar) elements.optSimilar.classList.add('active');
    if (tabKey === 'errors' && elements.optErrors) elements.optErrors.classList.add('active');
    if (tabKey === 'bamini' && elements.optBamini) elements.optBamini.classList.add('active');

    renderActiveView();
  }

  // Helper to build a clean, responsive pagination control
  function buildPaginationHtml(totalItems, currentPage, pageSize, idPrefix) {
    const totalPages = Math.ceil(totalItems / pageSize);
    if (totalPages <= 1) return '';
    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, totalItems);

    let options = '';
    for (let p = 1; p <= totalPages; p++) {
      options += `<option value="${p}" ${p === currentPage ? 'selected' : ''}>Page ${p} of ${totalPages}</option>`;
    }

    return `
      <div class="cleaner-pagination-bar">
        <div class="cleaner-pagination-info">
          Showing <strong>${start}–${end}</strong> of <strong>${totalItems}</strong> entries (Page <strong>${currentPage}</strong> of <strong>${totalPages}</strong>)
        </div>
        <div class="cleaner-pagination-buttons">
          <button class="cleaner-page-btn" id="${idPrefix}-first" ${currentPage <= 1 ? 'disabled' : ''} title="First Page">&laquo; First</button>
          <button class="cleaner-page-btn" id="${idPrefix}-prev" ${currentPage <= 1 ? 'disabled' : ''}>&larr; Prev</button>
          <select class="cleaner-search-input" id="${idPrefix}-select" style="min-width: 120px; padding: 4px 8px; font-size: 12px;">
            ${options}
          </select>
          <button class="cleaner-page-btn" id="${idPrefix}-next" ${currentPage >= totalPages ? 'disabled' : ''}>Next &rarr;</button>
          <button class="cleaner-page-btn" id="${idPrefix}-last" ${currentPage >= totalPages ? 'disabled' : ''} title="Last Page">Last &raquo;</button>
        </div>
      </div>
    `;
  }

  function attachPaginationEvents(idPrefix, currentPage, totalPages, onPageChange) {
    const firstBtn = document.getElementById(`${idPrefix}-first`);
    const prevBtn = document.getElementById(`${idPrefix}-prev`);
    const nextBtn = document.getElementById(`${idPrefix}-next`);
    const lastBtn = document.getElementById(`${idPrefix}-last`);
    const select = document.getElementById(`${idPrefix}-select`);

    if (firstBtn) firstBtn.onclick = () => onPageChange(1);
    if (prevBtn) prevBtn.onclick = () => { if (currentPage > 1) onPageChange(currentPage - 1); };
    if (nextBtn) nextBtn.onclick = () => { if (currentPage < totalPages) onPageChange(currentPage + 1); };
    if (lastBtn) lastBtn.onclick = () => onPageChange(totalPages);
    if (select) select.onchange = (e) => onPageChange(Number(e.target.value));
  }

  // Render the currently selected option view
  async function renderActiveView() {
    elements.listContainer.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; color: #94a3b8;">
        <div style="font-size: 36px; margin-bottom: 12px; animation: spin 1s linear infinite;">⏳</div>
        <div style="font-size: 16px; font-weight: 600; color: #ffffff;">Analyzing songs database...</div>
        <div style="font-size: 13px; margin-top: 6px;">Scanning 3,629+ hymns and songs</div>
      </div>
    `;
    elements.footerLeft.innerHTML = '';
    elements.footerRight.innerHTML = '';

    if (currentActiveTab === 'exact') {
      await renderExactDuplicates();
    } else if (currentActiveTab === 'diffTitle') {
      await renderDiffTitleDuplicates();
    } else if (currentActiveTab === 'similar') {
      await renderSimilarDuplicates();
    } else if (currentActiveTab === 'errors') {
      await renderSongErrors();
    } else if (currentActiveTab === 'bamini') {
      await renderBaminiConverter();
    }
  }

  // ---------------------------------------------------------------------------
  // 1. Exact Duplicates (Same Title & Same Content)
  // ---------------------------------------------------------------------------
  async function renderExactDuplicates(forceRefresh = false) {
    elements.workspaceTitle.textContent = 'Exact Duplicate Songs';
    elements.workspaceSubtitle.textContent = 'Songs with identical title and identical lyrics content. Keep 1 copy and delete extra duplicate copies.';

    try {
      if (!exactData || forceRefresh) {
        const res = await fetch(`/api/songs-cleaner/exact-duplicates${forceRefresh ? '?refresh=true' : ''}`);
        exactData = await res.json();
      }

      // Pre-select duplicates (skip the first keeper in each group)
      selectedIdsForDelete.clear();
      exactData.groups.forEach(group => {
        group.songs.slice(1).forEach(s => selectedIdsForDelete.add(s.id));
      });

      renderExactList();
    } catch (err) {
      elements.listContainer.innerHTML = `<div style="color:#ef4444; padding:30px; text-align:center;">Failed to load exact duplicates: ${escapeHtml(err.message)}</div>`;
    }
  }

  function renderExactList() {
    const term = (searchTerm || '').trim().toLowerCase();
    const filteredGroups = exactData.groups.filter(g => {
      if (!term) return true;
      return (g.title || '').toLowerCase().includes(term) || (g.preview || '').toLowerCase().includes(term);
    });

    const totalPages = Math.ceil(filteredGroups.length / PAGE_SIZE) || 1;
    if (exactPage > totalPages) exactPage = totalPages;
    if (exactPage < 1) exactPage = 1;

    const startIdx = (exactPage - 1) * PAGE_SIZE;
    const pageGroups = filteredGroups.slice(startIdx, startIdx + PAGE_SIZE);

    // Toolbar
    elements.toolbarActions.innerHTML = `
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <button id="btn-select-all-exact" class="btn-secondary" style="font-size: 12px; padding: 6px 12px;">Select All Duplicates (${exactData.totalDuplicateSongs})</button>
        <button id="btn-select-page-exact" class="btn-secondary" style="font-size: 12px; padding: 6px 12px;">Select Current Page</button>
        <button id="btn-deselect-all-exact" class="btn-secondary" style="font-size: 12px; padding: 6px 12px;">Deselect All</button>
      </div>
    `;

    document.getElementById('btn-select-all-exact').onclick = () => {
      exactData.groups.forEach(g => g.songs.slice(1).forEach(s => selectedIdsForDelete.add(s.id)));
      renderExactList();
      showToast(`Selected all ${selectedIdsForDelete.size} duplicate copies`);
    };

    document.getElementById('btn-select-page-exact').onclick = () => {
      pageGroups.forEach(g => g.songs.slice(1).forEach(s => selectedIdsForDelete.add(s.id)));
      renderExactList();
      showToast(`Selected duplicates on Page ${exactPage}`);
    };

    document.getElementById('btn-deselect-all-exact').onclick = () => {
      selectedIdsForDelete.clear();
      renderExactList();
      showToast('All selections cleared');
    };

    if (filteredGroups.length === 0) {
      elements.listContainer.innerHTML = `
        <div style="text-align:center; padding:60px; color:#94a3b8;">
          <div style="font-size: 40px; margin-bottom: 12px;">🎉</div>
          <div style="font-size: 16px; font-weight:700; color:#fff;">No Duplicates Matching Filter</div>
          <div style="font-size: 13px; margin-top: 4px;">Try searching for a different song or title.</div>
        </div>
      `;
      updateDeleteFooter(selectedIdsForDelete.size);
      return;
    }

    let html = '';
    pageGroups.forEach((group, pOffset) => {
      const gIdx = startIdx + pOffset;
      html += `
        <div class="duplicate-group-card">
          <div class="duplicate-group-header">
            <div class="group-header-info">
              <span style="font-size: 16px;">🎵</span>
              <span class="group-title">${escapeHtml(group.title)}</span>
              <span class="group-pill">${escapeHtml(group.category)}</span>
              <span class="group-pill" style="background: rgba(2, 132, 199, 0.2); color: #38bdf8;">${group.totalCopies} Total Copies</span>
            </div>
            <div style="font-size: 12px; color: #94a3b8;">Group #${gIdx + 1} of ${filteredGroups.length}</div>
          </div>
          <div>
      `;

      group.songs.forEach((song, sIdx) => {
        const isKeeper = sIdx === 0;
        const isChecked = selectedIdsForDelete.has(song.id);
        html += `
          <div class="duplicate-song-item ${isKeeper ? 'is-keeper' : ''} ${isChecked ? 'is-selected-for-delete' : ''}">
            <div class="song-checkbox-col">
              <input type="checkbox" id="chk-song-${song.id}" data-id="${song.id}" ${isChecked ? 'checked' : ''}>
            </div>
            <div class="song-details-col">
              <div class="song-meta-line">
                <span class="song-title-text">${escapeHtml(song.name || 'Untitled')}</span>
                <span style="font-size: 11px; color: #94a3b8;">[ID: ${song.id}]</span>
                <span style="font-size: 11px; color: #64748b;">• Font: ${escapeHtml(song.font || 'None')}</span>
                <span style="font-size: 11px; color: #64748b;">• ${song.slideCount} Slides</span>
                ${isKeeper ? '<span class="badge-keeper">⭐ Suggested Keeper</span>' : '<span class="badge-duplicate">Duplicate Copy</span>'}
              </div>
              <div class="song-preview-text">"${escapeHtml(song.preview || 'No preview text')}"</div>
            </div>
            <div>
              <button class="btn-secondary btn-preview-song" data-id="${song.id}" style="font-size: 11px; padding: 4px 8px;">Preview Slides</button>
            </div>
          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    });

    html += buildPaginationHtml(filteredGroups.length, exactPage, PAGE_SIZE, 'exact-pg');

    elements.listContainer.innerHTML = html;

    // Attach pagination events
    attachPaginationEvents('exact-pg', exactPage, totalPages, (newPage) => {
      exactPage = newPage;
      renderExactList();
      elements.listContainer.scrollTop = 0;
    });

    // Attach checkbox events
    elements.listContainer.querySelectorAll('input[type="checkbox"]').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const id = Number(e.target.dataset.id);
        if (e.target.checked) {
          selectedIdsForDelete.add(id);
        } else {
          selectedIdsForDelete.delete(id);
        }
        updateDeleteFooter(selectedIdsForDelete.size);
        const itemRow = e.target.closest('.duplicate-song-item');
        if (itemRow) {
          itemRow.classList.toggle('is-selected-for-delete', e.target.checked);
        }
      });
    });

    // Attach preview events
    elements.listContainer.querySelectorAll('.btn-preview-song').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = Number(e.target.dataset.id);
        openPreviewSlideModal(id);
      });
    });

    updateDeleteFooter(selectedIdsForDelete.size);
  }

  // ---------------------------------------------------------------------------
  // 2. Duplicate Songs with Different Title
  // ---------------------------------------------------------------------------
  async function renderDiffTitleDuplicates(forceRefresh = false) {
    elements.workspaceTitle.textContent = 'Duplicate Songs with Different Title';
    elements.workspaceSubtitle.textContent = 'These songs have identical lyrics content, but different titles. Select which title(s) to keep. Checked items will be deleted.';

    try {
      if (!diffTitleData || forceRefresh) {
        const res = await fetch(`/api/songs-cleaner/diff-title-duplicates${forceRefresh ? '?refresh=true' : ''}`);
        diffTitleData = await res.json();
      }

      // Pre-select secondary titles for deletion
      selectedIdsForDelete.clear();
      diffTitleData.groups.forEach(g => {
        g.songs.slice(1).forEach(s => selectedIdsForDelete.add(s.id));
      });

      renderDiffTitleList();
    } catch (err) {
      elements.listContainer.innerHTML = `<div style="color:#ef4444; padding:30px; text-align:center;">Failed to load diff-title duplicates: ${escapeHtml(err.message)}</div>`;
    }
  }

  function renderDiffTitleList() {
    const term = (searchTerm || '').trim().toLowerCase();
    const filteredGroups = diffTitleData.groups.filter(g => {
      if (!term) return true;
      const titleMatch = g.titlesList.some(t => t.toLowerCase().includes(term));
      return titleMatch || (g.contentPreview || '').toLowerCase().includes(term);
    });

    const totalPages = Math.ceil(filteredGroups.length / PAGE_SIZE) || 1;
    if (diffTitlePage > totalPages) diffTitlePage = totalPages;
    if (diffTitlePage < 1) diffTitlePage = 1;

    const startIdx = (diffTitlePage - 1) * PAGE_SIZE;
    const pageGroups = filteredGroups.slice(startIdx, startIdx + PAGE_SIZE);

    // Toolbar
    elements.toolbarActions.innerHTML = `
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <button id="btn-select-secondary-diff" class="btn-secondary" style="font-size: 12px; padding: 6px 12px;">Select All Secondary Titles (${diffTitleData.totalSecondaryTitles})</button>
        <button id="btn-select-page-diff" class="btn-secondary" style="font-size: 12px; padding: 6px 12px;">Select Current Page</button>
        <button id="btn-deselect-all-diff" class="btn-secondary" style="font-size: 12px; padding: 6px 12px;">Deselect All</button>
      </div>
    `;

    document.getElementById('btn-select-secondary-diff').onclick = () => {
      diffTitleData.groups.forEach(g => g.songs.slice(1).forEach(s => selectedIdsForDelete.add(s.id)));
      renderDiffTitleList();
      showToast(`Selected all ${selectedIdsForDelete.size} secondary titles for deletion`);
    };

    document.getElementById('btn-select-page-diff').onclick = () => {
      pageGroups.forEach(g => g.songs.slice(1).forEach(s => selectedIdsForDelete.add(s.id)));
      renderDiffTitleList();
      showToast(`Selected secondary titles on Page ${diffTitlePage}`);
    };

    document.getElementById('btn-deselect-all-diff').onclick = () => {
      selectedIdsForDelete.clear();
      renderDiffTitleList();
      showToast('All selections cleared');
    };

    if (filteredGroups.length === 0) {
      elements.listContainer.innerHTML = `
        <div style="text-align:center; padding:60px; color:#94a3b8;">
          <div style="font-size: 40px; margin-bottom: 12px;">🎉</div>
          <div style="font-size: 16px; font-weight:700; color:#fff;">No Different-Title Duplicates Found</div>
          <div style="font-size: 13px; margin-top: 4px;">All song content is distinct across titles.</div>
        </div>
      `;
      updateDeleteFooter(selectedIdsForDelete.size);
      return;
    }

    let html = '';
    pageGroups.forEach((group, pOffset) => {
      const gIdx = startIdx + pOffset;
      html += `
        <div class="duplicate-group-card">
          <div class="duplicate-group-header">
            <div class="group-header-info">
              <span style="font-size: 16px;">🏷️</span>
              <span class="group-title">Same Lyrics, Differing Titles (${group.totalCopies} variants)</span>
              <span class="group-pill" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24;">${group.titlesList.length} Different Titles</span>
            </div>
            <div style="font-size: 12px; color: #94a3b8;">Cluster #${gIdx + 1} of ${filteredGroups.length}</div>
          </div>
          <div style="background: #0d1527; padding: 10px 18px; border-bottom: 1px solid #202d44; font-size: 12px; color: #94a3b8;">
            <strong>Lyrics Match:</strong> "${escapeHtml(group.contentPreview)}"
          </div>
          <div>
      `;

      group.songs.forEach((song, sIdx) => {
        const isKeeper = sIdx === 0;
        const isChecked = selectedIdsForDelete.has(song.id);
        html += `
          <div class="duplicate-song-item ${isKeeper ? 'is-keeper' : ''} ${isChecked ? 'is-selected-for-delete' : ''}">
            <div class="song-checkbox-col">
              <input type="checkbox" data-id="${song.id}" ${isChecked ? 'checked' : ''}>
            </div>
            <div class="song-details-col">
              <div class="song-meta-line">
                <span class="song-title-text" style="color: #60a5fa; font-size: 15px;">${escapeHtml(song.name)}</span>
                <span style="font-size: 11px; color: #94a3b8;">[ID: ${song.id}]</span>
                <span style="font-size: 11px; color: #64748b;">• Category: ${escapeHtml(song.cat)}</span>
                <span style="font-size: 11px; color: #64748b;">• Font: ${escapeHtml(song.font || 'None')}</span>
                ${isKeeper ? '<span class="badge-keeper">⭐ Keep This Title</span>' : '<span class="badge-duplicate">Delete This Title</span>'}
              </div>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn-secondary btn-keep-only-this" data-group-idx="${gIdx}" data-song-id="${song.id}" style="font-size: 11px; padding: 4px 8px;">Keep Only This</button>
              <button class="btn-secondary btn-preview-song" data-id="${song.id}" style="font-size: 11px; padding: 4px 8px;">Preview</button>
            </div>
          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    });

    html += buildPaginationHtml(filteredGroups.length, diffTitlePage, PAGE_SIZE, 'diff-pg');

    elements.listContainer.innerHTML = html;

    // Attach pagination events
    attachPaginationEvents('diff-pg', diffTitlePage, totalPages, (newPage) => {
      diffTitlePage = newPage;
      renderDiffTitleList();
      elements.listContainer.scrollTop = 0;
    });

    // Attach checkbox events
    elements.listContainer.querySelectorAll('input[type="checkbox"]').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const id = Number(e.target.dataset.id);
        if (e.target.checked) selectedIdsForDelete.add(id);
        else selectedIdsForDelete.delete(id);
        updateDeleteFooter(selectedIdsForDelete.size);
        const itemRow = e.target.closest('.duplicate-song-item');
        if (itemRow) itemRow.classList.toggle('is-selected-for-delete', e.target.checked);
      });
    });

    // "Keep Only This" button
    elements.listContainer.querySelectorAll('.btn-keep-only-this').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const gIdx = Number(e.target.dataset.groupIdx);
        const keepId = Number(e.target.dataset.songId);
        const grp = filteredGroups[gIdx];
        if (grp) {
          grp.songs.forEach(s => {
            if (s.id === keepId) selectedIdsForDelete.delete(s.id);
            else selectedIdsForDelete.add(s.id);
          });
          renderDiffTitleList();
        }
      });
    });

    // Preview
    elements.listContainer.querySelectorAll('.btn-preview-song').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = Number(e.target.dataset.id);
        openPreviewSlideModal(id);
      });
    });

    updateDeleteFooter(selectedIdsForDelete.size);
  }

  // ---------------------------------------------------------------------------
  // 3. Similar / Near-Duplicate Songs (Content more or less same)
  // ---------------------------------------------------------------------------

  // Helper: Compute word-level LCS diff between two text strings
  function computeWordLcsDiff(strA, strB) {
    if (!strA && !strB) return { resultA: [], resultB: [] };
    strA = strA || '';
    strB = strB || '';

    // Split into tokens preserving whitespace and punctuation
    const tokensA = strA.split(/(\s+|[.,;!?–—\-])/).filter(Boolean);
    const tokensB = strB.split(/(\s+|[.,;!?–—\-])/).filter(Boolean);

    // Support up to 2500 tokens so full verses and songs diff without clipping
    const m = Math.min(tokensA.length, 2500);
    const n = Math.min(tokensB.length, 2500);

    const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
    for (let i = 0; i < m; i++) {
      const aLower = tokensA[i].trim().toLowerCase();
      for (let j = 0; j < n; j++) {
        const bLower = tokensB[j].trim().toLowerCase();
        if (aLower === bLower) {
          dp[i + 1][j + 1] = dp[i][j] + 1;
        } else {
          dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
      }
    }

    let i = m, j = n;
    const resultA = [];
    const resultB = [];

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && tokensA[i - 1].trim().toLowerCase() === tokensB[j - 1].trim().toLowerCase()) {
        resultA.unshift({ text: tokensA[i - 1], diff: false });
        resultB.unshift({ text: tokensB[j - 1], diff: false });
        i--; j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        resultB.unshift({ text: tokensB[j - 1], diff: true, type: 'b' });
        j--;
      } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
        resultA.unshift({ text: tokensA[i - 1], diff: true, type: 'a' });
        i--;
      }
    }

    for (let k = m; k < tokensA.length; k++) {
      resultA.push({ text: tokensA[k], diff: true, type: 'a' });
    }
    for (let k = n; k < tokensB.length; k++) {
      resultB.push({ text: tokensB[k], diff: true, type: 'b' });
    }

    return { resultA, resultB };
  }

  function formatDiffTokensToHtml(tokens, type) {
    if (!tokens || tokens.length === 0) return '';
    return tokens.map(t => {
      const escaped = escapeHtml(t.text);
      if (!t.diff || !t.text.trim()) return escaped;
      const cssClass = type === 'a' ? 'diff-token-a' : 'diff-token-b';
      const label = type === 'a' ? 'Unique to Song A (will be lost if deleted)' : 'Unique to Song B (will be lost if deleted)';
      return `<mark class="${cssClass}" title="${label}">${escaped}</mark>`;
    }).join('');
  }

  function getCleanSlideList(rawLyrics, font) {
    if (!rawLyrics) return [];
    let text = String(rawLyrics);
    if (typeof isTamilBibleFont === 'function' && isTamilBibleFont(font)) {
      try {
        if (typeof baminiToUnicode === 'function') text = baminiToUnicode(text);
      } catch (e) {}
    }
    return text.split(/<slide>/gi).map(s => {
      return s.replace(/<br\s*\/?>/gi, '\n')
              .replace(/<[^>]+>/gi, '')
              .replace(/&nbsp;/gi, ' ')
              .trim();
    }).filter(s => s.length > 0);
  }

  function getPairRecommendation(songA, songB) {
    const slidesA = songA.slideCount || 0;
    const slidesB = songB.slideCount || 0;
    const lenA = (songA.rawLyrics || '').length;
    const lenB = (songB.rawLyrics || '').length;
    const isBaminiA = (songA.font || '').toLowerCase().includes('tamil bible');
    const isBaminiB = (songB.font || '').toLowerCase().includes('tamil bible');

    if (slidesA > slidesB) {
      return { keep: 'A', text: `💡 Keep Song A: Has +${slidesA - slidesB} more slide(s) / verses.` };
    }
    if (slidesB > slidesA) {
      return { keep: 'B', text: `💡 Keep Song B: Has +${slidesB - slidesA} more slide(s) / verses.` };
    }
    if (isBaminiB && !isBaminiA) {
      return { keep: 'A', text: `💡 Keep Song A: Already standard Unicode Tamil.` };
    }
    if (isBaminiA && !isBaminiB) {
      return { keep: 'B', text: `💡 Keep Song B: Already standard Unicode Tamil.` };
    }
    if (lenA > lenB + 30) {
      return { keep: 'A', text: `💡 Keep Song A: Longer lyrics (+${lenA - lenB} characters).` };
    }
    if (lenB > lenA + 30) {
      return { keep: 'B', text: `💡 Keep Song B: Longer lyrics (+${lenB - lenA} characters).` };
    }
    return { keep: null, text: `💡 Minor variations: Inspect highlighted differences to choose which to delete.` };
  }

  // Side-by-Side Verse-by-Verse and Full Lyrics Diff Modal
  function openSimilarDiffModal(pair, pIdx) {
    const sA = pair.songA;
    const sB = pair.songB;
    const slidesA = getCleanSlideList(sA.rawLyrics, sA.font);
    const slidesB = getCleanSlideList(sB.rawLyrics, sB.font);
    const maxSlides = Math.max(slidesA.length, slidesB.length, 1);
    const rec = getPairRecommendation(sA, sB);

    const modal = document.createElement('div');
    modal.className = 'cleaner-overlay';
    modal.style.zIndex = '2100';

    function updateModalButtons() {
      const isDelA = selectedIdsForDelete.has(sA.id);
      const isDelB = selectedIdsForDelete.has(sB.id);

      const btnA = modal.querySelector('.btn-diff-keep-a');
      const btnB = modal.querySelector('.btn-diff-keep-b');
      const btnBoth = modal.querySelector('.btn-diff-keep-both');

      if (btnA) {
        if (!isDelA && isDelB) {
          btnA.style.background = '#059669';
          btnA.style.borderColor = '#10b981';
          btnA.innerHTML = '✓ Song A Kept (B Deleted)';
        } else {
          btnA.style.background = '#1e293b';
          btnA.style.borderColor = '#334155';
          btnA.innerHTML = 'Keep Song A (Delete B)';
        }
      }

      if (btnB) {
        if (!isDelB && isDelA) {
          btnB.style.background = '#059669';
          btnB.style.borderColor = '#10b981';
          btnB.innerHTML = '✓ Song B Kept (A Deleted)';
        } else {
          btnB.style.background = '#1e293b';
          btnB.style.borderColor = '#334155';
          btnB.innerHTML = 'Keep Song B (Delete A)';
        }
      }

      if (btnBoth) {
        if (!isDelA && !isDelB) {
          btnBoth.style.background = '#0284c7';
          btnBoth.style.color = '#fff';
          btnBoth.innerHTML = '✓ Both Kept';
        } else {
          btnBoth.style.background = '#1e293b';
          btnBoth.style.color = '#cbd5e1';
          btnBoth.innerHTML = 'Keep Both';
        }
      }
    }

    // Full clean lyrics for Song A and Song B
    const fullTextA = slidesA.join('\n\n');
    const fullTextB = slidesB.join('\n\n');

    const diff = computeWordLcsDiff(fullTextA, fullTextB);
    const htmlA = formatDiffTokensToHtml(diff.resultA, 'a').replace(/\n/g, '<br>');
    const htmlB = formatDiffTokensToHtml(diff.resultB, 'b').replace(/\n/g, '<br>');

    modal.innerHTML = `
      <div class="diff-modal-window">
        <div class="diff-modal-header">
          <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
            <button type="button" class="btn-cleaner-nav btn-close-similar-diff" style="font-size: 11px; padding: 4px 10px;" title="Return to list (Esc)">&larr; <span class="nav-btn-text">Return</span></button>
            <h2 style="margin: 0; font-size: 15px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Full Song Lyrics Diff: Pair #${pIdx + 1}</h2>
            <span class="group-pill" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid #10b981; flex-shrink: 0;">
              ${pair.similarity}% Similar
            </span>
          </div>
          <div class="diff-modal-actions">
            <button type="button" class="btn-primary btn-diff-keep-a" style="font-size: 11px; padding: 5px 10px; border: 1px solid;">Keep Song A (Delete B)</button>
            <button type="button" class="btn-primary btn-diff-keep-b" style="font-size: 11px; padding: 5px 10px; border: 1px solid;">Keep Song B (Delete A)</button>
            <button type="button" class="btn-secondary btn-diff-keep-both" style="font-size: 11px; padding: 5px 10px;">Keep Both</button>
            <button type="button" class="cleaner-close-btn btn-close-diff-top" aria-label="Close" title="Close (Esc)">&times;</button>
          </div>
        </div>

        <div class="diff-modal-subbar">
          <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
            <div class="diff-recommendation" style="font-size: 12px;">${rec.text}</div>
            <div class="diff-pill-group">
              <span class="diff-pill">Length: A (${(sA.rawLyrics || '').length} chars) vs B (${(sB.rawLyrics || '').length} chars)</span>
              <span class="diff-pill">Slides: A (${slidesA.length}) vs B (${slidesB.length})</span>
              <span class="diff-pill">Font: A (${escapeHtml(sA.font || 'None')}) vs B (${escapeHtml(sB.font || 'None')})</span>
            </div>
          </div>
          <div class="diff-legend-strip">
            <div class="diff-legend-item">
              <div class="diff-legend-dot" style="background: #f59e0b;"></div>
              <span>Unique to Song A (amber)</span>
            </div>
            <div class="diff-legend-item">
              <div class="diff-legend-dot" style="background: #10b981;"></div>
              <span>Unique to Song B (green)</span>
            </div>
            <div class="diff-legend-item">
              <div class="diff-legend-dot" style="background: #64748b;"></div>
              <span>Identical</span>
            </div>
          </div>
        </div>

        <!-- Full Lyrics Side-by-Side (Auto-Fit Height) -->
        <div class="diff-full-compare-grid">
          <div class="diff-full-pane">
            <div class="diff-full-pane-header">
              <span style="font-size: 13px; font-weight: 700; color: #f59e0b;">
                Song A: ${escapeHtml(sA.name)} [ID: ${sA.id}]
              </span>
              <span style="font-size: 11px; color: #94a3b8;">
                ${slidesA.length} Slides • Font: ${escapeHtml(sA.font || 'Baloo Thambi')}
              </span>
            </div>
            <div class="diff-full-pane-content" id="diff-scroll-a">
              ${htmlA || '<span style="color: #64748b; font-style: italic;">(No lyrics)</span>'}
            </div>
          </div>

          <div class="diff-full-pane">
            <div class="diff-full-pane-header">
              <span style="font-size: 13px; font-weight: 700; color: #10b981;">
                Song B: ${escapeHtml(sB.name)} [ID: ${sB.id}]
              </span>
              <span style="font-size: 11px; color: #94a3b8;">
                ${slidesB.length} Slides • Font: ${escapeHtml(sB.font || 'Baloo Thambi')}
              </span>
            </div>
            <div class="diff-full-pane-content" id="diff-scroll-b">
              ${htmlB || '<span style="color: #64748b; font-style: italic;">(No lyrics)</span>'}
            </div>
          </div>
        </div>

        <!-- Diff Modal Mobile/Desktop Footer Bar for Easy Return -->
        <div class="diff-modal-footer" style="padding: 6px 14px; background: #080d18; border-top: 1px solid #1e293b; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;">
          <button type="button" class="btn-cleaner-nav btn-close-similar-diff" style="font-size: 12px; padding: 4px 12px;">&larr; Return to Songs List</button>
          <span style="font-size: 11px; color: #94a3b8;">Press <kbd style="background:#1e293b; padding:2px 5px; border-radius:3px; border:1px solid #334155;">ESC</kbd> to close</span>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    updateModalButtons();

    // Synchronize scrolling between Song A and Song B panes
    const paneA = modal.querySelector('#diff-scroll-a');
    const paneB = modal.querySelector('#diff-scroll-b');
    let isSyncing = false;
    if (paneA && paneB) {
      paneA.onscroll = () => {
        if (isSyncing) return;
        isSyncing = true;
        paneB.scrollTop = paneA.scrollTop;
        setTimeout(() => isSyncing = false, 30);
      };
      paneB.onscroll = () => {
        if (isSyncing) return;
        isSyncing = true;
        paneA.scrollTop = paneB.scrollTop;
        setTimeout(() => isSyncing = false, 30);
      };
    }

    modal.querySelector('.btn-diff-keep-a').onclick = () => {
      selectedIdsForDelete.delete(sA.id);
      selectedIdsForDelete.add(sB.id);
      updateModalButtons();
      renderSimilarList();
      showToast(`Song A kept • Song B (ID: ${sB.id}) marked for deletion`);
    };

    modal.querySelector('.btn-diff-keep-b').onclick = () => {
      selectedIdsForDelete.delete(sB.id);
      selectedIdsForDelete.add(sA.id);
      updateModalButtons();
      renderSimilarList();
      showToast(`Song B kept • Song A (ID: ${sA.id}) marked for deletion`);
    };

    modal.querySelector('.btn-diff-keep-both').onclick = () => {
      selectedIdsForDelete.delete(sA.id);
      selectedIdsForDelete.delete(sB.id);
      updateModalButtons();
      renderSimilarList();
      showToast('Both songs kept in database');
    };

    const closeSimilarDiffModal = () => {
      document.removeEventListener('keydown', handleSimilarDiffKeydown);
      modal.remove();
    };

    const handleSimilarDiffKeydown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeSimilarDiffModal();
      }
    };

    document.addEventListener('keydown', handleSimilarDiffKeydown);

    modal.querySelectorAll('.btn-close-similar-diff, .cleaner-close-btn, .btn-close-diff-top').forEach(btn => {
      btn.onclick = closeSimilarDiffModal;
    });

    modal.onclick = (e) => {
      if (e.target === modal) closeSimilarDiffModal();
    };
  }

  async function renderSimilarDuplicates(forceRefresh = false) {
    elements.workspaceTitle.textContent = 'Similar / Near-Duplicate Songs';
    elements.workspaceSubtitle.textContent = 'Songs with high lyrics similarity (minor variations in formatting, spelling, or verses). Differences are highlighted so you can confidently choose which song to delete.';

    try {
      if (!similarData || forceRefresh) {
        const res = await fetch(`/api/songs-cleaner/similar-duplicates?similarity=${similarThreshold}${forceRefresh ? '&refresh=true' : ''}`);
        similarData = await res.json();
      }

      renderSimilarList();
    } catch (err) {
      elements.listContainer.innerHTML = `<div style="color:#ef4444; padding:30px; text-align:center;">Failed to load similar songs: ${escapeHtml(err.message)}</div>`;
    }
  }

  function renderSimilarList() {
    const term = (searchTerm || '').trim().toLowerCase();
    const filteredPairs = similarData.pairs.filter(p => {
      if (!term) return true;
      return p.songA.name.toLowerCase().includes(term) || p.songB.name.toLowerCase().includes(term);
    });

    const totalPages = Math.ceil(filteredPairs.length / PAGE_SIZE) || 1;
    if (similarPage > totalPages) similarPage = totalPages;
    if (similarPage < 1) similarPage = 1;

    const startIdx = (similarPage - 1) * PAGE_SIZE;
    const pagePairs = filteredPairs.slice(startIdx, startIdx + PAGE_SIZE);

    // Toolbar
    elements.toolbarActions.innerHTML = `
      <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
        <label style="font-size: 12px; color: #94a3b8;">Min Similarity:</label>
        <select id="select-similar-threshold" class="cleaner-search-input" style="min-width: 140px; padding: 4px 8px; font-size: 12px;">
          <option value="70" ${similarThreshold === 70 ? 'selected' : ''}>70% and above</option>
          <option value="80" ${similarThreshold === 80 ? 'selected' : ''}>80% and above</option>
          <option value="90" ${similarThreshold === 90 ? 'selected' : ''}>90% and above</option>
        </select>
        <button id="btn-keep-all-both" class="btn-secondary" style="font-size: 12px; padding: 6px 12px;">Keep Both for All Pairs</button>
      </div>
    `;

    document.getElementById('select-similar-threshold').onchange = (e) => {
      similarThreshold = Number(e.target.value);
      similarData = null; // force reload with new threshold
      similarPage = 1;
      renderSimilarDuplicates(true);
    };

    document.getElementById('btn-keep-all-both').onclick = () => {
      selectedIdsForDelete.clear();
      renderSimilarList();
      showToast('All similar pairs set to Keep Both');
    };

    if (filteredPairs.length === 0) {
      elements.listContainer.innerHTML = `
        <div style="text-align:center; padding:60px; color:#94a3b8;">
          <div style="font-size: 40px; margin-bottom: 12px;">✨</div>
          <div style="font-size: 16px; font-weight:700; color:#fff;">No Similar Duplicates Found at ${similarThreshold}%</div>
          <div style="font-size: 13px; margin-top: 4px;">Try lowering the similarity threshold filter.</div>
        </div>
      `;
      updateDeleteFooter(0);
      return;
    }

    let html = '';
    pagePairs.forEach((pair, pOffset) => {
      const pIdx = startIdx + pOffset;
      const isDeleteA = selectedIdsForDelete.has(pair.songA.id);
      const isDeleteB = selectedIdsForDelete.has(pair.songB.id);
      const simColor = pair.similarity >= 90 ? '#10b981' : pair.similarity >= 80 ? '#f59e0b' : '#38bdf8';

      // Compute word differences for the preview snippets
      const previewDiff = computeWordLcsDiff(pair.songA.preview || '', pair.songB.preview || '');
      const previewHtmlA = formatDiffTokensToHtml(previewDiff.resultA, 'a');
      const previewHtmlB = formatDiffTokensToHtml(previewDiff.resultB, 'b');

      // Title difference check
      const titleDiffers = (pair.songA.name || '').trim().toLowerCase() !== (pair.songB.name || '').trim().toLowerCase();
      let titleDiffHtml = '';
      if (titleDiffers) {
        const titleDiff = computeWordLcsDiff(pair.songA.name || '', pair.songB.name || '');
        titleDiffHtml = `
          <div class="diff-title-row">
            <span style="color: #94a3b8; font-weight: 600;">Different Titles:</span>
            <span>A: "${formatDiffTokensToHtml(titleDiff.resultA, 'a')}"</span>
            <span style="color: #64748b;">vs</span>
            <span>B: "${formatDiffTokensToHtml(titleDiff.resultB, 'b')}"</span>
          </div>
        `;
      }

      // Comparison Metrics & Recommendation
      const rec = getPairRecommendation(pair.songA, pair.songB);
      const slideDiff = pair.songA.slideCount !== pair.songB.slideCount;
      const lenA = (pair.songA.rawLyrics || '').length;
      const lenB = (pair.songB.rawLyrics || '').length;

      html += `
        <div class="similar-pair-card" data-pair-idx="${pIdx}">
          <div class="similar-pair-header">
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <span style="font-size: 16px;">🔍</span>
              <span style="font-size: 14px; font-weight: 700; color: #fff;">Pair #${pIdx + 1} of ${filteredPairs.length}</span>
              <span class="group-pill" style="background: rgba(16, 185, 129, 0.15); color: ${simColor}; border: 1px solid ${simColor}; font-weight: 800;">
                ${pair.similarity}% Similar
              </span>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
              <button class="btn-primary btn-open-diff" data-idx="${pIdx}" style="font-size: 11px; padding: 5px 12px; background: linear-gradient(135deg, #0284c7, #6366f1); font-weight: 700;">
                🔍 Side-by-Side Full Diff
              </button>
              <button class="btn-secondary btn-keep-both" data-a="${pair.songA.id}" data-b="${pair.songB.id}" style="font-size: 11px; padding: 5px 10px;">
                Keep Both
              </button>
            </div>
          </div>

          <!-- Comparison Metrics & Highlights Banner -->
          <div class="pair-diff-banner">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
              <div class="diff-recommendation">${rec.text}</div>
              <div class="diff-pill-group">
                <span class="diff-pill ${slideDiff ? 'pill-alert' : 'pill-info'}">
                  Slides: ${pair.songA.slideCount} vs ${pair.songB.slideCount} ${slideDiff ? `(${Math.abs(pair.songA.slideCount - pair.songB.slideCount)} difference)` : '(Equal)'}
                </span>
                <span class="diff-pill">
                  Length: ${lenA} vs ${lenB} chars ${lenA !== lenB ? `(${lenA > lenB ? 'A' : 'B'} +${Math.abs(lenA - lenB)})` : ''}
                </span>
                <span class="diff-pill">
                  Font: ${escapeHtml(pair.songA.font || 'None')} vs ${escapeHtml(pair.songB.font || 'None')}
                </span>
              </div>
            </div>
            ${titleDiffHtml}
            <div class="diff-legend-strip">
              <span style="font-weight: 600; color: #cbd5e1;">Highlight key:</span>
              <div class="diff-legend-item">
                <div class="diff-legend-dot" style="background: #f59e0b;"></div>
                <span>Unique to Song A (amber)</span>
              </div>
              <div class="diff-legend-item">
                <div class="diff-legend-dot" style="background: #10b981;"></div>
                <span>Unique to Song B (green)</span>
              </div>
            </div>
          </div>

          <div class="similar-pair-body">
            <!-- Song A -->
            <div class="song-compare-box ${isDeleteA ? 'marked-delete' : ''}">
              <div>
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                  <div>
                    <div style="font-size: 14px; font-weight: 700; color: #ffffff;">${escapeHtml(pair.songA.name)}</div>
                    <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">
                      ID: ${pair.songA.id} • ${escapeHtml(pair.songA.cat)} • Font: ${escapeHtml(pair.songA.font || 'None')} • ${pair.songA.slideCount} Slides
                    </div>
                  </div>
                  <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: ${isDeleteA ? '#ef4444' : '#94a3b8'}; cursor: pointer;">
                    <input type="checkbox" data-id="${pair.songA.id}" ${isDeleteA ? 'checked' : ''}> Delete
                  </label>
                </div>
                <div class="song-preview-text" style="background: #070d18; padding: 10px; border-radius: 6px; max-height: 110px; overflow-y: auto; font-family: 'Baloo Thambi', sans-serif; font-size: 13px; line-height: 1.5;">
                  "${previewHtmlA}"
                </div>
              </div>
              <div style="margin-top: 12px; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                <button type="button" class="btn-primary btn-keep-a" data-a="${pair.songA.id}" data-b="${pair.songB.id}" style="font-size: 11px; padding: 4px 10px; background: #059669;">
                  ✓ Keep Song A (Delete B)
                </button>
                <button class="btn-secondary btn-preview-song" data-id="${pair.songA.id}" style="font-size: 11px; padding: 4px 8px;">
                  Full Slides
                </button>
              </div>
            </div>

            <!-- Song B -->
            <div class="song-compare-box ${isDeleteB ? 'marked-delete' : ''}">
              <div>
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                  <div>
                    <div style="font-size: 14px; font-weight: 700; color: #ffffff;">${escapeHtml(pair.songB.name)}</div>
                    <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">
                      ID: ${pair.songB.id} • ${escapeHtml(pair.songB.cat)} • Font: ${escapeHtml(pair.songB.font || 'None')} • ${pair.songB.slideCount} Slides
                    </div>
                  </div>
                  <label style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: ${isDeleteB ? '#ef4444' : '#94a3b8'}; cursor: pointer;">
                    <input type="checkbox" data-id="${pair.songB.id}" ${isDeleteB ? 'checked' : ''}> Delete
                  </label>
                </div>
                <div class="song-preview-text" style="background: #070d18; padding: 10px; border-radius: 6px; max-height: 110px; overflow-y: auto; font-family: 'Baloo Thambi', sans-serif; font-size: 13px; line-height: 1.5;">
                  "${previewHtmlB}"
                </div>
              </div>
              <div style="margin-top: 12px; display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                <button type="button" class="btn-primary btn-keep-b" data-a="${pair.songA.id}" data-b="${pair.songB.id}" style="font-size: 11px; padding: 4px 10px; background: #059669;">
                  ✓ Keep Song B (Delete A)
                </button>
                <button class="btn-secondary btn-preview-song" data-id="${pair.songB.id}" style="font-size: 11px; padding: 4px 8px;">
                  Full Slides
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    });

    html += buildPaginationHtml(filteredPairs.length, similarPage, PAGE_SIZE, 'similar-pg');

    elements.listContainer.innerHTML = html;

    // Attach pagination events
    attachPaginationEvents('similar-pg', similarPage, totalPages, (newPage) => {
      similarPage = newPage;
      renderSimilarList();
      elements.listContainer.scrollTop = 0;
    });

    // Attach checkbox events
    elements.listContainer.querySelectorAll('input[type="checkbox"]').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const id = Number(e.target.dataset.id);
        if (e.target.checked) selectedIdsForDelete.add(id);
        else selectedIdsForDelete.delete(id);
        updateDeleteFooter(selectedIdsForDelete.size);
        const compareBox = e.target.closest('.song-compare-box');
        if (compareBox) compareBox.classList.toggle('marked-delete', e.target.checked);
      });
    });

    // Attach 1-click "Keep Song A (Delete B)" buttons
    elements.listContainer.querySelectorAll('.btn-keep-a').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const aId = Number(e.currentTarget.dataset.a);
        const bId = Number(e.currentTarget.dataset.b);
        selectedIdsForDelete.delete(aId);
        selectedIdsForDelete.add(bId);
        renderSimilarList();
        showToast(`Song A kept • Song B marked for deletion`);
      });
    });

    // Attach 1-click "Keep Song B (Delete A)" buttons
    elements.listContainer.querySelectorAll('.btn-keep-b').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const aId = Number(e.currentTarget.dataset.a);
        const bId = Number(e.currentTarget.dataset.b);
        selectedIdsForDelete.delete(bId);
        selectedIdsForDelete.add(aId);
        renderSimilarList();
        showToast(`Song B kept • Song A marked for deletion`);
      });
    });

    // Attach "Keep Both" buttons
    elements.listContainer.querySelectorAll('.btn-keep-both').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const aId = Number(e.currentTarget.dataset.a);
        const bId = Number(e.currentTarget.dataset.b);
        selectedIdsForDelete.delete(aId);
        selectedIdsForDelete.delete(bId);
        renderSimilarList();
        showToast('Both songs kept');
      });
    });

    // Attach "Side-by-Side Full Diff" modal buttons
    elements.listContainer.querySelectorAll('.btn-open-diff').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = Number(e.currentTarget.dataset.idx);
        const pair = filteredPairs[idx];
        if (pair) openSimilarDiffModal(pair, idx);
      });
    });

    // Attach individual slide preview
    elements.listContainer.querySelectorAll('.btn-preview-song').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = Number(e.currentTarget.dataset.id);
        openPreviewSlideModal(id);
      });
    });

    updateDeleteFooter(selectedIdsForDelete.size);
  }

  // ---------------------------------------------------------------------------
  // 4. Songs Error Analyse (No deletion required)
  // ---------------------------------------------------------------------------
  async function renderSongErrors(forceRefresh = false) {
    elements.workspaceTitle.textContent = 'Songs Error Analysis & Diagnostics';
    elements.workspaceSubtitle.textContent = 'Scans database for mixed fonts usage, font name discrepancies, diacritic typos, language misuse, and slide formatting. Delete song is not required.';

    try {
      if (!errorsData || forceRefresh) {
        const res = await fetch(`/api/songs-cleaner/error-analysis${forceRefresh ? '?refresh=true' : ''}`);
        errorsData = await res.json();
      }

      renderErrorsList();
    } catch (err) {
      elements.listContainer.innerHTML = `<div style="color:#ef4444; padding:30px; text-align:center;">Failed to analyze song errors: ${escapeHtml(err.message)}</div>`;
    }
  }

  function renderErrorsList() {
    const term = (searchTerm || '').trim().toLowerCase();
    const filteredSongs = errorsData.songs.filter(s => {
      const matchSearch = !term || s.name.toLowerCase().includes(term) || s.issues.some(i => i.title.toLowerCase().includes(term));
      if (!matchSearch) return false;
      if (errorCategoryFilter === 'all') return true;
      return s.issues.some(i => i.category === errorCategoryFilter);
    });

    const totalPages = Math.ceil(filteredSongs.length / PAGE_SIZE) || 1;
    if (errorsPage > totalPages) errorsPage = totalPages;
    if (errorsPage < 1) errorsPage = 1;

    const startIdx = (errorsPage - 1) * PAGE_SIZE;
    const pageSongs = filteredSongs.slice(startIdx, startIdx + PAGE_SIZE);

    // Category Tabs Toolbar
    const counts = errorsData.counts;
    const baminiNeedsTbSongs = (errorsData.songs || []).filter(s => s.issues.some(i => i.code === 'BAMINI_NEEDS_TAMIL_BIBLE'));
    const baminiInUnicodeSongs = (errorsData.songs || []).filter(s => s.issues.some(i => i.category === 'baminiInUnicode'));

    elements.toolbarActions.innerHTML = `
      <div style="display: flex; gap: 8px; align-items: center; justify-content: space-between; flex-wrap: wrap; width: 100%;">
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <button class="chip ${errorCategoryFilter === 'all' ? 'active' : ''}" data-cat="all">All (${errorsData.totalSongsWithErrors})</button>
          <button class="chip ${errorCategoryFilter === 'baminiInUnicode' ? 'active' : ''}" data-cat="baminiInUnicode" style="${counts.baminiInUnicode > 0 ? 'border-color: #a78bfa; color: #c4b5fd;' : ''}">✨ Bamini in Unicode Font (${counts.baminiInUnicode || 0})</button>
          <button class="chip ${errorCategoryFilter === 'fontMismatch' ? 'active' : ''}" data-cat="fontMismatch">Font Mismatch (${counts.fontMismatch || 0})</button>
          <button class="chip ${errorCategoryFilter === 'fontNameIssue' ? 'active' : ''}" data-cat="fontNameIssue">Font Name (${counts.fontNameIssue || 0})</button>
          <button class="chip ${errorCategoryFilter === 'typographyTypo' ? 'active' : ''}" data-cat="typographyTypo">Diacritics & Typos (${counts.typographyTypo || 0})</button>
          <button class="chip ${errorCategoryFilter === 'slideStructure' ? 'active' : ''}" data-cat="slideStructure">Slide Format (${counts.slideStructure || 0})</button>
          ${counts.mixedLanguage > 0 ? `<button class="chip ${errorCategoryFilter === 'mixedLanguage' ? 'active' : ''}" data-cat="mixedLanguage">Language Misuse (${counts.mixedLanguage})</button>` : ''}
        </div>
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          ${baminiInUnicodeSongs.length > 0 ? `
            <button id="btn-batch-fix-mixed-bamini" class="btn-primary" style="font-size: 12px; padding: 6px 14px; background: #8b5cf6; border: 1px solid #a78bfa; display: inline-flex; align-items: center; gap: 6px;">
              ✨ Convert All Bamini in Unicode Font (${baminiInUnicodeSongs.length})
            </button>
          ` : ''}
          ${baminiNeedsTbSongs.length > 0 ? `
            <button id="btn-batch-fix-bamini-font" class="btn-primary" style="font-size: 12px; padding: 6px 14px; background: #0284c7; border: 1px solid #38bdf8; display: inline-flex; align-items: center; gap: 6px;">
              🏷️ Set All Bamini to "Tamil Bible" (${baminiNeedsTbSongs.length})
            </button>
          ` : ''}
        </div>
      </div>
    `;

    elements.toolbarActions.querySelectorAll('.chip').forEach(btn => {
      btn.onclick = (e) => {
        errorCategoryFilter = e.target.dataset.cat;
        errorsPage = 1;
        renderErrorsList();
      };
    });

    const batchMixedBaminiBtn = elements.toolbarActions.querySelector('#btn-batch-fix-mixed-bamini');
    if (batchMixedBaminiBtn) {
      batchMixedBaminiBtn.onclick = async () => {
        const count = baminiInUnicodeSongs.length;
        if (!confirm(`Are you sure you want to convert the Bamini keystrokes in all ${count} Unicode font songs into clean Tamil Unicode with Baloo Thambi font?\n\nA silent database backup will be created automatically before conversion.`)) {
          return;
        }
        batchMixedBaminiBtn.disabled = true;
        batchMixedBaminiBtn.textContent = 'Converting slides...';
        try {
          const res = await fetch('/api/songs-cleaner/mass-convert-mixed-bamini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetFont: 'Baloo Thambi' })
          });
          const data = await res.json();
          if (!res.ok || data.error) throw new Error(data.error || 'Failed to convert mixed Bamini songs');
          showToast(`Successfully converted ${data.count} songs with Bamini slides to clean Unicode!`, 'success');
          await loadSummary(true);
          await renderSongErrors(true);
        } catch (err) {
          showToast(err.message, 'error');
          batchMixedBaminiBtn.disabled = false;
          batchMixedBaminiBtn.textContent = `✨ Convert All Bamini in Unicode Font (${count})`;
        }
      };
    }

    const batchBaminiBtn = elements.toolbarActions.querySelector('#btn-batch-fix-bamini-font');
    if (batchBaminiBtn) {
      batchBaminiBtn.onclick = async () => {
        const count = baminiNeedsTbSongs.length;
        if (!confirm(`Are you sure you want to change the font declaration of all ${count} Bamini-encoded songs to "Tamil Bible"?\n\nA silent backup will be created automatically.`)) {
          return;
        }
        batchBaminiBtn.disabled = true;
        batchBaminiBtn.textContent = 'Updating songs...';
        try {
          const res = await fetch('/api/songs-cleaner/batch-assign-tamil-bible', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: baminiNeedsTbSongs.map(s => s.id) })
          });
          const data = await res.json();
          if (!res.ok || data.error) throw new Error(data.error || 'Failed to update fonts');
          showToast(`Successfully updated ${data.updatedCount} songs to "Tamil Bible" font!`, 'success');
          await loadSummary(true);
          await renderSongErrors(true);
        } catch (err) {
          showToast(err.message, 'error');
          batchBaminiBtn.disabled = false;
          batchBaminiBtn.textContent = `🏷️ Set All Bamini to "Tamil Bible" (${count})`;
        }
      };
    }

    if (filteredSongs.length === 0) {
      elements.listContainer.innerHTML = `
        <div style="text-align:center; padding:60px; color:#94a3b8;">
          <div style="font-size: 40px; margin-bottom: 12px;">✅</div>
          <div style="font-size: 16px; font-weight:700; color:#fff;">No Errors Found in this Category</div>
          <div style="font-size: 13px; margin-top: 4px;">Songs are clean and compliant.</div>
        </div>
      `;
      elements.footerLeft.textContent = `Showing 0 of ${errorsData.totalSongsWithErrors} flagged songs`;
      elements.footerRight.innerHTML = '';
      return;
    }

    let html = '';
    pageSongs.forEach((song) => {
      const hasBaminiFontAssignError = song.issues.some(i => i.code === 'BAMINI_NEEDS_TAMIL_BIBLE');
      const hasMixedBaminiError = song.issues.some(i => i.category === 'baminiInUnicode');

      html += `
        <div class="error-song-card" style="${hasMixedBaminiError ? 'border-color: rgba(139, 92, 246, 0.4);' : ''}">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;">
            <div>
              <div style="font-size: 15px; font-weight: 700; color: #ffffff;">${escapeHtml(song.name)}</div>
              <div style="font-size: 12px; color: #94a3b8; margin-top: 2px;">
                ID: ${song.id} • Category: ${escapeHtml(song.cat)} • Font: <span style="color: #38bdf8;">"${escapeHtml(song.font || 'Empty')}"</span> • ${song.slideCount} Slides
              </div>
            </div>
            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
              ${hasMixedBaminiError ? `
                <button class="btn-primary btn-convert-mixed-single" data-id="${song.id}" style="font-size: 12px; padding: 6px 12px; background: #8b5cf6; border: 1px solid #a78bfa;">✨ Convert to Unicode</button>
              ` : ''}
              ${hasBaminiFontAssignError ? `
                <button class="btn-secondary btn-assign-tb-single" data-id="${song.id}" style="font-size: 12px; padding: 6px 12px; border-color: #38bdf8; color: #38bdf8;">🏷️ Set Font to "Tamil Bible"</button>
              ` : ''}
              <button class="btn-primary btn-quick-fix-song" data-id="${song.id}" style="font-size: 12px; padding: 6px 14px;">✏️ Inspect & Fix Song</button>
            </div>
          </div>

          <div class="error-issues-list">
      `;

      song.issues.forEach(issue => {
        const isMixedBamini = issue.category === 'baminiInUnicode';
        const isErr = issue.severity === 'error';

        if (isMixedBamini) {
          html += `
            <div class="issue-item issue-error" style="border-left: 3px solid #8b5cf6; background: rgba(139, 92, 246, 0.08);">
              <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                <span style="font-weight: 700; color: #c4b5fd;">✨ ${escapeHtml(issue.title)}</span>
                <span class="group-pill" style="background: rgba(139, 92, 246, 0.2); color: #c4b5fd; border: 1px solid #8b5cf6; font-size: 10px;">
                  Slide(s): [${(issue.baminiSlides || []).join(', ')}]
                </span>
              </div>
              <div style="color: #cbd5e1; margin-top: 4px;">${escapeHtml(issue.description)}</div>
              ${issue.snippet ? `
                <div style="margin-top: 6px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 12px;">
                  <span style="color: #f87171; font-family: monospace; background: #070d18; padding: 2px 6px; border-radius: 4px;">Bamini Keystroke: "${escapeHtml(issue.snippet)}"</span>
                  <span style="color: #94a3b8;">➔</span>
                  <span style="color: #4ade80; font-family: monospace; background: #070d18; padding: 2px 6px; border-radius: 4px;">Tamil Unicode: "${escapeHtml(issue.convertedSnippet || '')}"</span>
                </div>
              ` : ''}
            </div>
          `;
        } else {
          html += `
            <div class="issue-item ${isErr ? 'issue-error' : ''}">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 700; color: ${isErr ? '#f87171' : '#fbbf24'};">${isErr ? '❌' : '⚠️'} ${escapeHtml(issue.title)}</span>
                <span style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b;">${issue.category}</span>
              </div>
              <div style="color: #cbd5e1; margin-top: 4px;">${escapeHtml(issue.description)}</div>
              ${issue.snippet ? `<div style="margin-top: 4px; font-family: monospace; font-size: 11px; background: #070d18; padding: 2px 6px; border-radius: 4px; display: inline-block; color: #38bdf8;">Snippet: ${escapeHtml(issue.snippet)}</div>` : ''}
            </div>
          `;
        }
      });

      html += `
          </div>
        </div>
      `;
    });

    html += buildPaginationHtml(filteredSongs.length, errorsPage, PAGE_SIZE, 'errors-pg');

    elements.listContainer.innerHTML = html;

    // Attach pagination events
    attachPaginationEvents('errors-pg', errorsPage, totalPages, (newPage) => {
      errorsPage = newPage;
      renderErrorsList();
      elements.listContainer.scrollTop = 0;
    });

    // Attach quick fix events
    elements.listContainer.querySelectorAll('.btn-quick-fix-song').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = Number(e.currentTarget.dataset.id);
        openEditSongModal(id);
      });
    });

    // Attach single song convert mixed Bamini to clean Unicode events
    elements.listContainer.querySelectorAll('.btn-convert-mixed-single').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = Number(e.currentTarget.dataset.id);
        btn.disabled = true;
        btn.textContent = 'Converting...';
        try {
          const res = await fetch(`/api/songs-cleaner/convert-mixed-bamini/${id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetFont: 'Baloo Thambi' })
          });
          const data = await res.json();
          if (!res.ok || data.error) throw new Error(data.error || 'Failed to convert song');
          showToast(`Song #${id} Bamini slides successfully converted to Unicode!`, 'success');
          await loadSummary(true);
          await renderSongErrors(true);
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
          btn.textContent = '✨ Convert to Unicode';
        }
      });
    });

    // Attach single song Set to Tamil Bible events
    elements.listContainer.querySelectorAll('.btn-assign-tb-single').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = Number(e.currentTarget.dataset.id);
        btn.disabled = true;
        btn.textContent = 'Updating...';
        try {
          const res = await fetch(`/api/songs/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ font: 'Tamil Bible' })
          });
          if (!res.ok) throw new Error('Failed to update font');
          showToast(`Song #${id} font changed to "Tamil Bible"`, 'success');
          await loadSummary(true);
          await renderSongErrors(true);
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
          btn.textContent = '🏷️ Set Font to "Tamil Bible"';
        }
      });
    });

    elements.footerLeft.textContent = `Page ${errorsPage} of ${totalPages} (${filteredSongs.length} flagged songs, ${counts.totalErrors} total issues)`;
    elements.footerRight.innerHTML = `
      <span style="font-size: 12px; color: #94a3b8;">Use "Inspect & Fix Song" to correct font declarations or typos instantly.</span>
    `;
  }

  // ---------------------------------------------------------------------------
  // 5. Bamini to Unicode Converter
  // ---------------------------------------------------------------------------
  async function renderBaminiConverter(forceRefresh = false) {
    elements.workspaceTitle.textContent = 'Bamini to Unicode Converter';
    elements.workspaceSubtitle.textContent = 'Converts songs with Tamil Bible font to clean Unicode (Baloo Thambi). Clean songs can be mass converted; songs with detected typos are reviewed side-by-side.';

    try {
      if (!baminiData || forceRefresh) {
        const res = await fetch(`/api/songs-cleaner/bamini-analysis${forceRefresh ? '?refresh=true' : ''}`);
        baminiData = await res.json();
      }

      currentBaminiReviewIndex = 0;
      renderBaminiConverterView();
    } catch (err) {
      elements.listContainer.innerHTML = `<div style="color:#ef4444; padding:30px; text-align:center;">Failed to load Bamini analysis: ${escapeHtml(err.message)}</div>`;
    }
  }

  function renderBaminiConverterView() {
    elements.toolbarActions.innerHTML = '';

    const cleanCount = baminiData.cleanCount;
    const suspiciousCount = baminiData.suspiciousCount;

    let html = `
      <!-- Step 1: Mass Convert Clean Songs Card -->
      <div style="background: #131d31; border: 1px solid #293952; border-radius: 10px; padding: 20px; margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
          <div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 20px;">⚡</span>
              <h3 style="margin: 0; font-size: 16px; color: #fff;">Step 1: Mass Convert All Songs Without Typos</h3>
              <span class="cleaner-opt-badge badge-success">${cleanCount} Clean Songs</span>
            </div>
            <p style="margin: 6px 0 0 0; font-size: 13px; color: #94a3b8; max-width: 680px;">
              These songs strictly use standard Bamini phonetic glyphs with zero detected typos or anomalies. They can be safely converted to Unicode (Baloo Thambi) in a single batch.
            </p>
          </div>
          <div>
            <button id="btn-mass-convert-clean" class="btn-primary" style="background-color: #10b981; font-weight: 700; padding: 10px 20px; font-size: 14px;" ${cleanCount === 0 ? 'disabled' : ''}>
              ${cleanCount > 0 ? `🚀 Mass Convert ${cleanCount} Clean Songs` : '✅ All Clean Songs Converted'}
            </button>
          </div>
        </div>
      </div>

      <!-- Step 2: Individual Side-by-Side Review for Suspicious Songs -->
      <div style="background: #131d31; border: 1px solid #293952; border-radius: 10px; padding: 20px; flex: 1; display: flex; flex-direction: column;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid #24334a; padding-bottom: 12px; flex-wrap: wrap; gap: 10px;">
          <div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 20px;">🔍</span>
              <h3 style="margin: 0; font-size: 16px; color: #fff;">Step 2: Individual Song Review with Side-by-Side Previews</h3>
              <span class="cleaner-opt-badge badge-warn">${suspiciousCount} Needing Review</span>
            </div>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8;">
              Potential typo, English labels, or mixed characters were detected. Compare the original vs converted output below, edit if needed, and make a decision one by one.
            </p>
          </div>
          <div id="bamini-review-stepper" style="display: flex; align-items: center; gap: 8px;">
            <!-- Stepper controls -->
          </div>
        </div>

        <div id="bamini-side-by-side-workspace" style="flex: 1;">
          <!-- Active review song rendered here -->
        </div>
      </div>
    `;

    elements.listContainer.innerHTML = html;

    // Mass Convert Button Action
    const btnMass = document.getElementById('btn-mass-convert-clean');
    if (btnMass && cleanCount > 0) {
      btnMass.onclick = () => {
        showConfirmation(
          'Confirm Mass Conversion',
          `Are you sure you want to mass convert ${cleanCount} clean songs from Bamini (Tamil Bible) to Unicode (Baloo Thambi)?`,
          cleanCount,
          async () => {
            try {
              btnMass.disabled = true;
              btnMass.textContent = 'Converting...';
              const res = await fetch('/api/songs-cleaner/convert-clean-bamini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetFont: 'Baloo Thambi' })
              });
              const data = await res.json();
              if (data.success) {
                showToast(`Successfully converted ${data.convertedCount} songs to Unicode!`);
                await loadSummary(true);
                await renderBaminiConverter(true);
              } else {
                showToast(data.error || 'Conversion failed', 'error');
              }
            } catch (err) {
              showToast(err.message, 'error');
            }
          }
        );
      };
    }

    renderBaminiSingleSong();
  }

  function renderBaminiSingleSong() {
    const stepper = document.getElementById('bamini-review-stepper');
    const workspace = document.getElementById('bamini-side-by-side-workspace');
    if (!workspace) return;

    const list = baminiData.suspiciousSongs;
    if (list.length === 0) {
      stepper.innerHTML = '';
      workspace.innerHTML = `
        <div style="text-align:center; padding:40px; color:#10b981;">
          <div style="font-size: 36px; margin-bottom: 8px;">🎉</div>
          <div style="font-size: 16px; font-weight:700;">No Songs Needing Review!</div>
          <div style="font-size: 13px; color:#94a3b8; margin-top: 4px;">All Bamini songs have been cleanly reviewed and converted.</div>
        </div>
      `;
      elements.footerLeft.textContent = 'All Bamini songs reviewed';
      elements.footerRight.innerHTML = '';
      return;
    }

    if (currentBaminiReviewIndex >= list.length) {
      currentBaminiReviewIndex = list.length - 1;
    }
    if (currentBaminiReviewIndex < 0) {
      currentBaminiReviewIndex = 0;
    }

    const song = list[currentBaminiReviewIndex];

    stepper.innerHTML = `
      <button id="btn-bamini-prev" class="btn-secondary" style="font-size: 12px; padding: 4px 10px;" ${currentBaminiReviewIndex === 0 ? 'disabled' : ''}>&larr; Prev</button>
      <span style="font-size: 13px; color: #fff; font-weight: 700;">Song ${currentBaminiReviewIndex + 1} of ${list.length}</span>
      <button id="btn-bamini-next" class="btn-secondary" style="font-size: 12px; padding: 4px 10px;" ${currentBaminiReviewIndex === list.length - 1 ? 'disabled' : ''}>Next &rarr;</button>
    `;

    document.getElementById('btn-bamini-prev').onclick = () => {
      currentBaminiReviewIndex--;
      isEditingBaminiLyrics = false;
      renderBaminiSingleSong();
    };

    document.getElementById('btn-bamini-next').onclick = () => {
      currentBaminiReviewIndex++;
      isEditingBaminiLyrics = false;
      renderBaminiSingleSong();
    };

    workspace.innerHTML = `
      <div style="margin-bottom: 12px; background: #0d1527; padding: 12px 16px; border-radius: 6px; border: 1px solid #24334a;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <div>
            <span style="font-size: 15px; font-weight: 700; color: #ffffff;">${escapeHtml(song.name)}</span>
            <span style="font-size: 12px; color: #94a3b8; margin-left: 8px;">[ID: ${song.id}] • ${escapeHtml(song.cat)}</span>
          </div>
          <div style="display: flex; gap: 8px;">
            ${song.reasons.map(r => `<span class="cleaner-opt-badge badge-warn" style="font-size: 11px;">⚠️ ${escapeHtml(r)}</span>`).join(' ')}
          </div>
        </div>
      </div>

      ${song.reasons.some(r => r.includes('Already 100% Unicode')) ? `
        <div style="margin-bottom: 12px; background: rgba(14, 165, 233, 0.12); border: 1px solid rgba(14, 165, 233, 0.35); padding: 12px 16px; border-radius: 6px; font-size: 13px; color: #bae6fd; line-height: 1.5;">
          <strong>ℹ️ Song is already 100% Unicode Tamil:</strong> The lyrics are already typed in modern Tamil Unicode (highlighted in green below). The font in the database was mistakenly set to "Tamil Bible" (which is reserved for Bamini fonts). Clicking <strong>"✅ Set Font to Baloo Thambi"</strong> will keep the lyrics exactly as they are and update the font so it renders properly in VerseVIEW.
        </div>
      ` : `
        <!-- Visual Legend for Tamil Bible vs Baloo Thambi Preview -->
        <div style="margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; background: #070d18; padding: 10px 14px; border-radius: 6px; border: 1px solid #1e293b;">
          <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap; font-size: 12px;">
            <span style="font-weight: 700; color: #e2e8f0; display: flex; align-items: center; gap: 6px;">
              🎨 Font Preview Guide:
            </span>
            <span style="display: inline-flex; align-items: center; gap: 6px; color: #38bdf8;">
              <span style="background: #1e293b; padding: 1px 6px; border-radius: 3px; border: 1px solid #334155; color: #38bdf8; font-family: 'Tamil Bible', 'Bamini', sans-serif; font-size: 14px;">அன்பு</span>
              <strong>Left:</strong> Rendered in <em>Tamil Bible</em> font
            </span>
            <span style="display: inline-flex; align-items: center; gap: 6px; color: #34d399;">
              <mark class="hl-unicode-text" style="background: rgba(16, 185, 129, 0.28); color: #34d399; padding: 1px 6px; border-radius: 3px; border: 1px solid rgba(16, 185, 129, 0.5); font-weight: 700; font-family: 'Baloo Thambi', sans-serif;">தமிழ்</mark>
              <strong>Green Badge:</strong> Already Unicode Tamil
            </span>
            <span style="display: inline-flex; align-items: center; gap: 6px; color: #10b981;">
              <span style="background: rgba(16, 185, 129, 0.15); padding: 1px 6px; border-radius: 3px; border: 1px solid rgba(16, 185, 129, 0.4); color: #34d399; font-family: 'Baloo Thambi', sans-serif; font-weight: 700; font-size: 14px;">அன்பு</span>
              <strong>Right:</strong> Converted to <em>Baloo Thambi</em> (Unicode)
            </span>
          </div>
          <div style="font-size: 11px; color: #64748b;">
            2 blank lines between slides • Line breaks on new lines
          </div>
        </div>
      `}

      <div class="bamini-side-by-side">
        <!-- Left: Original Bamini -->
        <div class="preview-column">
          <div class="preview-col-header">
            <span>Original (${escapeHtml(song.font || 'Tamil Bible')} Font)</span>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 11px; color: #94a3b8;">${song.slideCount} Slides</span>
              <button id="btn-toggle-bamini-raw" class="btn-secondary" style="font-size: 11px; padding: 2px 8px;" title="Switch between Tamil Bible font and raw keystrokes">
                ${showBaminiRawKeys ? '🔠 Tamil Font View' : '🔤 Raw Keystrokes'}
              </button>
            </div>
          </div>
          <div class="preview-lyrics-box" style="${showBaminiRawKeys ? 'font-family: monospace; font-size: 13px; color: #94a3b8;' : 'font-family: \'Tamil Bible\', \'Tamil-Ananthi\', \'Bamini\', sans-serif; font-size: 16px; color: #f1f5f9;'} white-space: pre-wrap; line-height: 1.7;">${formatSongLyricsForDisplay(song.rawLyrics, true)}</div>
        </div>

        <!-- Right: Converted Unicode Preview -->
        <div class="preview-column">
          <div class="preview-col-header">
            <span style="color: #34d399;">Converted Preview (Baloo Thambi / Unicode)</span>
            <button id="btn-toggle-edit-converted" class="btn-secondary" style="font-size: 11px; padding: 2px 8px;">
              ${isEditingBaminiLyrics ? '👁️ Read-Only Mode' : '✏️ Edit Lyrics'}
            </button>
          </div>
          ${isEditingBaminiLyrics ? `
            <div style="display: flex; flex-direction: column; flex: 1;">
              <textarea id="bamini-converted-textarea" class="preview-lyrics-textarea" style="flex: 1; min-height: 320px; font-family: 'Baloo Thambi', sans-serif; font-size: 16px;">${escapeHtml(lyricsToTextareaValue(song.convertedLyrics || ''))}</textarea>
              <div style="font-size: 11px; color: #94a3b8; margin-top: 6px;">
                💡 <strong>Tip:</strong> Press Enter for next line. Leave 2 blank lines between slides.
              </div>
            </div>
          ` : `
            <div class="preview-lyrics-box" style="font-size: 16px; font-family: 'Baloo Thambi', 'Noto Sans Tamil', sans-serif; color: #34d399; white-space: pre-wrap; line-height: 1.7;">${formatSongLyricsForDisplay(song.convertedLyrics || '')}</div>
          `}
        </div>
      </div>

      <!-- Decision Controls Bar -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px; padding-top: 14px; border-top: 1px solid #24334a; flex-wrap: wrap; gap: 12px;">
        <div style="font-size: 12px; color: #94a3b8;">
          Review decision for song #${song.id} (${currentBaminiReviewIndex + 1}/${list.length})
        </div>
        <div style="display: flex; gap: 10px;">
          <button id="btn-bamini-skip" class="btn-secondary" style="font-size: 13px; padding: 8px 16px;">
            ⏭️ Skip (Keep Bamini)
          </button>
          <button id="btn-bamini-convert-single" class="btn-primary" style="background-color: #10b981; font-weight: 700; font-size: 13px; padding: 8px 18px;">
            ${song.reasons.some(r => r.includes('Already 100% Unicode')) ? '✅ Set Font to Baloo Thambi' : '✅ Convert to Unicode'}
          </button>
        </div>
      </div>
    `;

    const toggleRawBtn = document.getElementById('btn-toggle-bamini-raw');
    if (toggleRawBtn) {
      toggleRawBtn.onclick = () => {
        showBaminiRawKeys = !showBaminiRawKeys;
        renderBaminiSingleSong();
      };
    }

    document.getElementById('btn-toggle-edit-converted').onclick = () => {
      isEditingBaminiLyrics = !isEditingBaminiLyrics;
      renderBaminiSingleSong();
    };

    // Skip
    document.getElementById('btn-bamini-skip').onclick = () => {
      currentBaminiReviewIndex++;
      isEditingBaminiLyrics = false;
      renderBaminiSingleSong();
    };

    // Convert
    document.getElementById('btn-bamini-convert-single').onclick = async () => {
      let lyricsToSave = song.convertedLyrics;
      if (isEditingBaminiLyrics) {
        const textarea = document.getElementById('bamini-converted-textarea');
        if (textarea) lyricsToSave = textareaValueToLyrics(textarea.value);
      }

      try {
        const res = await fetch('/api/songs-cleaner/convert-single-bamini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: song.id,
            lyrics: lyricsToSave,
            targetFont: 'Baloo Thambi'
          })
        });
        const data = await res.json();
        if (data.success) {
          showToast(`Song #${song.id} converted to Unicode!`);
          // Remove from list
          baminiData.suspiciousSongs.splice(currentBaminiReviewIndex, 1);
          baminiData.suspiciousCount--;
          isEditingBaminiLyrics = false;
          renderBaminiConverterView();
        } else {
          showToast(data.error || 'Failed to convert song', 'error');
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
  }

  // ---------------------------------------------------------------------------
  // Delete Process with Irreversible Confirmation Modal
  // ---------------------------------------------------------------------------
  function updateDeleteFooter(count) {
    if (currentActiveTab === 'errors' || currentActiveTab === 'bamini') return;

    elements.footerLeft.innerHTML = `
      <span style="font-size: 13px; color: #94a3b8;">
        <strong>${count}</strong> song(s) selected for deletion
      </span>
    `;

    elements.footerRight.innerHTML = `
      <button id="btn-delete-selected-songs" class="btn-primary" style="background-color: #ef4444; font-weight: 700; padding: 8px 18px; font-size: 13px;" ${count === 0 ? 'disabled' : ''}>
        🗑️ Delete Selected (${count})
      </button>
    `;

    const delBtn = document.getElementById('btn-delete-selected-songs');
    if (delBtn) {
      delBtn.onclick = () => {
        if (selectedIdsForDelete.size === 0) return;
        executeDeleteFlow();
      };
    }
  }

  function executeDeleteFlow() {
    const count = selectedIdsForDelete.size;
    showConfirmation(
      'Action is Irreversible',
      `This action is irreversible. You are about to permanently delete ${count} duplicate song(s) from the database. Are you sure you want to proceed?`,
      count,
      async () => {
        try {
          const ids = Array.from(selectedIdsForDelete);
          const res = await fetch('/api/songs-cleaner/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids })
          });
          const result = await res.json();
          if (result.success) {
            showToast(`Permanently deleted ${result.deletedCount} duplicate songs`);
            selectedIdsForDelete.clear();
            await loadSummary(true);
            renderActiveView();
          } else {
            showToast(result.error || 'Deletion failed', 'error');
          }
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    );
  }

  // Irreversible confirmation dialog helper
  function showConfirmation(title, message, count, onConfirm) {
    elements.confirmTitle.textContent = title;
    elements.confirmMessage.textContent = message;
    elements.confirmCount.textContent = count;
    elements.confirmModal.style.display = 'flex';

    const closeConfirm = () => {
      elements.confirmModal.style.display = 'none';
      document.removeEventListener('keydown', handleConfirmKeydown);
    };

    const handleConfirmKeydown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeConfirm();
      }
    };

    document.addEventListener('keydown', handleConfirmKeydown);

    elements.btnConfirmCancel.onclick = closeConfirm;

    elements.confirmModal.onclick = (e) => {
      if (e.target === elements.confirmModal) closeConfirm();
    };

    elements.btnConfirmProceed.onclick = () => {
      closeConfirm();
      onConfirm();
    };
  }

  // Preview Slides Modal
  async function openPreviewSlideModal(songId) {
    try {
      const res = await fetch(`/api/songs/${songId}`);
      const song = await res.json();
      if (!song) return;

      const modal = document.createElement('div');
      modal.className = 'cleaner-overlay';
      modal.style.zIndex = '2200';
      modal.innerHTML = `
        <div class="cleaner-window" style="max-width: 720px; max-height: 85vh;">
          <div class="cleaner-header">
            <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
              <button type="button" class="btn-cleaner-nav btn-close-preview" style="font-size: 11px; padding: 4px 10px;" title="Return (Esc)">&larr; <span class="nav-btn-text">Return</span></button>
              <div style="min-width: 0;">
                <h3 style="margin:0; font-size:15px; color:#fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Slide Preview: ${escapeHtml(song.name)}</h3>
                <div style="font-size:11px; color:#94a3b8; margin-top:2px;">[ID: ${song.id}] • Font: ${escapeHtml(song.font || 'None')} • ${song.slideCount} Slides</div>
              </div>
            </div>
            <button class="cleaner-close-btn btn-close-preview" title="Close (Esc)">&times;</button>
          </div>
          <div style="flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:10px;">
            ${(song.slides || []).map((s, idx) => `
              <div style="background:#131d31; border:1px solid #293952; border-radius:8px; padding:12px;">
                <div style="font-size:11px; color:#38bdf8; font-weight:700; margin-bottom:4px;">Slide ${idx + 1}</div>
                <div style="font-size:14px; line-height:1.5; color:#fff; font-family:'Baloo Thambi', sans-serif;">
                  ${(s.lines || []).map(l => escapeHtml(l)).join('<br>')}
                </div>
              </div>
            `).join('')}
          </div>
          <div class="cleaner-footer" style="display: flex; justify-content: space-between; align-items: center;">
            <button type="button" class="btn-cleaner-nav btn-close-preview" style="font-size: 12px; padding: 4px 12px;">&larr; Return to Songs List</button>
            <span style="font-size: 11px; color: #94a3b8;">Press <kbd style="background:#1e293b; padding:2px 5px; border-radius:3px;">ESC</kbd> to close</span>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      const closePreviewModal = () => {
        document.removeEventListener('keydown', handlePreviewKeydown);
        modal.remove();
      };

      const handlePreviewKeydown = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          closePreviewModal();
        }
      };

      document.addEventListener('keydown', handlePreviewKeydown);

      modal.querySelectorAll('.btn-close-preview, .cleaner-close-btn').forEach(btn => {
        btn.onclick = closePreviewModal;
      });

      modal.onclick = (e) => {
        if (e.target === modal) closePreviewModal();
      };
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // Quick Edit Song Modal (from Error Analysis)
  async function openEditSongModal(songId) {
    try {
      const res = await fetch(`/api/songs/${songId}`);
      const song = await res.json();
      if (!song) return;

      elements.editSongId.value = song.id;
      elements.editSongTitle.value = song.name || '';
      elements.editSongFont.value = song.font || '';
      elements.editSongCat.value = song.cat || 'General';
      elements.editSongLyrics.value = lyricsToTextareaValue(song.rawLyrics || song.lyrics || '');

      elements.editModal.style.display = 'flex';
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // Attach Initial Global Listeners
  function initListeners() {
    // Top Tabs
    if (elements.optExact) elements.optExact.onclick = () => switchTab('exact');
    if (elements.optDiffTitle) elements.optDiffTitle.onclick = () => switchTab('diffTitle');
    if (elements.optSimilar) elements.optSimilar.onclick = () => switchTab('similar');
    if (elements.optErrors) elements.optErrors.onclick = () => switchTab('errors');
    if (elements.optBamini) elements.optBamini.onclick = () => switchTab('bamini');

    // Search
    if (elements.searchInput) {
      elements.searchInput.addEventListener('input', (e) => {
        searchTerm = e.target.value;
        exactPage = 1;
        diffTitlePage = 1;
        similarPage = 1;
        errorsPage = 1;
        if (currentActiveTab === 'exact') renderExactList();
        else if (currentActiveTab === 'diffTitle') renderDiffTitleList();
        else if (currentActiveTab === 'similar') renderSimilarList();
        else if (currentActiveTab === 'errors') renderErrorsList();
      });
    }

    // Refresh Button
    if (elements.refreshBtn) {
      elements.refreshBtn.onclick = () => {
        loadSummary(true);
        renderActiveView();
      };
    }

    // Fullscreen Toggle
    const btnFullscreenCleaner = document.getElementById('btn-fullscreen-cleaner');
    const textFullscreenCleaner = document.getElementById('fullscreen-text-cleaner');
    if (btnFullscreenCleaner) {
      btnFullscreenCleaner.onclick = () => {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
          const docEl = document.documentElement;
          if (docEl.requestFullscreen) docEl.requestFullscreen().catch(() => {});
          else if (docEl.webkitRequestFullscreen) docEl.webkitRequestFullscreen();
        } else {
          if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        }
      };

      const updateFsCleanerState = () => {
        const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
        btnFullscreenCleaner.title = isFs ? 'Exit Fullscreen Mode (Esc)' : 'Toggle Fullscreen Mode';
        if (textFullscreenCleaner) textFullscreenCleaner.textContent = isFs ? 'Exit Full' : 'Fullscreen';
        btnFullscreenCleaner.classList.toggle('active', isFs);
      };

      document.addEventListener('fullscreenchange', updateFsCleanerState);
      document.addEventListener('webkitfullscreenchange', updateFsCleanerState);
    }

    // Close Main Overlay
    if (elements.closeBtn) {
      elements.closeBtn.onclick = () => {
        if (elements.overlay) elements.overlay.style.display = 'none';
      };
    }

    // Edit Song Save
    if (elements.btnSaveEditSong) {
      elements.btnSaveEditSong.onclick = async () => {
        const id = Number(elements.editSongId.value);
        const name = elements.editSongTitle.value.trim();
        const font = elements.editSongFont.value.trim();
        const cat = elements.editSongCat.value.trim();
        const lyricsRaw = elements.editSongLyrics.value.trim();

        if (!name || !lyricsRaw) {
          showToast('Title and lyrics cannot be empty', 'warn');
          return;
        }

        const lyrics = textareaValueToLyrics(lyricsRaw);

        try {
          const res = await fetch('/api/songs-cleaner/update-song', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, name, font, cat, lyrics })
          });
          const data = await res.json();
          if (data.success) {
            showToast('Song updated successfully!');
            elements.editModal.style.display = 'none';
            await loadSummary(true);
            if (currentActiveTab === 'errors') renderSongErrors(true);
          } else {
            showToast(data.error || 'Update failed', 'error');
          }
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
    }

    if (elements.btnCloseEditSong) {
      elements.btnCloseEditSong.onclick = () => {
        elements.editModal.style.display = 'none';
      };
    }

    if (elements.editModal) {
      elements.editModal.onclick = (e) => {
        if (e.target === elements.editModal) {
          elements.editModal.style.display = 'none';
        }
      };
    }

    // Global keyboard Escape handler for edit modal
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (elements.editModal && elements.editModal.style.display === 'flex') {
          elements.editModal.style.display = 'none';
        }
      }
    });
  }

  // Public Interface
  window.SongCleanerSuite = {
    open: function(defaultTab = 'exact') {
      initElements();
      initListeners();
      if (elements.overlay) elements.overlay.style.display = 'flex';
      loadSummary();
      switchTab(defaultTab);
    },
    close: function() {
      if (elements.overlay) elements.overlay.style.display = 'none';
    }
  };

  // Auto-init on page load
  document.addEventListener('DOMContentLoaded', () => {
    initElements();
    initListeners();
  });
})();
