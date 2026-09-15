import { drawText, drawTextCentered, textWidth, CHAR_W } from './font.js';

// ---------------------------------------------------------------------------
// Security console puzzles. Nine types exist; three are drawn at random each
// session and bolted to the three keycard consoles, hardest last.
//
// Every puzzle is keyboard-only and exposes the same shape:
//   name, hint, update(dt), draw(g, x, y, w, h), onKey(code) -> 'solve'|'fail'|null
// The world keeps simulating while one is open, so the octopus can still walk
// in on you mid-solve. ESC backs out with progress preserved.
// ---------------------------------------------------------------------------

const rnd = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rnd(arr.length)];

const C = {
  on: 'g', off: 'd', dim: 'm', hot: 'r', warn: 'y', cool: 'c', text: 'w',
};

const HEX = {
  g: '#00ff41', d: '#00230d', m: '#00a82c', r: '#ff3355',
  y: '#ffd83d', c: '#29e0ff', w: '#e8fff0', u: '#8b2fd6', p: '#ff4dd2',
};

function box(g, x, y, w, h, colorKey, filled) {
  g.fillStyle = HEX[colorKey];
  if (filled) {
    g.fillRect(x, y, w, h);
  } else {
    g.fillRect(x, y, w, 1);
    g.fillRect(x, y + h - 1, w, 1);
    g.fillRect(x, y, 1, h);
    g.fillRect(x + w - 1, y, 1, h);
  }
}

// ===========================================================================
// 1. SEQUENCE LOCK — Simon says on the 1-4 keys.
// ===========================================================================
function sequenceLock(diff) {
  const len = 3 + diff;
  const seq = Array.from({ length: len }, () => rnd(4));
  const pads = ['r', 'y', 'c', 'g'];
  let phase = 'show';
  let t = 0;
  let idx = 0;
  let lit = -1;
  let press = -1;
  let pressT = 0;

  return {
    name: 'SEQUENCE LOCK',
    hint: 'KEYS 1-4  REPEAT THE PATTERN',
    // Test/debug support: the key sequence that clears this console.
    solutionKeys: () => seq.map((n) => 'Digit' + (n + 1)),
    update(dt) {
      if (pressT > 0) { pressT -= dt; if (pressT <= 0) press = -1; }
      if (phase !== 'show') return;
      t += dt;
      const step = Math.floor(t / 0.62);
      if (step >= seq.length) { phase = 'input'; lit = -1; return; }
      lit = (t % 0.62) < 0.44 ? seq[step] : -1;
    },
    onKey(code) {
      if (phase !== 'input') return null;
      const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[code];
      if (n === undefined) return null;
      press = n;
      pressT = 0.18;
      if (n === seq[idx]) {
        idx++;
        return idx >= seq.length ? 'solve' : null;
      }
      idx = 0;
      t = 0;
      phase = 'show';
      return 'fail';
    },
    draw(g, x, y, w, h) {
      drawTextCentered(g, phase === 'show' ? 'OBSERVE' : `ENTER  ${idx}/${len}`,
        x + w / 2, y + 6, phase === 'show' ? C.warn : C.on);
      const pw = 46;
      const gap = 10;
      const totalW = pads.length * pw + (pads.length - 1) * gap;
      const px = x + (w - totalW) / 2;
      const py = y + 34;
      pads.forEach((col, i) => {
        const bx = px + i * (pw + gap);
        const active = lit === i || press === i;
        box(g, bx, py, pw, 50, active ? col : 'd', active);
        box(g, bx, py, pw, 50, col, false);
        drawTextCentered(g, String(i + 1), bx + pw / 2, py + 21, active ? 'd' : col);
      });
    },
  };
}

// ===========================================================================
// 2. CIPHER DIAL — rotate a Caesar wheel until the intercept reads as English.
// ===========================================================================
function cipherDial(diff) {
  const words = ['OCTOPUS', 'AIRLOCK', 'PRESSURE', 'SPECIMEN', 'KEYCARD',
                 'REACTOR', 'TENTACLE', 'BULKHEAD', 'SALTWATER'];
  const pool = words.filter((wd) => wd.length <= 8 - diff);
  const word = pick(pool.length ? pool : words);
  const shift = 1 + rnd(24);
  const enc = [...word].map((ch) =>
    String.fromCharCode(((ch.charCodeAt(0) - 65 + shift) % 26) + 65)).join('');
  let dial = (shift + 3 + rnd(5)) % 26;

  const decode = () => [...enc].map((ch) =>
    String.fromCharCode(((ch.charCodeAt(0) - 65 - dial + 26) % 26) + 65)).join('');

  return {
    name: 'CIPHER DIAL',
    hint: 'ARROWS ROTATE   ENTER SEND',
    solutionKeys: () =>
      Array((shift - dial + 26) % 26).fill('ArrowRight').concat('Enter'),
    update() {},
    onKey(code) {
      if (code === 'ArrowLeft') { dial = (dial + 25) % 26; return null; }
      if (code === 'ArrowRight') { dial = (dial + 1) % 26; return null; }
      if (code === 'Enter') return decode() === word ? 'solve' : 'fail';
      return null;
    },
    draw(g, x, y, w, h) {
      drawTextCentered(g, 'INTERCEPT', x + w / 2, y + 4, C.dim);
      drawTextCentered(g, enc, x + w / 2, y + 18, C.hot, 2);

      drawTextCentered(g, 'DECODE', x + w / 2, y + 48, C.dim);
      const out = decode();
      drawTextCentered(g, out, x + w / 2, y + 62, out === word ? C.on : C.text, 2);

      // The wheel itself, as a strip of offsets centred on the current one.
      const cy = y + 100;
      for (let i = -4; i <= 4; i++) {
        const v = (dial + i + 26) % 26;
        const bx = x + w / 2 + i * 26 - 10;
        const here = i === 0;
        box(g, bx, cy, 20, 16, here ? 'g' : 'd', here);
        drawTextCentered(g, String(v).padStart(2, '0'), bx + 10, cy + 4, here ? 'd' : 'm');
      }
      drawTextCentered(g, 'ROTOR OFFSET', x + w / 2, cy + 22, C.dim);
    },
  };
}

// ===========================================================================
// 3. FLOW VALVES — rotate pipe segments to route coolant inlet to outlet.
// ===========================================================================
const N = 1, E = 2, S = 4, W = 8;
const rot = (m) => ((m << 1) | (m >> 3)) & 15;

function flowValves(diff) {
  const cols = 4;
  const rows = 3;
  const cells = Array.from({ length: cols * rows }, () => 0);

  // Lay a guaranteed path left-to-right, then scatter rotations over it.
  const path = [];
  let r = rnd(rows);
  const startRow = r;
  for (let c = 0; c < cols; c++) {
    const tr = c === cols - 1 ? r : rnd(rows);
    const stepDir = Math.sign(tr - r);
    while (r !== tr) { path.push([c, r]); r += stepDir; }
    path.push([c, r]);
  }
  const endRow = r;

  for (let i = 0; i < path.length; i++) {
    const [c, rr] = path[i];
    let mask = 0;
    const prev = path[i - 1];
    const next = path[i + 1];
    if (prev) mask |= dirTo(c, rr, prev[0], prev[1]); else mask |= W;
    if (next) mask |= dirTo(c, rr, next[0], next[1]); else mask |= E;
    cells[rr * cols + c] = mask;
  }
  for (let i = 0; i < cells.length; i++) {
    if (!cells[i]) cells[i] = pick([N | S, E | W, N | E, E | S, S | W, W | N]);
  }
  const orig = cells.slice();

  // Scramble: more spins at higher difficulty means a longer search.
  for (let i = 0; i < cells.length; i++) {
    const spins = rnd(3);
    for (let s = 0; s < spins; s++) cells[i] = rot(cells[i]);
  }

  let cx = 0;
  let cy = 0;

  function dirTo(c, rr, c2, r2) {
    if (c2 > c) return E;
    if (c2 < c) return W;
    return r2 > rr ? S : N;
  }

  function connected() {
    const seen = new Set();
    const stack = [[0, startRow]];
    while (stack.length) {
      const [c, rr] = stack.pop();
      const k = rr * cols + c;
      if (seen.has(k)) continue;
      seen.add(k);
      const m = cells[k];
      const steps = [[N, 0, -1, S], [E, 1, 0, W], [S, 0, 1, N], [W, -1, 0, E]];
      for (const [bit, dc, dr, back] of steps) {
        if (!(m & bit)) continue;
        const nc = c + dc;
        const nr = rr + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        if (!(cells[nr * cols + nc] & back)) continue;
        stack.push([nc, nr]);
      }
    }
    return seen.has(endRow * cols + (cols - 1)) && (cells[endRow * cols + cols - 1] & E);
  }

  return {
    name: 'FLOW VALVES',
    hint: 'MOVE  SPACE TURN  ENTER LOCK',
    solutionKeys: () => {
      const keys = [];
      let px = cx;
      let py = cy;
      for (let rr = 0; rr < rows; rr++) {
        for (let c = 0; c < cols; c++) {
          const k = rr * cols + c;
          let m = cells[k];
          let spins = 0;
          while (m !== orig[k] && spins < 4) { m = rot(m); spins++; }
          if (spins === 0 || spins >= 4) continue;
          while (px < c) { keys.push('ArrowRight'); px++; }
          while (px > c) { keys.push('ArrowLeft'); px--; }
          while (py < rr) { keys.push('ArrowDown'); py++; }
          while (py > rr) { keys.push('ArrowUp'); py--; }
          for (let i = 0; i < spins; i++) keys.push('Space');
        }
      }
      keys.push('Enter');
      return keys;
    },
    update() {},
    onKey(code) {
      if (code === 'ArrowLeft') cx = (cx + cols - 1) % cols;
      else if (code === 'ArrowRight') cx = (cx + 1) % cols;
      else if (code === 'ArrowUp') cy = (cy + rows - 1) % rows;
      else if (code === 'ArrowDown') cy = (cy + 1) % rows;
      else if (code === 'Space') cells[cy * cols + cx] = rot(cells[cy * cols + cx]);
      else if (code === 'Enter') return connected() ? 'solve' : 'fail';
      return null;
    },
    draw(g, x, y, w, h) {
      const cell = 34;
      const gx = x + (w - cols * cell) / 2;
      const gy = y + 26;
      const live = connected();

      drawText(g, 'IN', gx - 18, gy + startRow * cell + 13, C.cool);
      drawText(g, 'OUT', gx + cols * cell + 4, gy + endRow * cell + 13, live ? C.on : C.dim);

      for (let rr = 0; rr < rows; rr++) {
        for (let c = 0; c < cols; c++) {
          const bx = gx + c * cell;
          const by = gy + rr * cell;
          const sel = c === cx && rr === cy;
          box(g, bx, by, cell, cell, sel ? 'g' : 'd', false);
          const m = cells[rr * cols + c];
          const mx = bx + cell / 2;
          const my = by + cell / 2;
          g.fillStyle = HEX[live ? 'c' : 'm'];
          g.fillRect(mx - 3, my - 3, 6, 6);
          if (m & N) g.fillRect(mx - 2, by + 3, 4, cell / 2 - 3);
          if (m & S) g.fillRect(mx - 2, my, 4, cell / 2 - 3);
          if (m & W) g.fillRect(bx + 3, my - 2, cell / 2 - 3, 4);
          if (m & E) g.fillRect(mx, my - 2, cell / 2 - 3, 4);
        }
      }
      drawTextCentered(g, live ? 'FLOW ESTABLISHED' : 'NO FLOW',
        x + w / 2, gy + rows * cell + 6, live ? C.on : C.hot);
    },
  };
}

// ===========================================================================
// 4. SONAR TUNE — match a target waveform on two axes.
// ===========================================================================
function sonarTune(diff) {
  const tf = 2 + rnd(5);
  const ta = 2 + rnd(4);
  let f = Math.max(1, Math.min(9, tf + (rnd(5) - 2)));
  let a = Math.max(1, Math.min(7, ta + (rnd(5) - 2)));
  if (f === tf) f = (f % 9) + 1;
  if (a === ta) a = (a % 6) + 1;

  return {
    name: 'SONAR TUNE',
    hint: 'ARROWS TUNE   ENTER LOCK',
    solutionKeys: () => {
      const keys = [];
      for (let i = 0; i < Math.abs(tf - f); i++) keys.push(tf > f ? 'ArrowRight' : 'ArrowLeft');
      for (let i = 0; i < Math.abs(ta - a); i++) keys.push(ta > a ? 'ArrowUp' : 'ArrowDown');
      keys.push('Enter');
      return keys;
    },
    update() {},
    onKey(code) {
      if (code === 'ArrowLeft') f = Math.max(1, f - 1);
      else if (code === 'ArrowRight') f = Math.min(9, f + 1);
      else if (code === 'ArrowUp') a = Math.min(7, a + 1);
      else if (code === 'ArrowDown') a = Math.max(1, a - 1);
      else if (code === 'Enter') {
        return f === tf && a === ta ? 'solve' : 'fail';
      }
      return null;
    },
    draw(g, x, y, w, h) {
      const midY = y + 48;
      const plotW = w - 20;
      const px = x + 10;

      const wave = (freq, amp, colorKey, thick) => {
        g.fillStyle = HEX[colorKey];
        for (let i = 0; i < plotW; i++) {
          const v = Math.sin((i / plotW) * freq * Math.PI * 2) * amp * 4.5;
          g.fillRect(px + i, Math.round(midY - v), 1, thick);
        }
      };

      drawTextCentered(g, 'TARGET RETURN', x + w / 2, y + 2, C.dim);
      wave(tf, ta, 'd', 3);
      wave(tf, ta, 'u', 1);
      wave(f, a, 'g', 1);

      const matched = f === tf && a === ta;
      drawTextCentered(g, matched ? 'PHASE LOCKED' : 'DRIFTING',
        x + w / 2, y + 86, matched ? C.on : C.warn);

      const readout = (label, val, bx) => {
        box(g, bx, y + 104, 78, 26, 'm', false);
        drawText(g, label, bx + 6, y + 108, C.dim);
        drawText(g, String(val), bx + 6, y + 118, C.on, 2);
      };
      readout('FREQ', f, x + w / 2 - 88);
      readout('GAIN', a, x + w / 2 + 10);
    },
  };
}

// ===========================================================================
// 5. BINARY BUS — set the switch bank to the requested address.
// ===========================================================================
function binaryBus(diff) {
  const bits = 4 + diff;
  const target = 1 + rnd((1 << bits) - 1);
  const state = Array(bits).fill(false);
  let cur = 0;
  const value = () => state.reduce((acc, on, i) => acc + (on ? 1 << (bits - 1 - i) : 0), 0);

  return {
    name: 'BINARY BUS',
    hint: 'MOVE  SPACE FLIP  ENTER SEND',
    solutionKeys: () => {
      const keys = [];
      let pc = cur;
      for (let i = 0; i < bits; i++) {
        const want = (target >> (bits - 1 - i)) & 1;
        if ((state[i] ? 1 : 0) === want) continue;
        while (pc < i) { keys.push('ArrowRight'); pc++; }
        while (pc > i) { keys.push('ArrowLeft'); pc--; }
        keys.push('Space');
      }
      keys.push('Enter');
      return keys;
    },
    update() {},
    onKey(code) {
      if (code === 'ArrowLeft') cur = (cur + bits - 1) % bits;
      else if (code === 'ArrowRight') cur = (cur + 1) % bits;
      else if (code === 'Space') state[cur] = !state[cur];
      else if (code === 'Enter') return value() === target ? 'solve' : 'fail';
      return null;
    },
    draw(g, x, y, w, h) {
      drawTextCentered(g, 'REQUESTED ADDRESS', x + w / 2, y + 4, C.dim);
      drawTextCentered(g, String(target).padStart(3, '0'), x + w / 2, y + 16, C.warn, 3);

      const sw = 26;
      const gap = 6;
      const totalW = bits * sw + (bits - 1) * gap;
      const sx = x + (w - totalW) / 2;
      const sy = y + 62;
      for (let i = 0; i < bits; i++) {
        const bx = sx + i * (sw + gap);
        const on = state[i];
        box(g, bx, sy, sw, 38, on ? 'g' : 'd', true);
        box(g, bx, sy, sw, 38, i === cur ? 'w' : 'm', false);
        drawTextCentered(g, on ? '1' : '0', bx + sw / 2, sy + 15, on ? 'd' : 'm');
        drawTextCentered(g, String(1 << (bits - 1 - i)), bx + sw / 2, sy + 42, C.dim);
      }

      const v = value();
      drawTextCentered(g, `BUS ${String(v).padStart(3, '0')}`, x + w / 2, y + 122,
        v === target ? C.on : C.hot, 2);
    },
  };
}

// ===========================================================================
// 6. MEMORY CORE — reproduce a pattern shown for two seconds.
// ===========================================================================
function memoryCore(diff) {
  const size = 4;
  const count = 4 + diff;
  const truth = new Set();
  while (truth.size < count) truth.add(rnd(size * size));
  const guess = new Set();
  let cx = 0;
  let cy = 0;
  let showT = 3.0;

  return {
    name: 'MEMORY CORE',
    hint: 'MOVE  SPACE MARK  ENTER COMMIT',
    solutionKeys: () => {
      const keys = [];
      let px = cx;
      let py = cy;
      for (const idx of [...truth].sort((a, b) => a - b)) {
        const c = idx % size;
        const r = (idx / size) | 0;
        while (px < c) { keys.push('ArrowRight'); px++; }
        while (px > c) { keys.push('ArrowLeft'); px--; }
        while (py < r) { keys.push('ArrowDown'); py++; }
        while (py > r) { keys.push('ArrowUp'); py--; }
        keys.push('Space');
      }
      keys.push('Enter');
      return keys;
    },
    update(dt) { if (showT > 0) showT -= dt; },
    onKey(code) {
      if (showT > 0) return null;
      if (code === 'ArrowLeft') cx = (cx + size - 1) % size;
      else if (code === 'ArrowRight') cx = (cx + 1) % size;
      else if (code === 'ArrowUp') cy = (cy + size - 1) % size;
      else if (code === 'ArrowDown') cy = (cy + 1) % size;
      else if (code === 'Space') {
        const k = cy * size + cx;
        if (guess.has(k)) guess.delete(k); else guess.add(k);
      } else if (code === 'Enter') {
        if (guess.size !== truth.size) return 'fail';
        for (const k of truth) if (!guess.has(k)) return 'fail';
        return 'solve';
      }
      return null;
    },
    draw(g, x, y, w, h) {
      const showing = showT > 0;
      drawTextCentered(g, showing ? `MEMORISE  ${showT.toFixed(1)}` : `MARK ${guess.size}/${count}`,
        x + w / 2, y + 4, showing ? C.warn : C.on);

      const cell = 28;
      const gap = 5;
      const total = size * cell + (size - 1) * gap;
      const gx = x + (w - total) / 2;
      const gy = y + 20;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const k = r * size + c;
          const bx = gx + c * (cell + gap);
          const by = gy + r * (cell + gap);
          const on = showing ? truth.has(k) : guess.has(k);
          box(g, bx, by, cell, cell, on ? 'c' : 'd', true);
          const sel = !showing && c === cx && r === cy;
          box(g, bx, by, cell, cell, sel ? 'w' : 'm', false);
        }
      }
    },
  };
}

// ===========================================================================
// 7. PRESSURE BALANCE — three coupled valves, three gauges, one solution.
// ===========================================================================
function pressureBalance(diff) {
  const span = 5 + diff;
  const sol = [rnd(span), rnd(span), rnd(span)];
  const gauge = (v) => [v[0] + v[1], v[1] + v[2], v[2] + v[0]];
  const target = gauge(sol);
  const v = [0, 0, 0];
  let cur = 0;

  return {
    name: 'PRESSURE BALANCE',
    hint: 'ARROWS SELECT AND ADJUST',
    solutionKeys: () => {
      const keys = [];
      let pc = cur;
      for (let i = 0; i < 3; i++) {
        while (pc < i) { keys.push('ArrowRight'); pc++; }
        while (pc > i) { keys.push('ArrowLeft'); pc--; }
        const d = sol[i] - v[i];
        for (let j = 0; j < Math.abs(d); j++) keys.push(d > 0 ? 'ArrowUp' : 'ArrowDown');
      }
      return keys;
    },
    update() {},
    onKey(code) {
      if (code === 'ArrowLeft') cur = (cur + 2) % 3;
      else if (code === 'ArrowRight') cur = (cur + 1) % 3;
      else if (code === 'ArrowUp') v[cur] = Math.min(span - 1, v[cur] + 1);
      else if (code === 'ArrowDown') v[cur] = Math.max(0, v[cur] - 1);
      else return null;
      const now = gauge(v);
      return now.every((n, i) => n === target[i]) ? 'solve' : null;
    },
    draw(g, x, y, w, h) {
      const now = gauge(v);
      drawTextCentered(g, 'MATCH ALL THREE MANIFOLDS', x + w / 2, y + 2, C.dim);

      const barH = 72;
      const barW = 22;
      const slotW = 74;
      const gx = x + (w - slotW * 3) / 2;
      for (let i = 0; i < 3; i++) {
        const bx = gx + i * slotW + (slotW - barW) / 2;
        const by = y + 18;
        box(g, bx, by, barW, barH, 'd', true);
        const max = (span - 1) * 2;
        const hNow = Math.round((now[i] / max) * (barH - 2));
        const ok = now[i] === target[i];
        g.fillStyle = HEX[ok ? 'g' : now[i] > target[i] ? 'r' : 'c'];
        g.fillRect(bx + 1, by + barH - 1 - hNow, barW - 2, hNow);
        const tY = by + barH - 1 - Math.round((target[i] / max) * (barH - 2));
        g.fillStyle = HEX.y;
        g.fillRect(bx - 4, tY, barW + 8, 1);
        box(g, bx, by, barW, barH, 'm', false);
        drawTextCentered(g, `${now[i]}/${target[i]}`, bx + barW / 2, by + barH + 4, ok ? C.on : C.dim);
      }

      for (let i = 0; i < 3; i++) {
        const bx = gx + i * slotW + (slotW - 48) / 2;
        const by = y + 112;
        const sel = i === cur;
        box(g, bx, by, 48, 24, sel ? 'w' : 'm', false);
        drawTextCentered(g, `V${i + 1}`, bx + 14, by + 8, C.dim);
        drawTextCentered(g, String(v[i]), bx + 34, by + 8, sel ? C.on : C.text);
      }
    },
  };
}

// ===========================================================================
// 8. KEYPAD LOGIC — mastermind against the door code.
// ===========================================================================
function keypadLogic(diff) {
  const range = 5 + diff;
  const len = 3;
  const code = Array.from({ length: len }, () => 1 + rnd(range));
  const guess = Array(len).fill(1);
  const history = [];
  const maxTries = 6;
  let cur = 0;

  return {
    name: 'KEYPAD LOGIC',
    hint: 'ARROWS SET   ENTER GUESS',
    solutionKeys: () => {
      const keys = [];
      let pc = cur;
      for (let i = 0; i < len; i++) {
        while (pc < i) { keys.push('ArrowRight'); pc++; }
        while (pc > i) { keys.push('ArrowLeft'); pc--; }
        const d = (code[i] - guess[i] + range) % range;
        for (let j = 0; j < d; j++) keys.push('ArrowUp');
      }
      keys.push('Enter');
      return keys;
    },
    update() {},
    onKey(c) {
      if (c === 'ArrowLeft') cur = (cur + len - 1) % len;
      else if (c === 'ArrowRight') cur = (cur + 1) % len;
      else if (c === 'ArrowUp') guess[cur] = (guess[cur] % range) + 1;
      else if (c === 'ArrowDown') guess[cur] = ((guess[cur] - 2 + range) % range) + 1;
      else if (c === 'Enter') {
        let exact = 0;
        const codeRest = [];
        const guessRest = [];
        for (let i = 0; i < len; i++) {
          if (guess[i] === code[i]) exact++;
          else { codeRest.push(code[i]); guessRest.push(guess[i]); }
        }
        let present = 0;
        for (const gv of guessRest) {
          const at = codeRest.indexOf(gv);
          if (at >= 0) { present++; codeRest.splice(at, 1); }
        }
        history.push({ g: [...guess], exact, present });
        if (exact === len) return 'solve';
        if (history.length >= maxTries) {
          history.length = 0;
          return 'fail';
        }
        return null;
      }
      return null;
    },
    draw(g, x, y, w, h) {
      drawTextCentered(g, `DIGITS 1-${range}   TRY ${history.length + 1}/${maxTries}`,
        x + w / 2, y + 2, C.dim);

      const dw = 30;
      const gx = x + (w - (len * dw + (len - 1) * 8)) / 2;
      for (let i = 0; i < len; i++) {
        const bx = gx + i * (dw + 8);
        const sel = i === cur;
        box(g, bx, y + 16, dw, 30, sel ? 'w' : 'm', false);
        drawTextCentered(g, String(guess[i]), bx + dw / 2, y + 24, sel ? C.on : C.text, 2);
      }

      let ly = y + 56;
      drawText(g, 'LOG', x + 10, ly, C.dim);
      drawText(g, 'EXACT', x + w - 96, ly, C.dim);
      drawText(g, 'NEAR', x + w - 44, ly, C.dim);
      ly += 12;
      for (const row of history.slice(-5)) {
        drawText(g, row.g.join(' '), x + 10, ly, C.text);
        drawText(g, String(row.exact), x + w - 86, ly, row.exact ? C.on : C.dim);
        drawText(g, String(row.present), x + w - 38, ly, row.present ? C.warn : C.dim);
        ly += 12;
      }
      if (!history.length) drawText(g, 'NO ATTEMPTS', x + 10, ly, C.dim);
    },
  };
}

// ===========================================================================
// 9. REACTOR TIMING — stop the sweep inside a shrinking window, three times.
// ===========================================================================
function reactorTiming(diff) {
  const need = 3;
  let hits = 0;
  let pos = 0;
  let dir = 1;
  let speed = 0.7 + diff * 0.15;
  let zone = 0.30;
  let zoneAt = 0.4;
  let flash = 0;
  let flashOk = false;

  const reseat = () => {
    zoneAt = 0.12 + Math.random() * 0.72;
    zone = 0.30 - hits * 0.04 - diff * 0.02;
  };
  reseat();

  return {
    name: 'REACTOR TIMING',
    hint: 'SPACE TO ARREST THE SWEEP',
    // Timing puzzle: no static key list, so expose the window instead.
    solutionKeys: () => null,
    inZone: () => pos >= zoneAt - zone / 2 && pos <= zoneAt + zone / 2,
    update(dt) {
      if (flash > 0) flash -= dt;
      pos += dir * speed * dt;
      if (pos > 1) { pos = 1; dir = -1; }
      if (pos < 0) { pos = 0; dir = 1; }
    },
    onKey(code) {
      if (code !== 'Space') return null;
      const lo = zoneAt - zone / 2;
      const hi = zoneAt + zone / 2;
      flash = 0.35;
      if (pos >= lo && pos <= hi) {
        hits++;
        flashOk = true;
        if (hits >= need) return 'solve';
        speed += 0.18;
        reseat();
        return null;
      }
      hits = 0;
      flashOk = false;
      speed = 0.7 + diff * 0.15;
      reseat();
      return 'fail';
    },
    draw(g, x, y, w, h) {
      drawTextCentered(g, `ROD ALIGNMENT  ${hits}/${need}`, x + w / 2, y + 6, C.on);

      const bx = x + 16;
      const bw = w - 32;
      const by = y + 44;
      const bh = 30;
      box(g, bx, by, bw, bh, 'd', true);

      const lo = Math.max(0, zoneAt - zone / 2);
      const hi = Math.min(1, zoneAt + zone / 2);
      g.fillStyle = HEX.g;
      g.globalAlpha = 0.35;
      g.fillRect(bx + lo * bw, by, (hi - lo) * bw, bh);
      g.globalAlpha = 1;
      g.fillStyle = HEX.g;
      g.fillRect(bx + lo * bw, by, 1, bh);
      g.fillRect(bx + hi * bw - 1, by, 1, bh);

      g.fillStyle = HEX[flash > 0 ? (flashOk ? 'g' : 'r') : 'w'];
      g.fillRect(Math.round(bx + pos * bw) - 1, by - 5, 3, bh + 10);

      box(g, bx, by, bw, bh, 'm', false);

      for (let i = 0; i < need; i++) {
        const dx = x + w / 2 - (need * 16) / 2 + i * 16;
        box(g, dx, y + 96, 11, 11, i < hits ? 'g' : 'd', true);
        box(g, dx, y + 96, 11, 11, 'm', false);
      }
      if (flash > 0) {
        drawTextCentered(g, flashOk ? 'ROD SEATED' : 'MISALIGNED',
          x + w / 2, y + 118, flashOk ? C.on : C.hot);
      }
    },
  };
}

// ===========================================================================

const BUILDERS = [
  sequenceLock, cipherDial, flowValves, sonarTune, binaryBus,
  memoryCore, pressureBalance, keypadLogic, reactorTiming,
];

export const PUZZLE_COUNT = BUILDERS.length;

// Three distinct types per session, ramped so the last console is the worst.
export function rollPuzzles(n = 3) {
  const order = BUILDERS.map((b, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.slice(0, n).map((idx, slot) => BUILDERS[idx](slot));
}
