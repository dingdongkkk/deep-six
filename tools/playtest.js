// ---------------------------------------------------------------------------
// Headless balance harness. Drives the real Game class with a bot that models
// an average competent player: it beelines for objectives, reacts to the
// octopus only when the octopus is actually hunting (which a player can see on
// the minimap and hear in the music), spends real time thinking at consoles,
// and panics with the dash when cornered.
//
// Not shipped with the game. Load it from the console:
//   const T = await import('/tools/playtest.js'); await T.runTrials(50);
// ---------------------------------------------------------------------------

import { Game, TUNING } from '../src/game.js';

// Re-exported so a sweep mutates the SAME module instance the trials use.
export { TUNING };
import { TILE, MAP_W, MAP_H, flowField, isSolid, EXIT } from '../src/map.js';

// Seconds a human plausibly needs at each console, before difficulty scaling.
const THINK = {
  'SEQUENCE LOCK': 9,
  'CIPHER DIAL': 12,
  'FLOW VALVES': 18,
  'SONAR TUNE': 9,
  'BINARY BUS': 11,
  'MEMORY CORE': 11,
  'PRESSURE BALANCE': 15,
  'KEYPAD LOGIC': 20,
  'REACTOR TIMING': 8,
};

const DEFAULTS = {
  thinkScale: 1,        // 1 = average player, <1 = sharper
  sprintRange: 190,     // starts sprinting when a hunter is this close
  sprintFloor: 28,      // matches the in-game hysteresis threshold
  dashRange: 22,        // last-resort distance when not boxed in
  fleeRange: 70,        // abandons a console when a hunter gets this close
  evadeRange: 999,      // any active hunt means break contact before anything else
  hideRange: 130,       // freezes to drop to idle hearing once contact breaks
  timeout: 420,
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function makeBot(opts) {
  return {
    ...DEFAULTS,
    ...opts,
    field: new Int32Array(MAP_W * MAP_H),
    fieldKey: -1,
    fieldT: 0,
    fleeField: new Int32Array(MAP_W * MAP_H),
    fleeT: 0,
    thinkT: 0,
    atConsole: null,
    stats: { hunts: 0, dashes: 0, flees: 0, sprintTime: 0, consoleTime: 0 },
    travel60: 0,
    lastPos: null,
    wasHunting: false,
  };
}

function targetTile(game) {
  const open = game.cards.filter((c) => !c.taken);
  if (!open.length) return { x: EXIT.x, y: EXIT.y };
  let best = open[0];
  let bestD = dist(game.player, best);
  for (const c of open) {
    const d = dist(game.player, c);
    if (d < bestD) { bestD = d; best = c; }
  }
  return { x: Math.floor(best.x / TILE), y: Math.floor(best.y / TILE) };
}

// Threat-aware routing. Each candidate tile is scored as "distance still to go"
// minus a bonus for being far from the octopus, with the bonus weighted by how
// close the octopus currently is. At range the bot beelines; up close it runs.
// Without this it happily sprints straight through the thing chasing it.
function chooseStep(game, bot, dt) {
  const p = game.player;
  const o = game.octo;
  const od = dist(p, o);

  const t = targetTile(game);
  const key = t.y * MAP_W + t.x;
  bot.fieldT -= dt;
  if (key !== bot.fieldKey || bot.fieldT <= 0) {
    flowField(game.tiles, t.x, t.y, bot.field);
    bot.fieldKey = key;
    bot.fieldT = 0.5;
  }

  const threatened = o.mode === 'hunt' || od < 260;
  if (threatened) {
    bot.fleeT -= dt;
    if (bot.fleeT <= 0) {
      flowField(game.tiles, Math.floor(o.x / TILE), Math.floor(o.y / TILE), bot.fleeField);
      bot.fleeT = 0.25;
    }
  }

  // Weight rises sharply as the octopus closes, so evasion overrides the goal.
  let weight = 0;
  if (threatened) {
    weight = od < 90 ? 14 : od < 160 ? 7 : o.mode === 'hunt' ? 3 : 2;
  }

  const ptx = Math.floor(p.x / TILE);
  const pty = Math.floor(p.y / TILE);
  let best = null;
  let bestCost = Infinity;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = ptx + dx;
    const ny = pty + dy;
    if (isSolid(game.tiles, nx, ny)) continue;
    const ni = ny * MAP_W + nx;
    const obj = bot.field[ni];
    if (obj < 0) continue;
    let cost = obj;
    if (weight > 0) {
      const safe = bot.fleeField[ni];
      const s2 = safe < 0 ? 20 : safe;
      cost -= weight * Math.min(s2, 16);
      // Never voluntarily step into the tiles the octopus is standing on.
      // No human walks into a monster they can see.
      if (s2 <= 2 && od < 200) cost += 900;
    }
    if (cost < bestCost) { bestCost = cost; best = { x: nx, y: ny }; }
  }

  if (!best) return { vx: t.x * TILE + 8 - p.x, vy: t.y * TILE + 8 - p.y };

  // Look one tile further along the same gradient and aim between the two.
  // Steering tile-centre to tile-centre zig-zags, which quietly costs enough
  // speed that even a slower pursuer reels you in - a human doesn't move that
  // way, and without this the harness reads far harder than the game is.
  const ahead = stepFrom(game, bot, best.x, best.y, weight);
  const aimX = ahead ? (best.x + ahead.x) * 0.5 * TILE + 8 : best.x * TILE + 8;
  const aimY = ahead ? (best.y + ahead.y) * 0.5 * TILE + 8 : best.y * TILE + 8;
  return { vx: aimX - p.x, vy: aimY - p.y };
}

// One more gradient step out from an arbitrary tile, same scoring rule.
function stepFrom(game, bot, tx, ty, weight) {
  let best = null;
  let bestCost = Infinity;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = tx + dx;
    const ny = ty + dy;
    if (isSolid(game.tiles, nx, ny)) continue;
    const ni = ny * MAP_W + nx;
    const obj = bot.field[ni];
    if (obj < 0) continue;
    let cost = obj;
    if (weight > 0) {
      const safe = bot.fleeField[ni];
      cost -= weight * Math.min(safe < 0 ? 20 : safe, 16);
    }
    if (cost < bestCost) { bestCost = cost; best = { x: nx, y: ny }; }
  }
  return best;
}

function setKeys(game, vx, vy, sprint) {
  const k = {};
  if (vx > 2) k.KeyD = true;
  else if (vx < -2) k.KeyA = true;
  if (vy > 2) k.KeyS = true;
  else if (vy < -2) k.KeyW = true;
  if (sprint) k.ShiftLeft = true;
  game.keys = k;
}

function botStep(game, bot, dt) {
  const p = game.player;
  const o = game.octo;
  const od = dist(p, o);
  const hunting = o.mode === 'hunt';
  if (hunting && !bot.wasHunting) bot.stats.hunts++;
  bot.wasHunting = hunting;

  // ---- at a console -------------------------------------------------------
  if (game.state === 'puzzle') {
    bot.stats.consoleTime += dt;
    if (bot.atConsole !== game.puzzle) {
      bot.atConsole = game.puzzle;
      const base = THINK[game.puzzle.name] || 15;
      bot.thinkT = base * bot.thinkScale * (0.8 + Math.random() * 0.4);
    }
    if (hunting && od < bot.fleeRange) {
      game.onKeyDown('Escape');
      bot.stats.flees++;
      bot.atConsole = null;
      return;
    }
    bot.thinkT -= dt;
    if (bot.thinkT <= 0) {
      const pz = game.puzzle;
      const keys = pz.solutionKeys();
      if (keys === null) {
        if (pz.inZone()) game.onKeyDown('Space');
      } else {
        for (const k of keys) {
          if (game.state !== 'puzzle') break;
          game.onKeyDown(k);
        }
      }
    }
    return;
  }

  if (game.state !== 'play') return;
  bot.atConsole = null;

  // Hold still once contact is broken — idle hearing is less than half of
  // walking, so freezing is what actually makes the octopus give up.
  if (o.mode === 'search' && od > bot.hideRange) {
    game.keys = {};
    return;
  }

  const vec = chooseStep(game, bot, dt);
  const sprint = hunting && od < bot.sprintRange && p.stamina > bot.sprintFloor;
  setKeys(game, vec.vx, vec.vy, sprint);
  if (sprint) bot.stats.sprintTime += dt;

  // Save the dash for being cornered, then punch THROUGH the octopus on its
  // i-frames. Spending it to gain a few metres in an open-field chase wastes
  // the only answer to a dead end.
  const boxedIn = bot.travel60 < 34;
  if (hunting && p.dashCharges > 0 && p.dashT <= 0 &&
      (od < bot.dashRange || (boxedIn && od < 58))) {
    const towards = boxedIn;
    const ax = towards ? o.x - p.x : p.x - o.x;
    const ay = towards ? o.y - p.y : p.y - o.y;
    const k = {};
    if (Math.abs(ax) > Math.abs(ay)) k[ax > 0 ? 'KeyD' : 'KeyA'] = true;
    else k[ay > 0 ? 'KeyS' : 'KeyW'] = true;
    game.keys = k;
    game.onKeyDown('Space');
    bot.stats.dashes++;
  }
}

export function runTrial(opts = {}) {
  const cv = document.createElement('canvas');
  cv.width = 320;
  cv.height = 240;
  const game = new Game(cv.getContext('2d'));
  const bot = makeBot(opts);

  game.reset();
  game.state = 'play';
  game.time = 10;

  // Snapshot the situation at the moment of death, to see how runs actually end.
  let deathCtx = null;
  const origDie = game.die.bind(game);
  game.die = function () {
    if (!deathCtx) {
      const p = game.player;
      deathCtx = {
        inState: game.state,
        stamina: Math.round(p.stamina),
        dashLeft: p.dashCharges,
        moving: p.moving,
        sprinting: p.sprinting,
        recentTravel: Math.round(bot.travel60),
        octoMode: game.octo.mode,
      };
    }
    origDie();
  };

  const dt = 1 / 60;
  let frames = 0;
  const maxFrames = bot.timeout * 60;
  while (frames < maxFrames && game.state !== 'dead' && game.state !== 'win') {
    botStep(game, bot, dt);
    const prev = { x: game.player.x, y: game.player.y };
    game.update(dt);
    // Distance covered over the last second: near zero means cornered or stuck.
    const step = Math.hypot(game.player.x - prev.x, game.player.y - prev.y);
    bot.travel60 = bot.travel60 * 0.983 + step;
    game.time += dt;
    frames++;
  }

  return {
    outcome: game.state === 'win' ? 'win' : game.state === 'dead' ? 'dead' : 'timeout',
    time: game.elapsed,
    keycards: game.collected,
    score: game.state === 'win' ? game.score : game.score,
    puzzles: game.cards.map((c) => c.puzzle.name),
    deathCtx,
    ...bot.stats,
  };
}

// Win rate grouped by which puzzles were rolled, to see how much the random
// draw swings a session.
export function byPuzzleLoad(n = 300, opts = {}) {
  const runs = [];
  for (let i = 0; i < n; i++) runs.push(runTrial(opts));
  const THINK_REF = {
    'SEQUENCE LOCK': 9, 'CIPHER DIAL': 12, 'FLOW VALVES': 18, 'SONAR TUNE': 9,
    'BINARY BUS': 11, 'MEMORY CORE': 11, 'PRESSURE BALANCE': 15,
    'KEYPAD LOGIC': 20, 'REACTOR TIMING': 8,
  };
  const load = (r) => r.puzzles.reduce((s2, nm) => s2 + (THINK_REF[nm] || 12), 0);
  const buckets = { light: [], mid: [], heavy: [] };
  for (const r of runs) {
    const l = load(r);
    (l <= 30 ? buckets.light : l <= 40 ? buckets.mid : buckets.heavy).push(r);
  }
  const rate = (arr) => (arr.length ? +(arr.filter((r) => r.outcome === 'win').length / arr.length * 100).toFixed(1) : null);
  return {
    light: { n: buckets.light.length, win: rate(buckets.light) },
    mid: { n: buckets.mid.length, win: rate(buckets.mid) },
    heavy: { n: buckets.heavy.length, win: rate(buckets.heavy) },
    overall: rate(runs),
  };
}

export function runTrials(n = 40, opts = {}) {
  const runs = [];
  for (let i = 0; i < n; i++) runs.push(runTrial(opts));
  return summarise(runs);
}

export function summarise(runs) {
  const n = runs.length;
  const wins = runs.filter((r) => r.outcome === 'win');
  const deaths = runs.filter((r) => r.outcome === 'dead');
  const timeouts = runs.filter((r) => r.outcome === 'timeout');
  const avg = (arr, f) => (arr.length ? arr.reduce((s, r) => s + f(r), 0) / arr.length : 0);

  // Where do runs fall apart? Deaths bucketed by keycards held.
  const deathsByCards = [0, 1, 2, 3].map(
    (k) => deaths.filter((r) => r.keycards === k).length);

  const ctx = deaths.map((r) => r.deathCtx).filter(Boolean);
  const pct = (f) => (ctx.length ? +(ctx.filter(f).length / ctx.length * 100).toFixed(0) : 0);
  const deathProfile = ctx.length ? {
    inPuzzlePct: pct((c) => c.inState === 'puzzle'),
    corneredPct: pct((c) => c.recentTravel < 25),
    outOfStaminaPct: pct((c) => c.stamina < 25),
    dashStillHeldPct: pct((c) => c.dashLeft > 0),
    avgStamina: Math.round(ctx.reduce((s2, c) => s2 + c.stamina, 0) / ctx.length),
    avgRecentTravel: Math.round(ctx.reduce((s2, c) => s2 + c.recentTravel, 0) / ctx.length),
  } : null;

  return {
    trials: n,
    deathProfile,
    winRate: +(wins.length / n * 100).toFixed(1),
    deathRate: +(deaths.length / n * 100).toFixed(1),
    timeoutRate: +(timeouts.length / n * 100).toFixed(1),
    avgWinTime: +avg(wins, (r) => r.time).toFixed(1),
    avgDeathTime: +avg(deaths, (r) => r.time).toFixed(1),
    avgKeycards: +avg(runs, (r) => r.keycards).toFixed(2),
    deathsByKeycards: deathsByCards,
    avgHunts: +avg(runs, (r) => r.hunts).toFixed(1),
    avgDashes: +avg(runs, (r) => r.dashes).toFixed(2),
    avgFlees: +avg(runs, (r) => r.flees).toFixed(2),
    avgSprintTime: +avg(runs, (r) => r.sprintTime).toFixed(1),
    avgConsoleTime: +avg(runs, (r) => r.consoleTime).toFixed(1),
    avgWinScore: Math.round(avg(wins, (r) => r.score)),
  };
}
