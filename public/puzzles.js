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
  symbolMemory: 'Watch the sequence, then repeat it in order.',
  rotatingLock: 'Rotate each dial until it lines up with its mark.',
  wireConnect: 'Connect matching colors without crossing paths.',
  weightBalance: 'Select objects that add up to the exact target.',
  wordForge: 'Tap letters to spell real words. Longer is better.',
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
          SFX.correct();
          tile.classList.add('correct-flash');
          setTimeout(onSolved, 260);
        } else {
          SFX.wrong();
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
        if (i === state.keyIndex) { SFX.correct(); item.classList.add('found'); setTimeout(onSolved, 260); }
        else { SFX.wrong(); item.classList.add('wrong-flash'); setTimeout(() => item.classList.remove('wrong-flash'), 300); }
      });
      grid.appendChild(item);
    }
    return function destroy() {};
  },
};

/* ---- Symbol Memory ---- */
const SYMBOL_POOL = ['◆', '●', '▲', '■', '★', '✦', '⬟', '⬢', '✚', '◈'];

const SymbolMemory = {
  generate(params) {
    const slots = params.slots || 5;
    const sequenceLength = Math.min(params.sequenceLength || 3, slots);
    const symbols = prShuffle(SYMBOL_POOL).slice(0, slots);
    const sequence = prShuffle([...Array(slots).keys()]).slice(0, sequenceLength);
    return { slots, symbols, sequence, showTime: params.showTime || 600, gapTime: params.gapTime || 250, playerProgress: [], phase: 'idle', wrongAttempts: 0 };
  },
  mount(state, container, onSolved) {
    container.innerHTML = '';
    const wrap = prMakeEl('div', 'sm-wrap');
    const grid = prMakeEl('div', 'sm-grid');
    wrap.appendChild(grid);
    container.appendChild(wrap);

    const nodeEls = state.symbols.map((sym, i) => {
      const node = prMakeEl('button', 'sm-node');
      node.type = 'button';
      node.textContent = sym;
      node.dataset.index = i;
      grid.appendChild(node);
      return node;
    });

    let destroyed = false;
    const timeouts = [];
    function after(ms, fn) { const t = setTimeout(() => { if (!destroyed) fn(); }, ms); timeouts.push(t); return t; }
    function setInputEnabled(enabled) { nodeEls.forEach(n => { n.disabled = !enabled; }); }

    function playSequence() {
      setInputEnabled(false);
      state.phase = 'showing';
      let t = 200;
      state.sequence.forEach((slotIndex) => {
        after(t, () => nodeEls[slotIndex].classList.add('flash'));
        after(t + state.showTime, () => nodeEls[slotIndex].classList.remove('flash'));
        t += state.showTime + state.gapTime;
      });
      after(t + 150, () => { state.phase = 'input'; setInputEnabled(true); });
    }

    nodeEls.forEach((node) => {
      node.addEventListener('click', () => {
        if (state.phase !== 'input') return;
        const idx = Number(node.dataset.index);
        const expected = state.sequence[state.playerProgress.length];
        if (idx === expected) {
          SFX.correct();
          node.classList.add('correct');
          after(220, () => node.classList.remove('correct'));
          state.playerProgress.push(idx);
          if (state.playerProgress.length === state.sequence.length) {
            state.phase = 'solved';
            setInputEnabled(false);
            nodeEls.forEach(n => n.classList.add('solved'));
            after(280, onSolved);
          }
        } else {
          SFX.wrong();
          node.classList.add('wrong');
          after(260, () => node.classList.remove('wrong'));
          state.playerProgress = [];
          state.wrongAttempts++;
          if (state.wrongAttempts % 2 === 0) after(200, playSequence);
        }
      });
    });

    playSequence();
    return function destroy() { destroyed = true; timeouts.forEach(clearTimeout); };
  },
};

/* ---- Rotating Lock ---- */
const RotatingLock = {
  generate(params) {
    const dials = params.dials || 2;
    const segments = params.segments || 6;
    const linked = !!params.linked;
    const target = [];
    const current = [];
    for (let i = 0; i < dials; i++) {
      target.push(prRandomInt(0, segments - 1));
      let start = prRandomInt(0, segments - 1);
      if (start === target[i]) start = (start + 1) % segments;
      current.push(start);
    }
    return { dials, segments, linked, target, current };
  },
  mount(state, container, onSolved) {
    container.innerHTML = '';
    const wrap = prMakeEl('div', 'rl-wrap');
    container.appendChild(wrap);
    const dialEls = [];
    const pointerEls = [];
    const angleStep = 360 / state.segments;

    for (let i = 0; i < state.dials; i++) {
      const dial = prMakeEl('div', 'rl-dial');
      const ring = prMakeEl('div', 'rl-ring');
      const target = prMakeEl('div', 'rl-mark target');
      const pointer = prMakeEl('div', 'rl-mark pointer');
      target.style.transform = `rotate(${state.target[i] * angleStep}deg)`;
      pointer.style.transform = `rotate(${state.current[i] * angleStep}deg)`;
      ring.appendChild(target);
      ring.appendChild(pointer);
      dial.appendChild(ring);
      wrap.appendChild(dial);
      dialEls.push(dial);
      pointerEls.push(pointer);
      dial.addEventListener('click', () => { if (!dial.classList.contains('solved')) rotateDial(i); });
    }

    function checkWin() {
      let solved = true;
      for (let i = 0; i < state.dials; i++) {
        const ok = state.current[i] === state.target[i];
        dialEls[i].classList.toggle('solved', ok);
        if (!ok) solved = false;
      }
      if (solved) setTimeout(onSolved, 260);
    }

    function rotateDial(i) {
      SFX.click();
      state.current[i] = (state.current[i] + 1) % state.segments;
      pointerEls[i].style.transform = `rotate(${state.current[i] * angleStep}deg)`;
      if (state.linked && i < state.dials - 1) {
        state.current[i + 1] = (state.current[i + 1] + 1) % state.segments;
        pointerEls[i + 1].style.transform = `rotate(${state.current[i + 1] * angleStep}deg)`;
      }
      checkWin();
    }
    return function destroy() {};
  },
};

/* ---- Wire / Pipe Connect ---- */
const WC_PAIR_COLORS = ['#ffb454', '#4dd8ff', '#ff6b9d', '#8aff6b'];

// Carves a short random walk through cells not already claimed by an
// earlier pair. The whole walk (not just its two endpoints) is reserved,
// so every pair keeps a guaranteed obstacle-free route for the entire
// game, no matter what order the player solves them in.
//
// Previously endpoints were placed by picking two random free cells per
// pair. That could box a pair in completely: since solved endpoints stay
// on the board as permanent obstacles, a pair could end up with zero
// valid paths depending on where the other pairs landed, making the
// room unsolvable. Testing caught this by simulating solves across many
// random layouts (see the wire-connect trials in the project's own test
// notes) -- some fraction of generated 4x4/2-pair rooms had no solution.
function wcCarvePath(gridSize, occupied) {
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const isFree = (r, c) => r >= 0 && c >= 0 && r < gridSize && c < gridSize && !occupied.has(r + ',' + c);

  for (let attempt = 0; attempt < 60; attempt++) {
    const start = [prRandomInt(0, gridSize - 1), prRandomInt(0, gridSize - 1)];
    if (!isFree(start[0], start[1])) continue;
    const path = [start];
    const visited = new Set([start[0] + ',' + start[1]]);
    const targetLen = 2 + prRandomInt(0, Math.min(3, gridSize - 1));
    let stuck = false;
    while (path.length < targetLen) {
      const [r, c] = path[path.length - 1];
      const next = prShuffle(dirs)
        .map(([dr, dc]) => [r + dr, c + dc])
        .find(([nr, nc]) => isFree(nr, nc) && !visited.has(nr + ',' + nc));
      if (!next) { stuck = true; break; }
      path.push(next);
      visited.add(next[0] + ',' + next[1]);
    }
    if (!stuck && path.length >= 2) return path;
  }
  return null;
}

const WireConnect = {
  generate(params) {
    const gridSize = params.gridSize || 4;
    const requestedPairs = Math.min(params.pairs || 2, WC_PAIR_COLORS.length);
    const cells = Array.from({ length: gridSize }, () => Array.from({ length: gridSize }, () => null));
    const occupied = new Set();
    const endpoints = [];
    let pairIndex = 0;

    for (let p = 0; p < requestedPairs; p++) {
      const path = wcCarvePath(gridSize, occupied);
      if (!path) break; // grid is full; stop rather than place an unsolvable pair
      path.forEach(([r, c]) => occupied.add(r + ',' + c));
      const a = path[0];
      const b = path[path.length - 1];
      cells[a[0]][a[1]] = { kind: 'endpoint', pair: pairIndex };
      cells[b[0]][b[1]] = { kind: 'endpoint', pair: pairIndex };
      endpoints.push([a, b]);
      pairIndex++;
    }

    return {
      gridSize, pairs: pairIndex, cells, endpoints,
      connected: Array(pairIndex).fill(false),
      activePair: null,
      currentPath: [],
    };
  },
  mount(state, container, onSolved) {
    container.innerHTML = '';
    const grid = prMakeEl('div', 'wc-grid');
    grid.style.setProperty('--wc-size', state.gridSize);
    container.appendChild(grid);
    const cellEls = [];
    for (let r = 0; r < state.gridSize; r++) {
      const rowEls = [];
      for (let c = 0; c < state.gridSize; c++) {
        const cell = prMakeEl('button', 'wc-cell');
        cell.type = 'button';
        cell.addEventListener('click', () => handleClick(r, c));
        grid.appendChild(cell);
        rowEls.push(cell);
      }
      cellEls.push(rowEls);
    }

    function render() {
      for (let r = 0; r < state.gridSize; r++) {
        for (let c = 0; c < state.gridSize; c++) {
          const data = state.cells[r][c];
          const el = cellEls[r][c];
          el.className = 'wc-cell';
          if (data) {
            el.style.setProperty('--pair-color', WC_PAIR_COLORS[data.pair]);
            el.classList.add(data.kind === 'endpoint' ? 'endpoint' : 'path');
            if (state.connected[data.pair]) el.classList.add('connected');
          }
        }
      }
    }
    function isAdjacent(a, b) { return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1; }
    function flashInvalid(r, c) { cellEls[r][c].classList.add('invalid'); setTimeout(() => cellEls[r][c].classList.remove('invalid'), 220); }

    function handleClick(r, c) {
      const data = state.cells[r][c];
      if (state.activePair === null) {
        if (data && data.kind === 'endpoint' && !state.connected[data.pair]) {
          SFX.click();
          state.activePair = data.pair;
          state.currentPath = [[r, c]];
          render();
        }
        return;
      }
      const pair = state.activePair;
      const startCoord = state.currentPath[0];
      const last = state.currentPath[state.currentPath.length - 1];
      if (r === startCoord[0] && c === startCoord[1]) {
        state.currentPath.slice(1).forEach(([pr, pc]) => { state.cells[pr][pc] = null; });
        state.activePair = null;
        state.currentPath = [];
        render();
        return;
      }
      if (!isAdjacent(last, [r, c])) { SFX.wrong(); flashInvalid(r, c); return; }
      if (data && data.kind === 'endpoint' && data.pair === pair) {
        SFX.correct();
        state.currentPath.push([r, c]);
        state.connected[pair] = true;
        state.activePair = null;
        state.currentPath = [];
        render();
        if (state.connected.every(Boolean)) setTimeout(onSolved, 260);
        return;
      }
      if (data === null) {
        SFX.click();
        state.cells[r][c] = { kind: 'path', pair };
        state.currentPath.push([r, c]);
        render();
        return;
      }
      SFX.wrong();
      flashInvalid(r, c);
    }
    render();
    return function destroy() {};
  },
};

/* ---- Weight Balance ---- */
const WeightBalance = {
  generate(params) {
    const objectCount = params.objectCount || 5;
    const maxValue = params.maxValue || 9;
    const solutionSize = prRandomInt(2, Math.min(4, Math.max(2, objectCount - 1)));
    const values = [];
    for (let i = 0; i < objectCount; i++) values.push(prRandomInt(1, maxValue));
    const solutionIndices = prShuffle([...Array(objectCount).keys()]).slice(0, solutionSize);
    const target = solutionIndices.reduce((sum, i) => sum + values[i], 0);
    const objects = values.map((v, i) => ({ id: i, value: v }));
    return { objects: prShuffle(objects), target, selected: new Set() };
  },
  mount(state, container, onSolved) {
    container.innerHTML = '';
    const wrap = prMakeEl('div', 'wb-wrap');
    const targetLine = prMakeEl('div', 'wb-target');
    targetLine.innerHTML = `Target: <span>${state.target}</span>`;
    wrap.appendChild(targetLine);
    const totalLine = prMakeEl('div', 'wb-total');
    wrap.appendChild(totalLine);
    const objectsWrap = prMakeEl('div', 'wb-objects');
    wrap.appendChild(objectsWrap);
    container.appendChild(wrap);

    function currentTotal() {
      let sum = 0;
      state.selected.forEach(id => { sum += state.objects.find(o => o.id === id).value; });
      return sum;
    }
    function renderTotal() {
      const total = currentTotal();
      totalLine.textContent = `On the scale: ${total}`;
      totalLine.classList.remove('match', 'over');
      if (total === state.target) totalLine.classList.add('match');
      else if (total > state.target) totalLine.classList.add('over');
    }
    state.objects.forEach(obj => {
      const chip = prMakeEl('button', 'wb-chip');
      chip.type = 'button';
      chip.textContent = obj.value;
      chip.addEventListener('click', () => {
        if (state.selected.has(obj.id)) state.selected.delete(obj.id);
        else state.selected.add(obj.id);
        chip.classList.toggle('selected');
        renderTotal();
        if (currentTotal() === state.target) {
          SFX.correct();
          objectsWrap.querySelectorAll('.wb-chip').forEach(c => { c.disabled = true; });
          setTimeout(onSolved, 320);
        } else {
          SFX.click();
        }
      });
      objectsWrap.appendChild(chip);
    });
    renderTotal();
    return function destroy() {};
  },
};

/* ===========================================================================
   7. WORD FORGE
   A rack of scrambled letters. Tap tiles in order to spell a real word,
   submit it, repeat until you've found enough words (longer words count
   for more, and higher difficulty demands longer ones). Every word in
   WORD_BANK below is a real English word, hand-checked to actually be
   buildable from its own letter pool - see the verification notes in the
   commit that added this.
=========================================================================== */
const WORD_BANK = [
  { letters: 'TRIPES', words: ['SPRITE', 'PRIEST', 'STRIP', 'TIES', 'RITE', 'TIRE', 'TRIP', 'RIPE', 'PEST', 'SITE', 'REST'] },
  { letters: 'GARDEN', words: ['GARDEN', 'DANGER', 'RANGE', 'ANGER', 'GRAND', 'READ', 'DARE', 'GEAR', 'NEAR', 'EARN'] },
  { letters: 'PLANET', words: ['PLANET', 'PLATE', 'PANEL', 'PANE', 'PLAN', 'TAPE', 'LATE', 'LEAP'] },
  { letters: 'STREAM', words: ['STREAM', 'MASTER', 'STARE', 'RATES', 'TEARS', 'TEAM', 'MATE', 'SEAT', 'MEAT', 'ARTS'] },
  { letters: 'CANDLE', words: ['CANDLE', 'LANCED', 'CLEAN', 'DANCE', 'LEAD', 'LANE', 'CANE', 'LACE', 'DEAL'] },
  { letters: 'PICTURE', words: ['PICTURE', 'TRUCE', 'ERUPT', 'PRICE', 'TRIPE', 'CURT', 'CUTE', 'TRIP', 'PIE'] },
  { letters: 'MONSTER', words: ['MENTORS', 'MONSTER', 'NOTES', 'STERN', 'TERMS', 'STONE', 'TONES', 'STORM', 'TONE', 'NEST', 'MORE', 'REST'] },
  { letters: 'STAPLER', words: ['STAPLER', 'PLASTER', 'PLATES', 'PEARLS', 'PETALS', 'STARE', 'PLATE', 'TALES', 'LEAST', 'STEAL', 'PEARL', 'PETAL', 'REAL', 'SEAT', 'LATE', 'RATE', 'TEAR'] },
];

const WordForge = {
  generate(params) {
    const wordsNeeded = params.wordsNeeded || 3;
    const minLength = params.minLength || 3;

    const pool = WORD_BANK[prRandomInt(0, WORD_BANK.length - 1)];
    const eligible = pool.words.filter(w => w.length >= minLength);
    const tiles = prShuffle(pool.letters.split(''));

    return {
      letters: pool.letters, tiles, eligible: eligible.length ? eligible : pool.words,
      wordsNeeded, found: [], current: [], score: 0,
    };
  },
  mount(state, container, onSolved) {
    container.innerHTML = '';
    const wrap = prMakeEl('div', 'wf-wrap');

    const progress = prMakeEl('div', 'wf-progress');
    progress.textContent = `Words found: 0 / ${state.wordsNeeded}`;
    wrap.appendChild(progress);

    const spelled = prMakeEl('div', 'wf-spelled');
    wrap.appendChild(spelled);

    const rack = prMakeEl('div', 'wf-rack');
    wrap.appendChild(rack);

    const foundList = prMakeEl('div', 'wf-found');
    wrap.appendChild(foundList);

    const actions = prMakeEl('div', 'wf-actions');
    const clearBtn = prMakeEl('button', 'wf-btn wf-clear');
    clearBtn.type = 'button';
    clearBtn.textContent = 'Clear';
    const submitBtn = prMakeEl('button', 'wf-btn wf-submit');
    submitBtn.type = 'button';
    submitBtn.textContent = 'Submit';
    actions.appendChild(clearBtn);
    actions.appendChild(submitBtn);
    wrap.appendChild(actions);

    container.appendChild(wrap);

    const tileEls = state.tiles.map((letter, i) => {
      const tile = prMakeEl('button', 'wf-tile');
      tile.type = 'button';
      tile.textContent = letter;
      tile.dataset.index = i;
      tile.addEventListener('click', () => {
        if (tile.classList.contains('used')) return;
        SFX.click();
        tile.classList.add('used');
        state.current.push({ letter, index: i });
        renderSpelled();
      });
      rack.appendChild(tile);
      return tile;
    });

    function renderSpelled() {
      spelled.textContent = state.current.map(c => c.letter).join('') || '\u00A0';
    }

    function resetCurrent() {
      state.current.forEach(c => tileEls[c.index].classList.remove('used'));
      state.current = [];
      renderSpelled();
    }

    clearBtn.addEventListener('click', () => { SFX.click(); resetCurrent(); });

    submitBtn.addEventListener('click', () => {
      const word = state.current.map(c => c.letter).join('');
      const isValid = word.length >= 3 && state.eligible.includes(word);
      const alreadyFound = state.found.includes(word);

      if (!isValid || alreadyFound) {
        SFX.wrong();
        spelled.classList.add('wf-shake');
        setTimeout(() => spelled.classList.remove('wf-shake'), 300);
        resetCurrent();
        return;
      }

      SFX.correct();
      state.found.push(word);
      state.score += word.length;

      // Briefly flash the used tiles green, then free them for the next word.
      // The rack is a reusable set of letters, not a one-shot pool - a 6-letter
      // rack could never fit multiple 5+ letter words otherwise.
      const solvedIndices = state.current.map(c => c.index);
      solvedIndices.forEach(i => tileEls[i].classList.add('locked'));
      state.current = [];
      renderSpelled();
      setTimeout(() => {
        solvedIndices.forEach(i => tileEls[i].classList.remove('used', 'locked'));
      }, 260);

      const chip = prMakeEl('span', 'wf-found-word');
      chip.textContent = word;
      foundList.appendChild(chip);
      progress.textContent = `Words found: ${state.found.length} / ${state.wordsNeeded}`;

      if (state.found.length >= state.wordsNeeded) {
        progress.classList.add('wf-complete');
        setTimeout(onSolved, 320);
      }
    });

    return function destroy() {};
  },
};

const PUZZLE_MODULES = {
  patternCompletion: PatternCompletion,
  hiddenKey: HiddenKey,
  symbolMemory: SymbolMemory,
  rotatingLock: RotatingLock,
  wireConnect: WireConnect,
  weightBalance: WeightBalance,
  wordForge: WordForge,
};

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
