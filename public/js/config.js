// ===========================================================================
// Application Configuration (Single Place to Edit App Title and Settings)
// ===========================================================================

const APP_CONFIG = {
  appName: 'Verse View Server',
  title: 'Verse View Server',
  tagline: 'Real-Time Church Presentation Server'
};

if (typeof window !== 'undefined')
{
  window.APP_CONFIG = APP_CONFIG;
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

    function sendHeartbeat()
    {
      try
      {
        // Bust cache and force standalone connection with unique timestamp
        fetch(`/api/keepalive?client=${encodeURIComponent(clientName)}&t=${Date.now()}`, {
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
