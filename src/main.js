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

// Touch deck is created here so it also exists in the artifact wrapper.
const touchStyle = document.createElement('style');
touchStyle.textContent = `
  #mobile-controls { display:none; width:320px; height:126px; padding:8px 10px;
    grid-template-columns:126px 1fr; gap:18px; color:#00ff41; background:#000;
    border:1px solid #00521c; box-shadow:0 0 22px rgba(0,255,65,.12);
    touch-action:none; user-select:none; -webkit-user-select:none; }
  #mobile-controls button { appearance:none; border:1px solid #00a82c; border-radius:0;
    background:#00230d; color:#e8fff0; font:700 11px ui-monospace,monospace;
    min-width:36px; min-height:32px; padding:0; touch-action:none; }
  #mobile-controls button:active, #mobile-controls button.pressed {
    color:#000; background:#00ff41; border-color:#e8fff0; }
  .touch-dpad { display:grid; grid-template:repeat(3,34px)/repeat(3,38px); gap:2px; }
  .touch-dpad [data-code=ArrowUp] { grid-area:1/2; }
  .touch-dpad [data-code=ArrowLeft] { grid-area:2/1; }
  .touch-dpad [data-code=ArrowDown] { grid-area:2/2; }
  .touch-dpad [data-code=ArrowRight] { grid-area:2/3; }
  .touch-dpad .pad-mark { grid-area:3/1/4/4; color:#00521c; font:9px ui-monospace,monospace;
    text-align:center; padding-top:5px; letter-spacing:2px; }
  .touch-actions { display:grid; grid-template:32px 32px 30px/repeat(4,1fr); gap:4px; }
  .touch-actions .wide { grid-column:span 2; }
  .touch-actions .number { color:#29e0ff; min-width:0; min-height:28px; }
  #mobile-controls.puzzle [data-role=dash] { color:#ffd83d; }
  @media (pointer:coarse), (max-width:700px) {
    body { flex-direction:column; gap:7px; }
    #mobile-controls { display:grid; }
  }
`;
document.head.append(touchStyle);

const mobileControls = document.createElement('div');
mobileControls.id = 'mobile-controls';
mobileControls.setAttribute('aria-label', 'Mobile game controls');
mobileControls.innerHTML = `
  <div class="touch-dpad" aria-label="Direction pad">
    <button data-code="ArrowUp" aria-label="Move up">▲</button>
    <button data-code="ArrowLeft" aria-label="Move left">◀</button>
    <button data-code="ArrowDown" aria-label="Move down">▼</button>
    <button data-code="ArrowRight" aria-label="Move right">▶</button>
    <div class="pad-mark">MOVE / SELECT</div>
  </div>
  <div class="touch-actions">
    <button class="wide" data-code="ShiftLeft" aria-label="Hold to sprint">RUN</button>
    <button class="wide" data-code="Space" data-role="dash" aria-label="Dash or puzzle action">DASH</button>
    <button class="wide" data-code="Enter" aria-label="Confirm puzzle">OK</button>
    <button class="wide" data-code="Escape" aria-label="Leave puzzle">BACK</button>
    <button class="number" data-code="Digit1">1</button>
    <button class="number" data-code="Digit2">2</button>
    <button class="number" data-code="Digit3">3</button>
    <button class="number" data-code="Digit4">4</button>
  </div>`;
document.body.append(mobileControls);

for (const button of mobileControls.querySelectorAll('button')) {
  const code = button.dataset.code;
  const release = (event) => {
    event.preventDefault();
    button.classList.remove('pressed');
    game.onKeyUp(code);
  };
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    button.setPointerCapture?.(event.pointerId);
    button.classList.add('pressed');
    game.onKeyDown(code);
    navigator.vibrate?.(8);
  });
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
}

// Integer scaling only, so pixels stay square and sharp.
function fit() {
  const touchVisible = getComputedStyle(mobileControls).display !== 'none';
  const pad = touchVisible ? 0 : 24;
  const sw = window.innerWidth - pad;
  const sh = window.innerHeight - pad - (touchVisible ? 133 : 0);
  const scale = Math.max(1, Math.min(Math.floor(sw / VIEW_W), Math.floor(sh / VIEW_H)));
  const w = VIEW_W * scale;
  const h = VIEW_H * scale;
  const stage = document.getElementById('stage');
  stage.style.width = w + 'px';
  stage.style.height = h + 'px';
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  mobileControls.style.width = w + 'px';
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
  const puzzleMode = game.state === 'puzzle';
  mobileControls.classList.toggle('puzzle', puzzleMode);
  const action = mobileControls.querySelector('[data-role=dash]');
  action.textContent = puzzleMode ? 'ACT' : 'DASH';
  render(ctx, game);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
