// game.js
// Screen navigation skeleton. Gameplay loop lands in the next commit.

const GameState = {
  baseScreen: 'screen-menu',
};

function $(id) { return document.getElementById(id); }

function switchBaseScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
  GameState.baseScreen = id;
}

function renderLevelGrid() {
  const grid = $('level-grid');
  grid.innerHTML = '';
  LEVELS.forEach((level) => {
    const card = document.createElement('button');
    card.className = 'level-card';
    card.innerHTML = `
      <span class="level-num">${level.id}</span>
      <span class="level-name">${level.name}</span>
    `;
    grid.appendChild(card);
  });
}

function bindEvents() {
  $('btn-play').addEventListener('click', () => switchBaseScreen('screen-level-select'));
  $('btn-level-select').addEventListener('click', () => { renderLevelGrid(); switchBaseScreen('screen-level-select'); });
  $('btn-settings').addEventListener('click', () => switchBaseScreen('screen-settings'));
  $('btn-back-from-levels').addEventListener('click', () => switchBaseScreen('screen-menu'));
  $('btn-back-from-settings').addEventListener('click', () => switchBaseScreen('screen-menu'));
}

function initGame() {
  renderLevelGrid();
  bindEvents();
}

document.addEventListener('DOMContentLoaded', initGame);
