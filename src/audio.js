// ---------------------------------------------------------------------------
// Chiptune SFX + adaptive music, synthesised with WebAudio. No asset files.
// ---------------------------------------------------------------------------

let ctx = null;
let master = null;
let musicGain = null;
let sfxGain = null;
let enabled = true;
let started = false;

// Sequencer state.
let step = 0;
let nextNoteTime = 0;
let tempo = 0.145;      // seconds per 16th
let intensity = 0;      // 0 = calm, 1 = octopus on you
let timer = null;

const NOTE = {};
(() => {
  const names = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];
  for (let oct = 1; oct <= 6; oct++) {
    for (let i = 0; i < 12; i++) {
      NOTE[names[i] + oct] = 440 * Math.pow(2, (oct - 4) + (i - 9) / 12);
    }
  }
})();

// Minor-key bass riff, one bar of 16 steps. null = rest.
const BASS = ['A1', null, 'A1', null, 'C2', null, 'A1', null,
              'G1', null, 'G1', null, 'F1', null, 'E1', null];
const ARP_CALM = ['A3', 'C4', 'E4', 'C4', 'A3', 'C4', 'E4', 'G4',
                  'F3', 'A3', 'C4', 'A3', 'E3', 'G3', 'B3', 'G3'];
const ARP_HUNT = ['A4', 'E4', 'A4', 'C5', 'A4', 'E4', 'A4', 'C5',
                  'G4', 'D4', 'G4', 'B4', 'F4', 'C4', 'E4', 'A4'];

export function initAudio() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { enabled = false; return; }
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  musicGain = ctx.createGain();
  musicGain.gain.value = 0.0;
  musicGain.connect(master);
  sfxGain = ctx.createGain();
  sfxGain.gain.value = 0.85;
  sfxGain.connect(master);
}

// Browsers only allow audio after a gesture, so the first keypress calls this.
export function unlockAudio() {
  initAudio();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  started = true;
}

export function setEnabled(on) {
  enabled = on;
  if (master) master.gain.value = on ? 0.5 : 0;
}

export function isEnabled() {
  return enabled;
}

// --- one-shot voices -------------------------------------------------------

function blip(type, f0, f1, dur, vol, dest) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(dest || sfxGain);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur, vol, filterHz) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = filterHz;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(lp); lp.connect(g); g.connect(sfxGain);
  src.start(t);
}

export const sfx = {
  step()      { blip('square', 110, 80, 0.05, 0.05); },
  pickup()    { blip('square', 660, 1320, 0.10, 0.18);
                setTimeout(() => blip('square', 990, 1760, 0.12, 0.16), 90); },
  terminal()  { blip('square', 880, 880, 0.04, 0.10);
                setTimeout(() => blip('square', 1180, 1180, 0.05, 0.09), 60); },
  locked()    { blip('square', 200, 120, 0.16, 0.16);
                setTimeout(() => blip('square', 160, 90, 0.20, 0.14), 110); },
  unlock()    { [523, 659, 784, 1046].forEach((f, i) =>
                  setTimeout(() => blip('square', f, f, 0.14, 0.16), i * 95)); },
  alarm()     { blip('sawtooth', 440, 880, 0.18, 0.10); },
  hurt()      { blip('sawtooth', 300, 40, 0.5, 0.28); noise(0.4, 0.2, 900); },
  death()     { [392, 330, 262, 196, 131].forEach((f, i) =>
                  setTimeout(() => blip('square', f, f * 0.5, 0.30, 0.22), i * 160)); },
  win()       { [523, 659, 784, 1046, 1318].forEach((f, i) =>
                  setTimeout(() => blip('square', f, f, 0.16, 0.20), i * 120)); },
  ui()        { blip('square', 520, 780, 0.06, 0.12); },
  dash()      { blip('sawtooth', 820, 180, 0.22, 0.16); noise(0.18, 0.12, 2200); },
  bubble()    { blip('sine', 300 + Math.random() * 400, 900, 0.12, 0.05); },
};

// --- adaptive sequencer ----------------------------------------------------

export function startMusic() {
  initAudio();
  if (!ctx || timer) return;
  musicGain.gain.setTargetAtTime(0.32, ctx.currentTime, 0.8);
  nextNoteTime = ctx.currentTime;
  timer = setInterval(scheduler, 25);
}

export function stopMusic() {
  if (timer) { clearInterval(timer); timer = null; }
  if (ctx && musicGain) musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
}

// 0..1 — drives tempo, riff selection and an extra lead voice.
export function setIntensity(v) {
  intensity = Math.max(0, Math.min(1, v));
  tempo = 0.145 - 0.045 * intensity;
}

function scheduler() {
  if (!ctx || !started) return;
  while (nextNoteTime < ctx.currentTime + 0.12) {
    scheduleStep(step, nextNoteTime);
    nextNoteTime += tempo;
    step = (step + 1) % 16;
  }
}

function scheduleStep(i, time) {
  if (!enabled) return;
  const bass = BASS[i];
  if (bass) voice('square', NOTE[bass], time, tempo * 1.6, 0.20);

  const arp = (intensity > 0.45 ? ARP_HUNT : ARP_CALM)[i];
  if (arp && (i % 2 === 0 || intensity > 0.45)) {
    voice('triangle', NOTE[arp], time, tempo * 0.9, 0.11 + 0.06 * intensity);
  }

  // Hi-hat-ish tick keeps the pulse readable at low intensity.
  if (i % 4 === 2) voice('square', NOTE['A5'], time, 0.02, 0.03);

  // Danger stinger.
  if (intensity > 0.8 && i % 8 === 0) {
    voice('sawtooth', NOTE['A2'], time, tempo * 3, 0.10);
  }
}

function voice(type, freq, time, dur, vol) {
  if (!freq) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, time);
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(vol, time + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  osc.connect(g);
  g.connect(musicGain);
  osc.start(time);
  osc.stop(time + dur + 0.02);
}
