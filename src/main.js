import { Game, VIEW_W, VIEW_H } from './game.js';
import { render } from './renderer.js';
import { initAudio } from './audio.js';

const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d', { alpha: false });
canvas.width = VIEW_W;
canvas.height = VIEW_H;
ctx.imageSmoothingEnabled = false;

const game = new Game(ctx);
window.__game = game; // handy for poking at state from the console

// Integer scaling only, so pixels stay square and sharp.
function fit() {
  const pad = 24;
  const sw = window.innerWidth - pad;
  const sh = window.innerHeight - pad;
  const scale = Math.max(1, Math.min(Math.floor(sw / VIEW_W), Math.floor(sh / VIEW_H)));
  const w = VIEW_W * scale;
  const h = VIEW_H * scale;
  const stage = document.getElementById('stage');
  stage.style.width = w + 'px';
  stage.style.height = h + 'px';
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
}
window.addEventListener('resize', fit);
fit();

const HANDLED = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyM', 'KeyQ',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'ShiftLeft', 'ShiftRight', 'Space', 'Enter', 'Escape',
  'Digit1', 'Digit2', 'Digit3', 'Digit4',
]);

window.addEventListener('keydown', (e) => {
  if (HANDLED.has(e.code)) e.preventDefault();
  if (e.repeat) return;
  game.onKeyDown(e.code);
});
window.addEventListener('keyup', (e) => game.onKeyUp(e.code));
window.addEventListener('blur', () => { game.keys = {}; });

// Pointer/touch also boots past the splash screens and unlocks audio.
// Tapping advances the splash screens; in play Space is the dash, so leave it.
canvas.addEventListener('pointerdown', () => {
  initAudio();
  if (game.state === 'play' || game.state === 'puzzle') return;
  game.onKeyDown('Space');
});
window.addEventListener('pointerup', () => game.onKeyUp('Space'));

let last = performance.now();
function frame(now) {
  const dt = Math.min(1 / 30, (now - last) / 1000);
  last = now;
  game.update(dt);
  render(ctx, game);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
