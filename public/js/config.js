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
  });
}

if (typeof module !== 'undefined' && module.exports)
{
  module.exports = APP_CONFIG;
}
