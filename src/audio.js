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
let drumBuffer = null;

const NOTE = {};
(() => {
  const names = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];
  for (let oct = 1; oct <= 6; oct++) {
    for (let i = 0; i < 12; i++) {
      NOTE[names[i] + oct] = 440 * Math.pow(2, (oct - 4) + (i - 9) / 12);
    }
  }
})();

// Eight-bar A-minor theme: a submerged pulse, then a rising answer.
const CHORDS = [
  ['A1', 'A3', 'C4', 'E4'], ['F1', 'F3', 'A3', 'C4'],
  ['C2', 'G3', 'C4', 'E4'], ['E1', 'Gs3', 'B3', 'E4'],
  ['A1', 'A3', 'C4', 'E4'], ['F1', 'A3', 'C4', 'F4'],
  ['D2', 'A3', 'D4', 'F4'], ['E1', 'Gs3', 'B3', 'E4'],
];
const MELODY = [
  ['E5', null, 'C5', 'B4'], ['A4', null, 'C5', null],
  ['G4', 'C5', 'E5', null], ['B4', null, 'Gs4', 'B4'],
  ['E5', 'G5', 'E5', 'C5'], ['F5', null, 'E5', 'C5'],
  ['D5', 'F5', 'E5', 'D5'], ['B4', 'Gs4', 'B4', null],
];

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
  drumBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.15), ctx.sampleRate);
  const samples = drumBuffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
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
  if (master) master.gain.setTargetAtTime(on ? 0.5 : 0, ctx.currentTime, 0.025);
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
  if (!ctx || !started || ctx.state !== 'running') return;
  // A background tab can miss minutes of ticks. Never replay that backlog.
  if (nextNoteTime < ctx.currentTime - 0.2) nextNoteTime = ctx.currentTime;
  while (nextNoteTime < ctx.currentTime + 0.12) {
    scheduleStep(step, nextNoteTime);
    nextNoteTime += tempo;
    step = (step + 1) % 128;
  }
}

function scheduleStep(i, time) {
  if (!enabled) return;
  const bar = Math.floor(i / 16), beat = i % 16;
  const chord = CHORDS[bar];
  if (beat % 4 === 0 || (intensity > 0.45 && beat % 4 === 2)) {
    voice('triangle', NOTE[chord[0]] * (beat === 10 ? 2 : 1), time, tempo * 2.4, 0.30);
  }
  if (beat % 2 === 0 || intensity > 0.45) {
    const note = NOTE[chord[1 + [0, 1, 2, 1, 0, 2, 1, 2][Math.floor(beat / 2)]]];
    voice('square', note, time, tempo * 0.75, 0.055 + intensity * 0.025);
  }
  if (beat % 4 === 0) {
    const note = NOTE[MELODY[bar][beat / 4]];
    voice('triangle', note, time, tempo * 2.8, 0.12);
    // A quiet, single echo gives the melody an underwater space.
    voice('triangle', note, time + tempo * 3, tempo * 1.8, 0.025);
  }
  if (beat % 8 === 0 || (intensity > 0.6 && beat === 10)) {
    voice('sine', 100, time, 0.12, 0.25, 35);
  }
  if (beat % 8 === 4) percussion(time, 0.09, 0.08 + intensity * 0.05, 1500);
  if (beat % 4 === 2 || intensity > 0.55 && beat % 2 === 1) {
    percussion(time, 0.025, 0.035, 6500);
  }
  if (intensity > 0.8 && beat % 4 === 0) {
    voice('square', NOTE[chord[2]] * 2, time, tempo * 0.6, 0.065);
  }
}

function percussion(time, dur, vol, hz) {
  const src = ctx.createBufferSource();
  src.buffer = drumBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = hz;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  src.connect(filter); filter.connect(gain); gain.connect(musicGain);
  src.start(time); src.stop(time + dur);
  src.onended = () => { src.disconnect(); filter.disconnect(); gain.disconnect(); };
}

function voice(type, freq, time, dur, vol, endFreq) {
  if (!freq) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, time);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, time + dur);
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(vol, time + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  osc.connect(g);
  g.connect(musicGain);
  osc.start(time);
  osc.stop(time + dur + 0.02);
  osc.onended = () => { osc.disconnect(); g.disconnect(); };
}
