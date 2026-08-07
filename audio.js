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

  return {
    unlock() { ensureCtx(); },
    setMuted(v) { muted = !!v; },
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
  };
})();

if (typeof module !== 'undefined' && module.exports) { module.exports = { SFX }; }
