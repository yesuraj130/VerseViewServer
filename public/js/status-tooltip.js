// ===========================================================================
// Universal Server Status Tooltip Helper (for Presenter, Hub, Display, Animator)
// ===========================================================================

(function (window, document) {
  'use strict';

  let statusTooltipTimeout = null;

  function getLatencyClass(latency, isOnline) {
    if (!isOnline) return 'disconnected';
    if (typeof latency !== 'number' || latency < 0) return 'latency-good';
    if (latency >= 700) return 'latency-critical'; // Deep Coral Red-Orange >= 700ms
    if (latency >= 200) return 'latency-high';     // Vibrant Pure Orange >= 200ms
    if (latency >= 100) return 'latency-warn';     // Golden Amber >= 100ms
    if (latency >= 50) return 'latency-fair';      // Light Green >= 50ms
    return 'latency-good';                         // Emerald Green < 50ms
  }

  function getConnectedStatusText(latency) {
    if (typeof latency === 'number' && latency >= 0) {
      return `● Connected to Server (${latency} ms)`;
    }
    return '● Connected to Server';
  }

  function showServerStatusTooltip(targetDot, message, isOnline, latency) {
    if (!targetDot) return;

    let tooltip = document.getElementById('server-status-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'server-status-tooltip';
      tooltip.className = 'server-status-tooltip';
      document.body.appendChild(tooltip);
    }

    const lat = (typeof latency === 'number') ? latency : (window.currentSocketLatency ?? window.hubSocketLatency ?? window.displaySocketLatency ?? window.animLatency ?? null);
    const displayText = message || (isOnline ? getConnectedStatusText(lat) : '● Reconnecting to Server...');
    tooltip.textContent = displayText;

    const latClass = getLatencyClass(lat, isOnline);
    tooltip.className = `server-status-tooltip visible ${latClass}`;

    // Anchor tooltip accurately relative to target dot with screen boundary protection
    const rect = targetDot.getBoundingClientRect();
    const dotCenterX = rect.left + (rect.width / 2);

    // Use measured or estimated bounds
    const tooltipWidth = tooltip.offsetWidth || 180;
    const tooltipHeight = tooltip.offsetHeight || 30;
    const padding = 10;

    // Horizontal positioning clamped within screen edges
    const desiredLeft = dotCenterX - (tooltipWidth / 2);
    const maxLeft = Math.max(padding, window.innerWidth - tooltipWidth - padding);
    const clampedLeft = Math.max(padding, Math.min(maxLeft, desiredLeft));

    // Arrow caret alignment directly pointing to center of dot
    const arrowOffset = Math.max(14, Math.min(tooltipWidth - 14, dotCenterX - clampedLeft));

    // Vertical placement: default below; flip above if cramped at screen bottom
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = (spaceBelow < tooltipHeight + 16) && (rect.top > tooltipHeight + 16);

    if (placeAbove) {
      tooltip.classList.add('arrow-down');
      tooltip.style.top = `${Math.round(rect.top - tooltipHeight - 8)}px`;
    } else {
      tooltip.classList.remove('arrow-down');
      tooltip.style.top = `${Math.round(rect.bottom + 8)}px`;
    }

    tooltip.style.left = `${Math.round(clampedLeft)}px`;
    tooltip.style.setProperty('--arrow-x', `${Math.round(arrowOffset)}px`);

    clearTimeout(statusTooltipTimeout);
    statusTooltipTimeout = setTimeout(() => {
      tooltip.classList.remove('visible');
    }, 3200);
  }

  function hideServerStatusTooltip() {
    const tooltip = document.getElementById('server-status-tooltip');
    if (tooltip) {
      tooltip.classList.remove('visible');
      clearTimeout(statusTooltipTimeout);
    }
  }

  function attachTooltipToDot(dotElement, getSocketFn, getLatencyFn) {
    if (!dotElement) return;

    function getActiveSocket() {
      if (typeof getSocketFn === 'function') {
        const s = getSocketFn();
        if (s) return s;
      }
      return window.socket || window.hubSocket || window.displaySocket || window.animSocket || null;
    }

    function getActiveLatency() {
      if (typeof getLatencyFn === 'function') {
        const lat = getLatencyFn();
        if (typeof lat === 'number' && lat >= 0) return lat;
      }
      const winLat = window.currentSocketLatency ?? window.hubSocketLatency ?? window.displaySocketLatency ?? window.animLatency;
      if (typeof winLat === 'number' && winLat >= 0) return winLat;

      // Extract latency from dot title if present (e.g. "Connected to Server (28 ms)")
      const title = dotElement.getAttribute('title') || '';
      const match = title.match(/(\d+)\s*ms/i);
      if (match) return parseInt(match[1], 10);

      return null;
    }

    function isDotConnected(socket) {
      if (socket && typeof socket.connected === 'boolean') {
        return socket.connected && !dotElement.classList.contains('disconnected');
      }
      // If socket object isn't directly reachable, determine from dot's css state
      return !dotElement.classList.contains('disconnected');
    }

    function handleInteraction(e) {
      const socket = getActiveSocket();
      const isOnline = isDotConnected(socket);
      const latency = getActiveLatency();
      showServerStatusTooltip(dotElement, null, isOnline, latency);

      // Ping to update latency measurement dynamically if connected
      if (isOnline && socket && typeof socket.emit === 'function') {
        const pingStart = Date.now();
        socket.emit('client:ping', pingStart, () => {
          const freshLat = Math.max(0, Date.now() - pingStart);
          if (window.hubSocketLatency !== undefined) window.hubSocketLatency = freshLat;
          if (window.currentSocketLatency !== undefined) window.currentSocketLatency = freshLat;
          const tip = document.getElementById('server-status-tooltip');
          if (tip && tip.classList.contains('visible')) {
            tip.textContent = getConnectedStatusText(freshLat);
            const freshClass = getLatencyClass(freshLat, true);
            tip.className = `server-status-tooltip visible ${freshClass}`;
          }
        });
      }
    }

    dotElement.addEventListener('mouseenter', handleInteraction);
    dotElement.addEventListener('click', handleInteraction);
    dotElement.addEventListener('touchstart', handleInteraction, { passive: true });
    dotElement.addEventListener('mouseleave', hideServerStatusTooltip);
  }

  // Export functions to window
  window.showServerStatusTooltip = showServerStatusTooltip;
  window.hideServerStatusTooltip = hideServerStatusTooltip;
  window.attachTooltipToDot = attachTooltipToDot;
  window.getLatencyClass = getLatencyClass;

  // Auto-bind to any .server-dot found on the page once DOM is ready
  function initAutoDots() {
    document.querySelectorAll('.server-dot, .anim-live-dot').forEach((dot) => {
      if (dot._hasTooltipBound) return;
      dot._hasTooltipBound = true;
      attachTooltipToDot(dot, () => window.socket || window.hubSocket || window.displaySocket || window.animSocket, () => {
        return window.currentSocketLatency ?? window.hubSocketLatency ?? window.displaySocketLatency ?? window.animLatency ?? null;
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAutoDots);
  } else {
    initAutoDots();
  }

})(window, document);
