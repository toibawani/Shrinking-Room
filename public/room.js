// room.js — the room itself. One renderer, used by the game stage and by the
// sign-in screen's preview. Flat fills only: bone floor, bone-2 walls, ink
// edges, signal pressure. No gradients, no glow, no rounded corners.
//
// Everything here is in device-independent pixels; callers pass the canvas
// size after the devicePixelRatio transform has been applied.

const RoomRender = (function () {
  const COLOR = {
    ink: '#16150F',
    bone: '#E7E2D6',
    bone2: '#DCD6C8',
    signal: '#B8260F',
  };

  const WALL_BAND = 10; // px of wall thickness drawn inside the floor edge

  /**
   * Draws one frame of a room.
   * size        current inner room size in px
   * targetSize  where the walls are heading, drawn as a dashed outline
   * notches     how many times the walls will step inward this room
   * closed      how many of those steps are done
   */
  function drawRoom(ctx, opts) {
    const width = opts.width;
    const height = opts.height;
    const size = Math.max(24, opts.size);
    const initialSize = opts.initialSize || size;
    const crushSize = opts.crushSize || size;
    const range = Math.max(1, initialSize - crushSize);
    const compression = Math.min(1, Math.max(0, (initialSize - size) / range));
    const warning = !!opts.warning;
    const cx = width / 2;
    const cy = height / 2;
    const x = cx - size / 2;
    const y = cy - size / 2;

    // The dark outside the room.
    ctx.fillStyle = COLOR.ink;
    ctx.fillRect(0, 0, width, height);

    // The floor.
    ctx.fillStyle = COLOR.bone;
    ctx.fillRect(x, y, size, size);

    // Wall thickness reads as a second tone inside the floor edge.
    const band = Math.min(WALL_BAND, Math.max(4, size * 0.03));
    ctx.fillStyle = COLOR.bone2;
    ctx.fillRect(x, y, size, band);
    ctx.fillRect(x, y + size - band, size, band);
    ctx.fillRect(x, y, band, size);
    ctx.fillRect(x + size - band, y, band, size);

    // Floor outline and the inside edge of the wall band, so the frame reads
    // as thickness rather than a picture frame.
    ctx.strokeStyle = COLOR.ink;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
    if (band > 5) {
      ctx.strokeRect(x + band, y + band, size - band * 2, size - band * 2);
    }

    // Corner marks: the walls have a frame, not a glow.
    const mark = Math.min(28, size * 0.12);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, y + mark); ctx.lineTo(x, y); ctx.lineTo(x + mark, y);
    ctx.moveTo(x + size - mark, y); ctx.lineTo(x + size, y); ctx.lineTo(x + size, y + mark);
    ctx.moveTo(x, y + size - mark); ctx.lineTo(x, y + size); ctx.lineTo(x + mark, y + size);
    ctx.moveTo(x + size - mark, y + size); ctx.lineTo(x + size, y + size); ctx.lineTo(x + size, y + size - mark);
    ctx.stroke();

    // Where the walls are heading. Dashed so it reads as intent, not a wall.
    if (opts.targetSize && Math.abs(opts.targetSize - size) > 1) {
      const ts = Math.max(16, opts.targetSize);
      const tx = cx - ts / 2;
      const ty = cy - ts / 2;
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLOR.ink;
      ctx.globalAlpha = 0.75;
      ctx.strokeRect(tx + 1, ty + 1, ts - 2, ts - 2);
      ctx.restore();
    }

    // Notch ticks on the top wall: how many steps this room has, and how many
    // are spent. Ink marks, no red unless the room is nearly gone.
    const notches = opts.notches || 0;
    const closed = Math.min(opts.closed || 0, notches);
    if (notches > 1) {
      const step = size / notches;
      ctx.save();
      ctx.lineWidth = 2;
      for (let i = 0; i <= notches; i++) {
        const tickX = Math.round(x + step * i);
        const spent = i <= closed;
        ctx.strokeStyle = COLOR.ink;
        ctx.beginPath();
        ctx.moveTo(tickX, y);
        ctx.lineTo(tickX, y + (spent ? band : band / 2));
        ctx.stroke();
      }
      ctx.restore();
    }

    // Pressure: a solid signal band that thickens as the walls close in. It
    // only appears once the room is properly tight, and it is the only red in
    // the room.
    const pressure = Math.max(0, compression - 0.45) / 0.55;
    if (pressure > 0 || warning) {
      const amount = warning ? Math.max(pressure, 0.7) : pressure;
      const bandWidth = 2 + amount * 6;
      ctx.save();
      ctx.strokeStyle = COLOR.signal;
      ctx.lineWidth = bandWidth;
      const inset = band + bandWidth / 2;
      ctx.strokeRect(x + inset, y + inset, size - inset * 2, size - inset * 2);
      ctx.restore();
    }
  }

  function ease(t) {
    // Smoothstep: the walls have mass. Never linear.
    return t * t * (3 - 2 * t);
  }

  /**
   * Animates a room shrinking and resetting inside a canvas element.
   * Used by the auth screen. Honours reduced motion with a static frame.
   */
  function mountPreview(canvas, opts) {
    const options = Object.assign({
      initialSize: 520,
      crushSize: 190,
      stage: 600,
      duration: 9000,
      hold: 1400,
      notches: 4,
      reduced: false,
    }, opts || {});

    let rafId = null;
    let startedAt = null;
    let stopped = false;
    let lastW = 0;
    let lastH = 0;
    let ctx = null;

    function ensureContext() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      if (w !== lastW || h !== lastH || !ctx) {
        lastW = w;
        lastH = h;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      return { ctx, w, h };
    }

    function stageSizeFor(progress) {
      const size = options.initialSize - (options.initialSize - options.crushSize) * ease(progress);
      const scale = Math.min(lastW, lastH) / options.stage;
      return size * scale;
    }

    function paint(progress) {
      const view = ensureContext();
      const size = stageSizeFor(progress);
      const stepLength = options.duration / Math.max(1, options.notches);
      const closed = Math.min(options.notches, Math.floor((progress * options.duration) / stepLength));
      const scaledCrush = options.crushSize * (Math.min(view.w, view.h) / options.stage);
      const scaledInitial = options.initialSize * (Math.min(view.w, view.h) / options.stage);
      drawRoom(view.ctx, {
        width: view.w,
        height: view.h,
        size,
        targetSize: Math.max(scaledCrush, size - (scaledInitial - scaledCrush) / options.notches),
        initialSize: scaledInitial,
        crushSize: scaledCrush,
        notches: options.notches,
        closed,
      });
    }

    function tick(now) {
      if (stopped) return;
      if (startedAt === null) startedAt = now;
      const cycle = options.duration + options.hold;
      const elapsed = (now - startedAt) % cycle;
      const progress = Math.min(1, elapsed / options.duration);
      paint(progress);
      rafId = requestAnimationFrame(tick);
    }

    function start() {
      stopped = false;
      if (options.reduced) {
        paint(0.62);
        return;
      }
      if (rafId === null) rafId = requestAnimationFrame(tick);
    }

    function stop() {
      stopped = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
    }

    function onVisibility() {
      if (options.reduced) return;
      if (document.hidden) stop();
      else if (!stopped) start();
    }

    function onResize() {
      lastW = 0;
      lastH = 0;
      if (options.reduced) paint(0.62);
    }

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('resize', onResize);

    paint(options.reduced ? 0.62 : 0);
    if (!options.reduced) start();

    return {
      start,
      stop,
      repaint: () => paint(options.reduced ? 0.62 : 0),
      destroy() {
        stop();
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('resize', onResize);
      },
    };
  }

  return { drawRoom, mountPreview, COLOR };
})();

if (typeof module !== 'undefined' && module.exports) { module.exports = { RoomRender }; }
