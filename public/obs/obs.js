// ===========================================================================
// OBS Browser Source Controller (/obs/obs.js)
// Ultra-lightweight, resilient real-time renderer for OBS Studio CEF
// ===========================================================================

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
      // Clean off version in parentheses if desired, or keep as is
      return state.reference.trim();
    }
    if (state.verseInfo) {
      const v = state.verseInfo;
      return `Book ${v.bookNum || 1} ${v.chNum || 1}:${v.verseNum || 1}`;
    }
    return '';
  }

  // Auto-fit font size algorithm for Mode 1 and Mode 3 (Full Screen)
  function autoFitFullScreen(container, content, minPx = 28, maxPx = 140) {
    if (!container || !content) return;

    const comp = window.getComputedStyle(container);
    const padY = (parseFloat(comp.paddingTop) || 40) + (parseFloat(comp.paddingBottom) || 40);
    const maxH = container.clientHeight - padY - 10;
    if (maxH <= 0) return;

    let low = minPx;
    let high = maxPx;
    let best = minPx;

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

  // Auto-fit for Mode 2 (Lower Third / Bottom Dock, max ~30vh)
  function autoFitBottomDock(card, content) {
    if (!card || !content) return;

    // Reset to default CSS clamp first
    content.style.fontSize = '';

    // Max allowed height is ~30% of viewport height
    const maxH = Math.min(window.innerHeight * 0.32, 340);

    // If text actually overflows the ~30% height or card width, gradually reduce font size
    let currentSize = parseInt(window.getComputedStyle(content).fontSize, 10) || 40;
    const minSize = 18;

    while (currentSize > minSize && (content.scrollHeight > maxH || content.scrollWidth > content.clientWidth)) {
      currentSize -= 1;
      content.style.fontSize = currentSize + 'px';
    }
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
      // Vertical height varies based on content (e.g. 5-6 words shrinks height).
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

      // Auto adjust font size if exceeding ~30vh
      autoFitBottomDock(cardEl, contentEl);
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

  // Initial load
  fetchState();
})();
