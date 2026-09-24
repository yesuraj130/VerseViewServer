// ===========================================================================
// Universal Server Status Tooltip Helper (for Presenter, Hub, Display, Animator)
// ===========================================================================

(function (window, document) {
  'use strict';

  let statusTooltipTimeout = null;
  let activeDotTarget = null;

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

  function positionTooltip(tooltip, targetDot) {
    if (!tooltip || !targetDot) return;
    const rect = targetDot.getBoundingClientRect();
    const dotCenterX = rect.left + (rect.width / 2);

    const tooltipWidth = tooltip.offsetWidth || 180;
    const tooltipHeight = tooltip.offsetHeight || 30;
    const padding = 10;

    const desiredLeft = dotCenterX - (tooltipWidth / 2);
    const maxLeft = Math.max(padding, window.innerWidth - tooltipWidth - padding);
    const clampedLeft = Math.max(padding, Math.min(maxLeft, desiredLeft));
    const arrowOffset = Math.max(14, Math.min(tooltipWidth - 14, dotCenterX - clampedLeft));

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
  }

  function showServerStatusTooltip(targetDot, message, isOnline, latency, options = {}) {
    if (!targetDot) return;
    activeDotTarget = targetDot;

    let tooltip = document.getElementById('server-status-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'server-status-tooltip';
      tooltip.className = 'server-status-tooltip';
      document.body.appendChild(tooltip);
    }

    const isAlreadyVisible = tooltip.classList.contains('visible');
    const lat = (typeof latency === 'number') ? latency : (window.currentSocketLatency ?? window.hubSocketLatency ?? window.displaySocketLatency ?? window.animLatency ?? null);
    const displayText = message || (isOnline ? getConnectedStatusText(lat) : '● Reconnecting to Server...');
    tooltip.textContent = displayText;

    const latClass = getLatencyClass(lat, isOnline);
    tooltip.className = `server-status-tooltip visible ${latClass}`;

    positionTooltip(tooltip, targetDot);

    // If already visible and this is a background text update (not user-triggered), don't extend timer
    if (isAlreadyVisible && options.isBackgroundUpdate) {
      return;
    }

    clearTimeout(statusTooltipTimeout);
    statusTooltipTimeout = setTimeout(() => {
      hideServerStatusTooltip();
    }, 2800);
  }

  function updateServerStatusTooltipIfVisible(message, isOnline, latency) {
    const tooltip = document.getElementById('server-status-tooltip');
    if (tooltip && tooltip.classList.contains('visible') && activeDotTarget) {
      const lat = (typeof latency === 'number') ? latency : (window.currentSocketLatency ?? window.hubSocketLatency ?? window.displaySocketLatency ?? window.animLatency ?? null);
      const displayText = message || (isOnline ? getConnectedStatusText(lat) : '● Reconnecting to Server...');
      tooltip.textContent = displayText;
      const latClass = getLatencyClass(lat, isOnline);
      tooltip.className = `server-status-tooltip visible ${latClass}`;
      positionTooltip(tooltip, activeDotTarget);
    }
  }

  function hideServerStatusTooltip() {
    const tooltip = document.getElementById('server-status-tooltip');
    if (tooltip) {
      tooltip.classList.remove('visible');
    }
    if (statusTooltipTimeout) {
      clearTimeout(statusTooltipTimeout);
      statusTooltipTimeout = null;
    }
    activeDotTarget = null;
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

      const title = dotElement.getAttribute('title') || '';
      const match = title.match(/(\d+)\s*ms/i);
      if (match) return parseInt(match[1], 10);

      return null;
    }

    function isDotConnected(socket) {
      if (socket && typeof socket.connected === 'boolean') {
        return socket.connected && !dotElement.classList.contains('disconnected');
      }
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
          updateServerStatusTooltipIfVisible(null, true, freshLat);
        });
      }
    }

    dotElement.addEventListener('mouseenter', handleInteraction);
    dotElement.addEventListener('click', handleInteraction);
    dotElement.addEventListener('touchstart', handleInteraction, { passive: true });
    dotElement.addEventListener('mouseleave', hideServerStatusTooltip);
  }

  // Global dismiss on click/touch outside
  document.addEventListener('pointerdown', (e) => {
    const tooltip = document.getElementById('server-status-tooltip');
    if (tooltip && tooltip.classList.contains('visible')) {
      if (e.target.closest('#server-status-tooltip') || e.target.closest('.server-dot') || e.target.closest('.anim-live-dot')) {
        return;
      }
      hideServerStatusTooltip();
    }
  }, { passive: true });

  window.addEventListener('blur', hideServerStatusTooltip);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hideServerStatusTooltip();
  });

  // Export functions to window
  window.showServerStatusTooltip = showServerStatusTooltip;
  window.updateServerStatusTooltipIfVisible = updateServerStatusTooltipIfVisible;
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
