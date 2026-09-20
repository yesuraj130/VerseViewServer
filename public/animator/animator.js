// ===========================================================================
// VerseView Experimental 3D Animator Projector (/animator/animator.js)
// Real-Time Cinema-Grade Kinetic Typography Engine
// ===========================================================================

(function() {
  'use strict';

  // -------------------------------------------------------------------------
  // 1. CONFIGURATION & PERSISTENCE
  // -------------------------------------------------------------------------
  const DEFAULT_CONFIG = {
    animStyle: 'solidworks-snap-right', // 'solidworks-snap-right', 'tak-tak-char', 'fly-by', 'flip-3d', 'kinetic-zoom', 'radiance-wave', 'typewriter'
    exitStyle: 'solidworks-sweep-left', // 'solidworks-sweep-left', 'reverse-char', 'fly-camera', 'scatter-disperse', 'flip-out', 'sink-abyss', 'fade-down'
    extrudeDepth: 44,                  // 24, 44, 64, 88 (SolidWorks depth dimensions in px)
    cameraAngle: 'isometric',          // 'isometric', 'deep-profile', 'cinema-tilt', 'top-down-cad', 'low-angle', 'frontal-3d'
    theme3D: 'stage-white-3d',         // 'stage-white-3d', 'gold-3d', 'electric-cyan', 'sunset-amber', 'ruby-crimson', 'minimal-clean'
    bgMode: 'pitch-black',             // 'pitch-black', 'cosmic-navy', 'deep-violet', 'transparent'
    speed: 'normal',                   // 'dramatic' (1.0s), 'normal' (0.6s), 'snappy' (0.35s)
    particles: true,
    floatBreathing: true
  };

  let config = { ...DEFAULT_CONFIG };
  try {
    const saved = localStorage.getItem('vv_animator_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Migrate old depths if needed
      if (parsed.extrudeDepth === 16 || parsed.extrudeDepth === 20) parsed.extrudeDepth = 24;
      if (parsed.extrudeDepth === 28 || parsed.extrudeDepth === 36) parsed.extrudeDepth = 44;
      if (parsed.extrudeDepth === 40 || parsed.extrudeDepth === 50) parsed.extrudeDepth = 64;
      if (parsed.extrudeDepth === 54 || parsed.extrudeDepth === 72) parsed.extrudeDepth = 88;
      config = { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch (e) {
    // Ignore storage restriction
  }

  function saveConfig() {
    try {
      localStorage.setItem('vv_animator_config', JSON.stringify(config));
    } catch (e) {}
  }

  // -------------------------------------------------------------------------
  // 2. DOM REFERENCES
  // -------------------------------------------------------------------------
  const stage = document.getElementById('anim-stage');
  const cameraRig = document.getElementById('anim-camera-rig');
  const floatRig = document.getElementById('anim-float-rig');
  const container = document.getElementById('anim-container');
  const liveBadge = document.getElementById('anim-live-badge');
  const liveStatusText = document.getElementById('anim-live-status');
  const toolbar = document.getElementById('anim-toolbar');
  const panel = document.getElementById('anim-panel');
  const canvas = document.getElementById('particles-canvas');

  let activeLayer = null;
  let lastState = null;
  let testIndex = 0;

  // -------------------------------------------------------------------------
  // 3. SAMPLE TEST SLIDES (For Instant Auditioning)
  // -------------------------------------------------------------------------
  const TEST_SLIDES = [
    {
      type: 'bible',
      title: 'யோவான் 3:16',
      reference: 'யோவான் 3:16',
      lines: [
        'தேவன், தம்முடைய ஒரேபேறான குமாரனை விசுவாசிக்கிறவன் எவனோ அவன் கெட்டுப்போகாமல்',
        'நித்தியஜீவனை அடையும்படிக்கு, அவரைத் தந்தருளி, இவ்வளவாய் உலகத்தில் அன்புகூர்ந்தார்.'
      ]
    },
    {
      type: 'song',
      title: 'என் இயேசுவே',
      lines: [
        'என் இயேசுவே என் நேசரே',
        'என்றென்றும் உம்மை துதிப்பேன்',
        'உம் அன்பை எண்ணி பாடுவேன்',
        'அல்லேலூயா அல்லேலூயா'
      ]
    },
    {
      type: 'bible',
      title: 'சங்கீதம் 23:1',
      reference: 'சங்கீதம் 23:1',
      lines: [
        'கர்த்தர் என் மேய்ப்பராயிருக்கிறார்; நான் தாழ்ச்சியடையேன்.'
      ]
    },
    {
      type: 'song',
      title: 'Amazing Grace',
      lines: [
        'Amazing grace how sweet the sound',
        'That saved a wretch like me',
        'I once was lost but now am found',
        'Was blind but now I see'
      ]
    }
  ];

  // -------------------------------------------------------------------------
  // 4. THEME, DEPTH & CAMERA CONTROLLERS
  // -------------------------------------------------------------------------
  let isOrbiting = false;
  let startMouseX = 0, startMouseY = 0;
  let currentPitch = 24, currentYaw = -32;

  function updateExtrusionVector(pitchDeg, yawDeg) {
    if (!container) return;
    const p = pitchDeg !== undefined ? pitchDeg : currentPitch;
    const y = yawDeg !== undefined ? yawDeg : currentYaw;

    const radYaw = (y || 0) * Math.PI / 180;
    const radPitch = (p || 0) * Math.PI / 180;

    // Optical projection of extrusion backward along camera line of sight:
    // When looking from the right (yaw < 0), the depth goes to the left (-X)
    // When looking from above (pitch > 0), the depth goes upwards (-Y)
    const dirX = Math.sin(radYaw);
    const dirY = -Math.sin(radPitch) * Math.cos(radYaw);

    container.style.setProperty('--extrude-dir-x', dirX.toFixed(4));
    container.style.setProperty('--extrude-dir-y', dirY.toFixed(4));
  }

  function setCameraAngleFromPreset(preset) {
    let pitch = 24, yaw = -32;
    switch (preset) {
      case 'isometric':
        pitch = 24; yaw = -32; break;
      case 'deep-profile':
        pitch = 16; yaw = -48; break;
      case 'cinema-tilt':
        pitch = 16; yaw = -18; break;
      case 'top-down-cad':
        pitch = 38; yaw = -30; break;
      case 'low-angle':
        pitch = -22; yaw = 20; break;
      case 'frontal-3d':
        pitch = 8; yaw = -6; break;
      default:
        pitch = 24; yaw = -32; break;
    }
    currentPitch = pitch;
    currentYaw = yaw;
    updateExtrusionVector(pitch, yaw);
    if (cameraRig) {
      cameraRig.className = 'anim-camera-rig';
      cameraRig.classList.add(`camera-${preset}`);
      cameraRig.style.transform = ''; // reset inline so CSS class preset applies
    }
  }

  function initOrbitController() {
    if (!stage || !cameraRig) return;

    stage.addEventListener('mousedown', (e) => {
      if (e.target.closest('#anim-panel') || e.target.closest('#anim-toolbar')) return;
      isOrbiting = true;
      startMouseX = e.clientX;
      startMouseY = e.clientY;
      cameraRig.style.transition = 'none';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isOrbiting) return;
      const dx = e.clientX - startMouseX;
      const dy = e.clientY - startMouseY;
      const newYaw = currentYaw + (dx * 0.35);
      const newPitch = Math.max(-80, Math.min(80, currentPitch - (dy * 0.35)));
      cameraRig.style.transform = `rotateX(${newPitch}deg) rotateY(${newYaw}deg)`;
      updateExtrusionVector(newPitch, newYaw);
    });

    window.addEventListener('mouseup', (e) => {
      if (!isOrbiting) return;
      isOrbiting = false;
      const dx = e.clientX - startMouseX;
      const dy = e.clientY - startMouseY;
      currentYaw = currentYaw + (dx * 0.35);
      currentPitch = Math.max(-80, Math.min(80, currentPitch - (dy * 0.35)));
      cameraRig.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
      updateExtrusionVector(currentPitch, currentYaw);
    });

    // Touch support for mobile / touch screens
    stage.addEventListener('touchstart', (e) => {
      if (e.target.closest('#anim-panel') || e.target.closest('#anim-toolbar')) return;
      if (e.touches.length === 1) {
        isOrbiting = true;
        startMouseX = e.touches[0].clientX;
        startMouseY = e.touches[0].clientY;
        cameraRig.style.transition = 'none';
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (!isOrbiting || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - startMouseX;
      const dy = e.touches[0].clientY - startMouseY;
      const newYaw = currentYaw + (dx * 0.35);
      const newPitch = Math.max(-80, Math.min(80, currentPitch - (dy * 0.35)));
      cameraRig.style.transform = `rotateX(${newPitch}deg) rotateY(${newYaw}deg)`;
      updateExtrusionVector(newPitch, newYaw);
    }, { passive: true });

    window.addEventListener('touchend', () => {
      if (isOrbiting) {
        isOrbiting = false;
        cameraRig.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
        updateExtrusionVector(currentPitch, currentYaw);
      }
    });
  }

  function applyAppearance() {
    // Extrusion depth CSS dimensions (SolidWorks physical extrusion)
    const depth = config.extrudeDepth || 44;
    container.style.setProperty('--extrude-depth', depth + 'px');
    container.style.setProperty('--half-depth', (depth / 2) + 'px');
    container.style.setProperty('--slice-step', (depth / 25) + 'px');
    updateExtrusionVector(currentPitch, currentYaw);

    // Background Mode
    document.body.className = '';
    document.body.classList.add(`bg-${config.bgMode}`);
    if (config.bgMode === 'transparent') {
      canvas.style.display = 'none';
    } else {
      canvas.style.display = config.particles ? 'block' : 'none';
    }

    // 3D Typography Theme
    container.className = 'anim-container';
    container.classList.add(`theme-${config.theme3D}`);

    // Camera Angle applied to cameraRig
    setCameraAngleFromPreset(config.cameraAngle || 'isometric');

    // Float breathing applied to floatRig
    if (floatRig) {
      if (config.floatBreathing) {
        floatRig.classList.add('floating');
      } else {
        floatRig.classList.remove('floating');
      }
    }

    // Reflect in settings form
    const selAnim = document.getElementById('sel-anim-style');
    const selExit = document.getElementById('sel-exit-style');
    const selExtrude = document.getElementById('sel-extrude-depth');
    const selCamera = document.getElementById('sel-camera-angle');
    const selTheme = document.getElementById('sel-theme-3d');
    const selBg = document.getElementById('sel-bg-mode');
    const selSpeed = document.getElementById('sel-speed');
    const chkParticles = document.getElementById('chk-particles');
    const chkFloat = document.getElementById('chk-float');

    if (selAnim) selAnim.value = config.animStyle;
    if (selExit) selExit.value = config.exitStyle;
    if (selExtrude) selExtrude.value = String(config.extrudeDepth || 36);
    if (selCamera) selCamera.value = config.cameraAngle || 'isometric';
    if (selTheme) selTheme.value = config.theme3D;
    if (selBg) selBg.value = config.bgMode;
    if (selSpeed) selSpeed.value = config.speed;
    if (chkParticles) chkParticles.checked = config.particles;
    if (chkFloat) chkFloat.checked = config.floatBreathing;
  }

  // Duration mapping
  function getDurationMs() {
    switch (config.speed) {
      case 'dramatic': return 950;
      case 'snappy': return 380;
      default: return 580;
    }
  }

  // -------------------------------------------------------------------------
  // 5. TEXT PARSING & AUTO-FITTING
  // -------------------------------------------------------------------------
  function extractLines(state) {
    if (Array.isArray(state.lines) && state.lines.length > 0) return state.lines;
    if (state.rawSlide) {
      return state.rawSlide.split(/<BR>|\r?\n/i).map(l => l.replace(/<[^>]*>/g, '').trim()).filter(Boolean);
    }
    return [];
  }

  function getBibleRef(state) {
    if (state.title && state.title.trim()) return state.title.trim();
    if (state.reference && state.reference.trim()) return state.reference.trim();
    if (state.verseInfo) {
      const v = state.verseInfo;
      return `Book ${v.bookNum || 1} ${v.chNum || 1}:${v.verseNum || 1}`;
    }
    return '';
  }

  // Auto-fit font size to screen dimensions
  function autoFit(layer, minPx = 28, maxPx = 110) {
    const maxW = window.innerWidth * 0.90;
    const maxH = window.innerHeight * 0.86;

    let low = minPx;
    let high = maxPx;
    let best = minPx;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      layer.style.fontSize = mid + 'px';

      const isOverflow = (layer.scrollHeight > maxH) || (layer.scrollWidth > maxW);
      if (!isOverflow) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    layer.style.fontSize = best + 'px';
  }

  // -------------------------------------------------------------------------
  // 6. 3D ENTRANCE & EXIT ANIMATION ORCHESTRATION
  // -------------------------------------------------------------------------
  function splitIntoGraphemes(text) {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      try {
        const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
        return [...segmenter.segment(text)].map(s => s.segment);
      } catch (e) {}
    }
    return Array.from(text);
  }

  function animateElementsIn(wordElements, charElements, linesData, refEl, style, dur) {
    // ⚡ 1. SolidWorks "Tak" Snap from Beyond Right (Line by Line, Character by Character)
    if (style === 'solidworks-snap-right') {
      let charStagger = 34;
      let flightDur = 240;
      let lineGap = 110;

      if (config.speed === 'snappy') {
        charStagger = 20;
        flightDur = 170;
        lineGap = 75;
      } else if (config.speed === 'dramatic') {
        charStagger = 55;
        flightDur = 360;
        lineGap = 190;
      }

      // Hide all chars initially off-screen with visibility hidden to prevent any jump or 3D flattening
      charElements.forEach(ch => {
        ch.style.visibility = 'hidden';
      });

      let currentLineStartTime = 0;

      // Animate Bible Reference badge first from beyond right if present
      if (refEl) {
        refEl.style.visibility = 'hidden';
        const refRect = refEl.getBoundingClientRect();
        const refStartX = Math.max(window.innerWidth - refRect.left + 300, window.innerWidth * 0.85);
        setTimeout(() => { refEl.style.visibility = 'visible'; }, 0);
        const rAnim = refEl.animate([
          { transform: `translate3d(${refStartX}px, 0, 40px)` },
          { offset: 0.94, transform: 'translate3d(3px, 0, 4px)' },
          { offset: 1.0, transform: 'translate3d(0, 0, 0)' }
        ], {
          duration: flightDur * 1.05,
          easing: 'cubic-bezier(0.08, 0.92, 0.22, 1)',
          fill: 'both'
        });
        rAnim.onfinish = () => {
          refEl.style.visibility = 'visible';
          refEl.style.transform = 'translate3d(0, 0, 0)';
        };
        currentLineStartTime = flightDur * 0.55;
      }

      // Grouped by Line: First char comes from beyond right, snaps like tak; following chars in same line repeat, then next line!
      const linesToAnimate = (linesData && linesData.length > 0)
        ? linesData
        : [{ chars: charElements }];

      linesToAnimate.forEach(line => {
        const lineChars = line.chars;
        lineChars.forEach((ch, charIdx) => {
          const delay = currentLineStartTime + (charIdx * charStagger);
          const rect = ch.getBoundingClientRect();
          const startX = Math.max(window.innerWidth - rect.left + 300, window.innerWidth * 0.85);

          setTimeout(() => {
            ch.style.visibility = 'visible';
          }, delay);

          // "tak is moving charactes snaps to place like abrubt stop like object hit ground"
          // High velocity flight, abrupt deceleration and rigid mechanical impact
          const cAnim = ch.animate([
            {
              transform: `translate3d(${startX}px, 0, 40px)`
            },
            {
              offset: 0.94,
              transform: 'translate3d(3px, 0, 4px)'
            },
            {
              offset: 1.0,
              transform: 'translate3d(0, 0, 0)'
            }
          ], {
            duration: flightDur,
            delay: delay,
            easing: 'cubic-bezier(0.08, 0.92, 0.22, 1)',
            fill: 'both'
          });

          cAnim.onfinish = () => {
            ch.style.visibility = 'visible';
            ch.style.transform = 'translate3d(0, 0, 0)';
          };
        });

        // Proceed to next line after line characters have launched
        currentLineStartTime += (lineChars.length * charStagger) + lineGap;
      });
      return;
    }

    // Animate Reference badge for other styles if present
    if (refEl) {
      refEl.animate([
        { opacity: 0, transform: 'translate3d(0, -35px, 140px) rotateX(30deg) scale(0.85)', filter: 'blur(5px)' },
        { opacity: 1, transform: 'translate3d(0, 0, 0) rotateX(0deg) scale(1)', filter: 'blur(0px)' }
      ], {
        duration: dur * 0.85,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
        fill: 'both'
      });
    }

    // ⚡ 2. Character Staccato 3D Stamp
    if (style === 'tak-tak-char') {
      const totalChars = charElements.length;
      const stagger = Math.min(36, Math.max(16, 1100 / Math.max(totalChars, 1)));

      charElements.forEach((ch, idx) => {
        const delay = (refEl ? 120 : 0) + idx * stagger;
        const rx = 35 + (Math.random() - 0.5) * 15;
        const zDepth = 240 + Math.random() * 60;
        const yOffset = -55 - Math.random() * 25;

        ch.animate([
          {
            opacity: 0,
            transform: `translate3d(0, ${yOffset}px, ${zDepth}px) rotateX(${rx}deg) scale(1.5)`,
            filter: 'blur(4px) brightness(1.7)'
          },
          {
            opacity: 1,
            offset: 0.72,
            transform: 'translate3d(0, 4px, -10px) rotateX(-5deg) scale(0.95)',
            filter: 'blur(0px) brightness(1.2)'
          },
          {
            opacity: 1,
            offset: 1,
            transform: 'translate3d(0, 0, 0) rotateX(0deg) scale(1)',
            filter: 'blur(0px) brightness(1)'
          }
        ], {
          duration: Math.min(dur, 420),
          delay: delay,
          easing: 'cubic-bezier(0.18, 1.4, 0.35, 1)',
          fill: 'both'
        });
      });
      return;
    }

    // Word-level or typewriter entrance
    const targetElements = (style === 'typewriter') ? charElements : wordElements;
    const totalWords = targetElements.length;

    targetElements.forEach((el, idx) => {
      let keyframes = [];
      const stagger = Math.min(28, Math.max(12, 480 / Math.max(totalWords, 1)));
      const delay = (refEl ? 100 : 0) + idx * stagger;

      switch (style) {
        case 'fly-by': {
          // Word flies from 3D space with slight random yaw/pitch, lands in place
          const rx = (Math.random() - 0.5) * 50;
          const ry = (Math.random() - 0.5) * 50;
          const rz = (Math.random() - 0.5) * 20;
          const zDepth = 600 + Math.random() * 500;
          const offsetX = (Math.random() - 0.5) * 350;
          const offsetY = (Math.random() - 0.5) * 200;

          keyframes = [
            {
              opacity: 0,
              transform: `translate3d(${offsetX}px, ${offsetY}px, ${zDepth}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(1.4)`,
              filter: 'blur(8px)'
            },
            {
              opacity: 1,
              transform: 'translate3d(0, 0, 0) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1)',
              filter: 'blur(0px)'
            }
          ];
          break;
        }

        case 'flip-3d': {
          // 3D tumble flip along X axis
          keyframes = [
            {
              opacity: 0,
              transform: 'perspective(800px) rotateX(85deg) translate3d(0, 40px, -150px)',
              filter: 'blur(4px)'
            },
            {
              opacity: 1,
              transform: 'perspective(800px) rotateX(0deg) translate3d(0, 0, 0)',
              filter: 'blur(0px)'
            }
          ];
          break;
        }

        case 'kinetic-zoom': {
          // Push-in from foreground camera depth
          keyframes = [
            {
              opacity: 0,
              transform: 'scale(1.7) translate3d(0, 0, 300px)',
              filter: 'blur(10px)'
            },
            {
              opacity: 1,
              transform: 'scale(1) translate3d(0, 0, 0)',
              filter: 'blur(0px)'
            }
          ];
          break;
        }

        case 'radiance-wave': {
          // Luminous vertical bounce wave
          keyframes = [
            {
              opacity: 0,
              transform: 'translate3d(0, 50px, -80px) scale(0.8)',
              filter: 'blur(6px) brightness(2)'
            },
            {
              opacity: 1,
              transform: 'translate3d(0, 0, 0) scale(1)',
              filter: 'blur(0px) brightness(1)'
            }
          ];
          break;
        }

        case 'typewriter':
        default: {
          // Crisp, high-speed progressive snap
          keyframes = [
            {
              opacity: 0,
              transform: 'translate3d(0, 16px, 0) scale(0.92)'
            },
            {
              opacity: 1,
              transform: 'translate3d(0, 0, 0) scale(1)'
            }
          ];
          break;
        }
      }

      el.animate(keyframes, {
        duration: dur,
        delay: delay,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
        fill: 'both'
      });
    });
  }

  function animateLayerOut(layer, style, dur, onDone) {
    if (!layer) {
      if (onDone) onDone();
      return;
    }

    const chars = Array.from(layer.querySelectorAll('.anim-char'));
    const words = Array.from(layer.querySelectorAll('.anim-word'));
    const refEl = layer.querySelector('.anim-ref');
    const linesData = layer._linesData || [];
    let animations = [];

    switch (style) {
      case 'solidworks-sweep-left': {
        // ⚡ SOLIDWORKS SWEEP BEYOND LEFT (Line by line, character by character beyond left)
        let exitCharStagger = 24;
        let exitFlightDur = 260;
        let lineExitGap = 90;

        if (config.speed === 'snappy') {
          exitCharStagger = 15;
          exitFlightDur = 180;
          lineExitGap = 60;
        } else if (config.speed === 'dramatic') {
          exitCharStagger = 38;
          exitFlightDur = 380;
          lineExitGap = 160;
        }

        let currentExitLineStart = 0;

        // Grouped by lines: first character of line moves to beyond left and disappears, then other characters in same line, then next line!
        const linesToExit = (linesData && linesData.length > 0)
          ? linesData
          : [{ chars: chars }];

        linesToExit.forEach(line => {
          const lineChars = line.chars;
          lineChars.forEach((ch, charIdx) => {
            const delay = currentExitLineStart + (charIdx * exitCharStagger);
            const rect = ch.getBoundingClientRect();
            const destX = -(rect.right + 300);

            const anim = ch.animate([
              {
                transform: 'translate3d(0, 0, 0)'
              },
              {
                offset: 0.18,
                transform: 'translate3d(6px, 0, 0)'
              },
              {
                offset: 1.0,
                transform: `translate3d(${destX}px, 0, 0)`
              }
            ], {
              duration: exitFlightDur,
              delay: delay,
              easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
              fill: 'forwards'
            });
            anim.onfinish = () => {
              ch.style.visibility = 'hidden';
            };
            animations.push(anim);
          });

          // Next line exits after this line's characters
          currentExitLineStart += (lineChars.length * exitCharStagger) + lineExitGap;
        });

        // Reference badge sweeps out along with or just after the lines
        if (refEl) {
          const refRect = refEl.getBoundingClientRect();
          const destRefX = -(refRect.right + 300);
          const refAnim = refEl.animate([
            { transform: 'translate3d(0, 0, 0)' },
            { transform: `translate3d(${destRefX}px, 0, 0)` }
          ], {
            duration: exitFlightDur * 0.85,
            delay: currentExitLineStart * 0.4,
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
            fill: 'forwards'
          });
          refAnim.onfinish = () => {
            refEl.style.visibility = 'hidden';
          };
          animations.push(refAnim);
        }
        break;
      }

      case 'reverse-char': {
        // ⚡ REVERSE CHARACTER EXIT IN DIFFERENT DIRECTION (User's Request!)
        // Characters take off in reverse order: from last char back to first char!
        // Launch direction: DOWN-RIGHT and DEEP AWAY (opposite of the top-down entrance)
        const total = chars.length;
        const stagger = Math.min(22, Math.max(8, 550 / Math.max(total, 1)));

        animations = chars.map((char, forwardIdx) => {
          const reverseIdx = (total - 1) - forwardIdx; // last char exits first
          const delay = reverseIdx * stagger;

          const destX = 85 + Math.random() * 110;
          const destY = 55 + Math.random() * 75;
          const destZ = -380 - Math.random() * 150;
          const rotY = -50 - Math.random() * 30;
          const rotZ = 20 + Math.random() * 20;

          return char.animate([
            {
              opacity: 1,
              transform: 'translate3d(0, 0, 0) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1)',
              filter: 'blur(0px) brightness(1)'
            },
            {
              opacity: 0.9,
              offset: 0.25,
              transform: 'translate3d(-6px, -12px, 35px) scale(1.08)',
              filter: 'brightness(1.5)'
            },
            {
              opacity: 0,
              offset: 1,
              transform: `translate3d(${destX}px, ${destY}px, ${destZ}px) rotateY(${rotY}deg) rotateZ(${rotZ}deg) scale(0.2)`,
              filter: 'blur(8px) brightness(0.5)'
            }
          ], {
            duration: dur * 0.7,
            delay: delay,
            easing: 'cubic-bezier(0.5, 0, 0.8, 0.4)',
            fill: 'forwards'
          });
        });

        if (refEl) {
          animations.push(refEl.animate([
            { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
            { opacity: 0, transform: 'translate3d(0, -45px, 120px) scale(0.7)', filter: 'blur(8px)' }
          ], {
            duration: dur * 0.5,
            delay: total * stagger * 0.4,
            easing: 'ease-in',
            fill: 'forwards'
          }));
        }
        break;
      }

      case 'sink-abyss': {
        // 3D sink downward into the dark floor abyss
        const targets = words.length ? words : [layer];
        animations = targets.map((w, i) => {
          return w.animate([
            { opacity: 1, transform: 'translate3d(0, 0, 0) rotateX(0deg)' },
            { opacity: 0, transform: 'translate3d(0, 180px, -400px) rotateX(65deg) scale(0.4)', filter: 'blur(10px)' }
          ], {
            duration: dur * 0.75,
            delay: i * 12,
            easing: 'cubic-bezier(0.7, 0, 0.84, 0)',
            fill: 'forwards'
          });
        });
        break;
      }

      case 'fly-camera': {
        // Zooms right past viewer's head into camera
        const targets = words.length ? words : [layer];
        animations = targets.map((el, i) => {
          return el.animate([
            { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)', filter: 'blur(0px)' },
            { opacity: 0, transform: `translate3d(${(i % 2 === 0 ? -1 : 1) * 60}px, -40px, 600px) scale(1.8)`, filter: 'blur(12px)' }
          ], {
            duration: dur * 0.7,
            delay: i * 8,
            easing: 'cubic-bezier(0.7, 0, 0.84, 0)',
            fill: 'forwards'
          });
        });
        break;
      }

      case 'scatter-disperse': {
        // Explode randomly into 3D space
        const targets = chars.length ? chars : words;
        animations = targets.map((el) => {
          const tx = (Math.random() - 0.5) * 600;
          const ty = (Math.random() - 0.5) * 400;
          const tz = (Math.random() - 0.5) * 500;
          return el.animate([
            { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
            { opacity: 0, transform: `translate3d(${tx}px, ${ty}px, ${tz}px) scale(0.4)`, filter: 'blur(8px)' }
          ], {
            duration: dur * 0.75,
            easing: 'cubic-bezier(0.4, 0, 1, 1)',
            fill: 'forwards'
          });
        });
        break;
      }

      case 'flip-out': {
        // Tumbles back into horizon
        const targets = words.length ? words : [layer];
        animations = targets.map((el, i) => {
          return el.animate([
            { opacity: 1, transform: 'rotateX(0deg) translate3d(0, 0, 0)' },
            { opacity: 0, transform: 'rotateX(-80deg) translate3d(0, -60px, -200px)', filter: 'blur(6px)' }
          ], {
            duration: dur * 0.7,
            delay: i * 6,
            easing: 'cubic-bezier(0.7, 0, 0.84, 0)',
            fill: 'forwards'
          });
        });
        break;
      }

      case 'fade-down':
      default: {
        animations = [layer.animate([
          { opacity: 1, transform: 'translate3d(0, 0, 0)' },
          { opacity: 0, transform: 'translate3d(0, 24px, 0)' }
        ], {
          duration: dur * 0.6,
          easing: 'ease-in',
          fill: 'forwards'
        })];
        break;
      }
    }

    // Wait for exit animations to finish before removing from DOM
    Promise.all(animations.map(a => a.finished)).then(() => {
      layer.remove();
      if (onDone) onDone();
    }).catch(() => {
      layer.remove();
      if (onDone) onDone();
    });
  }

  // -------------------------------------------------------------------------
  // 7. SLIDE BUILDER & RENDER PIPELINE
  // -------------------------------------------------------------------------
  function renderSlide(state) {
    if (!state) return;
    lastState = state;

    // Handle clear / blank states
    if (state.status === 'clear' || state.status === 'blank' || state.type === 'none') {
      if (activeLayer) {
        animateLayerOut(activeLayer, config.exitStyle, getDurationMs(), () => {
          activeLayer = null;
        });
      }
      return;
    }

    const lines = extractLines(state);
    const refText = (state.type === 'bible') ? getBibleRef(state) : '';

    // Create new slide layer
    const newLayer = document.createElement('div');
    newLayer.className = 'anim-slide-layer active';

    let refEl = null;
    if (refText) {
      refEl = document.createElement('div');
      refEl.className = 'anim-ref';
      refEl.textContent = refText;
      newLayer.appendChild(refEl);
    }

    const linesWrapper = document.createElement('div');
    linesWrapper.className = 'anim-lines';

    const wordElements = [];
    const charElements = [];
    const linesData = [];

    lines.forEach(lineText => {
      const lineEl = document.createElement('div');
      lineEl.className = 'anim-line';
      const lineChars = [];
      const lineWords = [];

      // Split words while preserving spacing and structure
      const words = lineText.split(/\s+/).filter(Boolean);
      words.forEach(w => {
        const wordEl = document.createElement('span');
        wordEl.className = 'anim-word';

        // Split into grapheme clusters for character-level 3D animations
        const graphemes = splitIntoGraphemes(w);
        graphemes.forEach(g => {
          const charEl = document.createElement('span');
          charEl.className = 'anim-char';
          charEl.dataset.char = g;

          // Build SolidWorks multi-layer physical extrusion (24 slices + front + back)
          const solidEl = document.createElement('span');
          solidEl.className = 'anim-char-solid';

          // Back slice (rear bounding plane)
          const backSlice = document.createElement('span');
          backSlice.className = 'anim-slice anim-slice-back';
          backSlice.setAttribute('aria-hidden', 'true');
          backSlice.textContent = g;
          solidEl.appendChild(backSlice);

          // 24 intermediate physical side slices for true volumetric extrusion depth
          for (let s = 1; s <= 24; s++) {
            const sideSlice = document.createElement('span');
            sideSlice.className = `anim-slice anim-slice-side s-${s}`;
            sideSlice.setAttribute('aria-hidden', 'true');
            sideSlice.textContent = g;
            solidEl.appendChild(sideSlice);
          }

          // Front face slice (in flow)
          const frontSlice = document.createElement('span');
          frontSlice.className = 'anim-slice anim-slice-front';
          frontSlice.textContent = g;
          solidEl.appendChild(frontSlice);

          charEl.appendChild(solidEl);

          wordEl.appendChild(charEl);
          charElements.push(charEl);
          lineChars.push(charEl);
        });

        lineEl.appendChild(wordEl);
        wordElements.push(wordEl);
        lineWords.push(wordEl);
      });

      linesWrapper.appendChild(lineEl);
      linesData.push({ lineEl, chars: lineChars, words: lineWords });
    });

    newLayer.appendChild(linesWrapper);
    newLayer._linesData = linesData;
    newLayer._refEl = refEl;
    container.appendChild(newLayer);

    // Auto-fit font size
    autoFit(newLayer);

    const dur = getDurationMs();

    // Transition out previous slide if present
    if (activeLayer) {
      const oldLayer = activeLayer;
      animateLayerOut(oldLayer, config.exitStyle, dur);
    }

    activeLayer = newLayer;

    // Animate new slide in with line-by-line choreography
    animateElementsIn(wordElements, charElements, linesData, refEl, config.animStyle, dur);
  }

  // -------------------------------------------------------------------------
  // 8. BACKGROUND PARTICLES ENGINE (Lightweight Canvas)
  // -------------------------------------------------------------------------
  function initParticles() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    const count = 45;
    const particles = [];

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 2 + 0.8,
        speedX: (Math.random() - 0.5) * 0.4,
        speedY: (Math.random() - 0.5) * 0.4,
        alpha: Math.random() * 0.6 + 0.2
      });
    }

    function loop() {
      if (config.bgMode === 'transparent' || !config.particles) {
        requestAnimationFrame(loop);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      particles.forEach(p => {
        p.x += p.speedX;
        p.y += p.speedY;

        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });

      requestAnimationFrame(loop);
    }

    window.addEventListener('resize', () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      if (activeLayer) autoFit(activeLayer);
    });

    loop();
  }

  // -------------------------------------------------------------------------
  // 9. NETWORKING (SOCKET.IO + REST API FALLBACK)
  // -------------------------------------------------------------------------
  const socket = (typeof io !== 'undefined') ? io({
    transports: ['websocket'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 400,
    reconnectionDelayMax: 1500,
    timeout: 8000
  }) : null;

  async function fetchState() {
    try {
      const res = await fetch('/api/state', { cache: 'no-store' });
      if (res.ok) {
        const state = await res.json();
        renderSlide(state);
      }
    } catch (e) {}
  }

  if (socket) {
    socket.on('connect', () => {
      liveBadge.classList.add('connected');
      liveStatusText.textContent = 'Live Connected';
      socket.emit('role:register', {
        role: 'display',
        screen: `${window.innerWidth}x${window.innerHeight} (Animator 3D)`
      });
      socket.emit('get:state');
    });

    socket.on('disconnect', () => {
      liveBadge.classList.remove('connected');
      liveStatusText.textContent = 'Reconnecting...';
    });

    socket.on('display:update', (state) => {
      renderSlide(state);
    });
  } else {
    setInterval(fetchState, 600);
  }

  // -------------------------------------------------------------------------
  // 10. UI CONTROLS & EVENT BINDINGS
  // -------------------------------------------------------------------------
  function setupUI() {
    const btnToggleSettings = document.getElementById('btn-toggle-settings');
    const btnTestSlide = document.getElementById('btn-test-slide');
    const btnFullscreen = document.getElementById('btn-fullscreen');
    const btnClosePanel = document.getElementById('btn-close-panel');

    btnToggleSettings.addEventListener('click', () => {
      panel.classList.toggle('open');
    });

    if (btnClosePanel) {
      btnClosePanel.addEventListener('click', () => {
        panel.classList.remove('open');
      });
    }

    btnTestSlide.addEventListener('click', () => {
      const sample = TEST_SLIDES[testIndex % TEST_SLIDES.length];
      testIndex++;
      renderSlide(sample);
    });

    btnFullscreen.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    // Form element listeners
    document.getElementById('sel-anim-style').addEventListener('change', (e) => {
      config.animStyle = e.target.value;
      saveConfig();
      if (lastState) renderSlide(lastState);
    });

    document.getElementById('sel-exit-style').addEventListener('change', (e) => {
      config.exitStyle = e.target.value;
      saveConfig();
    });

    const selExtrudeDepth = document.getElementById('sel-extrude-depth');
    if (selExtrudeDepth) {
      selExtrudeDepth.addEventListener('change', (e) => {
        config.extrudeDepth = parseInt(e.target.value, 10) || 36;
        saveConfig();
        applyAppearance();
      });
    }

    const selCameraAngle = document.getElementById('sel-camera-angle');
    if (selCameraAngle) {
      selCameraAngle.addEventListener('change', (e) => {
        config.cameraAngle = e.target.value;
        saveConfig();
        applyAppearance();
      });
    }

    document.getElementById('sel-theme-3d').addEventListener('change', (e) => {
      config.theme3D = e.target.value;
      saveConfig();
      applyAppearance();
    });

    document.getElementById('sel-bg-mode').addEventListener('change', (e) => {
      config.bgMode = e.target.value;
      saveConfig();
      applyAppearance();
    });

    document.getElementById('sel-speed').addEventListener('change', (e) => {
      config.speed = e.target.value;
      saveConfig();
    });

    document.getElementById('chk-particles').addEventListener('change', (e) => {
      config.particles = e.target.checked;
      saveConfig();
      applyAppearance();
    });

    document.getElementById('chk-float').addEventListener('change', (e) => {
      config.floatBreathing = e.target.checked;
      saveConfig();
      applyAppearance();
    });

    // Initialize 3D mouse / touch orbit drag controller
    initOrbitController();

    // Keyboard Shortcuts:
    // 'H' -> Toggle toolbar / panel
    // 'T' -> Trigger test slide
    // 'F' -> Toggle fullscreen
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === 'h' || e.key === 'H') {
        toolbar.classList.toggle('hidden');
        panel.classList.remove('open');
      } else if (e.key === 't' || e.key === 'T') {
        btnTestSlide.click();
      } else if (e.key === 'f' || e.key === 'F') {
        btnFullscreen.click();
      }
    });
  }

  // Initial startup
  applyAppearance();
  initParticles();
  setupUI();
  fetchState();

  // If no slide is currently broadcast, display first demo slide so user sees animations right away!
  setTimeout(() => {
    if (!lastState || lastState.status === 'clear' || lastState.type === 'none') {
      renderSlide(TEST_SLIDES[0]);
    }
  }, 400);

})();
