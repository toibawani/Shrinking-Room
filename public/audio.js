// audio.js
// ---------------------------------------------------------------------------
// Tiny synthesized sound engine. No audio files to host — every effect is a
// short oscillator envelope generated on the fly with the Web Audio API.
// Browsers block audio until a user gesture, so call SFX.unlock() from the
// very first click/tap of a session (game.js does this on the landing screen).
// ---------------------------------------------------------------------------

const SFX = (function () {
  let ctx = null;
  let muted = false;

  // Adaptive background layer: two detuned low oscillators (a drone) plus a
  // soft pulse whose speed and pitch both climb as a room's time runs out,
  // so the tension is audible even with your eyes on the puzzle, not the
  // clock. progress is 0 (room just started) to 1 (about to be crushed).
  const bg = { osc1: null, osc2: null, pulseOsc: null, gain: null, pulseGain: null, lfo: null, progress: 0, running: false };

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone({ freq, duration = 0.12, type = 'sine', gain = 0.15, delay = 0, glide = null }) {
    if (muted) return;
    const c = ensureCtx();
    if (!c) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime + delay);
    if (glide !== null) osc.frequency.linearRampToValueAtTime(glide, c.currentTime + delay + duration);
    g.gain.setValueAtTime(0, c.currentTime + delay);
    g.gain.linearRampToValueAtTime(gain, c.currentTime + delay + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + duration);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(c.currentTime + delay);
    osc.stop(c.currentTime + delay + duration + 0.03);
  }

  function applyBgVolume() {
    if (!bg.gain) return;
    const targetGain = muted ? 0 : 0.05 + bg.progress * 0.05;
    bg.gain.gain.linearRampToValueAtTime(targetGain, ctx.currentTime + 0.3);
  }

  // Call once when a room starts. Builds a quiet, continuous low drone that
  // gets louder, higher, and pulses faster as updateBackground(progress)
  // moves toward 1. Safe to call again without a matching stop — it tears
  // down any previous layer first.
  function startBackground() {
    const c = ensureCtx();
    if (!c) return;
    stopBackground();

    const gain = c.createGain();
    gain.gain.value = muted ? 0 : 0.05;
    gain.connect(c.destination);

    const osc1 = c.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 55;
    const osc2 = c.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 55 * 1.5; // a fifth above, keeps the drone from feeling flat

    const pulseGain = c.createGain();
    pulseGain.gain.value = 0;
    const pulseOsc = c.createOscillator();
    pulseOsc.type = 'sine';
    pulseOsc.frequency.value = 110;
    const lfo = c.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.6; // slow heartbeat at the start of a room
    const lfoGain = c.createGain();
    lfoGain.gain.value = 0.04;
    lfo.connect(lfoGain);
    lfoGain.connect(pulseGain.gain);

    osc1.connect(gain);
    osc2.connect(gain);
    pulseOsc.connect(pulseGain);
    pulseGain.connect(gain);

    [osc1, osc2, pulseOsc, lfo].forEach(o => o.start());

    bg.osc1 = osc1; bg.osc2 = osc2; bg.pulseOsc = pulseOsc; bg.lfo = lfo;
    bg.gain = gain; bg.pulseGain = pulseGain;
    bg.progress = 0;
    bg.running = true;
  }

  // Call every frame (or every wall-shrink notch) with progress in [0,1] —
  // 0 right after a room starts, 1 as the timer approaches zero.
  function updateBackground(progress) {
    if (!bg.running || !ctx) return;
    bg.progress = Math.max(0, Math.min(1, progress));
    const t = ctx.currentTime;
    const p = bg.progress;

    bg.osc1.frequency.linearRampToValueAtTime(55 + p * 40, t + 0.4);
    bg.osc2.frequency.linearRampToValueAtTime((55 + p * 40) * 1.5, t + 0.4);
    bg.pulseOsc.frequency.linearRampToValueAtTime(110 + p * 90, t + 0.4);
    bg.lfo.frequency.linearRampToValueAtTime(0.6 + p * 2.4, t + 0.4); // heartbeat speeds up
    applyBgVolume();
  }

  function stopBackground() {
    if (!bg.running) return;
    const c = ctx;
    const g = bg.gain;
    if (c && g) {
      g.gain.cancelScheduledValues(c.currentTime);
      g.gain.linearRampToValueAtTime(0, c.currentTime + 0.25);
    }
    const toStop = [bg.osc1, bg.osc2, bg.pulseOsc, bg.lfo];
    setTimeout(() => toStop.forEach(o => { try { o && o.stop(); } catch (e) {} }), 300);
    bg.osc1 = bg.osc2 = bg.pulseOsc = bg.lfo = bg.gain = bg.pulseGain = null;
    bg.running = false;
    bg.progress = 0;
  }

  return {
    unlock() { ensureCtx(); },
    setMuted(v) { muted = !!v; if (bg.gain) applyBgVolume(); },
    isMuted() { return muted; },

    click()    { tone({ freq: 520, duration: 0.045, type: 'square', gain: 0.05 }); },
    uiToggle() { tone({ freq: 420, duration: 0.05, type: 'sine', gain: 0.07 }); },
    correct()  { tone({ freq: 660, duration: 0.08, type: 'sine', gain: 0.11 }); tone({ freq: 880, duration: 0.09, delay: 0.055, type: 'sine', gain: 0.11 }); },
    wrong()    { tone({ freq: 170, duration: 0.16, type: 'sawtooth', gain: 0.09, glide: 95 }); },
    shrink()   { tone({ freq: 95, duration: 0.22, type: 'sine', gain: 0.17, glide: 55 }); },
    warning()  { tone({ freq: 760, duration: 0.055, type: 'square', gain: 0.045 }); },

    solved() {
      [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, duration: 0.13, delay: i * 0.065, type: 'triangle', gain: 0.13 }));
    },
    levelComplete() {
      [523, 659, 784, 1046, 1318].forEach((f, i) => tone({ freq: f, duration: 0.15, delay: i * 0.075, type: 'sine', gain: 0.12 }));
    },
    gameOver() {
      [300, 260, 200, 140].forEach((f, i) => tone({ freq: f, duration: 0.17, delay: i * 0.09, type: 'sawtooth', gain: 0.13 }));
    },

    startBackground, updateBackground, stopBackground,
  };
})();

if (typeof module !== 'undefined' && module.exports) { module.exports = { SFX }; }
