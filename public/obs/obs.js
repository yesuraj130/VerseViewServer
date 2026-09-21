// ===========================================================================
// OBS Browser Source Controller (/obs/obs.js)
// Ultra-lightweight, resilient real-time renderer for OBS Studio CEF
// ===========================================================================

// ===========================================================================
// OBS CONFIGURATION (Easy Customization)
// Change margins, font sizes, line heights, spacing, background color & blur here
// ===========================================================================
const CONFIG = {
  // -------------------------------------------------------------------------
  // MODE 1 & 3: FULLSCREEN OVERLAYS (1 = Transparent Centered, 3 = Black Top)
  // -------------------------------------------------------------------------
  fullScreen: {
    minFontSize: 28,             // Minimum font size in pixels (e.g. 24, 28, 36)
    maxFontSize: 140,            // Maximum font size in pixels (e.g. 110, 140, 180)
    lineHeight: 1.35,            // Line height multiplier (e.g. 1.2, 1.35, 1.5)
    lineGap: '0.2em',            // Spacing between lines (e.g. '0.2em' or '12px')
    refFontSize: '1em',          // Bible reference size ('1em' = same as Bible text)
    refMarginBottom: '0.25em',   // Space below the top Bible reference header
    // Outer screen margins / padding:
    paddingTop: '1.5vh',         // Top screen margin
    paddingBottom: '1.5vh',      // Bottom screen margin
    paddingLeft: '2vw',          // Left screen margin
    paddingRight: '2vw'          // Right screen margin
  },

  // -------------------------------------------------------------------------
  // MODE 2: LOWER THIRD / BOTTOM DOCK
  // In OBS, size this source directly (30%, 50%, or 100% height as you prefer).
  // The semi-transparent background hugs ONLY the text area and aligns to bottom.
  // -------------------------------------------------------------------------
  lowerThird: {
    minFontSize: 24,             // Minimum font size in pixels
    maxFontSize: 58,             // Maximum font size in pixels
    lineHeight: 1.35,            // Line height multiplier
    lineGap: '0.2em',            // Spacing between lines
    refFontSize: '1em',          // Bible reference size ('1em' = same as Bible text)
    // Box padding around text:
    paddingTop: '8px',           // Padding above text inside dock
    paddingBottom: '8px',        // Padding below text inside dock
    paddingLeft: '16px',         // Padding left inside dock
    paddingRight: '16px',        // Padding right inside dock
    // Background color & transparency:
    // Examples:
    // 'rgba(10, 15, 29, 0.82)'  -> 82% dark navy/slate
    // 'rgba(0, 0, 0, 0.70)'     -> 70% black
    // 'rgba(0, 0, 0, 0.90)'     -> 90% black
    backgroundColor: 'rgba(10, 15, 29, 0.82)',
    backdropBlur: '12px',        // Glass blur ('0px' to turn off blur)
    borderTop: '1px solid rgba(255, 255, 255, 0.16)', // Top border line ('none' to remove)
  }
};

(function() {
  'use strict';

  // Identify OBS page mode (1, 2, or 3)
  const mode = parseInt(document.body.dataset.obsMode || '1', 10);
  const viewport = document.getElementById('obs-viewport');
  const contentEl = document.getElementById('obs-content');
  const cardEl = document.getElementById('obs-card') || contentEl;

  // Track latest authoritative state
  let lastState = null;
  let resizeTimeout = null;

  // Apply JavaScript configuration into CSS variables dynamically
  function applyConfig() {
    const root = document.documentElement;
    if (mode === 1 || mode === 3) {
      const fs = CONFIG.fullScreen;
      root.style.setProperty('--obs-line-height', String(fs.lineHeight));
      root.style.setProperty('--obs-line-gap', fs.lineGap);
      root.style.setProperty('--obs-ref-font-size', fs.refFontSize);
      root.style.setProperty('--obs-ref-margin-bottom', fs.refMarginBottom);
      root.style.setProperty('--obs-fs-padding-top', fs.paddingTop);
      root.style.setProperty('--obs-fs-padding-bottom', fs.paddingBottom);
      root.style.setProperty('--obs-fs-padding-left', fs.paddingLeft);
      root.style.setProperty('--obs-fs-padding-right', fs.paddingRight);
    } else if (mode === 2) {
      const lt = CONFIG.lowerThird;
      root.style.setProperty('--obs-line-height', String(lt.lineHeight));
      root.style.setProperty('--obs-line-gap', lt.lineGap);
      root.style.setProperty('--obs-ref-font-size', lt.refFontSize);
      root.style.setProperty('--obs-dock-bg', lt.backgroundColor);
      root.style.setProperty('--obs-dock-blur', lt.backdropBlur);
      root.style.setProperty('--obs-dock-border-top', lt.borderTop);
      root.style.setProperty('--obs-dock-pad-top', lt.paddingTop);
      root.style.setProperty('--obs-dock-pad-bottom', lt.paddingBottom);
      root.style.setProperty('--obs-dock-pad-left', lt.paddingLeft);
      root.style.setProperty('--obs-dock-pad-right', lt.paddingRight);
    }
  }

  // Connect via direct low-latency WebSocket
  const socket = (typeof io !== 'undefined') ? io({
    transports: ['websocket'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 400,
    reconnectionDelayMax: 1500,
    timeout: 8000
  }) : null;

  // Clean lines helper
  function extractLines(state) {
    if (Array.isArray(state.lines) && state.lines.length > 0) {
      return state.lines;
    }
    if (state.rawSlide) {
      return state.rawSlide.split(/<BR>|\r?\n/i).map(l => l.replace(/<[^>]*>/g, '').trim()).filter(Boolean);
    }
    return [];
  }

  // Get clean Bible reference
  function getBibleRef(state) {
    if (state.title && state.title.trim()) {
      return state.title.trim();
    }
    if (state.reference && state.reference.trim()) {
      return state.reference.trim();
    }
    if (state.verseInfo) {
      const v = state.verseInfo;
      return `Book ${v.bookNum || 1} ${v.chNum || 1}:${v.verseNum || 1}`;
    }
    return '';
  }

  // Auto-fit font size algorithm for Mode 1 and Mode 3 (Full Screen)
  function autoFitFullScreen(container, content) {
    if (!container || !content) return;
    const cfg = CONFIG.fullScreen;

    const comp = window.getComputedStyle(container);
    const padY = (parseFloat(comp.paddingTop) || 20) + (parseFloat(comp.paddingBottom) || 20);
    const maxH = container.clientHeight - padY - 8;
    if (maxH <= 0) return;

    let low = cfg.minFontSize;
    let high = cfg.maxFontSize;
    let best = cfg.minFontSize;

    // Binary search for pixel-perfect font size
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      content.style.fontSize = mid + 'px';

      // Overflow occurs ONLY when text height exceeds available height
      // or an unbroken word is wider than the content width
      const isOverflow = (content.scrollHeight > maxH) || (content.scrollWidth > content.clientWidth);
      if (!isOverflow) {
        best = mid;
        low = mid + 1; // Try larger
      } else {
        high = mid - 1; // Try smaller
      }
    }

    content.style.fontSize = best + 'px';
  }

  // Auto-fit for Mode 2 (Lower Third / Bottom Dock)
  // Aligns to bottom with min and max font size, NO % calculation.
  function autoFitLowerThird(card, content) {
    if (!card || !content) return;
    const cfg = CONFIG.lowerThird;

    const maxH = window.innerHeight - 8;
    if (maxH <= 0) return;

    let low = cfg.minFontSize;
    let high = cfg.maxFontSize;
    let best = cfg.minFontSize;

    // Binary search between minFontSize and maxFontSize
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      content.style.fontSize = mid + 'px';

      // Overflow occurs if text exceeds available window height or unbroken word exceeds width
      const isOverflow = (card.scrollHeight > maxH) || (content.scrollWidth > content.clientWidth);
      if (!isOverflow) {
        best = mid;
        low = mid + 1; // Try larger font
      } else {
        high = mid - 1; // Try smaller font
      }
    }

    content.style.fontSize = best + 'px';
  }

  // Main Render Routine
  function render(state) {
    if (!state) return;
    lastState = state;

    // 1. Handle Clear / Blank / None States
    if (state.status === 'clear' || state.status === 'blank' || state.type === 'none') {
      if (viewport) {
        viewport.classList.remove('obs-visible');
        viewport.classList.add('obs-hidden');
      }
      if (cardEl && cardEl !== viewport) {
        cardEl.classList.remove('obs-visible');
        cardEl.classList.add('obs-hidden');
      }
      return;
    }

    // 2. Make visible
    if (viewport) {
      viewport.classList.remove('obs-hidden');
      viewport.classList.add('obs-visible');
    }
    if (cardEl && cardEl !== viewport) {
      cardEl.classList.remove('obs-hidden');
      cardEl.classList.add('obs-visible');
    }

    const lines = extractLines(state);
    contentEl.innerHTML = '';

    // 3. Render according to Mode and Type
    if (mode === 1 || mode === 3) {
      // ---------------------------------------------------------------------
      // MODE 1 & 3:
      // For song: only slide text enough.
      // For bible: reference in top line, and content in second onwards.
      // Bible reference has same font size as bible text.
      // ---------------------------------------------------------------------
      if (state.type === 'bible') {
        const refText = getBibleRef(state);
        if (refText) {
          const refEl = document.createElement('div');
          refEl.className = 'obs-bible-top-ref';
          refEl.textContent = refText;
          contentEl.appendChild(refEl);
        }

        const linesWrapper = document.createElement('div');
        linesWrapper.className = 'obs-lines';
        lines.forEach(lineText => {
          const lineEl = document.createElement('div');
          lineEl.className = 'obs-line';
          lineEl.textContent = lineText;
          linesWrapper.appendChild(lineEl);
        });
        contentEl.appendChild(linesWrapper);
      } else {
        // Song or other slide: ONLY slide text enough
        const linesWrapper = document.createElement('div');
        linesWrapper.className = 'obs-lines';
        if (lines.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'obs-line';
          empty.innerHTML = '&nbsp;';
          linesWrapper.appendChild(empty);
        } else {
          lines.forEach(lineText => {
            const lineEl = document.createElement('div');
            lineEl.className = 'obs-line';
            lineEl.textContent = lineText;
            linesWrapper.appendChild(lineEl);
          });
        }
        contentEl.appendChild(linesWrapper);
      }

      // Auto fit font size for full page
      autoFitFullScreen(viewport, contentEl);

    } else if (mode === 2) {
      // ---------------------------------------------------------------------
      // MODE 2:
      // For song: slide text in bottom dock card.
      // For bible: bibleversetext (reference) in same paragraph!
      // Aligned to bottom, hugs text strictly, no % calculation.
      // ---------------------------------------------------------------------
      if (state.type === 'bible') {
        const refText = getBibleRef(state);
        const verseText = lines.join(' ').replace(/\s+/g, ' ').trim();

        const p = document.createElement('p');
        p.className = 'obs-bible-paragraph';

        const textNode = document.createTextNode(verseText + ' ');
        p.appendChild(textNode);

        if (refText) {
          const refSpan = document.createElement('span');
          refSpan.className = 'obs-bible-inline-ref';
          refSpan.textContent = `(${refText})`;
          p.appendChild(refSpan);
        }

        contentEl.appendChild(p);
      } else {
        // Song slide in bottom dock
        const linesWrapper = document.createElement('div');
        linesWrapper.className = 'obs-lines obs-dock-song-lines';
        lines.forEach(lineText => {
          const lineEl = document.createElement('div');
          lineEl.className = 'obs-line';
          lineEl.textContent = lineText;
          linesWrapper.appendChild(lineEl);
        });
        contentEl.appendChild(linesWrapper);
      }

      // Auto fit font size between minFontSize and maxFontSize for lower third
      autoFitLowerThird(cardEl, contentEl);
    }
  }

  // Fetch REST API state fallback
  async function fetchState() {
    try {
      const res = await fetch('/api/state', { cache: 'no-store' });
      if (res.ok) {
        const state = await res.json();
        render(state);
      }
    } catch (e) {
      // Ignore network errors in OBS during startup
    }
  }

  // Socket.io event bindings
  if (socket) {
    socket.on('connect', () => {
      socket.emit('role:register', {
        role: 'display',
        screen: `${window.innerWidth}x${window.innerHeight} (OBS-${mode})`
      });
      socket.emit('get:state');
    });

    socket.on('display:update', (state) => {
      render(state);
    });
  } else {
    setInterval(fetchState, 500);
  }

  // Reconnection and wake-up listeners (crucial for OBS scene switches)
  function handleWakeup() {
    if (socket) {
      if (!socket.connected) {
        socket.connect();
      } else {
        socket.emit('get:state');
      }
    }
    fetchState();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') handleWakeup();
  });
  window.addEventListener('pageshow', handleWakeup);
  window.addEventListener('focus', handleWakeup);
  window.addEventListener('online', handleWakeup);

  // Window resize handler with debounce
  window.addEventListener('resize', () => {
    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (lastState) render(lastState);
    }, 80);
  });

  // Initial config apply & load
  applyConfig();
  fetchState();
})();
