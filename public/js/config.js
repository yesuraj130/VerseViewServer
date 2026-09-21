// ===========================================================================
// Application Configuration (Single Place to Edit App Title and Settings)
// ===========================================================================

const APP_CONFIG = {
  appName: 'Verse View Server',
  title: 'Verse View Server',
  tagline: 'Real-Time Church Presentation Server'
};

// Global Application Settings Object (Bible font mapping & Song font overrides)
let APP_SETTINGS = {
  fontMapping: {
    bible: {
      tamil: 'Baloo Thambi',
      kjv: 'Baloo Chettan',
      municode: 'Baloo Chettan',
      hindi_unicode: 'Baloo',
      telugu: 'Ramabhadra Telugu',
      lbla: 'Baloo Chettan'
    },
    songOverrides: {}
  }
};

// Immediately load from localStorage for synchronous instant availability
if (typeof window !== 'undefined' && typeof localStorage !== 'undefined')
{
  try
  {
    const cached = localStorage.getItem('vv_config_settings');
    if (cached)
    {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.fontMapping)
      {
        APP_SETTINGS = parsed;
      }
    }
  }
  catch (e) {}
}

// Background sync settings from server
async function refreshAppSettings()
{
  try
  {
    const res = await fetch('/api/settings', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.config)
    {
      APP_SETTINGS = data.config;
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined')
      {
        localStorage.setItem('vv_config_settings', JSON.stringify(APP_SETTINGS));
      }
    }
  }
  catch (e) {}
}

function getEffectiveSongFont(rawFont)
{
  if (!rawFont || typeof rawFont !== 'string')
  {
    const override = APP_SETTINGS?.fontMapping?.songOverrides?.['Baloo Thambi'] || APP_SETTINGS?.fontMapping?.songOverrides?.['Baloo Thambi 2'];
    return override || 'Baloo Thambi 2';
  }

  const trimmed = rawFont.trim();
  const overrides = APP_SETTINGS?.fontMapping?.songOverrides;
  if (overrides)
  {
    if (overrides[trimmed]) return overrides[trimmed];
    // Case-insensitive lookup fallback
    const lower = trimmed.toLowerCase();
    for (const [key, val] of Object.entries(overrides))
    {
      if (key.trim().toLowerCase() === lower && val)
      {
        return val;
      }
    }
  }
  return trimmed || 'Baloo Thambi 2';
}

function getEffectiveBibleFont(versionId)
{
  if (!versionId) return 'Baloo Thambi 2';
  const cleanId = String(versionId).replace(/\.db$/i, '').trim();
  const bibles = APP_SETTINGS?.fontMapping?.bible;
  if (bibles)
  {
    if (bibles[cleanId]) return bibles[cleanId];
    // Case-insensitive lookup fallback
    const lower = cleanId.toLowerCase();
    for (const [key, val] of Object.entries(bibles))
    {
      if (key.trim().toLowerCase() === lower && val)
      {
        return val;
      }
    }
  }
  return 'Baloo Thambi 2';
}

if (typeof window !== 'undefined')
{
  window.APP_CONFIG = APP_CONFIG;
  window.APP_SETTINGS = APP_SETTINGS;
  window.getEffectiveSongFont = getEffectiveSongFont;
  window.getEffectiveBibleFont = getEffectiveBibleFont;
  window.refreshAppSettings = refreshAppSettings;

  // Trigger non-blocking settings refresh on startup
  refreshAppSettings();

  document.addEventListener('DOMContentLoaded', () =>
  {
    document.querySelectorAll('[data-app-title]').forEach((el) =>
    {
      el.textContent = APP_CONFIG.title;
    });

    // Automatically initialize keepalive heartbeat for active tabs (Presenter, Display, Hub)
    initRenderKeepAlive();
  });

  // Client-Side Keep-Alive to prevent idle spin-down
  function initRenderKeepAlive()
  {
    let clientName = 'web';
    const path = window.location.pathname || '';
    if (path.includes('/presenter')) clientName = 'presenter';
    else if (path.includes('/display')) clientName = 'display';
    else clientName = 'hub';

    // Unique 4-character session ID per browser tab to distinguish multiple tabs on same machine
    const tabId = Math.random().toString(36).substring(2, 6);

    function sendHeartbeat()
    {
      try
      {
        // Bust cache and force standalone connection with unique timestamp and tab ID
        fetch(`/api/keepalive?client=${encodeURIComponent(clientName)}&tab=${tabId}&t=${Date.now()}`, {
          method: 'GET',
          cache: 'no-store',
          keepalive: false
        }).catch(() => {});
      }
      catch (e) {}
    }

    // Fire initial heartbeat after 15 seconds to announce presence in logs
    setTimeout(sendHeartbeat, 15000);

    // Send heartbeat every 9.5 minutes
    setInterval(sendHeartbeat, 9.5 * 60 * 1000);
  }
}

if (typeof module !== 'undefined' && module.exports)
{
  module.exports = APP_CONFIG;
}
