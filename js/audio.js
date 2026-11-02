// Generated audio: ambient/trance music, classical, white noise, and sound effects (WebAudio, no assets).
let ctx = null, master, musicBus, sfxBus, noiseBuf;
let channel = 'ambient', muted = false, trance = false, tranceUntil = 0, nextTranceAt = 0;
let step = 0, nextTime = 0, timer = null;
let noiseSrc = null, noiseGain = null;

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const PROG = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am F C G
const PENTA = [57, 60, 62, 64, 67, 69, 72, 74, 76];

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
  musicBus = ctx.createGain(); musicBus.gain.value = 0.5; musicBus.connect(master);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  nextTime = ctx.currentTime + 0.2;
  timer = setInterval(schedule, 100);
  nextTranceAt = ctx.currentTime + 150 + Math.random() * 120;
  applyChannel(locked || userChannel);
}

export function setMuted(m) { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.05); }
export const isMuted = () => muted;
export function getChannel() { return userChannel; }

// The listener's pick (userChannel) is kept while a mini-game can lock the radio to one channel.
let userChannel = 'ambient', locked = null;
export function setChannel(c) { userChannel = c; if (!locked) applyChannel(c); }
export function lockChannel(c) { locked = c; applyChannel(c); }
export function unlockChannel() { locked = null; applyChannel(userChannel); }

function applyChannel(c) {
  channel = c; step = 0;
  if (!ctx) return;
  if (noiseSrc) { try { noiseSrc.stop(); } catch {} noiseSrc = null; }
  if (c === 'noise') {
    noiseSrc = ctx.createBufferSource(); noiseSrc.buffer = noiseBuf; noiseSrc.loop = true;
    noiseGain = ctx.createGain(); noiseGain.gain.value = 0.25;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 9000;
    noiseSrc.connect(f); f.connect(noiseGain); noiseGain.connect(musicBus); noiseSrc.start();
  }
}

export function setTrance(on, seconds = 90) {
  if (!ctx) return;
  trance = on; tranceUntil = on ? ctx.currentTime + seconds : 0; step = 0;
}

function osc(type, freq, t, dur, gain, dest, o = {}) {
  const os = ctx.createOscillator(), g = ctx.createGain();
  os.type = type; os.frequency.setValueAtTime(freq, t);
  if (o.slideTo) os.frequency.exponentialRampToValueAtTime(o.slideTo, t + dur);
  if (o.detune) os.detune.value = o.detune;
  const a = o.attack ?? 0.01;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = os;
  if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; os.connect(f); node = f; }
  if (o.vibrato) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 5.5; lg.gain.value = freq * 0.012; l.connect(lg); lg.connect(os.frequency); l.start(t); l.stop(t + dur + 0.1); }
  node.connect(g); g.connect(dest || musicBus);
  os.start(t); os.stop(t + dur + 0.1);
}

function noise(t, dur, gain, freq, type = 'bandpass', dest, q = 1) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(dest || sfxBus);
  s.start(t, Math.random()); s.stop(t + dur + 0.05);
}

function schedule() {
  if (!ctx || muted) { if (ctx) nextTime = Math.max(nextTime, ctx.currentTime); return; }
  if (ctx.state === 'suspended') return;
  const now = ctx.currentTime;
  if (!trance && channel === 'ambient' && now > nextTranceAt) setTrance(true, 70 + Math.random() * 40);
  if (trance && now > tranceUntil) { trance = false; nextTranceAt = now + 160 + Math.random() * 200; step = 0; }
  const bpm = channel === 'ambient' ? (trance ? 128 : 66) : channel === 'jazz' ? 124 : 72;
  const dur = 60 / bpm / 4; // 16th
  while (nextTime < now + 0.3) {
    if (nextTime < now) nextTime = now;
    if (channel === 'ambient') (trance ? tranceStep : ambientStep)(nextTime, step, dur);
    else if (channel === 'classical') classicalStep(nextTime, step, dur);
    else if (channel === 'jazz') jazzStep(nextTime + (step % 4 === 2 ? dur * 0.66 : 0), step, dur); // swung off-beats
    step++; nextTime += dur;
  }
}

// Jazz: walking bass, ride cymbal, piano comping and a wandering lead over a ii-V-I-VI loop.
const JAZZ = [
  { root: 38, voice: [53, 57, 60, 64], scale: [62, 64, 65, 67, 69, 71, 72, 74], next: 43 },
  { root: 43, voice: [59, 62, 65, 69], scale: [67, 69, 71, 72, 74, 76, 77, 79], next: 36 },
  { root: 36, voice: [55, 59, 64, 67], scale: [60, 62, 64, 65, 67, 69, 71, 72], next: 45 },
  { root: 45, voice: [55, 61, 64, 69], scale: [69, 71, 73, 74, 76, 78, 79, 81], next: 38 },
];
let jazzNote = 4;
function jazzStep(t, s, d) {
  const c = JAZZ[Math.floor(s / 16) % 4], beat = Math.floor((s % 16) / 4);
  if (s % 4 === 0) {
    const n = [c.root, c.root + 7, c.root + 12, c.next + (c.next > c.root ? -1 : 1)][beat];
    osc('triangle', mtof(n), t, d * 3.6, 0.24, musicBus, { attack: 0.008, lp: 700 });
    osc('sine', mtof(n), t, d * 3.6, 0.18, musicBus, { attack: 0.008 });
  }
  if ([0, 4, 6, 8, 12, 14].includes(s % 16)) noise(t, 0.06, beat % 2 ? 0.09 : 0.06, 8000, 'highpass', musicBus);
  if (s % 8 === 4) noise(t, 0.05, 0.1, 5000, 'highpass', musicBus);
  if (s % 16 === 0 && Math.random() < 0.6) osc('sine', 90, t, 0.14, 0.2, musicBus, { slideTo: 45 });
  if ((s % 16 === 6 || s % 16 === 11 || (s % 16 === 2 && Math.random() < 0.4)) && Math.random() < 0.85) {
    c.voice.forEach((n, i) => osc('triangle', mtof(n), t, d * 3, 0.07, musicBus, { attack: 0.004, lp: 2200, detune: i * 3 }));
  }
  if (s % 2 === 0 && Math.random() < 0.5) {
    jazzNote = Math.max(0, Math.min(c.scale.length - 1, jazzNote + pick3()));
    const n = c.scale[jazzNote];
    osc('triangle', mtof(n), t, d * (Math.random() < 0.3 ? 5 : 2.6), 0.09, musicBus, { attack: 0.02, lp: 2600, vibrato: true });
  }
}
const pick3 = () => [-2, -1, -1, 1, 1, 2, 3][Math.floor(Math.random() * 7)];

function ambientStep(t, s, d) {
  const bar = Math.floor(s / 64) % 4, chord = PROG[bar];
  if (s % 64 === 0) chord.forEach((n, i) => osc('sine', mtof(n - 12 + (i === 0 ? -12 : 0)), t, d * 66, 0.12, musicBus, { attack: 2, lp: 900, detune: i * 4 }));
  if (s % 64 === 0) chord.forEach((n) => osc('triangle', mtof(n), t, d * 60, 0.05, musicBus, { attack: 3, lp: 1400 }));
  if (s % 8 === 4 && Math.random() < 0.45) osc('sine', mtof(PENTA[Math.floor(Math.random() * PENTA.length)] + 12), t, d * 10, 0.07, musicBus, { attack: 0.02 });
}

function tranceStep(t, s, d) {
  const bar = Math.floor(s / 16) % 4, chord = PROG[bar];
  if (s % 4 === 0) osc('sine', 120, t, 0.18, 0.5, musicBus, { slideTo: 40 });
  if (s % 4 === 2) noise(t, 0.05, 0.12, 9000, 'highpass', musicBus);
  if (s % 2 === 1) osc('sawtooth', mtof(chord[0] - 24), t, d * 0.9, 0.12, musicBus, { lp: 500 });
  const arp = [0, 1, 2, 1][s % 4], oct = (s % 8 > 3) ? 12 : 0;
  osc('sawtooth', mtof(chord[arp] + 12 + oct), t, d * 1.4, 0.05, musicBus, { lp: 1800 + (s % 64) * 20, attack: 0.005 });
  if (s % 16 === 0) chord.forEach((n) => osc('triangle', mtof(n), t, d * 16, 0.05, musicBus, { attack: 0.3, lp: 1200 }));
}

function classicalStep(t, s, d) {
  const bar = Math.floor(s / 32) % 4, chord = PROG[bar];
  const lead = [0, 2, 1, 2, 0, 1, 2, 1];
  if (s % 4 === 0) {
    const n = chord[lead[(s / 4) % 8 | 0]] + (Math.random() < 0.3 ? 12 : 0) + 12;
    osc('sawtooth', mtof(n), t, d * 5, 0.07, musicBus, { attack: 0.12, lp: 2400, vibrato: true });
    osc('sawtooth', mtof(n), t, d * 5, 0.04, musicBus, { attack: 0.15, lp: 2000, vibrato: true, detune: 9 });
  }
  if (s % 32 === 0) chord.forEach((n) => osc('sawtooth', mtof(n - 12), t, d * 30, 0.05, musicBus, { attack: 0.8, lp: 1200, vibrato: true }));
  if (s % 4 === 2 && Math.random() < 0.28) { // zither
    const n = PENTA[Math.floor(Math.random() * PENTA.length)] + 12;
    osc('triangle', mtof(n), t, 1.2, 0.09, musicBus, { attack: 0.003 });
    osc('square', mtof(n * 2), t, 0.2, 0.02, musicBus, { attack: 0.002, lp: 3000 });
  }
}

// ------------------------------------------------------------------ SFX
const SFX = {
  click: (t) => osc('square', 660, t, 0.05, 0.08, sfxBus),
  chime: (t) => { osc('sine', 880, t, 0.5, 0.15, sfxBus); osc('sine', 1318, t + 0.1, 0.6, 0.12, sfxBus); },
  coin: (t) => { osc('square', 988, t, 0.08, 0.1, sfxBus); osc('square', 1319, t + 0.08, 0.2, 0.1, sfxBus); },
  eat: (t) => { for (let i = 0; i < 5; i++) noise(t + i * 0.13, 0.07, 0.4, 1800 + i * 150, 'bandpass', sfxBus, 2); },
  sip: (t) => { noise(t, 0.35, 0.25, 700, 'bandpass', sfxBus, 4); osc('sine', 300, t + 0.3, 0.1, 0.1, sfxBus, { slideTo: 200 }); },
  door: (t) => { osc('sine', 180, t, 0.15, 0.25, sfxBus, { slideTo: 90 }); noise(t, 0.08, 0.15, 400, 'lowpass'); },
  scooterOn: (t) => osc('sawtooth', 120, t, 0.5, 0.12, sfxBus, { slideTo: 380, lp: 900 }),
  scooterOff: (t) => osc('sawtooth', 380, t, 0.5, 0.12, sfxBus, { slideTo: 90, lp: 900 }),
  roast: (t) => { noise(t, 1.2, 0.35, 220, 'lowpass', sfxBus); for (let i = 0; i < 6; i++) noise(t + 0.3 + i * 0.15, 0.04, 0.5, 2500, 'bandpass', sfxBus, 3); },
  espresso: (t) => { noise(t, 0.4, 0.3, 3000, 'highpass', sfxBus); noise(t + 0.4, 1.6, 0.25, 900, 'bandpass', sfxBus, 3); },
  hit: (t) => { osc('triangle', 520, t, 0.08, 0.3, sfxBus, { slideTo: 300 }); },
  punch: (t) => { noise(t, 0.1, 0.5, 250, 'lowpass'); osc('sine', 140, t, 0.12, 0.4, sfxBus, { slideTo: 60 }); },
  horn: (t) => { osc('square', 330, t, 0.35, 0.1, sfxBus); osc('square', 415, t, 0.35, 0.1, sfxBus); },
  bell: (t) => { osc('sine', 1046, t, 0.8, 0.2, sfxBus); osc('sine', 2093, t, 0.5, 0.06, sfxBus); },
  siren: (t) => { for (let i = 0; i < 4; i++) osc('sawtooth', i % 2 ? 700 : 960, t + i * 0.35, 0.34, 0.08, sfxBus, { lp: 1800 }); },
  pour: (t) => noise(t, 1.0, 0.25, 1400, 'bandpass', sfxBus, 2),
  squawk: (t) => { osc('sawtooth', 900, t, 0.15, 0.1, sfxBus, { slideTo: 1500, lp: 3000 }); osc('sawtooth', 1400, t + 0.18, 0.12, 0.08, sfxBus, { slideTo: 800, lp: 3000 }); },
  coo: (t) => osc('sine', 300, t, 0.3, 0.12, sfxBus, { slideTo: 220, vibrato: true }),
  rustle: (t) => { for (let i = 0; i < 5; i++) noise(t + i * 0.07, 0.06, 0.3, 4000, 'highpass'); },
  rain: (t) => noise(t, 0.4, 0.05, 5000, 'highpass'),
};

export function sfx(name) {
  if (!ctx || muted || !SFX[name]) return;
  if (ctx.state === 'suspended') ctx.resume();
  SFX[name](ctx.currentTime + 0.01);
}
