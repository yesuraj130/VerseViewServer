// ===========================================================================
// Verse View Server — Application Settings & Font Mapper Controller
// ===========================================================================

document.addEventListener('DOMContentLoaded', () =>
{
  initSettingsPage();
});

const STANDARD_FONTS = [
  'Baloo Thambi 2',
  'Baloo Thambi',
  'Latha',
  'Mukta Malar',
  'Noto Sans Tamil',
  'Bamini',
  'Arial',
  'Baloo Chettan',
  'Baloo',
  'Ramabhadra Telugu',
  'Segoe UI',
  'Roboto',
  'Times New Roman',
  'Georgia',
  'sans-serif',
  'serif'
];

const BIBLE_SAMPLE_TEXTS = {
  tamil: 'ஆதியிலே தேவன் வானத்தையும் பூமியையும் சிருஷ்டித்தார்.',
  kjv: 'In the beginning God created the heaven and the earth.',
  municode: 'ആദിയിൽ ദൈവം ആകാശവും ഭൂമിയും സൃഷ്ടിച്ചു.',
  hindi_unicode: 'आदि में परमेश्वर ने आकाश और पृथ्वी की सृष्टि की।',
  telugu: 'ఆదియందు దేవుడు భూమ్యాకాశములను సృజించెను.',
  lbla: 'En el principio creó Dios los cielos y la tierra.'
};

let currentSettings = {
  fontMapping: {
    bible: {},
    songOverrides: {}
  }
};

let bibleVersionsList = [];
let detectedSongFontsList = [];

async function initSettingsPage()
{
  // Bind UI buttons
  const btnSaveTop = document.getElementById('btn-save-settings-top');
  const btnSaveBottom = document.getElementById('btn-save-settings');
  const btnReset = document.getElementById('btn-reset-settings');
  const btnAddSongOverride = document.getElementById('btn-add-song-override');

  if (btnSaveTop) btnSaveTop.addEventListener('click', saveSettings);
  if (btnSaveBottom) btnSaveBottom.addEventListener('click', saveSettings);
  if (btnReset) btnReset.addEventListener('click', resetSettingsToDefaults);
  if (btnAddSongOverride) btnAddSongOverride.addEventListener('click', () => addSongOverrideRow('', ''));

  // Load initial settings from server
  await fetchSettings();
}

async function fetchSettings()
{
  try
  {
    const res = await fetch('/api/settings');
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();

    currentSettings = data.config || {
      fontMapping: {
        bible: {},
        songOverrides: {}
      }
    };

    if (!currentSettings.fontMapping) currentSettings.fontMapping = {};
    if (!currentSettings.fontMapping.bible) currentSettings.fontMapping.bible = {};
    if (!currentSettings.fontMapping.songOverrides) currentSettings.fontMapping.songOverrides = {};

    bibleVersionsList = data.bibleVersions || [];
    detectedSongFontsList = data.detectedSongFonts || [];

    renderBibleVersionsTable();
    renderSongOverridesList();
    renderDetectedFontsChips();
  }
  catch (err)
  {
    console.error('Error fetching settings:', err);
    showAlert('Failed to load settings from server: ' + err.message, true);
  }
}

// ---------------------------------------------------------------------------
// 1. Bible Versions Font Mapper
// ---------------------------------------------------------------------------
function renderBibleVersionsTable()
{
  const tbody = document.getElementById('bible-versions-tbody');
  if (!tbody) return;

  if (bibleVersionsList.length === 0)
  {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">No Bible versions detected</td></tr>';
    return;
  }

  tbody.innerHTML = '';

  bibleVersionsList.forEach((v) =>
  {
    const tr = document.createElement('tr');

    const assignedFont = (currentSettings.fontMapping.bible && currentSettings.fontMapping.bible[v.id])
      || v.configuredFont
      || v.defaultFont
      || 'Baloo Thambi 2';

    const sampleText = BIBLE_SAMPLE_TEXTS[v.id] || `${v.name} • Scripture Sample 1:1`;

    tr.innerHTML = `
      <td>
        <div class="version-name-cell">
          <span>${escapeHtml(v.name)}</span>
          ${!v.available ? '<span style="font-size: 10px; color: #f87171; background: rgba(239,68,68,0.2); padding: 1px 4px; border-radius: 3px;">DB missing</span>' : ''}
        </div>
      </td>
      <td>
        <span class="version-db-badge">${escapeHtml(v.file || v.id + '.db')}</span>
      </td>
      <td>
        <div class="font-input-wrapper">
          <input 
            type="text" 
            class="font-select-input bible-font-input" 
            list="fonts-datalist" 
            data-version-id="${escapeHtml(v.id)}" 
            value="${escapeHtml(assignedFont)}" 
            placeholder="Font name (e.g. Baloo Thambi, Arial)"
          />
        </div>
      </td>
      <td>
        <div class="preview-box bible-preview-box" id="preview-bible-${escapeHtml(v.id)}" style="font-family: '${escapeHtml(assignedFont)}', var(--font-display);">
          ${escapeHtml(sampleText)}
        </div>
      </td>
    `;

    // Attach live change listener to update font preview instantaneously
    const input = tr.querySelector('.bible-font-input');
    const previewBox = tr.querySelector('.bible-preview-box');
    if (input && previewBox)
    {
      const updatePreview = () =>
      {
        const chosen = input.value.trim() || 'sans-serif';
        previewBox.style.fontFamily = `"${chosen}", 'Baloo Thambi 2', 'Baloo Thambi', 'Mukta Malar', 'Noto Sans Tamil', var(--font-display)`;
      };
      input.addEventListener('input', updatePreview);
      input.addEventListener('change', updatePreview);
    }

    tbody.appendChild(tr);
  });

  injectFontsDatalist();
}

// ---------------------------------------------------------------------------
// 2. Song Font Override Mapper
// ---------------------------------------------------------------------------
function renderSongOverridesList()
{
  const container = document.getElementById('song-overrides-container');
  if (!container) return;

  container.innerHTML = '';

  const overrides = currentSettings.fontMapping.songOverrides || {};
  const entries = Object.entries(overrides);

  if (entries.length === 0)
  {
    container.innerHTML = `
      <div class="empty-overrides-placeholder">
        No active song font overrides. Songs will render using their assigned database font (with Unicode/Bamini fallback).
        <div style="margin-top: 8px;">
          <button type="button" class="btn-secondary" style="font-size: 11px; padding: 4px 10px;" onclick="addSongOverrideRow('Baloo Thambi', 'Latha')">
            + Add Example (Baloo Thambi &rarr; Latha)
          </button>
        </div>
      </div>
    `;
    return;
  }

  entries.forEach(([sourceFont, targetFont]) =>
  {
    addSongOverrideRow(sourceFont, targetFont, false);
  });
}

function addSongOverrideRow(sourceFont = '', targetFont = '', animate = true)
{
  const container = document.getElementById('song-overrides-container');
  if (!container) return;

  // Clear empty placeholder if present
  const placeholder = container.querySelector('.empty-overrides-placeholder');
  if (placeholder) placeholder.remove();

  const row = document.createElement('div');
  row.className = 'song-override-row';

  const defaultTarget = targetFont || 'Latha';

  row.innerHTML = `
    <div>
      <label style="display: block; font-size: 11px; color: var(--text-muted); margin-bottom: 4px; font-weight: 600;">SOURCE FONT (in songs.db):</label>
      <input 
        type="text" 
        class="font-select-input override-source-input" 
        list="detected-fonts-datalist" 
        value="${escapeHtml(sourceFont)}" 
        placeholder="e.g. Baloo Thambi, Bamini, Arial"
      />
    </div>
    <div class="override-arrow">&rarr;</div>
    <div>
      <label style="display: block; font-size: 11px; color: var(--text-muted); margin-bottom: 4px; font-weight: 600;">OVERRIDE DISPLAY FONT:</label>
      <input 
        type="text" 
        class="font-select-input override-target-input" 
        list="fonts-datalist" 
        value="${escapeHtml(defaultTarget)}" 
        placeholder="e.g. Latha, Arial, Noto Sans Tamil"
      />
    </div>
    <div>
      <label style="display: block; font-size: 11px; color: var(--text-muted); margin-bottom: 4px; font-weight: 600;">LIVE PREVIEW:</label>
      <div class="preview-box override-preview-box" style="font-family: '${escapeHtml(defaultTarget)}', var(--font-display);">
        மகிமை மாட்சிமை நிறைந்தவரே • Praise the Lord
      </div>
    </div>
    <div style="display: flex; align-items: flex-end; height: 100%;">
      <button type="button" class="btn-delete-override" title="Remove this override rule">&times;</button>
    </div>
  `;

  // Attach live preview updates
  const targetInput = row.querySelector('.override-target-input');
  const previewBox = row.querySelector('.override-preview-box');
  const btnDelete = row.querySelector('.btn-delete-override');

  if (targetInput && previewBox)
  {
    const updatePreview = () =>
    {
      const chosen = targetInput.value.trim() || 'sans-serif';
      previewBox.style.fontFamily = `"${chosen}", 'Baloo Thambi 2', 'Baloo Thambi', 'Mukta Malar', 'Noto Sans Tamil', var(--font-display)`;
    };
    targetInput.addEventListener('input', updatePreview);
    targetInput.addEventListener('change', updatePreview);
  }

  if (btnDelete)
  {
    btnDelete.addEventListener('click', () =>
    {
      row.remove();
      if (container.querySelectorAll('.song-override-row').length === 0)
      {
        renderSongOverridesList();
      }
    });
  }

  container.appendChild(row);

  if (animate)
  {
    row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const srcInput = row.querySelector('.override-source-input');
    if (srcInput && !sourceFont) srcInput.focus();
  }
}

// ---------------------------------------------------------------------------
// 3. Detected Song Fonts Chips
// ---------------------------------------------------------------------------
function renderDetectedFontsChips()
{
  const container = document.getElementById('detected-fonts-chips');
  if (!container) return;

  container.innerHTML = '';

  if (detectedSongFontsList.length === 0)
  {
    container.innerHTML = '<span style="font-size: 12px; color: var(--text-muted);">No distinct font tags in songs database</span>';
    return;
  }

  detectedSongFontsList.forEach((fontName) =>
  {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'font-chip';
    chip.textContent = fontName;
    chip.title = `Click to create an override rule for "${fontName}"`;

    chip.addEventListener('click', () =>
    {
      addSongOverrideRow(fontName, 'Latha');
    });

    container.appendChild(chip);
  });

  injectDetectedFontsDatalist();
}

function injectFontsDatalist()
{
  let datalist = document.getElementById('fonts-datalist');
  if (!datalist)
  {
    datalist = document.createElement('datalist');
    datalist.id = 'fonts-datalist';
    document.body.appendChild(datalist);
  }

  const allFonts = Array.from(new Set([...STANDARD_FONTS, ...detectedSongFontsList]));
  datalist.innerHTML = allFonts.map(f => `<option value="${escapeHtml(f)}"></option>`).join('');
}

function injectDetectedFontsDatalist()
{
  let datalist = document.getElementById('detected-fonts-datalist');
  if (!datalist)
  {
    datalist = document.createElement('datalist');
    datalist.id = 'detected-fonts-datalist';
    document.body.appendChild(datalist);
  }

  const fonts = Array.from(new Set([...detectedSongFontsList, 'Baloo Thambi', 'Baloo Thambi 2', 'Bamini', 'Tamil Bible', 'Tamil-Ananthi', 'Mukta Malar', 'Arial']));
  datalist.innerHTML = fonts.map(f => `<option value="${escapeHtml(f)}"></option>`).join('');
}

// ---------------------------------------------------------------------------
// 4. Save & Reset Settings Controller
// ---------------------------------------------------------------------------
async function saveSettings()
{
  const btnSaveTop = document.getElementById('btn-save-settings-top');
  const btnSaveBottom = document.getElementById('btn-save-settings');

  if (btnSaveTop) btnSaveTop.disabled = true;
  if (btnSaveBottom) btnSaveBottom.disabled = true;

  try
  {
    // 1. Gather Bible font mappings
    const bibleMappings = {};
    const bibleInputs = document.querySelectorAll('.bible-font-input');
    bibleInputs.forEach((input) =>
    {
      const versionId = input.getAttribute('data-version-id');
      const font = input.value.trim();
      if (versionId && font)
      {
        bibleMappings[versionId] = font;
      }
    });

    // 2. Gather Song font overrides
    const songOverrides = {};
    const overrideRows = document.querySelectorAll('.song-override-row');
    overrideRows.forEach((row) =>
    {
      const src = row.querySelector('.override-source-input')?.value.trim();
      const target = row.querySelector('.override-target-input')?.value.trim();
      if (src && target)
      {
        songOverrides[src] = target;
      }
    });

    const payload = {
      fontMapping: {
        bible: bibleMappings,
        songOverrides: songOverrides
      }
    };

    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok)
    {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `HTTP ${res.status}`);
    }

    const resData = await res.json();
    currentSettings = resData.config || payload;

    // Cache locally so pages pick up changes instantly on reload
    if (typeof localStorage !== 'undefined')
    {
      localStorage.setItem('vv_config_settings', JSON.stringify(currentSettings));
    }

    showAlert('✅ Settings successfully saved to data/config.json! Reload Presenter and Display to apply changes.', false);
  }
  catch (err)
  {
    console.error('Failed to save settings:', err);
    showAlert('❌ Error saving settings: ' + err.message, true);
  }
  finally
  {
    if (btnSaveTop) btnSaveTop.disabled = false;
    if (btnSaveBottom) btnSaveBottom.disabled = false;
  }
}

async function resetSettingsToDefaults()
{
  const confirmed = confirm('Are you sure you want to reset font mappings and overrides back to defaults?');
  if (!confirmed) return;

  const defaultBibleFonts = {};
  bibleVersionsList.forEach((v) =>
  {
    defaultBibleFonts[v.id] = v.defaultFont || 'Baloo Thambi 2';
  });

  currentSettings.fontMapping = {
    bible: defaultBibleFonts,
    songOverrides: {}
  };

  renderBibleVersionsTable();
  renderSongOverridesList();

  await saveSettings();
}

function showAlert(message, isError = false)
{
  const alertEl = document.getElementById('settings-alert');
  const alertText = document.getElementById('settings-alert-text');
  const alertIcon = document.getElementById('settings-alert-icon');
  if (!alertEl || !alertText) return;

  alertText.textContent = message;
  alertIcon.textContent = isError ? '❌' : '✅';
  alertEl.className = isError ? 'settings-alert error' : 'settings-alert';
  alertEl.style.display = 'flex';

  alertEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  setTimeout(() =>
  {
    alertEl.style.display = 'none';
  }, 6000);
}

function escapeHtml(text)
{
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
