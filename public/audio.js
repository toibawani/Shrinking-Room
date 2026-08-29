// audio.js — Synthesized sound engine (Web Audio API, no asset files).

const SFX = (function () {
  let ctx = null;
  let muted = false;
  let bgPaused = false;
  let savedBgGain = 0.05;

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
    const targetGain = muted || bgPaused ? 0 : savedBgGain;
    bg.gain.gain.linearRampToValueAtTime(targetGain, ctx.currentTime + 0.25);
  }

  function startBackground() {
    const c = ensureCtx();
    if (!c) return;
    stopBackground();
    bgPaused = false;

    const gain = c.createGain();
    gain.gain.value = muted ? 0 : 0.05;
    gain.connect(c.destination);

    const osc1 = c.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 52;
    const osc2 = c.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 78;

    const pulseGain = c.createGain();
    pulseGain.gain.value = 0;
    const pulseOsc = c.createOscillator();
    pulseOsc.type = 'sine';
    pulseOsc.frequency.value = 104;
    const lfo = c.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.5;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 0.035;
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
    savedBgGain = 0.05;
  }

  function updateBackground(progress) {
    if (!bg.running || !ctx) return;
    bg.progress = Math.max(0, Math.min(1, progress));
    const t = ctx.currentTime;
    const p = bg.progress;

    bg.osc1.frequency.linearRampToValueAtTime(52 + p * 45, t + 0.4);
    bg.osc2.frequency.linearRampToValueAtTime(78 + p * 55, t + 0.4);
    bg.pulseOsc.frequency.linearRampToValueAtTime(104 + p * 80, t + 0.4);
    bg.lfo.frequency.linearRampToValueAtTime(0.5 + p * 2.8, t + 0.4);
    savedBgGain = 0.04 + p * 0.06;
    if (!bgPaused && !muted) {
      bg.gain.gain.linearRampToValueAtTime(savedBgGain, t + 0.3);
    }
  }

  function pauseBackground() {
    if (!bg.running) return;
    bgPaused = true;
    applyBgVolume();
  }

  function resumeBackground() {
    if (!bg.running) return;
    bgPaused = false;
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
    bgPaused = false;
  }

  return {
    unlock() { ensureCtx(); },
    setMuted(v) { muted = !!v; applyBgVolume(); },
    isMuted() { return muted; },

    click()    { tone({ freq: 480, duration: 0.04, type: 'square', gain: 0.04 }); },
    uiToggle() { tone({ freq: 400, duration: 0.05, type: 'sine', gain: 0.06 }); },
    correct()  { tone({ freq: 620, duration: 0.07, type: 'sine', gain: 0.1 }); tone({ freq: 830, duration: 0.08, delay: 0.05, type: 'sine', gain: 0.1 }); },
    wrong()    { tone({ freq: 160, duration: 0.14, type: 'sawtooth', gain: 0.08, glide: 90 }); },
    shrink()   { tone({ freq: 88, duration: 0.2, type: 'sine', gain: 0.14, glide: 50 }); },
    warning()  { tone({ freq: 720, duration: 0.05, type: 'square', gain: 0.04 }); },

    solved() {
      [494, 622, 740, 988].forEach((f, i) => tone({ freq: f, duration: 0.12, delay: i * 0.06, type: 'triangle', gain: 0.11 }));
    },
    levelComplete() {
      [494, 622, 740, 988, 1175].forEach((f, i) => tone({ freq: f, duration: 0.14, delay: i * 0.07, type: 'sine', gain: 0.1 }));
    },
    gameOver() {
      [280, 240, 185, 130].forEach((f, i) => tone({ freq: f, duration: 0.16, delay: i * 0.085, type: 'sawtooth', gain: 0.11 }));
    },

    startBackground, updateBackground, pauseBackground, resumeBackground, stopBackground,
  };
})();

if (typeof module !== 'undefined' && module.exports) { module.exports = { SFX }; }
