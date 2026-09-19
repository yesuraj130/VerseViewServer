// ===========================================================================
// Progressive Web App (PWA) Manager & In-App Installation Flow
// ===========================================================================

(function() {
  'use strict';

  // 1. Service Worker Registration
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then((reg) => {
          console.log('[PWA] Service Worker registered successfully with scope:', reg.scope);
        })
        .catch((err) => {
          console.warn('[PWA] Service Worker registration failed:', err);
        });
    });
  }

  // 2. Install Prompt State & Helpers
  let deferredInstallPrompt = null;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent || '');
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                       (window.navigator && window.navigator.standalone === true);

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    updateInstallButtonState();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    updateInstallButtonState();
    console.log('[PWA] App successfully installed');
  });

  function updateInstallButtonState() {
    const installBtns = document.querySelectorAll('[data-pwa-install-btn]');
    installBtns.forEach(btn => {
      if (isStandalone) {
        btn.style.display = 'none';
      } else if (deferredInstallPrompt) {
        btn.style.display = 'inline-flex';
        btn.title = 'Install App on Device';
      } else if (isIOS) {
        btn.style.display = 'inline-flex';
        btn.title = 'Install on iPhone / iPad';
      } else {
        btn.style.display = 'none';
      }
    });
  }

  function triggerPWAInstall() {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('[PWA] User accepted installation prompt');
        }
        deferredInstallPrompt = null;
        updateInstallButtonState();
      });
    } else if (isIOS) {
      showIOSInstallModal();
    }
  }

  function showIOSInstallModal() {
    let modal = document.getElementById('pwa-ios-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'pwa-ios-modal';
      modal.className = 'modal-backdrop';
      modal.style.display = 'flex';
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 380px; text-align: center; padding: 24px;">
          <div style="font-size: 32px; margin-bottom: 12px;">📱</div>
          <h3 style="font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 8px;">Install on iPhone / iPad</h3>
          <p style="font-size: 13px; color: var(--color-font-muted); line-height: 1.5; margin-bottom: 18px;">
            1. Tap the <strong>Share</strong> icon in Safari toolbar at the bottom.<br>
            2. Scroll down and select <strong>Add to Home Screen</strong>.
          </p>
          <button type="button" class="btn-primary" id="pwa-ios-modal-close" style="width: 100%;">Got it</button>
        </div>
      `;
      document.body.appendChild(modal);
      document.getElementById('pwa-ios-modal-close').addEventListener('click', () => {
        modal.remove();
      });
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
      });
    } else {
      modal.style.display = 'flex';
    }
  }

  // 3. Fullscreen Controller (Supports both Chrome Browser and PWA)
  function isFullscreen() {
    return !!(document.fullscreenElement ||
              document.webkitFullscreenElement ||
              document.mozFullScreenElement ||
              document.msFullscreenElement);
  }

  function toggleFullscreen() {
    if (!isFullscreen()) {
      const docEl = document.documentElement;
      if (docEl.requestFullscreen) {
        docEl.requestFullscreen().catch(err => console.warn('[PWA] Fullscreen error:', err.message));
      } else if (docEl.webkitRequestFullscreen) {
        docEl.webkitRequestFullscreen();
      } else if (docEl.mozRequestFullScreen) {
        docEl.mozRequestFullScreen();
      } else if (docEl.msRequestFullscreen) {
        docEl.msRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
    }
  }

  function updateFullscreenButtons() {
    const fsBtns = document.querySelectorAll('[data-fullscreen-btn]');
    const active = isFullscreen();
    fsBtns.forEach(btn => {
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      if (active) {
        btn.classList.add('active-fullscreen');
        btn.title = 'Exit Fullscreen Mode';
      } else {
        btn.classList.remove('active-fullscreen');
        btn.title = 'Enter Fullscreen Mode (Edge-to-Edge Notch View)';
      }
    });
  }

  document.addEventListener('fullscreenchange', updateFullscreenButtons);
  document.addEventListener('webkitfullscreenchange', updateFullscreenButtons);

  document.addEventListener('DOMContentLoaded', () => {
    updateInstallButtonState();
    updateFullscreenButtons();

    // Auto-enter immersive fullscreen on first tap/interaction if launched in PWA mode
    const autoFullscreenHandler = () => {
      const displayModePWA = window.matchMedia('(display-mode: standalone)').matches ||
                             window.matchMedia('(display-mode: fullscreen)').matches ||
                             (window.navigator && window.navigator.standalone === true);
      if (displayModePWA && !isFullscreen()) {
        const docEl = document.documentElement;
        if (docEl.requestFullscreen) {
          docEl.requestFullscreen().catch(() => {});
        } else if (docEl.webkitRequestFullscreen) {
          docEl.webkitRequestFullscreen();
        }
      }
      document.removeEventListener('click', autoFullscreenHandler);
      document.removeEventListener('touchstart', autoFullscreenHandler);
    };

    document.addEventListener('click', autoFullscreenHandler, { once: true });
    document.addEventListener('touchstart', autoFullscreenHandler, { once: true });

    document.querySelectorAll('[data-pwa-install-btn]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        triggerPWAInstall();
      });
    });

    document.querySelectorAll('[data-fullscreen-btn]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        toggleFullscreen();
      });
    });
  });

  window.PWA = {
    triggerInstall: triggerPWAInstall,
    toggleFullscreen: toggleFullscreen,
    isFullscreen: isFullscreen,
    isStandalone: isStandalone,
    isIOS: isIOS
  };
})();
