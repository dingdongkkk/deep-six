import { PAL } from './palette.js';

// ---------------------------------------------------------------------------
// Pixel-art helpers. Every sprite is authored as rows of chars and baked once
// into an offscreen canvas, so the hot loop only ever does drawImage().
// ---------------------------------------------------------------------------

function bake(rows, overrides = {}) {
  const h = rows.length;
  const w = rows[0].length;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      const key = overrides[ch] !== undefined ? overrides[ch] : ch;
      const col = PAL[key];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  }
  return cv;
}

function mirror(src) {
  const cv = document.createElement('canvas');
  cv.width = src.width;
  cv.height = src.height;
  const g = cv.getContext('2d');
  g.translate(src.width, 0);
  g.scale(-1, 1);
  g.drawImage(src, 0, 0);
  return cv;
}

// ---------------------------------------------------------------------------
// Diver (the player). 12x12, three facings, two walk frames each.
// ---------------------------------------------------------------------------

const DIVER_DOWN = [
  [
    '....wwww....',
    '..wwssssww..',
    '..wsccccsw..',
    '..wsccccsw..',
    '..wwssssww..',
    '...mggggm...',
    '..mggyyggm..',
    '..mggyyggm..',
    '..msggggsm..',
    '...ss..ss...',
    '...ss..ss...',
    '..www..www..',
  ],
  [
    '....wwww....',
    '..wwssssww..',
    '..wsccccsw..',
    '..wsccccsw..',
    '..wwssssww..',
    '...mggggm...',
    '..mggyyggm..',
    '..mggyyggm..',
    '..msggggsm..',
    '...ss..ss...',
    '..ss....ss..',
    '.www....www.',
  ],
];

const DIVER_UP = [
  [
    '....wwww....',
    '..wwssssww..',
    '..wssssssw..',
    '..wssssssw..',
    '..wwssssww..',
    '...mggggm...',
    '..mgccccgm..',
    '..mgccccgm..',
    '..msggggsm..',
    '...ss..ss...',
    '...ss..ss...',
    '..www..www..',
  ],
  [
    '....wwww....',
    '..wwssssww..',
    '..wssssssw..',
    '..wssssssw..',
    '..wwssssww..',
    '...mggggm...',
    '..mgccccgm..',
    '..mgccccgm..',
    '..msggggsm..',
    '...ss..ss...',
    '..ss....ss..',
    '.www....www.',
  ],
];

const DIVER_SIDE = [
  [
    '...wwww.....',
    '..wwsssww...',
    '..wsscccw...',
    '..wsscccw...',
    '..wwsssww...',
    '...mgggm....',
    '..mggggym...',
    '..mggggym...',
    '..msgggsm...',
    '...ssss.....',
    '...ss.ss....',
    '..www.www...',
  ],
  [
    '...wwww.....',
    '..wwsssww...',
    '..wsscccw...',
    '..wsscccw...',
    '..wwsssww...',
    '...mgggm....',
    '..mggggym...',
    '..mggggym...',
    '..msgggsm...',
    '...ssss.....',
    '..ss..ss....',
    '.www..www...',
  ],
];

// ---------------------------------------------------------------------------
// Octopus. 16x16, three tentacle frames; body colour is swapped at bake time
// so the creature strobes through a palette while it hunts.
// ---------------------------------------------------------------------------

const OCTO_BODY = [
  '.....XXXXXX.....',
  '...XXXXXXXXXX...',
  '..XXXXXXXXXXXX..',
  '..XXXXXXXXXXXX..',
  '.XXXXXXXXXXXXXX.',
  '.XXeeXXXXXXeeXX.',
  '.XXeeXXXXXXeeXX.',
  '.XXXXXXXXXXXXXX.',
  '.XXXXXXXXXXXXXX.',
  '..XXXXXXXXXXXX..',
  '..XXXXXXXXXXXX..',
];

const OCTO_TENTACLES = [
  [
    '.XX.XX.XX.XX.XX.',
    '.XX.XX.XX.XX.XX.',
    'XX..XX..XX..XX..',
    'X....XX..XX....X',
    'XX...X....X...XX',
  ],
  [
    '.XX.XX.XX.XX.XX.',
    'XX..XX..XX..XX..',
    'X...XX....XX...X',
    'XX..X......X..XX',
    '.XX.........XX..',
  ],
  [
    '.XX.XX.XX.XX.XX.',
    '.XX..XX.XX..XX..',
    '..XX..XX.XX..XX.',
    '...XX..XXXX..XX.',
    '....XX......XX..',
  ],
];

// ---------------------------------------------------------------------------
// Props.
// ---------------------------------------------------------------------------

const KEYCARD = [
  '..........',
  '.CCCCCCCC.',
  '.CkkkkkkC.',
  '.CkCCCCkC.',
  '.CkCkkCkC.',
  '.CkCCCCkC.',
  '.CkkkkkkC.',
  '.CCCCCCCC.',
  '..CC..CC..',
  '..........',
];

const TERMINAL = [
  '............',
  '.wwwwwwwwww.',
  '.wkkkkkkkkw.',
  '.wkggggggkw.',
  '.wkgkkkkgkw.',
  '.wkggggggkw.',
  '.wkggkkggkw.',
  '.wkkkkkkkkw.',
  '.wwwwwwwwww.',
  '...wwwwww...',
  '..wwwwwwww..',
  '............',
];

const CONSOLE = [
  '................',
  '.wwwwwwwwwwwwww.',
  '.wkkkkkkkkkkkkw.',
  '.wkCCCCCCCCCCkw.',
  '.wkCkkkkkkkkCkw.',
  '.wkCkCCCCCCkCkw.',
  '.wkCkCkkkkCkCkw.',
  '.wkCkCCCCCCkCkw.',
  '.wkCkkkkkkkkCkw.',
  '.wkCCCCCCCCCCkw.',
  '.wkkkkkkkkkkkkw.',
  '.wwwwwwwwwwwwww.',
  '..w..........w..',
  '..wwwwwwwwwwww..',
  '...w........w...',
  '................',
];

const DOOR = [
  'wwwwwwwwwwwwwwww',
  'wkkkkkkkkkkkkkkw',
  'wkCCCCCCCCCCCCkw',
  'wkCkkkkkkkkkkCkw',
  'wkCkCCCCCCCCkCkw',
  'wkCkCkkkkkkCkCkw',
  'wkCkCkCCCCkCkCkw',
  'wkCkCkCkkCkCkCkw',
  'wkCkCkCkkCkCkCkw',
  'wkCkCkCCCCkCkCkw',
  'wkCkCkkkkkkCkCkw',
  'wkCkCCCCCCCCkCkw',
  'wkCkkkkkkkkkkCkw',
  'wkCCCCCCCCCCCCkw',
  'wkkkkkkkkkkkkkkw',
  'wwwwwwwwwwwwwwww',
];

// ---------------------------------------------------------------------------
// Baked sprite tables, built once at module load.
// ---------------------------------------------------------------------------

export const SPR = {};

export function buildSprites() {
  SPR.diver = {
    down: DIVER_DOWN.map((f) => bake(f)),
    up: DIVER_UP.map((f) => bake(f)),
    right: DIVER_SIDE.map((f) => bake(f)),
    left: DIVER_SIDE.map((f) => mirror(bake(f))),
  };

  // One baked sprite per (tentacle frame x body colour).
  SPR.octo = {};
  for (const col of ['u', 'p', 'r', 'o', 'w']) {
    SPR.octo[col] = OCTO_TENTACLES.map((tent) =>
      bake(OCTO_BODY.concat(tent), { X: col, e: 'y' })
    );
  }

  SPR.key = {};
  for (const col of ['r', 'y', 'c']) SPR.key[col] = bake(KEYCARD, { C: col });

  SPR.console = {};
  for (const col of ['r', 'y', 'c']) SPR.console[col] = bake(CONSOLE, { C: col });
  SPR.consoleDone = bake(CONSOLE, { C: 'd', w: 'd' });

  SPR.terminal = bake(TERMINAL);
  SPR.terminalUsed = bake(TERMINAL, { g: 'd' });

  SPR.doorLocked = bake(DOOR, { C: 'r' });
  SPR.doorOpen = bake(DOOR, { C: 'g' });

  SPR.tiles = buildTiles();
  return SPR;
}

// ---------------------------------------------------------------------------
// Tiles are drawn procedurally: chunky blocks on solid black, CRT-green edges.
// ---------------------------------------------------------------------------

function tileCanvas(draw) {
  const cv = document.createElement('canvas');
  cv.width = 16;
  cv.height = 16;
  draw(cv.getContext('2d'));
  return cv;
}

function buildTiles() {
  const floor = [];
  for (let v = 0; v < 3; v++) {
    floor.push(
      tileCanvas((g) => {
        g.fillStyle = '#000000';
        g.fillRect(0, 0, 16, 16);
        g.fillStyle = '#001c0a';
        g.fillRect(0, 0, 16, 1);
        g.fillRect(0, 0, 1, 16);
        if (v === 1) {
          g.fillStyle = '#00380f';
          g.fillRect(6, 6, 2, 2);
          g.fillRect(11, 12, 1, 1);
        } else if (v === 2) {
          g.fillStyle = '#00380f';
          g.fillRect(3, 10, 1, 1);
          g.fillRect(12, 4, 2, 1);
        }
      })
    );
  }

  const wall = tileCanvas((g) => {
    g.fillStyle = '#000000';
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#0a3d20';
    g.fillRect(1, 1, 14, 14);
    g.fillStyle = '#12703a';
    g.fillRect(1, 1, 14, 2);
    g.fillRect(1, 1, 2, 14);
    g.fillStyle = '#00ff41';
    g.fillRect(2, 2, 2, 2);
    g.fillRect(12, 12, 2, 2);
    g.fillStyle = '#003d1a';
    g.fillRect(4, 7, 8, 1);
    g.fillRect(7, 4, 1, 8);
  });

  return { floor, wall };
}

export { bake, mirror };
