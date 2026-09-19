
const viewport = document.getElementById('display-viewport');
const contentContainer = document.getElementById('display-content');
const linesContainer = document.getElementById('lines-container');
const displayRef = document.getElementById('display-ref');
const socketDot = document.getElementById('display-socket-dot');
const statusText = document.getElementById('display-status-text');
const buttonToggleFullscreen = document.getElementById('btn-toggle-fs');

// Initialize Socket.io with direct WebSocket transport and rapid reconnection
const socket = (typeof io !== 'undefined') ? io({
  transports: ['websocket'],
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 2000,
  timeout: 10000
}) : null;

function renderDisplayState(state)
{
  if (!state) return;

  // Handle Blank & Clear Statuses
  if (state.status === 'blank')
  {
    viewport.classList.add('blank-mode');
    viewport.classList.remove('clear-mode');
  }
  else if (state.status === 'clear')
  {
    viewport.classList.remove('blank-mode');
    viewport.classList.add('clear-mode');
  }
  else
  {
    viewport.classList.remove('blank-mode');
    viewport.classList.remove('clear-mode');
  }

  // Render text lines
  const rawLines = Array.isArray(state.lines) ? state.lines : (state.rawSlide ? state.rawSlide.split('<BR>') : []);
  const lines = rawLines;
  linesContainer.innerHTML = '';

  // Apply font family: use Baloo Thambi for all
  if (state.font && state.font !== 'Tamil Bible' && state.font !== 'Tamil-Ananthi' && state.font !== 'Latha' && state.font !== 'Mukta Malar' && state.font !== 'Baloo Thambi' && state.font !== 'Baloo Thambi 2')
  {
    linesContainer.style.fontFamily = `"${state.font}", 'Baloo Thambi 2', 'Baloo Thambi', 'Mukta Malar', var(--font-display)`;
  }
  else
  {
    linesContainer.style.fontFamily = `'Baloo Thambi 2', 'Baloo Thambi', 'Mukta Malar', 'Noto Sans Tamil', var(--font-display)`;
  }

  if (lines.length === 0)
  {
    const emptyLine = document.createElement('div');
    emptyLine.className = 'display-line';
    emptyLine.innerHTML = '&nbsp;';
    linesContainer.appendChild(emptyLine);
  }
  else
  {
    lines.forEach((line) =>
    {
      const lineEl = document.createElement('div');
      lineEl.className = 'display-line';
      const trimmed = line ? line.trim() : '';
      if (trimmed)
      {
        lineEl.textContent = line;
      }
      else
      {
        lineEl.innerHTML = '&nbsp;';
        lineEl.classList.add('display-line-gap');
      }
      linesContainer.appendChild(lineEl);
    });
  }

  // Render Footer Reference
  if (state.reference)
  {
    displayRef.textContent = state.reference;
    displayRef.style.display = 'block';
  }
  else
  {
    displayRef.style.display = 'none';
  }

  // Adjust font scaling based on line count and max characters
  adjustTypography(lines);
}

function adjustTypography(lines)
{
  const lineCount = lines.length;
  let maxLineLength = 0;
  for (const l of lines)
  {
    if (l.length > maxLineLength) maxLineLength = l.length;
  }

  const lineEls = linesContainer.querySelectorAll('.display-line');

  let fontSize = 'clamp(28px, 5.2vw, 76px)';
  if (lineCount >= 6 || maxLineLength > 60)
  {
    fontSize = 'clamp(20px, 3.4vw, 48px)';
  }
  else if (lineCount >= 4 || maxLineLength > 45)
  {
    fontSize = 'clamp(24px, 4.2vw, 60px)';
  }

  lineEls.forEach((el) =>
  {
    el.style.fontSize = fontSize;
  });
}

// Fallback fetch in case socket hasn't emitted yet
async function fetchCurrentState()
{
  try
  {
    const res = await fetch('/api/state');
    if (res.ok)
    {
      const state = await res.json();
      renderDisplayState(state);
    }
  }
  catch (err)
  {
    console.warn('Could not fetch state via REST:', err);
  }
}

if (socket)
{
  socket.on('connect', () =>
  {
    socketDot.classList.remove('disconnected');
    statusText.textContent = 'Live Connected';
    socket.emit('role:register', {
      role: 'display',
      screen: `${window.screen.width || window.innerWidth}x${window.screen.height || window.innerHeight}`
    });
    socket.emit('get:state');
  });

  socket.on('disconnect', () =>
  {
    socketDot.classList.add('disconnected');
    statusText.textContent = 'Reconnecting...';
  });

  socket.on('display:update', (state) =>
  {
    renderDisplayState(state);
  });
}
else
{
  // If socket.io is unavailable, poll every 500ms as fallback
  setInterval(fetchCurrentState, 500);
}

// Immediate wake-up reconnection handler for Projector/Display
function handleDisplayWakeup()
{
  if (socket)
  {
    if (!socket.connected)
    {
      socket.connect();
    }
    else
    {
      socket.emit('get:state');
    }
  }
  fetchCurrentState();
}

// 1. Detect when tab/screen wakes up or becomes visible
document.addEventListener('visibilitychange', () =>
{
  if (document.visibilityState === 'visible')
  {
    handleDisplayWakeup();
  }
});

// 2. Handle page restoration from memory/bfcache or standard page show
window.addEventListener('pageshow', (event) =>
{
  if (event.persisted)
  {
    if (statusText)
    {
      statusText.textContent = 'Syncing...';
    }
  }
  handleDisplayWakeup();
});

// 3. Window focus
window.addEventListener('focus', () =>
{
  handleDisplayWakeup();
});

// 4. Device network restored
window.addEventListener('online', () =>
{
  handleDisplayWakeup();
});

// 5. Timer drift detection (detects OS sleep / freeze even without visibility event)
let lastDisplayHeartbeat = Date.now();
setInterval(() =>
{
  const now = Date.now();
  const elapsed = now - lastDisplayHeartbeat;
  lastDisplayHeartbeat = now;
  if (elapsed > 7000)
  {
    handleDisplayWakeup();
  }
}, 2000);

// Fullscreen controls
function toggleFullscreen()
{
  if (!document.fullscreenElement)
  {
    document.documentElement.requestFullscreen().catch((err) =>
    {
      console.warn('Error attempting to enable fullscreen:', err.message);
    });
  }
  else
  {
    if (document.exitFullscreen)
    {
      document.exitFullscreen();
    }
  }
}

if (buttonToggleFullscreen)
{
  buttonToggleFullscreen.addEventListener('click', (e) =>
  {
    e.stopPropagation();
    toggleFullscreen();
  });
}

document.body.addEventListener('dblclick', toggleFullscreen);
