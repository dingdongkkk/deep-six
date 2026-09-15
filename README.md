# DEEP SIX — Facility K-22

**▶ Play it: <https://game-chi-ten-84.vercel.app>**

An 8-bit top-down escape game. You are trapped in a flooded research facility
with Specimen 22. Find three keycards, unseal the exit, and get out before it
finds you.

Built for the Team #22 **RETRO** brief: 8-bit pixel art, solid black
backgrounds, bright green CRT terminal text, chiptune SFX.

## Controls

| Key | Action |
| --- | --- |
| `WASD` / arrows | Swim (smooth 8-way) |
| `Shift` | Sprint — faster, but roughly **2x** your noise radius |
| `Space` | Thruster dash — **one charge per dive** |
| `M` | Mute |
| `R` | Retry from the death or escape screen |

At a console: arrows / `Space` / `Enter` drive the puzzle, `Esc` backs out.

### The dash

A 0.18s burst at 430px/s (~77px) that carries **invulnerability frames for its
whole duration** — you can punch straight through the octopus with it. You get
exactly one per attempt and it only comes back on retry, so it is a panic
button, not a movement tool.

### Stamina

Sprint drains 32/s and regenerates 11/s after a 1.1s delay, so a full bar is
~3.1s of sprint and ~10s to refill. You cannot sprint your way around the
facility; you spend it to break one chase and then you are walking.

You also need **25 stamina banked to start** a sprint, though you may ride one
down to empty — the tick on the PWR bar marks that threshold. Without it the bar
just chatters at zero and sprint does nothing.

## Run locally

Any static file server works; the game uses ES modules, so `file://` will not.

```bash
python3 -m http.server 8321
```

Then open http://localhost:8321.

## Keycard consoles

Each keycard sits behind a security console running one of **nine** puzzle
types. Three distinct types are drawn at random per session and assigned to the
consoles in difficulty order, so the last console you visit is the nastiest.

| # | Puzzle | Input |
| --- | --- | --- |
| 1 | **Sequence Lock** — Simon-says pattern, 4-6 long | `1`-`4` |
| 2 | **Cipher Dial** — rotate a Caesar wheel until the intercept reads | arrows, `Enter` |
| 3 | **Flow Valves** — rotate pipe segments to route inlet to outlet | arrows, `Space`, `Enter` |
| 4 | **Sonar Tune** — match a target waveform on frequency and gain | arrows, `Enter` |
| 5 | **Binary Bus** — set a switch bank to a decimal address | arrows, `Space`, `Enter` |
| 6 | **Memory Core** — reproduce a 4x4 pattern shown for 2.2s | arrows, `Space`, `Enter` |
| 7 | **Pressure Balance** — three coupled valves, three gauges | arrows |
| 8 | **Keypad Logic** — mastermind, 6 tries, exact/near feedback | arrows, `Enter` |
| 9 | **Reactor Timing** — stop a sweep in a shrinking window, 3x | `Space` |

**The world does not pause while a console is open.** The octopus keeps
patrolling, and the panel shows its state and distance so you can decide
whether to keep solving or run. `Esc` aborts and keeps your progress — the same
puzzle instance is still there when you come back.

Two things carry a cost:

- **Solving broadcasts your position.** The console dispenses the keycard and
  hands the octopus your exact tile with a 5-second hunt. Expect company.
- **A wrong entry is a noise ping** — a shorter 2.2s hunt. Guessing is
  expensive; Keypad Logic in particular punishes brute force.

Every puzzle exposes `solutionKeys()` (and `inZone()` for the timing one),
which is what the test harness drives them with — handy as a debug cheat too.

## Balance

Tuned against `tools/playtest.js`, a headless harness that drives the real
`Game` class with a bot modelling a competent player: it routes around the
octopus, sprints to break contact, freezes to drop to idle hearing, spends real
seconds "thinking" at consoles, and saves the dash for a dead end. Every number
below is from 200-320 trial batches.

**Where it landed** (~320 trials):

| Metric | Value |
| --- | --- |
| Win rate | **36%** |
| Average winning run | 81s |
| Average losing run | 64s |
| Keycards held at death | peaks at **2** — the run climaxes at the last console |

**Skill gradient** — solving puzzles faster is the single biggest lever:

| Solver speed | Win rate |
| --- | --- |
| Fast (0.6x think time) | **58%** |
| Average | 36% |
| Slow (1.7x think time) | 27% |

**What the numbers exposed.** Three real bugs came out of this, none of which
were visible by playing a few rounds:

1. **The chase had no exit.** Hunt speed (90) beat walk (80) while walking noise
   (112px) exceeded the gap sprint could open, so once the octopus came within
   earshot it could never be shaken. Win rate was **0%**.
2. **Sprint had no hysteresis.** With no minimum reserve to *start* a sprint, the
   bar chattered at zero and produced a useless stutter instead of a burst. Fixed
   with `SPRINT_MIN`.
3. **The broadcast had no tell.** The octopus charged the instant a console
   dispensed. It now rears up for ~1.15s first, which is the player's cue to run.

**Sensitivity.** `OCTO_HUNT_SPEED` dominates everything else:

| Hunt speed | 78 | 82 | 84 | 86 |
| --- | --- | --- | --- | --- |
| Win rate | 53% | **43%** | 31% | 19% |

It is set to **82** — just above walk (80), so a chase cannot simply be walked
off, with the collapse into an unwinnable footrace kept well away at ~86.

Two results were counter-intuitive and worth keeping in mind before retuning:

- **Stamina regen is nearly balance-neutral** (11/16/20 -> 45/44/42% win), so the
  slow setting costs nothing and is kept at 11.
- **A longer broadcast hunt is *kinder*.** When a hunt lapses the octopus reverts
  to random patrol and can wander into you, which reads as unfair; a committed
  chase is more survivable and feels better.

Using the dash correctly — saving it for a corner and punching *through* the
octopus on its i-frames — moved the win rate from 22% to 43% in testing. It is
the highest-leverage thing a player can learn.

Re-run any of this from the browser console:

```js
const T = await import('/tools/playtest.js');
T.runTrials(300);                        // headline numbers
T.runTrials(200, { thinkScale: 0.6 });   // a sharper player
T.byPuzzleLoad(320);                     // win rate by puzzle draw
T.TUNING.OCTO_HUNT_SPEED = 86;           // sweep a dial, then re-run
```

Balance constants live in one exported `TUNING` object at the top of
[`src/game.js`](src/game.js) so the harness can sweep them without editing source.

## Deploying

Live on Vercel at <https://game-chi-ten-84.vercel.app>, auto-deploying from
`main`. Push and it ships:

```bash
git push origin main
```

To deploy manually, or to a different host — the whole game is static files, no
build step and no dependencies:

```bash
vercel deploy --prod
```

`vercel.json` sets `Cache-Control: must-revalidate` on everything. Filenames are
not content-hashed, so without it a redeploy would serve stale ES modules to
anyone who had already loaded the game.

Note that Vercel's *deployment-specific* URLs (`game-<hash>-anubvkr.vercel.app`)
sit behind Deployment Protection and return a 302 to an SSO login. The public
link is the project alias above.

Any other static host works too:

```bash
npx vercel deploy --prod
```

```bash
npx netlify-cli deploy --prod --dir .
```

For itch.io, zip `index.html`, `style.css` and `src/` together and upload as an
HTML5 project with a 960x720 viewport.

## How it is put together

| File | Role |
| --- | --- |
| `src/map.js` | Facility layout. Rooms and corridors are carved from solid wall, then `validate()` BFS-checks that every keycard, terminal and the exit is reachable from spawn. |
| `src/game.js` | Simulation: movement, AABB collision with wall sliding, the octopus state machine, pickups, scoring. |
| `src/renderer.js` | Camera, tile and sprite blitting, the lamp/darkness pass, HUD and minimap. |
| `src/sprites.js` | Pixel art authored as char rows, baked once into offscreen canvases. |
| `src/font.js` | 5x7 bitmap font — `fillText` would render anti-aliased mush at 320x240. |
| `src/audio.js` | WebAudio chiptune. No audio assets; SFX and the adaptive sequencer are synthesised. |
| `src/puzzles.js` | The nine console puzzles. Each exposes `name`, `hint`, `update`, `draw`, `onKey` and `solutionKeys`. |
| `tools/playtest.js` | Headless balance harness. Not shipped with the game. |

Internal resolution is 320x240, integer-scaled to the window so pixels stay
square.

### The octopus

It runs a three-state machine — `patrol`, `search`, `hunt` — over a BFS flow
field recomputed toward its target roughly five times a second, so it pursues
through corridors instead of pressing into walls. With clear line of sight it
steers straight at you.

It finds you by **sound** as well as sight: standing still barely registers,
walking carries ~112px, sprinting ~232px. Hunt speed (90) sits above your walk
(80) and below your sprint (134), so escaping a chase costs stamina, and
stamina only refills once you stop running.

## Editing the level

`ROOMS`, `CORRIDORS` and `BLOCKS` in `src/map.js` are plain rectangle tables.
Change them freely — `validate()` runs on load and logs a console warning
naming anything it has stranded.
