# AGENTS.md — DEEP SIX

Handoff notes for an agent picking this repo up cold. Player-facing docs and the
balance write-up live in [README.md](README.md); this file is about the code.

---

## 1. What this is

A browser game: **8-bit top-down underwater escape**. You explore a flooded
research facility, solve three security-console puzzles to collect three
keycards, and reach the exit before a hunting octopus catches you.

It is a **game-jam submission for Team #22**, built to two externally fixed
specs. Treat both as hard constraints — they are what the entry is scored on,
and they are not open to redesign:

**Shared base challenge** (identical for every team, so judging is comparable):
trapped in a mysterious underwater facility; a giant octopus hunts the player;
2D top-down exploration; collect keycards / activate switches; unlock the exit
and escape. WASD controls specified. The keycard count of three was the
project owner's choice.

**Team #22's assigned theme, RETRO:** 8-bit pixel art, solid black backgrounds,
bright green CRT terminal text, chiptune SFX, scanlines; the octopus rendered as
a multi-sprite with flashing palette-swap frames; grid-based or smooth 8-way
movement, crisp pixel collisions, retro score tally.

Practical consequence: **do not** introduce photographic assets, a non-CRT
colour scheme, a 3D or side-on view, or remove the score tally. The theme card
requires the theme to "visibly shape your level".

## 2. Stack and constraints

- **Vanilla JS, ES modules, zero dependencies, no build step.**
- Canvas 2D. Internal resolution **320x240**, integer-scaled to the window with
  `image-rendering: pixelated`.
- No asset files at all. Every sprite is authored as char rows in
  `src/sprites.js`; every sound is synthesised in `src/audio.js`; the font is a
  5x7 bitmap in `src/font.js`.
- ES modules mean **`file://` will not work** — it needs a static server.
  `.claude/launch.json` defines a `deep-six` config (`python3 -m http.server 8321`).

## 3. File map

| File | Responsibility |
| --- | --- |
| `index.html` | Standalone page (local + static hosting). Full HTML document. |
| `artifact.html` | Claude Artifact wrapper. **Fragment only** — see §8. |
| `style.css` | CRT chrome: scanlines, vignette, flicker. Used by `index.html` only; `artifact.html` inlines its own copy. |
| `src/main.js` | Entry point. Canvas setup, integer-scale fit, input wiring, rAF loop. |
| `src/game.js` | `TUNING` constants + the `Game` class: simulation, state machine, octopus AI, pickups, scoring. No drawing. |
| `src/renderer.js` | All drawing: camera, tiles, sprites, lighting, HUD, minimap, puzzle panel, boot/title/dead/win screens. No simulation. |
| `src/map.js` | Facility layout tables, tile queries, BFS flow field, line-of-sight, `validate()`. |
| `src/puzzles.js` | The nine console puzzles + `rollPuzzles()`. |
| `src/sprites.js` | Pixel art as char rows, baked once into offscreen canvases. |
| `src/font.js` | 5x7 bitmap font, cached per colour. |
| `src/audio.js` | WebAudio SFX + adaptive chiptune sequencer. |
| `tools/playtest.js` | Headless balance harness. **Not shipped** — excluded from the artifact `files` map. |

`game.js` and `renderer.js` are strictly separated: `renderer.js` imports from
`game.js`, never the reverse. Keep it that way — the harness runs `Game` with no
rendering at all, which is what makes 300-trial batches take ~6 seconds.

## 4. Coordinate system

- Tiles are **16px**. Map is **64x44 tiles** = 1024x704px. Viewport 320x240.
- Entity `x`/`y` are **pixel centres**, not tile indices. Convert with
  `Math.floor(px / TILE)`.
- Collision is axis-separated AABB (`Game.moveEntity`), which gives free wall
  sliding. Player half-extent 4.5, octopus 5.
- Camera clamps to map bounds and is rounded to integers so pixels stay crisp.

## 5. Game state machine

`game.state` is one of:

```
boot -> title -> briefingMission -> briefingFlood -> briefingControls -> play <-> puzzle
                  |
                  +-> dead | win  --(R)--> play
```

- **`play` and `puzzle` both simulate the world.** The octopus keeps hunting
  while a console is open — that is deliberate, not a bug. `die()` can fire
  during `puzzle` and clears `puzzle`/`activeCard`.
- `go(state)` records `lastTransition`. `onKeyDown` requires
  `time - lastTransition > 0.3` before a screen-advancing key counts; without it
  a single click (which fires both `pointerdown` and `keydown`) blows through
  two screens at once.
- In `puzzle`, all input routes to `puzzle.onKey()`. `Esc`/`Q` calls
  `closeConsole()`, which **preserves the puzzle instance** on the card, so
  fleeing mid-solve and returning keeps progress.
- `consoleLock` prevents a console re-triggering while you stand on it; it
  clears once you move >26px away.

## 6. Key contracts

### Puzzle interface (`src/puzzles.js`)

Every builder returns an object with this exact shape:

```js
{
  name: 'FLOW VALVES',          // shown top-right of the panel
  hint: 'MOVE  SPACE TURN  ENTER LOCK',
  update(dt) {},                 // may be a no-op
  draw(g, x, y, w, h) {},        // body area only; panel chrome is the renderer's job
  onKey(code) {},                // -> 'solve' | 'fail' | null
  solutionKeys() {},             // -> array of key codes that solve it, or null
  inZone() {},                   // timing puzzle only, when solutionKeys() is null
}
```

- **`hint` must stay under ~32 characters.** The footer is 44 chars wide and
  `ESC ABORT` claims 11 on the right. Longer hints overlap it.
- `draw` is handed a 268x150 body box. Do not draw outside it.
- **`solutionKeys()` is the test contract.** It is what the harness and the
  puzzle self-test drive. If you add a puzzle, it must implement this or it
  cannot be verified. It doubles as a debug cheat.
- `'fail'` triggers a noise ping (2.2s hunt). Do not return it for
  navigation keys — only for genuine wrong answers.

`rollPuzzles(3)` shuffles all nine and returns three, calling
`BUILDERS[idx](slot)` where `slot` is 0/1/2 and acts as the difficulty
parameter. Slot maps to card index, so **GAMMA always gets the hardest
variant**, regardless of visit order.

### Map authoring (`src/map.js`)

`ROOMS`, `CORRIDORS` and `BLOCKS` are plain rectangle tables carved out of solid
wall. Corridors are 2 tiles wide so there is room to dodge past the octopus.

**`validate()` runs on every `Game` construction** and console-warns if any
keycard, terminal, the exit, or the octopus spawn is unreachable from spawn, or
if any floor tile is orphaned. Edit the tables freely, then check the console —
it will name what you stranded. Current layout: `problems: [], orphans: 0`.

### Balance constants (`TUNING` in `src/game.js`)

One exported mutable object. The harness re-exports it
(`export { TUNING } from '../src/game.js'`) so sweeps mutate the same instance.
Read §9 before changing values — several are counter-intuitive.

## 7. Octopus AI

Three modes, in `Game.updateOcto`:

- **`patrol`** — wanders to a random tile in a random room.
- **`search`** — heads to the last known player tile, then reverts to patrol.
- **`hunt`** — pursues. Entered when the player is *heard* or *seen*, or when a
  console broadcast reveals them.

Detection is **sound and sight**, and sound is the dominant sense:

| Player state | Heard from |
| --- | --- |
| Still | `HEAR_IDLE` 46px |
| Walking | `HEAR_WALK` 88px |
| Sprinting | `HEAR_SPRINT` 232px |

Sight is `SIGHT_RANGE` 200px and is blocked by walls (`lineOfSight`). Sound is
not blocked by walls.

Pursuit uses a **BFS flow field** (`flowField`) recomputed toward the target
roughly 5x/second, so it navigates corridors rather than pressing into walls.
With clear line of sight it steers straight at the player instead.

`rearT` is a telegraph: on a reveal the octopus rears up (flashing white,
bobbing) at 12% speed before charging. A charge with no tell is a gotcha; the
tell is what makes the broadcast survivable.

## 8. Publishing to Claude Artifacts

`artifact.html` is the wrapper. Three rules:

1. **It is a fragment, not a document.** No `<!doctype>`, `<html>`, `<head>` or
   `<body>` — those are added at publish time. It starts with `<title>` and
   `<style>`.
2. **Every `src/*.js` must be listed in the `files` map**, or the module graph
   breaks silently and the page renders black. There are currently nine.
   `tools/playtest.js` is deliberately excluded.
3. **Republish to the same URL** by passing the same `file_path` in this
   conversation, or `url` from any other. Publishing without `url` from a fresh
   conversation creates a *separate* artifact.

Live artifact: <https://claude.ai/code/artifact/438a2398-c04c-415d-b89a-7a4c57886143>

## 9. Testing

Everything runs in the browser console against a served copy. There is no node
test runner — the code needs `document` for sprite baking.

```js
// Balance: drives the real Game class with a bot modelling a competent player.
const T = await import('/tools/playtest.js');
T.runTrials(300);                       // headline numbers + death profile
T.runTrials(200, { thinkScale: 0.6 });  // a sharper player
T.byPuzzleLoad(320);                    // win rate by which puzzles were rolled

// Sweep a dial. TUNING is re-exported from the harness on purpose.
const BASE = {...T.TUNING};
T.TUNING.OCTO_HUNT_SPEED = 86;
T.runTrials(180);
Object.assign(T.TUNING, BASE);
```

To verify all nine puzzles still solve, roll until every type has been seen,
run each ~340 frames to clear intro phases, then feed it `solutionKeys()`.
The timing puzzle returns `null` — drive it with `inZone()` instead.

**Current measured state** (~320 trials, average-player bot):

| | |
| --- | --- |
| Win rate | 36% |
| Skill gradient | fast solver 58% / average 36% / slow solver 27% |
| Deaths peak at | 2 keycards |

`OCTO_HUNT_SPEED` dominates everything. After the flood and slower movement
pass it sits at **72**, just below `PLAYER_WALK` (74); the current measured win
rate is 36.9% across 640 trials.

## 10. Traps — read before editing

Things that cost real debugging time here.

- **Hunt speed must stay near walk speed.** When `OCTO_HUNT_SPEED` exceeds
  `PLAYER_WALK` by much, and `HEAR_WALK` exceeds the gap a sprint can open, the
  chase becomes mathematically unescapable. That combination produced a **0% win
  rate** and is invisible from playing a few rounds. Re-run the harness after
  touching any speed or hearing constant.
- **Sprint needs hysteresis.** `SPRINT_MIN` (25) is the reserve required to
  *start* a sprint; you may ride one to empty. Remove it and the bar chatters at
  zero, producing a useless stutter instead of a burst.
- **Stamina regen is nearly balance-neutral** (11/16/20 -> 45/44/42% win). Don't
  "fix" difficulty with it; it won't move.
- **A longer broadcast hunt is kinder, not harsher.** When a hunt lapses the
  octopus reverts to *random* patrol and can wander into the player, which reads
  as unfair. A committed chase is more survivable.
- **Module instance identity.** `import('/src/game.js?v=1')` and
  `import('../src/game.js')` are **two different module objects** with separate
  `TUNING`. Mutating one will not affect the other, and a sweep that does this
  silently measures nothing. Always go through `T.TUNING`.
- **HUD z-order.** The minimap is drawn after the message line. Messages sit at
  `VIEW_H - 76` to clear it and the sonar label; move them lower and long messages get clipped.
- **Sprites bake at module load** and need `document`. Anything importing
  `sprites.js` needs a DOM.
- **`sfx.*` no-ops safely before `initAudio()`**, so the headless harness can run
  the real `Game` without audio.
- Don't add a build step, a framework, or a dependency. The whole value of this
  layout is that the directory is directly deployable to any static host.
