// ---------------------------------------------------------------------------
// The facility. Rooms and corridors are carved out of a solid block of wall,
// which keeps the layout readable and lets us assert connectivity on load.
// ---------------------------------------------------------------------------

export const TILE = 16;
export const MAP_W = 64;
export const MAP_H = 44;

export const WALL = 0;
export const FLOOR = 1;

export const ROOMS = [
  { id: 'airlock', name: 'AIRLOCK',    x: 3,  y: 3,  w: 10, h: 7 },
  { id: 'control', name: 'CONTROL',    x: 20, y: 2,  w: 14, h: 9 },
  { id: 'lab',     name: 'WET LAB',    x: 42, y: 3,  w: 16, h: 8 },
  { id: 'pump',    name: 'PUMP ROOM',  x: 4,  y: 16, w: 12, h: 9 },
  { id: 'atrium',  name: 'ATRIUM',     x: 24, y: 15, w: 16, h: 12 },
  { id: 'storage', name: 'STORAGE',    x: 46, y: 15, w: 13, h: 9 },
  { id: 'reactor', name: 'REACTOR',    x: 5,  y: 30, w: 14, h: 10 },
  { id: 'mess',    name: 'MESS HALL',  x: 25, y: 32, w: 13, h: 8 },
  { id: 'bay',     name: 'ESCAPE BAY', x: 44, y: 29, w: 15, h: 11 },
];

// Two tiles wide so there is room to dodge past the octopus in a corridor.
const CORRIDORS = [
  { x: 13, y: 6,  w: 7, h: 2 },   // airlock  -> control
  { x: 34, y: 6,  w: 8, h: 2 },   // control  -> lab
  { x: 7,  y: 10, w: 2, h: 6 },   // airlock  -> pump
  { x: 28, y: 11, w: 2, h: 4 },   // control  -> atrium
  { x: 51, y: 11, w: 2, h: 4 },   // lab      -> storage
  { x: 16, y: 20, w: 8, h: 2 },   // pump     -> atrium
  { x: 40, y: 20, w: 6, h: 2 },   // atrium   -> storage
  { x: 9,  y: 25, w: 2, h: 5 },   // pump     -> reactor
  { x: 30, y: 27, w: 2, h: 5 },   // atrium   -> mess
  { x: 19, y: 35, w: 6, h: 2 },   // reactor  -> mess
  { x: 38, y: 35, w: 6, h: 2 },   // mess     -> bay
  { x: 50, y: 24, w: 2, h: 5 },   // storage  -> bay
];

// Cover: pillars, crates, consoles. Placed so no route is ever cut off.
const BLOCKS = [
  [27, 18, 2, 2], [35, 18, 2, 2], [27, 22, 2, 2], [35, 22, 2, 2],   // atrium
  [48, 17, 2, 2], [54, 20, 2, 2],                                   // storage
  [9, 33, 2, 2],  [14, 36, 2, 2],                                   // reactor
  [23, 4, 2, 1],  [29, 8, 2, 1],                                    // control
  [45, 4, 2, 1],  [52, 9, 2, 1],                                    // lab
  [12, 18, 2, 2],                                                   // pump
  [28, 35, 2, 1], [32, 37, 2, 1],                                   // mess
  [47, 32, 2, 2],                                                   // bay
];

export const SPAWN = { x: 7, y: 6 };
export const OCTO_SPAWN = { x: 52, y: 19 };
export const EXIT = { x: 57, y: 20 };

// One keycard per far corner of the facility, so all three must be hunted down.
export const KEY_SPOTS = [
  { x: 11, y: 35, room: 'REACTOR' },
  { x: 50, y: 6,  room: 'WET LAB' },
  { x: 9,  y: 20, room: 'PUMP ROOM' },
];

export const TERMINAL_SPOTS = [
  { x: 31, y: 4 }, { x: 26, y: 17 }, { x: 37, y: 25 }, { x: 56, y: 21 },
  { x: 6, y: 32 }, { x: 35, y: 37 }, { x: 45, y: 8 },  { x: 5, y: 17 },
];

export function buildMap() {
  const tiles = new Uint8Array(MAP_W * MAP_H).fill(WALL);
  const carve = (x, y, w, h) => {
    for (let ty = y; ty < y + h; ty++) {
      for (let tx = x; tx < x + w; tx++) {
        if (tx > 0 && ty > 0 && tx < MAP_W - 1 && ty < MAP_H - 1) {
          tiles[ty * MAP_W + tx] = FLOOR;
        }
      }
    }
  };

  for (const r of ROOMS) carve(r.x, r.y, r.w, r.h);
  for (const c of CORRIDORS) carve(c.x, c.y, c.w, c.h);
  for (const [x, y, w, h] of BLOCKS) {
    for (let ty = y; ty < y + h; ty++) {
      for (let tx = x; tx < x + w; tx++) tiles[ty * MAP_W + tx] = WALL;
    }
  }
  return tiles;
}

export function isSolid(tiles, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
  return tiles[ty * MAP_W + tx] === WALL;
}

export function roomAt(tx, ty) {
  for (const r of ROOMS) {
    if (tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h) return r;
  }
  return null;
}

// --- pathfinding -----------------------------------------------------------

// Breadth-first flood from a tile. The octopus walks downhill on this field,
// which gives real pursuit through corridors instead of bumping into walls.
export function flowField(tiles, sx, sy, out) {
  const dist = out || new Int32Array(MAP_W * MAP_H);
  dist.fill(-1);
  if (isSolid(tiles, sx, sy)) return dist;

  const queue = new Int32Array(MAP_W * MAP_H);
  let head = 0;
  let tail = 0;
  const start = sy * MAP_W + sx;
  dist[start] = 0;
  queue[tail++] = start;

  while (head < tail) {
    const cur = queue[head++];
    const cx = cur % MAP_W;
    const cy = (cur / MAP_W) | 0;
    const d = dist[cur] + 1;
    for (let i = 0; i < 4; i++) {
      const nx = cx + (i === 0 ? 1 : i === 1 ? -1 : 0);
      const ny = cy + (i === 2 ? 1 : i === 3 ? -1 : 0);
      if (isSolid(tiles, nx, ny)) continue;
      const ni = ny * MAP_W + nx;
      if (dist[ni] !== -1) continue;
      dist[ni] = d;
      queue[tail++] = ni;
    }
  }
  return dist;
}

// Every walkable tile reachable from spawn? Guards against a bad edit to the
// layout tables above silently stranding a keycard.
export function validate(tiles) {
  const dist = flowField(tiles, SPAWN.x, SPAWN.y);
  const problems = [];
  const check = (p, label) => {
    if (dist[p.y * MAP_W + p.x] < 0) problems.push(`${label} @${p.x},${p.y}`);
  };
  check(OCTO_SPAWN, 'octopus spawn');
  check(EXIT, 'exit');
  KEY_SPOTS.forEach((k, i) => check(k, `keycard ${i + 1}`));
  TERMINAL_SPOTS.forEach((t, i) => check(t, `terminal ${i + 1}`));
  let orphans = 0;
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === FLOOR && dist[i] < 0) orphans++;
  }
  return { problems, orphans };
}

// Bresenham-ish walk: can the octopus see straight through to this point?
export function lineOfSight(tiles, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (TILE * 0.4));
  if (steps <= 0) return true;
  for (let i = 1; i < steps; i++) {
    const x = x0 + (dx * i) / steps;
    const y = y0 + (dy * i) / steps;
    if (isSolid(tiles, Math.floor(x / TILE), Math.floor(y / TILE))) return false;
  }
  return true;
}
