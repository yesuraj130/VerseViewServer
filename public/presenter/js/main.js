// ===========================================================================
// Presenter Console — Main Entry & Initialization Orchestrator
// ===========================================================================

document.addEventListener('DOMContentLoaded', () =>
{
  initControls();
  initResizer();
  initTabNavigation();

  // Load Songs and Bible catalogs concurrently in parallel
  Promise.all([
    initSongs(),
    initBible()
  ]).catch((err) =>
  {
    console.error('Parallel presenter initialization error:', err);
  });
});
