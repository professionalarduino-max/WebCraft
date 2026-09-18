// Procedural Minecraft-style sound effects + calm generative music.
// Everything is synthesized with WebAudio — no audio assets.

import { B } from './blocks.js';

let ctx = null;
let sfxBus = null;
let musicBus = null;
let noiseBuf = null;
let masterBus = null;
let enabled = true;
let volume = 1;

export function initAudio() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterBus = ctx.createGain();
      masterBus.gain.value = volume;
      masterBus.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = enabled ? 1 : 0;
      sfxBus.connect(masterBus);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.5;
      musicBus.connect(masterBus);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { /* no audio */ }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
  if (rainWant && !rainNodes) { rainWant = false; setRain(true); }
}

export function setSoundsEnabled(v) {
  enabled = !!v;
  if (sfxBus) sfxBus.gain.value = enabled ? 1 : 0;
}
export function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  if (masterBus) masterBus.gain.value = volume;
}
export function soundsEnabled() { return enabled; }

// looping rain hiss, faded in/out (created on demand from the noise buffer)
let rainNodes = null;
let rainWant = false;
export function setRain(on) {
  rainWant = !!on;
  if (!ctx || !noiseBuf || !masterBus) return;
  if (rainWant && !rainNodes) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.07, ctx.currentTime + 2);
    src.connect(f); f.connect(g); g.connect(masterBus);
    src.start();
    rainNodes = { src, g };
  } else if (!rainWant && rainNodes) {
    const { src, g } = rainNodes;
    rainNodes = null;
    g.gain.cancelScheduledValues(ctx.currentTime);
    g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
    setTimeout(() => { try { src.stop(); } catch (e) {} }, 900);
  }
}
const on = () => ctx && enabled && sfxBus;

// enveloped oscillator
function tone(type, f0, f1, dur, vol = 0.15, delay = 0, dest = null) {
  if (!on()) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(f0, 1), t);
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(dest || sfxBus);
  o.start(t);
  o.stop(t + dur + 0.05);
}

// filtered noise burst (freqEnd = optional filter sweep target)
function noise(dur, vol, fType = 'lowpass', freq = 800, q = 0.8, delay = 0, freqEnd = null) {
  if (!on()) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  src.playbackRate.value = 0.7 + Math.random() * 0.6;
  const f = ctx.createBiquadFilter();
  f.type = fType;
  f.frequency.setValueAtTime(freq, t);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(sfxBus);
  src.start(t);
  src.stop(t + dur + 0.05);
}

// ---------------------------------------------------------------------------
// Block materials -> {filter freq, decay, volume, thump [f0, f1]}

const MAT_SOUND = {
  grass: { f: 700, d: 0.10, v: 0.14, th: [210, 90] },
  dirt: { f: 500, d: 0.11, v: 0.15, th: [170, 70] },
  sand: { f: 1400, d: 0.09, v: 0.12, th: [260, 120] },
  gravel: { f: 2200, d: 0.08, v: 0.13, th: [300, 140] },
  stone: { f: 420, d: 0.13, v: 0.17, th: [150, 60] },
  wood: { f: 900, d: 0.08, v: 0.15, th: [280, 130] },
  glass: { f: 4000, d: 0.16, v: 0.12, th: [1900, 900] },
  cloth: { f: 600, d: 0.08, v: 0.08, th: [220, 140] },
  snow: { f: 3200, d: 0.10, v: 0.09, th: [400, 200] },
  water: { f: 900, d: 0.18, v: 0.06, th: [500, 150] },
};

const GRASS_IDS = new Set([B.GRASS, B.LEAVES, B.TNT, B.TORCH, B.POPPY, B.DANDELION, B.BLUE_ORCHID, B.ALLIUM, B.HAY]);
const DIRT_IDS = new Set([B.DIRT, B.CLAY, B.NETHERRACK]);
const GLASS_IDS = new Set([B.GLASS, B.GLASS_PANE, B.ICE, B.GLOWSTONE, B.TINTED_GLASS, B.SEA_LANTERN]);
const SNOW_IDS = new Set([B.SNOW, B.SNOW_BLOCK, B.PACKED_ICE]);
const CLOTH_IDS = new Set([B.WOOL, B.BED, B.CACTUS, B.COBWEB]);
const WOOD_IDS = new Set([
  B.PLANK, B.BIRCH_PLANK, B.SPRUCE_PLANK, B.LOG, B.BIRCH_LOG, B.SPRUCE_LOG,
  B.CRAFTING_TABLE, B.CHEST, B.FENCE, B.BOOKSHELF, B.JUKEBOX, B.NOTE_BLOCK,
  B.PUMPKIN, B.MELON, B.OAK_SLAB, B.SPRUCE_SLAB, B.BIRCH_SLAB,
  B.DARK_LOG, B.DARK_PLANK,
]);

export function materialOf(id) {
  if (id == null) return 'stone';
  if (GRASS_IDS.has(id)) return 'grass';
  if (DIRT_IDS.has(id)) return 'dirt';
  if (id === B.SAND) return 'sand';
  if (id === B.GRAVEL) return 'gravel';
  if (GLASS_IDS.has(id)) return 'glass';
  if (SNOW_IDS.has(id)) return 'snow';
  if (CLOTH_IDS.has(id)) return 'cloth';
  if (id >= 90 && id <= 104) return 'cloth'; // colored wool
  if (WOOD_IDS.has(id)) return 'wood';
  if (id >= B.LADDER && id <= B.LADDER + 3) return 'wood';
  if (id >= B.DOOR && id <= B.DOOR + 7) return 'wood';
  if (id === B.DOOR_TOP || id === B.DOOR_TOP_OPEN) return 'wood';
  if (id >= B.OAK_STAIRS && id <= B.OAK_STAIRS + 3) return 'wood';
  if (id >= B.SPRUCE_STAIRS && id <= B.SPRUCE_STAIRS + 3) return 'wood';
  return 'stone';
}

function digNoise(mat, volMul = 1, delay = 0) {
  const m = MAT_SOUND[mat] || MAT_SOUND.stone;
  noise(m.d, m.v * volMul, 'lowpass', m.f * (0.9 + Math.random() * 0.2), 0.9, delay);
  tone('triangle', m.th[0], m.th[1], m.d, m.v * 0.7 * volMul, delay);
}

function shatter(delay = 0) {
  noise(0.18, 0.16, 'highpass', 2800, 0.7, delay);
  tone('sine', 2100 + Math.random() * 400, 1400, 0.12, 0.08, delay);
  tone('sine', 2900 + Math.random() * 500, 1800, 0.09, 0.06, delay + 0.02);
}

// ---------------------------------------------------------------------------
// Jukebox tune (scheduled per-note so stopping cuts it immediately)

let jukeboxOn = false;
let jukeboxToken = 0;
const MEL = [
  12, 16, 19, 16, 21, 19, 16, 12,
  14, 17, 19, 17, 21, 24, 21, 19,
  16, 19, 16, 12, 14, 12, 9, 12,
  16, 12, 14, 16, 12, 9, 7, 9,
];
function startJukebox() {
  initAudio();
  if (!ctx || jukeboxOn) return;
  jukeboxOn = true;
  const my = ++jukeboxToken;
  const beat = 0.21;
  MEL.forEach((p, i) => {
    setTimeout(() => { if (jukeboxOn && my === jukeboxToken) sfx.note(p); }, i * beat * 1000);
    if (i % 4 === 0) {
      setTimeout(() => { if (jukeboxOn && my === jukeboxToken) sfx.note(Math.max(0, p - 12)); }, i * beat * 1000);
    }
  });
  setTimeout(() => { if (my === jukeboxToken) jukeboxOn = false; }, MEL.length * beat * 1000 + 500);
}

// ---------------------------------------------------------------------------

export const sfx = {
  break: () => { digNoise('stone'); noise(0.08, 0.1, 'lowpass', 600, 0.8, 0.02); },
  breakMat: (mat) => {
    if (mat === 'glass') { shatter(); return; }
    digNoise(mat, 1.2);
    noise(0.1, 0.08, 'lowpass', 500, 0.8, 0.03);
  },
  mine: () => digNoise('stone', 0.5),
  dig: (mat) => digNoise(mat || 'stone', 0.55),
  place: () => { tone('square', 260, 150, 0.06, 0.1); noise(0.05, 0.08, 'lowpass', 900); },
  placeMat: (mat) => {
    if (mat === 'glass') {
      tone('sine', 2200, 1600, 0.07, 0.07);
      noise(0.05, 0.06, 'highpass', 3000);
      return;
    }
    const m = MAT_SOUND[mat] || MAT_SOUND.stone;
    tone('triangle', m.th[0] * 1.4, m.th[1], 0.07, 0.12);
    noise(0.05, 0.07, 'lowpass', m.f);
  },
  step: (mat, vol = 1) => {
    if (mat === 'water') { noise(0.16, 0.05, 'lowpass', 1000, 0.7); return; }
    if (mat === 'glass') { noise(0.05, 0.05 * vol, 'highpass', 3500); return; }
    const m = MAT_SOUND[mat] || MAT_SOUND.stone;
    noise(m.d * 0.8, m.v * 0.55 * vol, 'lowpass', m.f, 0.9);
  },
  land: (hard = 0.5) => {
    noise(0.1, 0.1 + hard * 0.12, 'lowpass', 500);
    tone('sine', 130, 60, 0.1, 0.1 + hard * 0.1);
  },
  click: () => { tone('square', 1400, 800, 0.035, 0.09); noise(0.02, 0.05, 'highpass', 2500); },
  hurt: () => { tone('sawtooth', 320, 90, 0.2, 0.16); noise(0.1, 0.1, 'lowpass', 700); },
  die: () => { tone('sawtooth', 280, 40, 0.6, 0.18); noise(0.3, 0.1, 'lowpass', 500); },
  pop: () => { const f = 600 + Math.random() * 300; tone('sine', f, f * 1.6, 0.08, 0.12); },
  pickup: () => {
    const f = 700 + Math.random() * 250;
    tone('sine', f, f * 1.5, 0.09, 0.1);
    tone('sine', f * 1.5, f * 2, 0.08, 0.08, 0.07);
  },
  hit: () => { tone('triangle', 180, 70, 0.09, 0.16); noise(0.06, 0.1, 'lowpass', 800); },
  splash: () => {
    noise(0.3, 0.14, 'lowpass', 1400, 0.6, 0, 300);
    tone('sine', 500, 120, 0.25, 0.08);
  },
  eat: () => { for (let i = 0; i < 3; i++) noise(0.07, 0.14, 'lowpass', 750, 1, i * 0.14); },
  craft: () => {
    tone('triangle', 420, 640, 0.09, 0.12);
    noise(0.04, 0.06, 'lowpass', 1200, 0.8, 0.02);
  },
  fireball: () => {
    noise(0.3, 0.12, 'bandpass', 1200, 1.2, 0, 400);
    tone('sawtooth', 800, 180, 0.28, 0.08);
  },
  crit: () => {
    tone('square', 700, 1500, 0.07, 0.12);
    tone('square', 1000, 2000, 0.06, 0.1, 0.05);
    noise(0.08, 0.08, 'highpass', 3000, 0.7);
  },
  bow: () => {
    tone('triangle', 160, 620, 0.13, 0.14);
    noise(0.06, 0.08, 'highpass', 1800, 0.8, 0.1);
    tone('triangle', 620, 240, 0.1, 0.1, 0.12);
  },
  portal: () => {
    tone('sine', 130, 520, 0.7, 0.12);
    tone('sine', 196, 780, 0.7, 0.08);
    tone('sine', 520, 100, 0.6, 0.1, 0.35);
    noise(0.9, 0.05, 'bandpass', 900, 2, 0.1, 300);
  },
  fuse: () => {
    noise(0.5, 0.09, 'highpass', 3200, 0.6);
    noise(0.4, 0.06, 'highpass', 4200, 0.6, 0.35);
  },
  door: () => {
    tone('sawtooth', 190, 260, 0.12, 0.06);
    tone('triangle', 140, 90, 0.12, 0.14, 0.1);
    noise(0.08, 0.08, 'lowpass', 600, 0.8, 0.1);
  },
  chest: () => {
    tone('sawtooth', 150, 220, 0.14, 0.06);
    noise(0.12, 0.1, 'lowpass', 700, 0.8, 0.05);
    tone('triangle', 200, 120, 0.1, 0.1, 0.12);
  },
  explode: () => {
    noise(0.8, 0.4, 'lowpass', 350, 0.5, 0, 60);
    tone('sine', 100, 24, 0.7, 0.4);
    tone('sawtooth', 70, 28, 0.5, 0.2, 0.05);
    noise(0.4, 0.15, 'lowpass', 900, 0.6, 0.02, 150);
  },
  levelup: () => {
    const seq = [523, 659, 784, 1046, 1318];
    seq.forEach((f, i) => {
      tone('triangle', f, f, 0.22, 0.1, i * 0.1);
      tone('sine', f * 2, f * 2, 0.18, 0.04, i * 0.1);
    });
  },
  piston: () => { noise(0.12, 0.2, 'lowpass', 400); tone('square', 180, 70, 0.12, 0.12); },
  dispense: () => { tone('square', 500, 200, 0.07, 0.1); noise(0.05, 0.08, 'lowpass', 1200); },
  note: (p = 12) => {
    const f = 185 * Math.pow(2, Math.max(0, Math.min(24, p)) / 12);
    tone('triangle', f, f * 0.99, 0.5, 0.22);
    tone('sine', f * 2, f * 2, 0.3, 0.06);
  },
  jukeboxPlaying: () => jukeboxOn,
  jukeboxStart: () => startJukebox(),
  jukeboxStop: () => { jukeboxOn = false; jukeboxToken++; },
};

// ---------------------------------------------------------------------------
// Calm generative background music (soft plucks + occasional pads)

function mPluck(freq, dur, vol) {
  if (!ctx || !music.playing || !musicBus) return;
  const t = ctx.currentTime;
  for (const [type, m, v] of [['triangle', 1, vol], ['sine', 2, vol * 0.4]]) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq * m;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(musicBus);
    o.start(t); o.stop(t + dur + 0.1);
  }
}

function mPad(freq, dur, vol) {
  if (!ctx || !music.playing || !musicBus) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'triangle';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 2.5);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(musicBus);
  o.start(t); o.stop(t + dur + 0.1);
}

function scheduleMelody() {
  if (!music.playing) return;
  setTimeout(() => {
    if (!music.playing) return;
    if (Math.random() < 0.75) {
      const scale = [220, 246.9, 277.2, 329.6, 369.9, 440, 493.9, 554.4];
      const f = scale[(Math.random() * scale.length) | 0] * (Math.random() < 0.25 ? 0.5 : 1);
      mPluck(f, 2.5 + Math.random() * 2, 0.1);
      if (Math.random() < 0.3) mPluck(f * 1.5, 3, 0.06);
    }
    scheduleMelody();
  }, 2500 + Math.random() * 4500);
}

function schedulePad() {
  if (!music.playing) return;
  setTimeout(() => {
    if (!music.playing) return;
    const roots = [110, 130.8, 146.8, 164.8];
    const r = roots[(Math.random() * roots.length) | 0];
    for (const m of [1, 1.25, 1.5]) mPad(r * m, 7, 0.035);
    schedulePad();
  }, 18000 + Math.random() * 22000);
}

export const music = {
  playing: false,
  start() {
    initAudio();
    if (!ctx || this.playing) return;
    this.playing = true;
    scheduleMelody();
    schedulePad();
  },
  stop() {
    this.playing = false;
  },
};
