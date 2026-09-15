# Console Puzzle Solutions — DEEP SIX

Nine puzzle types exist. Three are drawn at random per session. Difficulty is
tied to the **card, not visit order**: ALPHA gets the easiest variant, GAMMA
(Pump Room) always the hardest.

---

## Before anything else

**A wrong answer is a noise ping** — a 2.2s hunt aimed at you. Never guess.

**Five of the nine confirm you're right before you commit.** On these, guessing
is never necessary — read the status line and press Enter only when it flips:

| Puzzle | Wait for |
| --- | --- |
| Flow Valves | `FLOW ESTABLISHED` + pipes turn cyan |
| Sonar Tune | `PHASE LOCKED` |
| Binary Bus | `BUS nnn` turns green |
| Cipher Dial | `DECODE` reads as a real word |
| Pressure Balance | Solves itself — there is no Enter |

The other four commit blind: **Sequence, Memory, Keypad, Timing.**

`Esc` leaves a console with **progress preserved** — the same puzzle is waiting
when you come back. The `SPECIMEN` readout on the panel shows the octopus's
state and distance; red `HUNTING` with a falling number means leave now.

---

## 1. Sequence Lock — 3-5 steps

Pads flash in order (0.62s each) under the header `OBSERVE`. When it changes to
`ENTER n/len`, replay with keys `1`-`4`.

**Solving it:** say the numbers aloud as they flash. One wrong press replays the
entire sequence *and* pings. The header counts your progress, so you always know
how many remain.

## 2. Cipher Dial

`INTERCEPT` is the ciphertext. `DECODE` updates live as Left/Right rotate the
rotor. Press `Enter` when `DECODE` is a word.

**The whole vocabulary** — it is always one of these:

```
OCTOPUS   AIRLOCK   PRESSURE   SPECIMEN   KEYCARD
REACTOR   TENTACLE  BULKHEAD   SALTWATER
```

You start 3-8 clicks from the answer, so hold one direction and read. Zero risk:
you can see the plaintext before committing.

## 3. Flow Valves

4x3 pipe grid. Arrows move, `Space` rotates 90 degrees, `Enter` locks. Connect
`IN` (left edge) to `OUT` (right edge).

**Solving it:** about a third of the cells start already correct, and decoy
pieces sit off the true path — **any** working route counts, not just the
intended one. Watch the status text rather than tracing pipes by eye.

## 4. Sonar Tune

Purple wave is the target, green is yours.

**The trick: FREQ is literally the number of complete cycles across the plot.**
Count the peaks on the purple wave, set FREQ to match with Left/Right (target is
always 2-6). Then Up/Down for GAIN, which is just height (target 2-5). You start
within 2 of both. Enter on `PHASE LOCKED`.

## 5. Binary Bus

4-6 switches, each labelled with its place value underneath. Left/Right select,
`Space` flips, `Enter` sends.

**Greedy from the left:** take the largest place value that doesn't exceed the
remainder, subtract, repeat.

```
Target 23, switches 16 8 4 2 1
  16 <= 23  -> ON,  remainder 7
   8 >  7   -> off
   4 <= 7   -> ON,  remainder 3
   2 <= 3   -> ON,  remainder 1
   1 <= 1   -> ON,  remainder 0
Answer: 1 0 1 1 1
```

The live `BUS` readout turns green when it matches, so verify before Enter.

## 6. Memory Core

4-6 cells flash cyan on a 4x4 grid for **3.0 seconds** with a countdown, then
hide. Arrows move, `Space` marks, `Enter` commits.

**Solving it:** read shapes and rows, not sixteen individual squares — "top row
both ends, middle one left". The header shows `MARK n/count`, so you always know
how many you still owe. Count and cells must match exactly.

## 7. Pressure Balance — the only one with real maths

Three valves, three gauges. Each gauge is a **sum of two valves**:

```
Gauge1 = V1 + V2      Gauge2 = V2 + V3      Gauge3 = V3 + V1
```

The `n/m` under each bar is current/target; the yellow line is the target.

**Direct solution** from the three targets T1, T2, T3:

```
V1 = ( T1 - T2 + T3) / 2
V2 = ( T1 + T2 - T3) / 2
V3 = (-T1 + T2 + T3) / 2
```

Worked example — targets 7, 5, 6:

```
V1 = ( 7 - 5 + 6) / 2 = 4
V2 = ( 7 + 5 - 6) / 2 = 3
V3 = (-7 + 5 + 6) / 2 = 2
Check: 4+3=7, 3+2=5, 2+4=6
```

**Without algebra:** fix Gauge 1 with V1, notice Gauge 3 moved, correct with V3,
repeat. It converges in a few passes. It solves the instant all three match.

## 8. Keypad Logic

Mastermind. **3 digits**, range 1-5/6/7 (the header says which), **6 tries**.
Left/Right pick position, Up/Down cycle the digit, `Enter` guesses.

- `EXACT` = right digit **and** right position
- `NEAR`  = right digit, wrong position
- Digits **can repeat**

**Opening:** guess `1 1 1`, then `2 2 2`, then `3 3 3`. Each tells you how many
of that digit the code contains, with no positional noise. Once the multiset is
known, you are only permuting — and with 3 slots that is at most a few tries.

Running out of tries wipes the on-screen log **but keeps the same secret code**,
so anything you wrote down still applies.

## 9. Reactor Timing

Hit `Space` while the sweeping marker is inside the green zone. **3 hits.** Each
hit speeds the sweep up and both shrinks and moves the zone. A miss resets you
to zero and pings.

**Press slightly early** — aim for the leading edge of the zone, not its centre.
The marker moves fast enough that reaction lag puts a centre-aimed press late.

---

## Built-in solver (debug)

Every puzzle exposes `solutionKeys()`, which is how the test harness verifies
them. It works at runtime too. Open a console in-game, then in the browser
devtools console:

```js
// Auto-solve whichever console is currently open.
(() => {
  const g = window.__game;
  if (g.state !== 'puzzle') return 'no console open';
  const keys = g.puzzle.solutionKeys();
  if (keys) { keys.forEach(k => g.onKeyDown(k)); return 'solved'; }
  // Timing puzzle has no static answer - press inside the window instead.
  const id = setInterval(() => {
    if (!g.puzzle) return clearInterval(id);
    if (g.puzzle.inZone()) g.onKeyDown('Space');
  }, 8);
  return 'timing puzzle: auto-pressing';
})();
```

Peek at the answer without solving it:

```js
window.__game.puzzle.solutionKeys();   // the exact key sequence
window.__game.cards.map(c => c.puzzle.name);   // which three rolled this session
```
