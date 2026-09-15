import { SPR, buildSprites } from './sprites.js';
import { drawText, drawTextCentered, textWidth } from './font.js';
import { KEY_COLORS, KEY_NAMES, OCTO_CALM, OCTO_HUNT } from './palette.js';
import {
  TILE, MAP_W, MAP_H, FLOOR, buildMap, isSolid, roomAt, flowField,
  lineOfSight, validate, ROOMS, SPAWN, OCTO_SPAWN, EXIT, KEY_SPOTS, TERMINAL_SPOTS,
} from './map.js';
import {
  initAudio, unlockAudio, startMusic, setIntensity, setFloodLevel, sfx, setEnabled, isEnabled,
} from './audio.js';
import { rollPuzzles } from './puzzles.js';

export const VIEW_W = 320;
export const VIEW_H = 240;

// ---------------------------------------------------------------------------
// Balance constants, in one mutable object so the playtest harness in tools/
// can sweep them without editing source. Values here are the tuned defaults.
// ---------------------------------------------------------------------------
export const TUNING = {
  PLAYER_WALK: 74,
  PLAYER_SPRINT: 118,

  OCTO_PATROL: 47,
  OCTO_SEARCH: 59,
  OCTO_HUNT_SPEED: 72,     // just under walk (74); sprint still matters for creating space
                           // you must spend sprint, cover or the dash. Measured win
                           // rate by speed: 78->53%, 82->43%, 84->31%, 86->19%.
                           // Past ~86 it collapses into an unwinnable footrace.
  HUNT_PERSIST: 2.8,       // seconds it keeps hunting after losing contact

  DASH_SPEED: 430,
  DASH_TIME: 0.24,         // travel distance and i-frame window
  DASH_CHARGES: 1,         // one per attempt; only a retry gives it back

  STAMINA_DRAIN: 32,
  STAMINA_REGEN: 11,       // slow, as asked. Swept 11/16/20 -> 45/44/42% win:
                           // balance-neutral, so the slower value costs nothing.
  STAMINA_LOCK: 1.1,
  SPRINT_MIN: 25,          // hysteresis: reserve needed to KICK OFF a sprint

  HEAR_IDLE: 46,
  HEAR_WALK: 88,
  HEAR_SPRINT: 232,
  SIGHT_RANGE: 200,
  CATCH_DIST: 10,

  BROADCAST_HUNT: 3.5,     // hunt seconds granted by taking a keycard. Longer is
                           // actually kinder: once a hunt lapses it reverts to random
                           // patrol and can wander into you, which reads as unfair.
  BROADCAST_REAR: 1.15,    // telegraph before it charges
  NOISE_HUNT: 2.2,         // hunt seconds granted by a wrong console entry
  NOISE_REAR: 0.5,

  // Competitive flood clock. The typical successful run is ~83s, so water
  // appears during the final card push while the hard oxygen deadline remains
  // far enough out for skilled recoveries.
  FLOOD_START: 50,
  FLOOD_FULL: 120,
  OXYGEN_TIME: 28,
  OXYGEN_RECOVER: 8,
  WATER_SPEED_SCALE: 0.90,
};

const LIGHT_RADIUS = 82;

const SCORE_KEY = 500;
const SCORE_TERMINAL = 150;
const ESCAPE_BONUS = 6000;

// ---------------------------------------------------------------------------

export class Game {
  constructor(ctx) {
    this.ctx = ctx;
    buildSprites();
    this.tiles = buildMap();

    const report = validate(this.tiles);
    if (report.problems.length || report.orphans > 0) {
      console.warn('[facility] layout issues:', report);
    }
    this.layoutReport = report;

    this.field = new Int32Array(MAP_W * MAP_H);
    this.fieldTarget = -1;
    this.fieldTimer = 0;

    this.keys = {};
    this.state = 'boot';
    this.bootTime = 0;
    this.lastTransition = 0;
    this.shake = 0;
    this.time = 0;

    this.reset();
  }

  reset() {
    this.player = {
      x: SPAWN.x * TILE + 8,
      y: SPAWN.y * TILE + 8,
      dir: 'down',
      frame: 0,
      animT: 0,
      stamina: 100,
      staminaLock: 0,
      moving: false,
      sprinting: false,
      stepT: 0,
      dashCharges: TUNING.DASH_CHARGES,
      dashT: 0,
      dashVX: 0,
      dashVY: 0,
      trail: [],
    };

    this.octo = {
      x: OCTO_SPAWN.x * TILE + 8,
      y: OCTO_SPAWN.y * TILE + 8,
      mode: 'patrol',
      huntT: 0,
      target: { x: OCTO_SPAWN.x, y: OCTO_SPAWN.y },
      wander: null,
      frame: 0,
      animT: 0,
      palT: 0,
      palIdx: 0,
      rearT: 0,
    };

    const rolled = rollPuzzles(3);
    this.cards = KEY_SPOTS.map((spot, i) => ({
      x: spot.x * TILE + 8,
      y: spot.y * TILE + 8,
      room: spot.room,
      color: KEY_COLORS[i],
      name: KEY_NAMES[i],
      taken: false,
      bob: Math.random() * Math.PI * 2,
      puzzle: rolled[i],
    }));

    this.terminals = TERMINAL_SPOTS.map((t) => ({
      x: t.x * TILE + 8,
      y: t.y * TILE + 8,
      used: false,
    }));

    this.explored = new Uint8Array(MAP_W * MAP_H);
    this.score = 0;
    this.collected = 0;
    this.doorOpen = false;
    this.elapsed = 0;
    this.waterLevel = 0;
    this.oxygen = 100;
    this.inWater = false;
    this.floodWarned = false;
    this.floodFullWarned = false;
    this.floodCriticalWarned = false;
    this.deathCause = '';
    setFloodLevel(0);
    this.message = '';
    this.messageT = 0;
    this.danger = 0;
    this.shake = 0;
    this.finalScore = null;
    this.deathT = 0;
    this.puzzle = null;
    this.activeCard = null;
    this.consoleLock = null;
    this.puzzleFlash = 0;
    this.puzzleFlashOk = false;
    this.beaconT = 0;
  }

  // -- input ---------------------------------------------------------------

  onKeyDown(code) {
    this.keys[code] = true;
    unlockAudio();
    // Audio is a global control, including while a console owns puzzle input.
    if (code === 'KeyM') {
      setEnabled(!isEnabled());
      this.say(isEnabled() ? 'AUDIO ON' : 'AUDIO MUTED', 1.2);
      return;
    }

    // A click can land as both pointerdown and keydown; without this guard a
    // single tap would blow straight through the splash screens.
    const settled = this.time - this.lastTransition > 0.3;

    if (this.state === 'boot' && this.bootTime > 0.4 && settled) {
      this.go('title');
      return;
    }
    if (this.state === 'title' && settled) {
      this.go('briefingMission');
      return;
    }
    if (this.state === 'briefingMission' && settled) {
      this.go('briefingFlood');
      return;
    }
    if (this.state === 'briefingFlood' && settled) {
      this.go('briefingControls');
      return;
    }
    if (this.state === 'briefingControls' && settled) {
      this.reset();
      this.go('play');
      startMusic();
      return;
    }
    if ((this.state === 'dead' || this.state === 'win') && code === 'KeyR' && settled) {
      this.reset();
      this.go('play');
      return;
    }

    // A console has the keyboard while it is open. ESC backs out and keeps
    // whatever progress the puzzle has accumulated, so fleeing is always legal.
    if (this.state === 'puzzle') {
      if (code === 'Escape' || code === 'KeyQ') {
        this.closeConsole();
        this.say('CONSOLE DISENGAGED', 1.4);
        return;
      }
      const result = this.puzzle.onKey(code);
      if (result === 'solve') this.solveConsole();
      else if (result === 'fail') this.failConsole();
      else sfx.terminal();
      return;
    }

    if (this.state === 'play' && code === 'Space') this.tryDash();
  }

  onKeyUp(code) {
    this.keys[code] = false;
  }

  go(state) {
    this.state = state;
    this.lastTransition = this.time;
    sfx.ui();
  }

  down(...codes) {
    return codes.some((c) => this.keys[c]);
  }

  say(text, dur = 2.4) {
    this.message = text;
    this.messageT = dur;
  }

  // -- update --------------------------------------------------------------

  update(dt) {
    this.time += dt;
    if (this.state === 'boot') { this.bootTime += dt; return; }

    // The facility does not pause for a puzzle: the octopus keeps hunting
    // while you stand at the console with your back to the room.
    if (this.state === 'puzzle') {
      this.elapsed += dt;
      this.updateFlood(dt);
      if (this.state === 'dead') return;
      if (this.messageT > 0) this.messageT -= dt;
      if (this.puzzleFlash > 0) this.puzzleFlash -= dt;
      if (this.beaconT > 0) this.beaconT -= dt;
      if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 22);
      const p = this.player;
      p.moving = false;
      p.sprinting = false;
      p.staminaLock = Math.max(0, p.staminaLock - dt);
      if (p.staminaLock === 0) p.stamina = Math.min(100, p.stamina + TUNING.STAMINA_REGEN * dt);
      this.puzzle.update(dt);
      this.updateOcto(dt);
      this.updateExplored();
      this.updateDanger();
      return;
    }

    if (this.state !== 'play') {
      if (this.state === 'dead') this.deathT += dt;
      setIntensity(this.state === 'dead' ? 0 : 0.1);
      return;
    }

    this.elapsed += dt;
    this.updateFlood(dt);
    if (this.state === 'dead') return;
    if (this.messageT > 0) this.messageT -= dt;
    if (this.puzzleFlash > 0) this.puzzleFlash -= dt;
    if (this.beaconT > 0) this.beaconT -= dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 22);

    this.updatePlayer(dt);
    this.updateOcto(dt);
    this.updatePickups();
    this.updateExplored();
    this.updateDanger();
  }

  updateFlood(dt) {
    const wasDry = this.waterLevel === 0;
    this.waterLevel = Math.max(0, Math.min(1,
      (this.elapsed - TUNING.FLOOD_START) / (TUNING.FLOOD_FULL - TUNING.FLOOD_START)));

    if (wasDry && this.waterLevel > 0 && !this.floodWarned) {
      this.floodWarned = true;
      this.say('!! HULL BREACH - WATER RISING', 3.2);
      sfx.floodAlarm();
    }
    if (this.waterLevel >= 0.72 && !this.floodCriticalWarned) {
      this.floodCriticalWarned = true;
      this.say('!! WATER 75% - SEEK ESCAPE ROUTE', 3.2);
      sfx.floodAlarm();
    }
    if (this.waterLevel >= 1 && !this.floodFullWarned) {
      this.floodFullWarned = true;
      this.say('!! FACILITY FLOODED - OXYGEN ACTIVE', 3.2);
      sfx.floodAlarm();
    }
    const surfaceY = MAP_H * TILE * (1 - this.waterLevel);
    this.inWater = this.waterLevel > 0 && this.player.y >= surfaceY;
    if (this.inWater) {
      this.oxygen = Math.max(0, this.oxygen - (100 / TUNING.OXYGEN_TIME) * dt);
      if (this.oxygen <= 0) this.die('oxygen');
    } else {
      this.oxygen = Math.min(100, this.oxygen + TUNING.OXYGEN_RECOVER * dt);
    }
    setFloodLevel(this.waterLevel);
  }

  updatePlayer(dt) {
    const p = this.player;

    // A dash overrides normal control for its whole duration.
    if (p.dashT > 0) {
      p.dashT -= dt;
      this.moveEntity(p, p.dashVX * dt, p.dashVY * dt, 4.5, 4.5);
      p.trail.push({ x: p.x, y: p.y, dir: p.dir, frame: p.frame, life: 0.22 });
      for (const t of p.trail) t.life -= dt;
      p.trail = p.trail.filter((t) => t.life > 0);
      p.moving = true;
      return;
    }
    for (const t of p.trail) t.life -= dt;
    p.trail = p.trail.filter((t) => t.life > 0);

    let dx = 0;
    let dy = 0;
    if (this.down('KeyA', 'ArrowLeft')) dx -= 1;
    if (this.down('KeyD', 'ArrowRight')) dx += 1;
    if (this.down('KeyW', 'ArrowUp')) dy -= 1;
    if (this.down('KeyS', 'ArrowDown')) dy += 1;

    const wantSprint = this.down('ShiftLeft', 'ShiftRight');
    const moving = dx !== 0 || dy !== 0;
    p.sprinting = wantSprint && moving &&
      (p.sprinting ? p.stamina > 0 : p.stamina >= TUNING.SPRINT_MIN);

    if (p.sprinting) {
      p.stamina = Math.max(0, p.stamina - TUNING.STAMINA_DRAIN * dt);
      p.staminaLock = TUNING.STAMINA_LOCK;
    } else {
      p.staminaLock = Math.max(0, p.staminaLock - dt);
      if (p.staminaLock === 0) p.stamina = Math.min(100, p.stamina + TUNING.STAMINA_REGEN * dt);
    }

    const baseSpeed = p.sprinting ? TUNING.PLAYER_SPRINT : TUNING.PLAYER_WALK;
    const speed = baseSpeed * (this.inWater ? TUNING.WATER_SPEED_SCALE : 1);
    p.moving = dx !== 0 || dy !== 0;

    if (p.moving) {
      // Normalise so diagonals are not faster (spec: smooth 8-way movement).
      const len = Math.hypot(dx, dy);
      dx = (dx / len) * speed * dt;
      dy = (dy / len) * speed * dt;
      this.moveEntity(p, dx, dy, 4.5, 4.5);

      if (Math.abs(dx) > Math.abs(dy)) p.dir = dx > 0 ? 'right' : 'left';
      else p.dir = dy > 0 ? 'down' : 'up';

      p.animT += dt * (p.sprinting ? 11 : 7);
      p.frame = Math.floor(p.animT) % 2;

      p.stepT -= dt;
      if (p.stepT <= 0) {
        p.stepT = p.sprinting ? 0.22 : 0.34;
        if (this.inWater) sfx.swim();
        else sfx.step();
      }
    } else {
      p.frame = 0;
      p.animT = 0;
    }

    if (Math.random() < dt * 0.4) sfx.bubble();
  }

  updateOcto(dt) {
    const o = this.octo;
    const p = this.player;
    const d = Math.hypot(p.x - o.x, p.y - o.y);

    const hearing = !p.moving ? TUNING.HEAR_IDLE : p.sprinting ? TUNING.HEAR_SPRINT : TUNING.HEAR_WALK;
    const heard = d < hearing;
    const seen = d < TUNING.SIGHT_RANGE && lineOfSight(this.tiles, o.x, o.y, p.x, p.y);

    if (heard || seen) {
      if (o.mode !== 'hunt') {
        sfx.alarm();
        this.say('!! CONTACT !!', 1.6);
      }
      o.mode = 'hunt';
      o.huntT = TUNING.HUNT_PERSIST;
      o.target = { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) };
    } else if (o.mode === 'hunt') {
      o.huntT -= dt;
      if (o.huntT <= 0) o.mode = 'search';
    }

    let speed;
    if (o.mode === 'hunt') {
      speed = TUNING.OCTO_HUNT_SPEED;
    } else if (o.mode === 'search') {
      speed = TUNING.OCTO_SEARCH;
      const td = Math.hypot(o.target.x * TILE + 8 - o.x, o.target.y * TILE + 8 - o.y);
      if (td < 18) { o.mode = 'patrol'; o.wander = null; }
    } else {
      speed = TUNING.OCTO_PATROL;
      const td = o.wander
        ? Math.hypot(o.wander.x * TILE + 8 - o.x, o.wander.y * TILE + 8 - o.y)
        : 999;
      if (!o.wander || td < 20) {
        const r = ROOMS[Math.floor(Math.random() * ROOMS.length)];
        o.wander = {
          x: r.x + Math.floor(Math.random() * r.w),
          y: r.y + Math.floor(Math.random() * r.h),
        };
      }
      o.target = o.wander;
    }

    // A reveal makes it rear up first. A charge with no tell is just a gotcha;
    // the tell is what makes the broadcast a chase you can actually run from.
    if (o.rearT > 0) {
      o.rearT -= dt;
      speed *= 0.12;
    }

    this.steer(o, o.target, speed, dt);

    // Animation: tentacle cycle plus the palette strobe called for by the theme.
    o.animT += dt * (o.mode === 'hunt' ? 9 : 4);
    o.frame = Math.floor(o.animT) % 3;
    o.palT += dt * (o.mode === 'hunt' ? 14 : 3);
    const pal = o.mode === 'hunt' ? OCTO_HUNT : OCTO_CALM;
    o.palIdx = Math.floor(o.palT) % pal.length;
    o.pal = pal[o.palIdx];

    // Dash i-frames: you can punch straight through the octopus, once.
    if (d < TUNING.CATCH_DIST && this.player.dashT <= 0 && this.state !== 'dead') this.die();
    if (d < 60 && o.mode === 'hunt') this.shake = Math.max(this.shake, (60 - d) / 14);
  }

  // Walk downhill on a BFS flow field toward the target tile, or straight at
  // the player when there is a clear line — that reads as deliberate pursuit.
  steer(o, targetTile, speed, dt) {
    const tx = Math.max(0, Math.min(MAP_W - 1, targetTile.x));
    const ty = Math.max(0, Math.min(MAP_H - 1, targetTile.y));
    const key = ty * MAP_W + tx;

    this.fieldTimer -= dt;
    if (key !== this.fieldTarget || this.fieldTimer <= 0) {
      flowField(this.tiles, tx, ty, this.field);
      this.fieldTarget = key;
      this.fieldTimer = 0.2;
    }

    let aimX;
    let aimY;
    const p = this.player;
    const direct = o.mode === 'hunt' && lineOfSight(this.tiles, o.x, o.y, p.x, p.y);

    if (direct) {
      aimX = p.x;
      aimY = p.y;
    } else {
      const otx = Math.floor(o.x / TILE);
      const oty = Math.floor(o.y / TILE);
      const here = this.field[oty * MAP_W + otx];
      let best = null;
      let bestD = here < 0 ? Infinity : here;
      const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [nx, ny] of neighbours) {
        const cx = otx + nx;
        const cy = oty + ny;
        if (isSolid(this.tiles, cx, cy)) continue;
        const nd = this.field[cy * MAP_W + cx];
        if (nd >= 0 && nd < bestD) { bestD = nd; best = { x: cx, y: cy }; }
      }
      if (best) {
        aimX = best.x * TILE + 8;
        aimY = best.y * TILE + 8;
      } else {
        aimX = tx * TILE + 8;
        aimY = ty * TILE + 8;
      }
    }

    const vx = aimX - o.x;
    const vy = aimY - o.y;
    const len = Math.hypot(vx, vy);
    if (len < 0.5) return;
    this.moveEntity(o, (vx / len) * speed * dt, (vy / len) * speed * dt, 5, 5);
  }

  // Axis-separated AABB resolution, which also gives free wall sliding.
  moveEntity(e, dx, dy, hw, hh) {
    if (dx !== 0) {
      let nx = e.x + dx;
      const side = dx > 0 ? nx + hw : nx - hw;
      const tx = Math.floor(side / TILE);
      const y0 = Math.floor((e.y - hh) / TILE);
      const y1 = Math.floor((e.y + hh) / TILE);
      let blocked = false;
      for (let ty = y0; ty <= y1; ty++) if (isSolid(this.tiles, tx, ty)) blocked = true;
      if (blocked) {
        nx = dx > 0 ? tx * TILE - hw - 0.01 : (tx + 1) * TILE + hw + 0.01;
      }
      e.x = nx;
    }
    if (dy !== 0) {
      let ny = e.y + dy;
      const side = dy > 0 ? ny + hh : ny - hh;
      const ty = Math.floor(side / TILE);
      const x0 = Math.floor((e.x - hw) / TILE);
      const x1 = Math.floor((e.x + hw) / TILE);
      let blocked = false;
      for (let tx = x0; tx <= x1; tx++) if (isSolid(this.tiles, tx, ty)) blocked = true;
      if (blocked) {
        ny = dy > 0 ? ty * TILE - hh - 0.01 : (ty + 1) * TILE + hh + 0.01;
      }
      e.y = ny;
    }
  }

  updatePickups() {
    const p = this.player;

    // Keycards live behind security consoles now; walking up opens the puzzle.
    if (this.consoleLock &&
        Math.hypot(p.x - this.consoleLock.x, p.y - this.consoleLock.y) > 26) {
      this.consoleLock = null;
    }
    for (const c of this.cards) {
      if (c.taken || c === this.consoleLock) continue;
      if (Math.hypot(p.x - c.x, p.y - c.y) < 13) this.openConsole(c);
    }

    for (const t of this.terminals) {
      if (t.used) continue;
      if (Math.hypot(p.x - t.x, p.y - t.y) < 14) {
        t.used = true;
        this.score += SCORE_TERMINAL;
        sfx.terminal();
        this.say(`DATA LOG RECOVERED  +${SCORE_TERMINAL}`, 1.6);
      }
    }

    const ex = EXIT.x * TILE + 8;
    const ey = EXIT.y * TILE + 8;
    if (Math.hypot(p.x - ex, p.y - ey) < 14) {
      if (this.doorOpen) this.win();
      else if (this.messageT <= 0) {
        sfx.locked();
        this.say(`EXIT SEALED - ${3 - this.collected} KEYCARDS MISSING`, 2.2);
      }
    }
  }

  updateExplored() {
    const ptx = Math.floor(this.player.x / TILE);
    const pty = Math.floor(this.player.y / TILE);
    const r = 6;
    for (let y = pty - r; y <= pty + r; y++) {
      for (let x = ptx - r; x <= ptx + r; x++) {
        if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
        if ((x - ptx) ** 2 + (y - pty) ** 2 <= r * r) this.explored[y * MAP_W + x] = 1;
      }
    }
  }

  updateDanger() {
    const d = Math.hypot(this.player.x - this.octo.x, this.player.y - this.octo.y);
    let danger;
    if (this.octo.mode === 'hunt') danger = Math.max(0.5, Math.min(1, 1 - d / 320));
    else if (this.octo.mode === 'search') danger = 0.35;
    else danger = Math.max(0, 0.28 - d / 1600);
    this.danger = danger;
    setIntensity(danger);
  }

  // -- dash ----------------------------------------------------------------

  tryDash() {
    const p = this.player;
    if (p.dashCharges <= 0 || p.dashT > 0) {
      sfx.locked();
      this.say('THRUSTER SPENT', 1.2);
      return;
    }
    let dx = 0;
    let dy = 0;
    if (this.down('KeyA', 'ArrowLeft')) dx -= 1;
    if (this.down('KeyD', 'ArrowRight')) dx += 1;
    if (this.down('KeyW', 'ArrowUp')) dy -= 1;
    if (this.down('KeyS', 'ArrowDown')) dy += 1;
    if (!dx && !dy) {
      // No input: fire along the way the diver is already looking.
      if (p.dir === 'left') dx = -1;
      else if (p.dir === 'right') dx = 1;
      else if (p.dir === 'up') dy = -1;
      else dy = 1;
    }
    const len = Math.hypot(dx, dy);
    p.dashVX = (dx / len) * TUNING.DASH_SPEED;
    p.dashVY = (dy / len) * TUNING.DASH_SPEED;
    p.dashT = TUNING.DASH_TIME;
    p.dashCharges--;
    p.trail.length = 0;
    this.shake = Math.max(this.shake, 3);
    sfx.dash();
  }

  // -- security consoles ---------------------------------------------------

  openConsole(card) {
    this.puzzle = card.puzzle;
    this.activeCard = card;
    this.state = 'puzzle';
    this.lastTransition = this.time;
    this.keys = {};
    sfx.ui();
    this.say(`${card.name} CONSOLE ONLINE`, 1.8);
  }

  closeConsole() {
    this.consoleLock = this.activeCard;
    this.puzzle = null;
    this.activeCard = null;
    this.state = 'play';
    this.lastTransition = this.time;
    this.keys = {};
  }

  solveConsole() {
    const card = this.activeCard;
    card.taken = true;
    this.collected++;
    this.score += SCORE_KEY;
    this.closeConsole();
    sfx.pickup();
    this.player.stamina = 100;
    this.player.staminaLock = 0;

    // The console screams your position across the facility as it dispenses.
    this.revealPlayer(TUNING.BROADCAST_HUNT, `${card.name} TAKEN - POSITION BROADCAST`);

    if (this.collected >= 3) {
      this.doorOpen = true;
      setTimeout(() => sfx.unlock(), 260);
      setTimeout(() => this.say('ALL KEYCARDS - EXIT UNSEALED', 3.4), 900);
    }
  }

  failConsole() {
    this.puzzleFlash = 0.4;
    this.puzzleFlashOk = false;
    this.shake = Math.max(this.shake, 4);
    sfx.locked();
    // A wrong entry is quieter than a dispense, but it still carries.
    this.revealPlayer(TUNING.NOISE_HUNT, 'REJECTED - NOISE DETECTED', true);
  }

  // Hands the octopus your exact tile and puts it straight into pursuit.
  revealPlayer(duration, text, quiet = false) {
    const o = this.octo;
    o.mode = 'hunt';
    o.huntT = duration;
    o.rearT = quiet ? TUNING.NOISE_REAR : TUNING.BROADCAST_REAR;
    o.target = { x: Math.floor(this.player.x / TILE), y: Math.floor(this.player.y / TILE) };
    this.beaconT = Math.max(this.beaconT, quiet ? 1.2 : 2.4);
    if (!quiet) this.shake = Math.max(this.shake, 6);
    sfx.alarm();
    this.say(text, quiet ? 1.8 : 3);
  }

  die(cause = 'specimen') {
    this.state = 'dead';
    this.deathCause = cause;
    this.puzzle = null;
    this.activeCard = null;
    this.lastTransition = this.time;
    this.messageT = 0;
    this.deathT = 0;
    this.shake = 9;
    sfx.hurt();
    setTimeout(() => sfx.death(), 260);
  }

  win() {
    const bonus = Math.max(0, Math.round(ESCAPE_BONUS - this.elapsed * 20));
    this.finalScore = {
      keys: this.collected * SCORE_KEY,
      logs: this.terminals.filter((t) => t.used).length * SCORE_TERMINAL,
      bonus,
      time: this.elapsed,
      total: this.score + bonus,
    };
    this.score = this.finalScore.total;
    this.state = 'win';
    this.lastTransition = this.time;
    this.messageT = 0;
    sfx.win();
  }
}
