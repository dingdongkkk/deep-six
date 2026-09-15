import { SPR } from './sprites.js';
import { drawText, drawTextCentered, textWidth, CHAR_W } from './font.js';
import { TILE, MAP_W, MAP_H, FLOOR, isSolid, roomAt, EXIT } from './map.js';
import { VIEW_W, VIEW_H, TUNING } from './game.js';
import { isEnabled } from './audio.js';

const MAP_PX_W = MAP_W * TILE;
const MAP_PX_H = MAP_H * TILE;

const BOOT_LINES = [
  'AQUALAB OS V2.71',
  'MEMORY CHECK ......... 640K OK',
  'SUBLEVEL PRESSURE .... NOMINAL',
  'HULL INTEGRITY ....... 42%',
  'BIO-CONTAINMENT ...... BREACHED',
  '',
  '>> WARNING: SPECIMEN 22 AT LARGE',
  '>> ALL PERSONNEL EVACUATE',
  '',
  'PRESS ANY KEY',
];

export function render(g, game) {
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#000000';
  g.fillRect(0, 0, VIEW_W, VIEW_H);

  if (game.state === 'boot') { drawBoot(g, game); return; }
  if (game.state === 'title') { drawTitle(g, game); return; }
  if (game.state === 'briefingMission') { drawMissionBriefing(g, game); return; }
  if (game.state === 'briefingFlood') { drawFloodBriefing(g, game); return; }
  if (game.state === 'briefingControls') { drawControlsBriefing(g, game); return; }

  const cam = camera(game);
  drawWorld(g, game, cam);
  drawFlood(g, game, cam);
  drawLighting(g, game, cam);
  drawPlayerBubbles(g, game, cam);
  if (game.beaconT > 0) drawBeacon(g, game, cam);
  drawHud(g, game);
  drawMinimap(g, game);

  if (game.state === 'puzzle') drawPuzzle(g, game);
  if (game.state === 'dead') drawDead(g, game);
  if (game.state === 'win') drawWin(g, game);
}

// ---------------------------------------------------------------------------

function camera(game) {
  let cx = game.player.x - VIEW_W / 2;
  let cy = game.player.y - VIEW_H / 2;
  cx = Math.max(0, Math.min(MAP_PX_W - VIEW_W, cx));
  cy = Math.max(0, Math.min(MAP_PX_H - VIEW_H, cy));
  if (game.shake > 0) {
    cx += (Math.random() - 0.5) * game.shake;
    cy += (Math.random() - 0.5) * game.shake;
  }
  return { x: Math.round(cx), y: Math.round(cy) };
}

function drawWorld(g, game, cam) {
  const x0 = Math.floor(cam.x / TILE);
  const y0 = Math.floor(cam.y / TILE);
  const x1 = Math.min(MAP_W - 1, x0 + Math.ceil(VIEW_W / TILE));
  const y1 = Math.min(MAP_H - 1, y0 + Math.ceil(VIEW_H / TILE));

  for (let ty = Math.max(0, y0); ty <= y1; ty++) {
    for (let tx = Math.max(0, x0); tx <= x1; tx++) {
      const sx = tx * TILE - cam.x;
      const sy = ty * TILE - cam.y;
      if (isSolid(game.tiles, tx, ty)) {
        g.drawImage(SPR.tiles.wall, sx, sy);
      } else {
        const v = (tx * 7 + ty * 13) % 3;
        g.drawImage(SPR.tiles.floor[v], sx, sy);
      }
    }
  }

  // Exit hatch.
  const door = game.doorOpen ? SPR.doorOpen : SPR.doorLocked;
  g.drawImage(door, EXIT.x * TILE - cam.x, EXIT.y * TILE - cam.y);
  if (game.doorOpen && Math.floor(game.time * 4) % 2 === 0) {
    drawText(g, 'EXIT', EXIT.x * TILE - cam.x - 4, EXIT.y * TILE - cam.y - 10, 'g');
  }

  for (const t of game.terminals) {
    g.drawImage(t.used ? SPR.terminalUsed : SPR.terminal, t.x - cam.x - 6, t.y - cam.y - 6);
  }

  // Security consoles: lit while they still hold a keycard, dead once looted.
  for (const c of game.cards) {
    const sx = Math.round(c.x - cam.x - 8);
    const sy = Math.round(c.y - cam.y - 8);
    if (c.taken) {
      g.drawImage(SPR.consoleDone, sx, sy);
      continue;
    }
    g.drawImage(SPR.console[c.color], sx, sy);
    const bob = Math.sin(game.time * 3 + c.bob) * 1.5;
    g.drawImage(SPR.key[c.color], sx + 3, Math.round(sy - 11 + bob));
  }

  const o = game.octo;
  const rearing = o.rearT > 0;
  const octoSpr = SPR.octo[rearing ? 'w' : (o.pal || 'u')][o.frame];
  const oy = rearing ? Math.sin(o.rearT * 22) * 2 : 0;
  g.drawImage(octoSpr, Math.round(o.x - cam.x - 8), Math.round(o.y - cam.y - 8 + oy));

  const p = game.player;
  for (const t of p.trail) {
    g.globalAlpha = Math.max(0, t.life / 0.22) * 0.45;
    g.drawImage(SPR.diver[t.dir][t.frame], Math.round(t.x - cam.x - 6), Math.round(t.y - cam.y - 7));
  }
  g.globalAlpha = 1;

  if (game.state !== 'dead' || Math.floor(game.deathT * 12) % 2 === 0) {
    const spr = SPR.diver[p.dir][p.frame];
    g.drawImage(spr, Math.round(p.x - cam.x - 6), Math.round(p.y - cam.y - 7));
  }
}

// Darkness is a multiply pass with a hole punched around the diver's lamp.
function drawLighting(g, game, cam) {
  const px = game.player.x - cam.x;
  const py = game.player.y - cam.y;
  const pulse = 1 + Math.sin(game.time * 2.4) * 0.03;
  const r = LIGHT(game) * pulse;

  g.globalCompositeOperation = 'multiply';
  const grd = g.createRadialGradient(px, py, 8, px, py, r);
  grd.addColorStop(0, '#ffffff');
  grd.addColorStop(0.45, '#cfead8');
  grd.addColorStop(0.78, '#40614c');
  grd.addColorStop(1, '#16241a');
  g.fillStyle = grd;
  g.fillRect(0, 0, VIEW_W, VIEW_H);
  g.globalCompositeOperation = 'source-over';

  // A hunting octopus strobes through the dark so it is never a cheap death.
  const o = game.octo;
  if (o.mode !== 'patrol') {
    g.globalAlpha = o.mode === 'hunt' ? 0.55 : 0.22;
    g.drawImage(SPR.octo[o.pal || 'u'][o.frame], Math.round(o.x - cam.x - 8), Math.round(o.y - cam.y - 8));
    g.globalAlpha = 1;
  }

  if (game.danger > 0.6) {
    g.globalAlpha = (game.danger - 0.6) * 0.5 * (0.6 + 0.4 * Math.sin(game.time * 12));
    g.fillStyle = '#ff3355';
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    g.globalAlpha = 1;
  }
}

function drawFlood(g, game, cam) {
  if (game.waterLevel <= 0) return;
  const top = Math.round(MAP_PX_H * (1 - game.waterLevel) - cam.y);
  if (top >= VIEW_H) return;
  const waterTop = Math.max(0, top);
  const pulse = Math.sin(game.time * 3.2);
  g.save();
  const water = g.createLinearGradient(0, waterTop, 0, VIEW_H);
  water.addColorStop(0, '#0b6680');
  water.addColorStop(0.28, '#063d52');
  water.addColorStop(1, '#021c2c');
  g.globalAlpha = 0.17 + game.waterLevel * 0.16;
  g.fillStyle = water;
  g.fillRect(0, waterTop, VIEW_W, VIEW_H - waterTop);
  g.globalAlpha = 0.8;
  g.fillStyle = '#29e0ff';
  if (top >= 0) g.fillRect(0, top, VIEW_W, 1);
  for (let x = -20; x < VIEW_W + 20; x += 20) {
    const wave = Math.round(Math.sin(game.time * 3 + x * 0.12) * 2);
    g.fillRect(x + wave, waterTop + 3, 9, 1);
    g.globalAlpha = 0.3;
    g.fillRect(x + 10 - wave, waterTop + 7, 6, 1);
    g.globalAlpha = 0.8;
  }
  // Bubbles and dim caustic streaks move below the waterline.
  for (let i = 0; i < 22; i++) {
    const span = Math.max(4, VIEW_H - waterTop);
    const bx = (i * 47 + Math.floor(game.time * (7 + i % 4))) % VIEW_W;
    const by = waterTop + ((i * 29 - game.time * (10 + i % 3) + 5000) % span);
    g.globalAlpha = 0.22 + (i % 3) * 0.09;
    g.fillRect(Math.round(bx), Math.round(by), i % 4 === 0 ? 2 : 1, 1);
  }
  g.globalAlpha = 0.08 + game.waterLevel * 0.05;
  for (let y = waterTop + 14; y < VIEW_H; y += 22) {
    g.fillRect(Math.round((game.time * 5 + y * 3) % VIEW_W) - 24,
      y + Math.round(pulse), 24, 1);
  }
  g.restore();
}

function drawPlayerBubbles(g, game, cam) {
  if (!game.inWater || game.state === 'dead') return;
  const px = Math.round(game.player.x - cam.x);
  const py = Math.round(game.player.y - cam.y);
  g.save();
  g.strokeStyle = '#29e0ff';
  for (let i = 0; i < 5; i++) {
    const phase = (game.time * (0.7 + i * 0.04) + i * 0.21) % 1;
    const x = px + 5 + Math.round(Math.sin(phase * 8 + i) * 4);
    const y = py - 7 - Math.round(phase * 26);
    g.globalAlpha = (1 - phase) * 0.75;
    g.strokeRect(x + 0.5, y + 0.5, i % 2 ? 1 : 2, i % 2 ? 1 : 2);
  }
  g.restore();
}

function LIGHT(game) {
  return 82 + (game.player.sprinting ? 10 : 0);
}

// ---------------------------------------------------------------------------

function drawHud(g, game) {
  g.fillStyle = '#000000';
  g.fillRect(0, 0, VIEW_W, 14);
  g.fillStyle = '#00a82c';
  g.fillRect(0, 14, VIEW_W, 1);

  drawText(g, 'KEYS', 4, 3, 'm');
  for (let i = 0; i < 3; i++) {
    const card = game.cards[i];
    const x = 30 + i * 9;
    g.fillStyle = card.taken ? PALHEX(card.color) : '#00230d';
    g.fillRect(x, 3, 7, 8);
    g.fillStyle = '#000000';
    g.fillRect(x + 2, 5, 3, 4);
  }

  const room = roomAt(Math.floor(game.player.x / TILE), Math.floor(game.player.y / TILE));
  drawTextCentered(g, room ? room.name : 'CORRIDOR', VIEW_W / 2, 3, 'g');

  const scoreStr = 'SCR ' + String(game.score).padStart(6, '0');
  drawText(g, scoreStr, VIEW_W - 4 - textWidth(scoreStr), 3, 'g');

  // Stamina.
  g.fillStyle = '#000000';
  g.fillRect(0, VIEW_H - 17, 244, 17);
  g.fillStyle = '#00521c';
  g.fillRect(0, VIEW_H - 18, 244, 1);
  drawText(g, 'PWR', 4, VIEW_H - 11, 'm');
  g.fillStyle = '#00230d';
  g.fillRect(26, VIEW_H - 10, 62, 6);
  const w = Math.round((game.player.stamina / 100) * 60);
  const canKick = game.player.stamina >= 25;
  g.fillStyle = canKick ? '#00ff41' : '#ff3355';
  g.fillRect(27, VIEW_H - 9, w, 4);
  // Tick marks the reserve you need before a sprint will engage at all.
  g.fillStyle = canKick ? '#00521c' : '#ffd83d';
  g.fillRect(27 + Math.round(0.25 * 60), VIEW_H - 10, 1, 6);

  // Dash charge: one per attempt, so it reads as a single hard pip.
  drawText(g, 'DSH', 96, VIEW_H - 11, 'm');
  const ready = game.player.dashCharges > 0;
  const pipX = 118;
  g.fillStyle = ready ? '#29e0ff' : '#00230d';
  g.fillRect(pipX, VIEW_H - 10, 14, 6);
  g.fillStyle = ready ? '#000000' : '#00521c';
  g.fillRect(pipX + 2, VIEW_H - 8, 10, 2);
  if (!ready) drawText(g, 'SPENT', pipX + 18, VIEW_H - 11, 'd');
  drawText(g, fmt(game.elapsed), 207, VIEW_H - 11, 'g');
  const meter = game.oxygen;
  drawText(g, 'O2', 151, VIEW_H - 11, meter < 30 ? 'r' : 'c');
  g.fillStyle = '#00230d';
  g.fillRect(168, VIEW_H - 10, 34, 6);
  g.fillStyle = meter < 30 ? '#ff3355' : '#29e0ff';
  g.fillRect(169, VIEW_H - 9, Math.round(32 * meter / 100), 4);
  if (meter < 30 && Math.floor(game.time * 5) % 2 === 0) {
    drawText(g, 'O2 LOW', 160, VIEW_H - 20, 'r');
  }
  const alert = game.octo.mode === 'hunt';
  drawText(g, alert ? '!! CONTACT' : 'SONAR LIVE', 251, 178, alert ? 'r' : 'm');
  drawText(g, isEnabled() ? 'M AUDIO ON' : 'M MUTED', 4, 18, 'm');
  if (game.waterLevel > 0 && game.waterLevel < 1) {
    const remain = Math.max(0, Math.ceil(TUNING.FLOOD_FULL - game.elapsed));
    const warning = `FLOOD ${fmt(remain)}`;
    const critical = game.waterLevel >= 0.72;
    const visible = !critical || Math.floor(game.time * 6) % 2 === 0;
    g.fillStyle = '#000000';
    g.fillRect(VIEW_W - textWidth(warning) - 9, 16, textWidth(warning) + 9, 12);
    if (visible) drawText(g, warning, VIEW_W - textWidth(warning) - 4, 18, critical ? 'r' : 'c');
  }

  if (game.messageT > 0) {
    const alphaBlink = game.messageT > 0.4 || Math.floor(game.time * 10) % 2 === 0;
    if (alphaBlink) {
      const col = game.message.startsWith('!!') ? 'r' : 'g';
      // Sits above the minimap: lower down, the minimap's panel clips the tail
      // off longer messages.
      const w2 = textWidth(game.message);
      g.fillStyle = '#000000';
      g.fillRect(VIEW_W / 2 - w2 / 2 - 4, VIEW_H - 78, w2 + 8, 12);
      drawTextCentered(g, game.message, VIEW_W / 2, VIEW_H - 76, col);
    }
  }
}

function PALHEX(key) {
  return { r: '#ff3355', y: '#ffd83d', c: '#29e0ff' }[key] || '#00ff41';
}

function drawMinimap(g, game) {
  const mx = VIEW_W - MAP_W - 5;
  const my = VIEW_H - MAP_H - 5;

  g.fillStyle = '#000000';
  g.fillRect(mx - 2, my - 2, MAP_W + 4, MAP_H + 4);
  g.fillStyle = '#00a82c';
  g.strokeStyle = '#00a82c';
  g.lineWidth = 1;
  g.strokeRect(mx - 1.5, my - 1.5, MAP_W + 3, MAP_H + 3);

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = y * MAP_W + x;
      if (!game.explored[i]) continue;
      if (game.tiles[i] !== FLOOR) continue;
      g.fillStyle = '#00521c';
      g.fillRect(mx + x, my + y, 1, 1);
    }
  }

  for (const c of game.cards) {
    if (c.taken) continue;
    const tx = Math.floor(c.x / TILE);
    const ty = Math.floor(c.y / TILE);
    if (!game.explored[ty * MAP_W + tx]) continue;
    if (Math.floor(game.time * 3) % 2 === 0) continue;
    g.fillStyle = PALHEX(c.color);
    g.fillRect(mx + tx, my + ty, 2, 2);
  }

  if (game.explored[EXIT.y * MAP_W + EXIT.x]) {
    g.fillStyle = game.doorOpen ? '#00ff41' : '#ff3355';
    g.fillRect(mx + EXIT.x - 1, my + EXIT.y - 1, 3, 3);
  }

  // Sonar contact: the octopus only paints when it is actively hunting.
  if (game.octo.mode === 'hunt' && Math.floor(game.time * 6) % 2 === 0) {
    g.fillStyle = '#ff4dd2';
    g.fillRect(mx + Math.floor(game.octo.x / TILE) - 1, my + Math.floor(game.octo.y / TILE) - 1, 3, 3);
  }

  g.fillStyle = '#e8fff0';
  g.fillRect(mx + Math.floor(game.player.x / TILE), my + Math.floor(game.player.y / TILE), 2, 2);
}

// ---------------------------------------------------------------------------

// The position broadcast: rings out from the diver so you see what you just did.
function drawBeacon(g, game, cam) {
  const px = game.player.x - cam.x;
  const py = game.player.y - cam.y;
  const phase = 1 - Math.min(1, game.beaconT / 2.4);
  for (let i = 0; i < 3; i++) {
    const t = (phase + i * 0.33) % 1;
    g.globalAlpha = (1 - t) * 0.55;
    g.strokeStyle = '#ff3355';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(px, py, 6 + t * 120, 0, Math.PI * 2);
    g.stroke();
  }
  g.globalAlpha = 1;
}

const PANEL = { x: 20, y: 14, w: 280, h: 212 };

function drawPuzzle(g, game) {
  const { x, y, w, h } = PANEL;
  const pz = game.puzzle;
  const card = game.activeCard;

  g.fillStyle = 'rgba(0,0,0,0.86)';
  g.fillRect(0, 0, VIEW_W, VIEW_H);

  g.fillStyle = '#000000';
  g.fillRect(x, y, w, h);
  g.strokeStyle = game.puzzleFlash > 0 ? '#ff3355' : '#00a82c';
  g.lineWidth = 1;
  g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  const title = `${card.name} CONSOLE`;
  drawText(g, title, x + 6, y + 4, 'm');
  const nm = pz.name;
  drawText(g, nm, x + w - 6 - textWidth(nm), y + 4, 'g');
  g.fillStyle = '#00521c';
  g.fillRect(x + 4, y + 15, w - 8, 1);

  pz.draw(g, x + 6, y + 20, w - 12, 150);

  g.fillStyle = '#00521c';
  g.fillRect(x + 4, y + 176, w - 8, 1);

  // Threat readout — you are facing a screen with your back to the corridor.
  const o = game.octo;
  const dist = Math.hypot(game.player.x - o.x, game.player.y - o.y) / 16;
  const label = o.mode === 'hunt' ? 'HUNTING' : o.mode === 'search' ? 'SEARCHING' : 'PATROL';
  const hot = o.mode === 'hunt';
  const blink = !hot || Math.floor(game.time * 6) % 2 === 0;
  drawText(g, 'SPECIMEN', x + 6, y + 182, 'm');
  if (blink) {
    drawText(g, label, x + 62, y + 182, hot ? 'r' : dist < 8 ? 'y' : 'm');
  }
  const dTxt = `${dist.toFixed(0)}M`;
  drawText(g, dTxt, x + w - 6 - textWidth(dTxt), y + 182, dist < 8 ? 'r' : 'm');

  drawText(g, pz.hint, x + 6, y + 196, 'm');
  drawText(g, 'ESC ABORT', x + w - 6 - textWidth('ESC ABORT'), y + 196, 'y');
}

function drawBoot(g, game) {
  const chars = Math.floor(game.bootTime * 46);
  let used = 0;
  let y = 30;
  for (const line of BOOT_LINES) {
    if (used >= chars) break;
    const slice = line.slice(0, Math.max(0, chars - used));
    const col = line.startsWith('>>') ? 'r' : 'g';
    drawText(g, slice, 26, y, col);
    used += line.length + 3;
    y += 12;
  }
  // Cursor trails the text while it types, then parks on its own line.
  const total = BOOT_LINES.reduce((n, l) => n + l.length + 3, 0);
  if (Math.floor(game.time * 3) % 2 === 0) {
    const done = chars >= total;
    const cx = done ? 26 : 26 + (lastLen(BOOT_LINES, chars) * CHAR_W);
    const cy = done ? y : y - 12;
    g.fillStyle = '#00ff41';
    g.fillRect(cx, cy, 5, 8);
  }
}

// How many chars of the line currently being typed are visible.
function lastLen(lines, chars) {
  let used = 0;
  for (const line of lines) {
    if (used + line.length + 3 > chars) return Math.max(0, chars - used);
    used += line.length + 3;
  }
  return 0;
}

function drawTitle(g, game) {
  const t = game.time;
  g.strokeStyle = '#00521c';
  g.strokeRect(8.5, 8.5, 303, 222);
  drawText(g, 'AQUALAB / K-22', 16, 16, 'm');
  drawText(g, 'SIGNAL LOST', 238, 16, 'r');
  // Offset bitmap lettering supplies a crisp arcade extrusion.
  drawTextCentered(g, 'DEEP SIX', VIEW_W / 2 + 2, 42, 'd', 3);
  drawTextCentered(g, 'DEEP SIX', VIEW_W / 2, 39, 'g', 3);
  drawTextCentered(g, 'SUBMERGED. HUNTED. STILL ALIVE.', VIEW_W / 2, 69, 'm');
  g.fillStyle = '#00521c';
  g.fillRect(24, 85, 272, 1);

  const y = 96;
  drawTextCentered(g, 'A GIANT OCTOPUS IS HUNTING YOU.', VIEW_W / 2, y, 'w');
  drawTextCentered(g, 'FIND 3 KEYCARDS. UNSEAL THE EXIT.', VIEW_W / 2, y + 12, 'w');
  drawTextCentered(g, 'EACH ONE YOU TAKE BROADCASTS YOUR POSITION.', VIEW_W / 2, y + 24, 'r');

  drawTextCentered(g, 'WASD - SWIM    SHIFT - SPRINT [LOUD]', VIEW_W / 2, y + 44, 'm');
  drawTextCentered(g, 'SPACE - THRUSTER DASH [ONCE PER DIVE]', VIEW_W / 2, y + 56, 'c');
  drawTextCentered(g, 'M - AUDIO ON/OFF', VIEW_W / 2, y + 68, 'm');

  g.fillStyle = '#00230d';
  g.fillRect(77, 193, 166, 30);
  drawTextCentered(g, 'TEAM 22 / RETRO', VIEW_W / 2, 198, 'm');

  if (Math.floor(t * 2) % 2 === 0) {
    drawTextCentered(g, '> PRESS ANY KEY TO DIVE', VIEW_W / 2, 212, 'g');
  }

  const spr = SPR.octo[Math.floor(t * 3) % 2 === 0 ? 'u' : 'p'][Math.floor(t * 4) % 3];
  g.drawImage(spr, 20, 180, 32, 32);
  g.drawImage(spr, VIEW_W - 52, 180, 32, 32);
}

function briefingFrame(g, page, title, color = 'g') {
  g.strokeStyle = '#00521c';
  g.strokeRect(8.5, 8.5, 303, 222);
  drawText(g, `K-22 BRIEFING // ${page}/3`, 16, 15, 'm');
  drawText(g, title, VIEW_W - 16 - textWidth(title), 15, color);
  g.fillStyle = '#00521c';
  g.fillRect(16, 28, 288, 1);
}

function briefingNext(g, game, text) {
  if (Math.floor(game.time * 2) % 2 === 0) {
    drawTextCentered(g, `> ${text}`, VIEW_W / 2, 216, 'g');
  }
}

function drawMissionBriefing(g, game) {
  briefingFrame(g, 1, 'MISSION');
  drawTextCentered(g, 'ESCAPE FACILITY K-22', VIEW_W / 2, 39, 'w', 2);

  // Visual route: diver -> three keys -> exit.
  g.fillStyle = '#00230d';
  g.fillRect(19, 65, 282, 57);
  g.strokeStyle = '#00a82c';
  g.setLineDash([4, 4]);
  g.beginPath(); g.moveTo(49, 91); g.lineTo(270, 91); g.stroke();
  g.setLineDash([]);
  g.drawImage(SPR.diver.right[0], 27, 79, 24, 24);
  for (let i = 0; i < 3; i++) {
    const col = ['r', 'y', 'c'][i];
    g.drawImage(SPR.key[col], 90 + i * 45, 81, 20, 20);
    drawTextCentered(g, String(i + 1), 100 + i * 45, 105, col);
  }
  g.drawImage(SPR.doorOpen, 256, 75, 32, 32);

  drawTextCentered(g, 'FIND 3 SECURITY CONSOLES', VIEW_W / 2, 136, 'c');
  drawTextCentered(g, 'SOLVE EACH TASK. CLAIM EACH KEY.', VIEW_W / 2, 150, 'm');
  drawTextCentered(g, 'ALL 3 KEYS OPEN THE ESCAPE HATCH.', VIEW_W / 2, 164, 'g');
  g.drawImage(SPR.octo.p[1], 21, 178, 28, 28);
  drawText(g, 'SPECIMEN 22 HUNTS WHILE YOU SOLVE.', 58, 186, 'r');
  briefingNext(g, game, 'NEXT: FLOOD PROTOCOL');
}

function drawFloodBriefing(g, game) {
  briefingFrame(g, 2, 'FLOOD PROTOCOL', 'c');
  const x = 40, y = 43, w = 240, h = 104;
  g.fillStyle = '#00131c'; g.fillRect(x, y, w, h);
  g.strokeStyle = '#00a82c'; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  const demo = 0.18 + ((game.time * 0.08) % 0.68);
  const waterY = Math.round(y + h * (1 - demo));
  g.globalAlpha = 0.45; g.fillStyle = '#063d52';
  g.fillRect(x + 2, waterY, w - 4, y + h - waterY - 2);
  g.globalAlpha = 1; g.fillStyle = '#29e0ff'; g.fillRect(x + 2, waterY, w - 4, 1);
  for (let bx = x + 8; bx < x + w - 8; bx += 18) {
    g.fillRect(bx + Math.round(Math.sin(game.time * 3 + bx) * 2), waterY + 4, 8, 1);
  }
  g.drawImage(SPR.diver.down[0], 148, 88, 24, 24);
  drawText(g, 'LEAK', x + 8, y + 8, 'r');
  drawText(g, 'O2', x + w - 42, y + 8, 'c');
  g.fillStyle = '#00230d'; g.fillRect(x + w - 42, y + 19, 31, 5);
  g.fillStyle = '#29e0ff'; g.fillRect(x + w - 41, y + 20, 29, 3);

  drawText(g, '00:50', 29, 159, 'y');
  drawText(g, 'WATER STARTS RISING', 83, 159, 'm');
  drawText(g, '02:00', 29, 173, 'r');
  drawText(g, 'FACILITY FULLY FLOODED', 83, 173, 'm');
  drawText(g, 'O2', 29, 187, 'c');
  drawText(g, '28 SEC AIR / RECOVERS ABOVE WATER', 56, 187, 'm');
  drawTextCentered(g, 'UNDERWATER SPEED: 90%', VIEW_W / 2, 201, 'c');
  briefingNext(g, game, 'NEXT: CONTROLS');
}

function keycap(g, label, x, y, w = 34) {
  g.fillStyle = '#00230d'; g.fillRect(x, y, w, 19);
  g.strokeStyle = '#00a82c'; g.strokeRect(x + 0.5, y + 0.5, w - 1, 18);
  drawTextCentered(g, label, x + w / 2, y + 6, 'w');
}

function drawControlsBriefing(g, game) {
  briefingFrame(g, 3, 'DIVE CONTROLS', 'c');
  drawTextCentered(g, 'STAY QUIET. KEEP MOVING.', VIEW_W / 2, 40, 'm');
  keycap(g, 'W', 57, 58, 26); keycap(g, 'A', 29, 79, 26);
  keycap(g, 'S', 57, 79, 26); keycap(g, 'D', 85, 79, 26);
  drawText(g, 'SWIM / 8 DIRECTIONS', 133, 73, 'g');
  keycap(g, 'SHIFT', 29, 111, 82);
  drawText(g, 'SPRINT - FAST, BUT LOUD', 133, 117, 'y');
  keycap(g, 'SPACE', 29, 143, 82);
  drawText(g, 'THRUSTER DASH - ONE USE', 133, 149, 'c');
  keycap(g, 'ESC/Q', 29, 175, 82);
  drawText(g, 'LEAVE TASK / KEEP PROGRESS', 133, 181, 'm');
  drawTextCentered(g, 'WATCH O2, WATER, STAMINA AND SONAR.', VIEW_W / 2, 202, 'r');
  briefingNext(g, game, 'BEGIN DIVE');
}

function drawDead(g, game) {
  g.fillStyle = 'rgba(0,0,0,0.72)';
  g.fillRect(0, 0, VIEW_W, VIEW_H);
  const drowned = game.deathCause === 'oxygen';
  drawTextCentered(g, drowned ? 'DROWNED' : 'TAKEN', VIEW_W / 2, 74, 'r', 3);
  drawTextCentered(g, drowned ? 'OXYGEN RESERVE DEPLETED' : 'SPECIMEN 22 HAS YOU', VIEW_W / 2, 106, 'w');
  drawTextCentered(g, `KEYCARDS ${game.collected}/3   SCORE ${game.score}`, VIEW_W / 2, 128, 'm');
  drawTextCentered(g, `TIME ${fmt(game.elapsed)}`, VIEW_W / 2, 140, 'm');
  if (Math.floor(game.time * 2) % 2 === 0) {
    drawTextCentered(g, 'PRESS R TO RETRY', VIEW_W / 2, 176, 'g');
  }
}

function drawWin(g, game) {
  const f = game.finalScore;
  g.fillStyle = 'rgba(0,0,0,0.82)';
  g.fillRect(0, 0, VIEW_W, VIEW_H);
  drawTextCentered(g, 'ESCAPED', VIEW_W / 2, 36, 'g', 3);
  drawTextCentered(g, 'SURFACE REACHED', VIEW_W / 2, 68, 'w');

  const rows = [
    ['KEYCARDS', f.keys],
    ['DATA LOGS', f.logs],
    ['TIME BONUS', f.bonus],
  ];
  let y = 96;
  for (const [label, val] of rows) {
    drawText(g, label, 80, y, 'm');
    const s = String(val).padStart(6, '0');
    drawText(g, s, VIEW_W - 80 - textWidth(s), y, 'g');
    y += 14;
  }
  g.fillStyle = '#00a82c';
  g.fillRect(80, y + 2, VIEW_W - 160, 1);
  y += 10;
  drawText(g, 'TOTAL', 80, y, 'w');
  const tot = String(f.total).padStart(6, '0');
  drawText(g, tot, VIEW_W - 80 - textWidth(tot), y, 'y');

  drawTextCentered(g, `ESCAPE TIME ${fmt(f.time)}`, VIEW_W / 2, y + 22, 'm');
  if (Math.floor(game.time * 2) % 2 === 0) {
    drawTextCentered(g, 'PRESS R TO DIVE AGAIN', VIEW_W / 2, VIEW_H - 20, 'g');
  }
}

function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
