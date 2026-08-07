// puzzles.js
// Puzzle library. Each module exposes generate(params) (pure state) and
// mount(state, container, onSolved) (renders + wires input). Puzzles.create
// is the single entry point game.js calls. Types get added one at a time.

function prShuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}
function prRandomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function prMakeEl(tag, className) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}

const PUZZLE_HINTS = {
  patternCompletion: 'Pick the tile that continues the pattern.',
  hiddenKey: 'One of these is not quite like the others.',
};

/* ---- Pattern Completion ---- */
const PC_SHAPES = ['circle', 'square', 'triangle', 'diamond'];
const PC_COLORS = ['#ffb454', '#4dd8ff', '#ff6b9d', '#8aff6b', '#c084fc'];

const PatternCompletion = {
  generate(params) {
    const length = params.length || 3;
    const optionsCount = params.options || 3;
    const complexity = params.complexity || 1;
    const shapeCycle = prShuffle(PC_SHAPES).slice(0, prRandomInt(2, 3));
    const colorCycle = prShuffle(PC_COLORS).slice(0, prRandomInt(2, 3));
    const varyShape = complexity >= 2 ? true : Math.random() < 0.5;
    const varyColor = complexity >= 2 ? true : !varyShape;
    const fixedShape = shapeCycle[0];
    const fixedColor = colorCycle[0];

    function tileAt(pos) {
      return {
        shape: varyShape ? shapeCycle[pos % shapeCycle.length] : fixedShape,
        color: varyColor ? colorCycle[pos % colorCycle.length] : fixedColor,
      };
    }
    const sequence = [];
    for (let i = 0; i < length; i++) sequence.push(tileAt(i));
    const answer = tileAt(length);

    const options = [answer];
    let guard = 0;
    while (options.length < optionsCount && guard < 50) {
      guard++;
      const decoy = { shape: PC_SHAPES[prRandomInt(0, PC_SHAPES.length - 1)], color: PC_COLORS[prRandomInt(0, PC_COLORS.length - 1)] };
      const dup = options.some(o => o.shape === decoy.shape && o.color === decoy.color);
      if (!dup) options.push(decoy);
    }
    return { sequence, answer, options: prShuffle(options) };
  },
  mount(state, container, onSolved) {
    container.innerHTML = '';
    const wrap = prMakeEl('div', 'pc-wrap');
    const row = prMakeEl('div', 'pc-row');
    state.sequence.forEach(tile => row.appendChild(makeTile(tile, false)));
    row.appendChild(makeBlankTile());
    wrap.appendChild(row);

    const options = prMakeEl('div', 'pc-options');
    state.options.forEach(opt => {
      const tile = makeTile(opt, true);
      tile.addEventListener('click', () => {
        if (opt.shape === state.answer.shape && opt.color === state.answer.color) {
          tile.classList.add('correct-flash');
          setTimeout(onSolved, 260);
        } else {
          tile.classList.add('wrong-flash');
          setTimeout(() => tile.classList.remove('wrong-flash'), 300);
        }
      });
      options.appendChild(tile);
    });
    wrap.appendChild(options);
    container.appendChild(wrap);

    function makeTile(tile, clickable) {
      const box = prMakeEl('div', 'pc-tile' + (clickable ? ' option' : ''));
      const shape = prMakeEl('div', 'pc-shape shape-' + tile.shape);
      if (tile.shape === 'triangle') shape.style.setProperty('--tri-color', tile.color);
      else shape.style.background = tile.color;
      box.appendChild(shape);
      return box;
    }
    function makeBlankTile() { const box = prMakeEl('div', 'pc-tile blank'); box.textContent = '?'; return box; }
    return function destroy() {};
  },
};

/* ---- Hidden Key Search ---- */
const HiddenKey = {
  generate(params) {
    const decoys = params.decoys || 5;
    const difficulty = Math.max(0.1, Math.min(0.9, params.difficulty !== undefined ? params.difficulty : 0.4));
    const total = decoys + 1;
    const keyIndex = prRandomInt(0, total - 1);
    const modes = ['tone', 'shadow', 'glow'];
    const mode = modes[prRandomInt(0, modes.length - 1)];
    const magnitude = 1 - difficulty;
    return { total, keyIndex, mode, magnitude };
  },
  mount(state, container, onSolved) {
    container.innerHTML = '';
    const grid = prMakeEl('div', 'hk-grid');
    container.appendChild(grid);
    for (let i = 0; i < state.total; i++) {
      const item = prMakeEl('button', 'hk-item');
      item.type = 'button';
      const orb = prMakeEl('div', 'hk-orb');
      item.appendChild(orb);
      if (i === state.keyIndex) {
        if (state.mode === 'tone') {
          orb.style.filter = `brightness(${1 + (6 + state.magnitude * 26) / 100})`;
        } else if (state.mode === 'shadow') {
          const dist = 3 + state.magnitude * 10;
          orb.style.boxShadow = `${-dist}px ${dist}px 10px rgba(0,0,0,0.55)`;
        } else {
          orb.style.boxShadow = `0 0 ${10 + state.magnitude * 16}px rgba(255,255,255,${0.08 + state.magnitude * 0.3})`;
        }
      }
      item.addEventListener('click', () => {
        if (i === state.keyIndex) { item.classList.add('found'); setTimeout(onSolved, 260); }
        else { item.classList.add('wrong-flash'); setTimeout(() => item.classList.remove('wrong-flash'), 300); }
      });
      grid.appendChild(item);
    }
    return function destroy() {};
  },
};

const PUZZLE_MODULES = { patternCompletion: PatternCompletion, hiddenKey: HiddenKey };

const Puzzles = {
  create(type, params, container, onSolved) {
    const mod = PUZZLE_MODULES[type];
    if (!mod) { console.error('Unknown puzzle type:', type); return { destroy() {} }; }
    const state = mod.generate(params || {});
    const destroy = mod.mount(state, container, onSolved) || function () {};
    return { destroy, state };
  },
  hint(type) { return PUZZLE_HINTS[type] || ''; },
};
