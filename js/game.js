'use strict';
/* ═══════════════════════════════════════════════════════════
   گازِ آخر — FULL THROTTLE
   موتور مسابقه‌ی Pseudo-3D روی Canvas2D · سه مسیر · کیبورد
   ═══════════════════════════════════════════════════════════ */

/* ───────── ۱) ابزارهای کمکی ───────── */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp  = (a, b, t) => a + (b - a) * t;
const easeInOut = t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
const increase = (start, inc, max) => { let r = start + inc; while (r >= max) r -= max; while (r < 0) r += max; return r; };
const exponentialFog = (d, density) => 1 / Math.pow(Math.E, d * d * density);
const overlap = (x1, w1, x2, w2, pct = 1) => {
  const h1 = (w1 / 2) * pct, h2 = (w2 / 2) * pct;
  return !((x1 + h1 < x2 - h2) || (x1 - h1 > x2 + h2));
};
const mulberry32 = seed => {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const TAU = Math.PI * 2;
const fmtTime = t => {
  const m = Math.floor(t / 60), s = Math.floor(t % 60), d = Math.floor((t * 10) % 10);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${d}`;
};
const fmtNum = n => Math.floor(n).toLocaleString('en-US');

/* ───────── ۲) صدا (Web Audio API) ───────── */
const AudioSys = (() => {
  let ctx = null, master = null;
  let engineOsc = null, engineOsc2 = null, engineFilter = null, engineGain = null;
  let muted = false;
  try { muted = localStorage.getItem('ft.muted') === '1'; } catch (e) { /* محیط خصوصی */ }

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
  }
  function setMuted(v) {
    muted = v;
    try { localStorage.setItem('ft.muted', v ? '1' : '0'); } catch (e) {}
    if (master) master.gain.value = v ? 0 : 0.5;
  }
  function startEngine() {
    ensure(); if (!ctx || engineOsc) return;
    engineGain = ctx.createGain(); engineGain.gain.value = 0;
    engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 500; engineFilter.Q.value = 9;
    engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 52;
    engineOsc2 = ctx.createOscillator(); engineOsc2.type = 'square'; engineOsc2.frequency.value = 26;
    const g2 = ctx.createGain(); g2.gain.value = 0.45;
    engineOsc.connect(engineFilter); engineOsc2.connect(g2); g2.connect(engineFilter);
    engineFilter.connect(engineGain); engineGain.connect(master);
    engineOsc.start(); engineOsc2.start();
  }
  function stopEngine() {
    if (!engineOsc) return;
    const t = ctx.currentTime;
    engineGain.gain.setTargetAtTime(0, t, 0.08);
    const o1 = engineOsc, o2 = engineOsc2;
    setTimeout(() => { try { o1.stop(); o2.stop(); o1.disconnect(); o2.disconnect(); } catch (e) {} }, 350);
    engineOsc = null; engineOsc2 = null;
  }
  function setEngine(ratio, boosting) {
    if (!ctx || !engineOsc) return;
    const t = ctx.currentTime;
    const f = 46 + ratio * ratio * 230 + (boosting ? 55 : 0);
    engineOsc.frequency.setTargetAtTime(f, t, 0.07);
    engineOsc2.frequency.setTargetAtTime(f / 2, t, 0.07);
    engineFilter.frequency.setTargetAtTime(280 + ratio * 2300 + (boosting ? 750 : 0), t, 0.09);
    engineGain.gain.setTargetAtTime(0.045 + ratio * 0.115 + (boosting ? 0.03 : 0), t, 0.09);
  }
  function blip(freq = 440, dur = 0.12, type = 'square', vol = 0.22, when = 0) {
    ensure(); if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.03);
  }
  const coin     = () => { blip(880, .09, 'square', .16); blip(1318, .17, 'square', .16, .07); };
  const nearMiss = () => blip(659, .09, 'triangle', .22);
  const click    = () => blip(1150, .05, 'square', .1);
  const countBeep = fin => blip(fin ? 880 : 392, fin ? .5 : .16, 'square', .3);
  const fanfare  = () => { [523, 659, 784, 1046].forEach((f, i) => blip(f, .2, 'square', .22, i * .15)); blip(1318, .55, 'square', .22, .62); };
  function crashSnd() {
    ensure(); if (!ctx) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.32);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.1);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = ctx.createGain(); g.gain.setValueAtTime(.5, t); g.gain.exponentialRampToValueAtTime(.001, t + .32);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 850;
    src.connect(f); f.connect(g); g.connect(master); src.start(t);
    blip(64, .32, 'sawtooth', .38);
  }
  return {
    ensure, startEngine, stopEngine, setEngine, coin, nearMiss, click, countBeep, fanfare, crashSnd,
    get muted() { return muted; },
    toggleMute() { setMuted(!muted); return muted; },
  };
})();

/* ───────── ۳) ثابت‌های جهان ───────── */
const SEG_LEN = 200;
const RUMBLE = 3;
const DRAW_DISTANCE = 210;
const CAMERA_HEIGHT = 1050;
const FOV_DEPTH = 0.84;
const ROAD_WIDTH = 2200;
const PLAYER_Z = CAMERA_HEIGHT * FOV_DEPTH;
const MAX_SPEED = SEG_LEN * 60;           // ≈ ۱۲٬۰۰۰ واحد بر ثانیه
const ACCEL = MAX_SPEED / 4.6;
const BRAKE = -MAX_SPEED * 0.95;
const DECEL = -MAX_SPEED / 7;
const OFFROAD_DECEL = -MAX_SPEED * 0.75;
const OFFROAD_LIMIT = MAX_SPEED / 4.2;
const CENTRIFUGAL = 0.31;
const DISPLAY_KMH = 305;                  // سرعت نمایشی در بیشینه
const W = 960, H = 540;
const LANES = [-0.58, 0, 0.58];
const bestKey = id => `ft.best.${id}`;
const getBest = id => { try { const v = localStorage.getItem(bestKey(id)); return v ? +v : null; } catch (e) { return null; } };
const setBest = (id, v) => { try { localStorage.setItem(bestKey(id), String(v)); } catch (e) {} };

/* ───────── ۴) تعریف مسیرها ───────── */
const TRACKS = {
  city: {
    id: 'city', seed: 1337, name: 'تهرانِ شب', en: 'TEHRAN NIGHTS',
    segments: 3750, km: 7.5, parTime: 96,
    trafficCount: 13, trafficMin: 0.30, trafficMax: 0.44,
    trafficPalette: ['#ffd23f', '#19d3ff', '#ff8a3d', '#e8e8f0', '#3ddc84', '#c9c9d6'],
    straightRatio: 0.34, minCurve: 0.8, maxCurve: 3.1, hilliness: 3.4, fogDensity: 5.4,
    scenery: ['building', 'building', 'building', 'palm', 'lamp'],
    sky: ['#070b26', '#1a0f3c', '#3b1157', '#a1246b'],
    sun: { y: 0.415, r: 0.185, inner: '#ffe98a', mid: '#ff8a3d', outer: '#ff2e63', slits: true },
    horizonGlow: 'rgba(255,46,150,.42)', fogColor: '#1a0d30',
    light: { road: '#2c2c38', grass: '#10101a', rumble: '#ff2e96', lane: '#b8a9ff' },
    dark:  { road: '#272735', grass: '#0d0d16', rumble: '#19d3ff', lane: null },
    layer: 'city',
  },
  desert: {
    id: 'desert', seed: 9241, name: 'کویر لوت', en: 'LUT DESERT',
    segments: 4500, km: 9.0, parTime: 100,
    trafficCount: 6, trafficMin: 0.36, trafficMax: 0.5,
    trafficPalette: ['#e8e4da', '#a63a2a', '#3a6ea5', '#c9c27a', '#5a5148', '#8a8f96'],
    straightRatio: 0.55, minCurve: 0.6, maxCurve: 2.15, hilliness: 5.2, fogDensity: 3.1,
    scenery: ['cactus', 'rock', 'bush', 'sign', 'cactus'],
    sky: ['#331a4e', '#5c2350', '#a63a44', '#f2a24b'],
    sun: { y: 0.425, r: 0.16, inner: '#fff6c8', mid: '#ffc24b', outer: '#ff7a2a', slits: false },
    horizonGlow: 'rgba(255,190,90,.5)', fogColor: '#6e3524',
    light: { road: '#47403a', grass: '#d9a05e', rumble: '#f5e6c8', lane: '#ffe9b0' },
    dark:  { road: '#403a35', grass: '#cd9252', rumble: '#b03a2e', lane: null },
    layer: 'desert',
  },
  mountain: {
    id: 'mountain', seed: 5173, name: 'گردنه‌ی البرز', en: 'ALBORZ PASS',
    segments: 4200, km: 8.4, parTime: 128,
    trafficCount: 8, trafficMin: 0.3, trafficMax: 0.42,
    trafficPalette: ['#d64545', '#4a90d9', '#e8e8e8', '#f0c040', '#7a4ad9', '#3f5a44'],
    straightRatio: 0.22, minCurve: 1.6, maxCurve: 4.4, hilliness: 10.5, fogDensity: 4.2,
    scenery: ['pine', 'pine', 'rock', 'pine2', 'msign'],
    sky: ['#10233a', '#1e3a54', '#3f5c74', '#cfe4e6'],
    sun: { y: 0.30, r: 0.1, inner: '#ffffff', mid: '#f2f6e8', outer: '#cfe0d8', slits: false },
    horizonGlow: 'rgba(226,242,244,.45)', fogColor: '#1f3242',
    light: { road: '#3c4249', grass: '#2e6b34', rumble: '#ecf0f1', lane: '#f5f6fa' },
    dark:  { road: '#373d44', grass: '#285a2d', rumble: '#b03a2e', lane: null },
    layer: 'mountain',
  },
};
const TRACK_ORDER = ['city', 'desert', 'mountain'];

/* ───────── ۵) ساختِ جهانِ مسیر ───────── */
function buildSegments(def) {
  const segments = [];
  const rng = mulberry32(def.seed);
  const lastY = () => (segments.length ? segments[segments.length - 1].p2.world.y : 0);

  const addSegment = (curve, y) => {
    const n = segments.length;
    segments.push({
      index: n, curve,
      p1: { world: { y: lastY(), z: n * SEG_LEN }, camera: {}, screen: {} },
      p2: { world: { y, z: (n + 1) * SEG_LEN }, camera: {}, screen: {} },
      sprites: [], color: Math.floor(n / RUMBLE) % 2 ? 'dark' : 'light',
      fog: 1, clip: 0, isFinish: false,
    });
  };
  const addRoad = (enter, hold, leave, curve, dy) => {
    const startY = lastY();
    const endY = startY + dy * SEG_LEN;
    const total = enter + hold + leave;
    const h = n => startY + (endY - startY) * easeInOut(clamp(n / total, 0, 1));
    for (let n = 0; n < enter; n++) addSegment(lerp(0, curve, (n / enter) * (n / enter)), h(n));
    for (let n = 0; n < hold; n++)  addSegment(curve, h(enter + n));
    for (let n = 0; n < leave; n++) addSegment(lerp(curve, 0, easeInOut(n / leave)), h(enter + hold + n));
  };

  // سکوی آغاز
  addRoad(0, 150, 0, 0, 0);

  let dir = 1, alt = 0;
  while (segments.length < def.segments) {
    const r = rng();
    if (r < def.straightRatio) {
      const dy = clamp((rng() * 2 - 1) * def.hilliness - alt * 0.07, -def.hilliness, def.hilliness);
      alt += dy;
      addRoad(0, (70 + rng() * 120) | 0, 0, 0, dy);
    } else {
      if (rng() < 0.82) dir = -dir;
      const mag = def.minCurve + rng() * (def.maxCurve - def.minCurve);
      const len = (26 + rng() * 40) | 0;
      const hold = (len * (0.6 + rng() * 1.15)) | 0;
      const dy = clamp((rng() * 2 - 1) * def.hilliness - alt * 0.07, -def.hilliness, def.hilliness);
      alt += dy;
      addRoad(len, hold, len, dir * mag, dy);
    }
  }
  // مستقیمِ پایان
  addRoad(0, 110, 0, 0, clamp(-alt * 0.1, -8, 8));

  // خط پایان (چکر‌بُرد)
  const finishIdx = segments.length - 96;
  if (segments[finishIdx]) segments[finishIdx].isFinish = true;
  // بنر پایان کمی جلوتر
  if (segments[finishIdx + 6]) segments[finishIdx + 6].sprites.push({ type: 'arch', offset: 0, seed: 1, worldH: 0 });

  return segments;
}

const SCENERY_DEF = {
  building: { worldH: 3400, aspect: 0.62 },
  palm:     { worldH: 1750, aspect: 0.85 },
  lamp:     { worldH: 1550, aspect: 0.32 },
  cactus:   { worldH: 950,  aspect: 0.5 },
  rock:     { worldH: 720,  aspect: 1.35 },
  bush:     { worldH: 420,  aspect: 1.5 },
  sign:     { worldH: 1150, aspect: 0.72 },
  pine:     { worldH: 2100, aspect: 0.8 },
  pine2:    { worldH: 2600, aspect: 0.72 },
  msign:    { worldH: 1250, aspect: 0.75 },
};

function decorate(segments, def) {
  const rng = mulberry32(def.seed + 777);
  for (let i = 60; i < segments.length - 140; i += 2 + ((rng() * 3) | 0)) {
    if (rng() < 0.24) continue; // فضاهای خالی برای نفس کشیدن
    const side = rng() < 0.5 ? -1 : 1;
    const offset = side * (1.45 + rng() * 3.6);
    const type = def.scenery[(rng() * def.scenery.length) | 0];
    const baseH = SCENERY_DEF[type].worldH;
    segments[i].sprites.push({
      type, offset, seed: (rng() * 1e9) | 0,
      worldH: baseH * (0.75 + rng() * 0.6),
    });
  }
}

function buildCoins(segments, def) {
  const rng = mulberry32(def.seed + 31337);
  const coins = [];
  const total = segments.length * SEG_LEN;
  for (let z = 3200; z < total - 4000; z += 5200 + rng() * 1800) {
    const lane = LANES[(rng() * 3) | 0];
    for (let j = 0; j < 5; j++) {
      coins.push({ z: z + j * SEG_LEN * 1.2, offset: lane + (rng() * 0.08 - 0.04), taken: false });
    }
  }
  return coins;
}

/* ─ لایه‌های بک‌گراندِ تولیدی (آف‌اسکرین) ─ */
function makeFarLayer(def) {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 340;
  const g = c.getContext('2d');
  const rng = mulberry32(def.seed + 999);

  if (def.layer === 'city') {
    // ردیف دور (روشن‌تر)
    g.fillStyle = '#241536';
    let x = -20;
    while (x < c.width + 40) {
      const bw = 40 + rng() * 90, bh = 60 + rng() * 150;
      g.fillRect(x, c.height - 150 - bh, bw, bh + 150);
      x += bw + 4 + rng() * 26;
    }
    // ردیف نزدیک (تیره) + آنتن + پنجره‌های روشن
    x = -30;
    while (x < c.width + 60) {
      const bw = 60 + rng() * 120, bh = 120 + rng() * 190;
      const top = c.height - bh;
      const grad = g.createLinearGradient(0, top, 0, c.height);
      grad.addColorStop(0, '#170d28'); grad.addColorStop(1, '#0e071c');
      g.fillStyle = grad;
      g.fillRect(x, top, bw, bh);
      // آنتن
      if (rng() < 0.4) {
        g.strokeStyle = '#170d28'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(x + bw / 2, top); g.lineTo(x + bw / 2, top - 22 - rng() * 40); g.stroke();
        g.fillStyle = '#ff4d4d'; g.beginPath(); g.arc(x + bw / 2, top - 24 - rng() * 38, 2.4, 0, TAU); g.fill();
      }
      // پنجره‌ها
      const cols = Math.max(2, (bw / 16) | 0), rows = Math.max(3, (bh / 24) | 0);
      for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
        if (rng() < 0.34) {
          g.fillStyle = rng() < 0.78 ? 'rgba(255,214,130,.9)' : 'rgba(90,230,255,.9)';
          g.fillRect(x + 5 + col * (bw - 10) / cols, top + 10 + r * (bh - 18) / rows, 3.6, 5.2);
        }
      }
      x += bw + 8 + rng() * 34;
    }
  } else if (def.layer === 'desert') {
    // قله‌های دور (mesa)
    g.fillStyle = '#6e3524';
    let x = -60;
    while (x < c.width + 120) {
      const w = 150 + rng() * 260, h = 60 + rng() * 110, flat = 30 + rng() * 70;
      g.beginPath();
      g.moveTo(x, c.height);
      g.lineTo(x + (w - flat) / 2, c.height - h);
      g.lineTo(x + (w + flat) / 2, c.height - h);
      g.lineTo(x + w, c.height);
      g.closePath(); g.fill();
      x += w + 20 + rng() * 120;
    }
    // تپه‌های ماسه‌ای نزدیک
    g.fillStyle = '#4a2318';
    g.beginPath(); g.moveTo(0, c.height);
    let y = c.height - 40;
    g.lineTo(0, y);
    for (let px = 0; px <= c.width; px += 32) {
      y = c.height - 26 - Math.sin(px * 0.011 + 2) * 24 - rng() * 9;
      g.lineTo(px, y);
    }
    g.lineTo(c.width, c.height); g.closePath(); g.fill();
  } else {
    // کوهستانی: قله‌های برفی دور
    g.fillStyle = '#31445e';
    let x = -80;
    while (x < c.width + 160) {
      const w = 200 + rng() * 260, h = 120 + rng() * 160;
      const peakX = x + w / 2, peakY = c.height - h;
      g.beginPath();
      g.moveTo(x, c.height - 60); g.lineTo(peakX, peakY); g.lineTo(x + w, c.height - 60); g.closePath(); g.fill();
      // کلاهک برف
      g.fillStyle = '#e8eef2';
      const sw = w * 0.16;
      g.beginPath();
      g.moveTo(peakX - sw, peakY + h * 0.30); g.lineTo(peakX, peakY); g.lineTo(peakX + sw, peakY + h * 0.30);
      g.lineTo(peakX + sw * 0.45, peakY + h * 0.22); g.lineTo(peakX - sw * 0.2, peakY + h * 0.32); g.closePath(); g.fill();
      g.fillStyle = '#31445e';
      x += w * (0.62 + rng() * 0.3);
    }
    // خط‌الراس نزدیک با کاج‌های تیره
    g.fillStyle = '#16241c';
    g.beginPath(); g.moveTo(0, c.height);
    for (let px = 0; px <= c.width; px += 18) {
      const ridge = c.height - 34 - Math.sin(px * 0.008 + 1.4) * 26 - Math.sin(px * 0.03) * 7;
      g.lineTo(px, ridge);
    }
    g.lineTo(c.width, c.height); g.closePath(); g.fill();
    // نوک کاج‌ها
    for (let px = 0; px < c.width; px += 9 + rng() * 14) {
      const base = c.height - 30 - Math.sin(px * 0.008 + 1.4) * 26;
      const h = 12 + rng() * 22;
      g.beginPath(); g.moveTo(px - 5, base); g.lineTo(px, base - h); g.lineTo(px + 5, base); g.closePath(); g.fill();
    }
  }
  return c;
}

/* ───────── ۶) وضعیت بازی ───────── */
const canvas = $('#game-canvas');
const ctx = canvas.getContext('2d');

const keys = { left: false, right: false, up: false, down: false, space: false };

const game = {
  state: 'menu',           // menu | tracks | countdown | race | paused | finish
  track: null, def: null, segments: [], cars: [], coins: [],
  trackLength: 0, position: 0, speed: 0, playerX: 0, playerY: 0,
  steerVis: 0, skyOffset: 0, bgLayer: null, skyGrad: null,
  nitro: 100, boosting: false, score: 0, coinsTaken: 0, nearMisses: 0,
  raceTime: 0, invuln: 0, shake: 0, bump: 0,
  countdownT: 0, lastCount: 99, finishShown: false, confettiT: 0,
  particles: [], popups: [], spawnAheadT: 0,
  finishZ: 0, coinChain: 0, coinChainT: 0, coinPopup: null,
};

function resetRace(def) {
  game.def = def;
  game.segments = buildSegments(def);
  decorate(game.segments, def);
  game.trackLength = game.segments.length * SEG_LEN;
  game.finishZ = (game.segments.length - 96) * SEG_LEN; // خط چکر‌بُرد
  game.coins = buildCoins(game.segments, def);
  game.cars = [];
  game.position = 0; game.speed = 0; game.playerX = 0; game.playerY = 0;
  game.steerVis = 0; game.skyOffset = 0;
  game.nitro = 100; game.boosting = false;
  game.score = 0; game.coinsTaken = 0; game.nearMisses = 0;
  game.raceTime = 0; game.invuln = 0; game.shake = 0; game.bump = 0;
  game.particles = []; game.popups = []; game.spawnAheadT = 0;
  game.finishShown = false; game.confettiT = 0;
  game.bgLayer = makeFarLayer(def);
  // گرادیانت آسمان (یک‌بار)
  const g = ctx.createLinearGradient(0, 0, 0, H * 0.72);
  g.addColorStop(0, def.sky[0]); g.addColorStop(0.42, def.sky[1]); g.addColorStop(0.78, def.sky[2]); g.addColorStop(1, def.sky[3]);
  game.skyGrad = g;
  seedInitialTraffic(def);
}

function seedInitialTraffic(def) {
  const rng = mulberry32(def.seed + Date.now() % 100000);
  for (let i = 0; i < def.trafficCount; i++) {
    const z = 2600 + rng() * (DRAW_DISTANCE * SEG_LEN * 0.85);
    spawnCarAt(def, z, true);
  }
}
function spawnCarAt(def, z, initial = false) {
  const lane = LANES[(Math.random() * 3) | 0] + (Math.random() * 0.16 - 0.08);
  // تداخل ممنوع
  for (const c of game.cars) if (Math.abs(c.z - z) < 620 && Math.abs(c.offset - lane) < 0.5) return null;
  const r = Math.random();
  const type = r < 0.58 ? 'sedan' : r < 0.84 ? 'suv' : 'truck';
  const car = {
    z, offset: lane, type,
    speed: MAX_SPEED * (def.trafficMin + Math.random() * (def.trafficMax - def.trafficMin)),
    color: def.trafficPalette[(Math.random() * def.trafficPalette.length) | 0],
    counted: false, wob: Math.random() * TAU,
  };
  game.cars.push(car);
  return car;
}
function maintainTraffic(def) {
  // حذف ماشین‌های رد‌شده از پشت
  game.cars = game.cars.filter(c => c.z > game.position - 1500);
  // تکمیل جمعیت جلوتر از بازیکن
  const ahead = game.cars.filter(c => c.z > game.position).length;
  const need = def.trafficCount - ahead;
  for (let i = 0; i < need; i++) {
    const z = game.position + 5200 + Math.random() * (DRAW_DISTANCE * SEG_LEN * 0.8);
    if (z < game.trackLength - 1200) spawnCarAt(def, z);
  }
}
function findSegment(z) {
  const i = clamp(Math.floor(z / SEG_LEN), 0, game.segments.length - 1);
  return game.segments[i];
}

/* ───────── ۷) ذرات و پاپ‌آپ‌ها ───────── */
function spawnParticle(p) { game.particles.push(Object.assign({ life: 0.7, maxLife: 0.7, size: 4, vx: 0, vy: 0, grav: 0, alpha: 1 }, p)); }
function popup(text, color = '#fff', size = 26) {
  const lane = game.popups.filter(p => p.life > 0.7).length;
  game.popups.push({ text, color, size, x: W / 2 + (Math.random() * 160 - 80), y: H * 0.33 + lane * 38, vy: -46, life: 1.5, maxLife: 1.5 });
}
function updateParticles(dt) {
  if (game.coinChainT > 0) { game.coinChainT -= dt; if (game.coinChainT <= 0) { game.coinChain = 0; game.coinPopup = null; } }
  if (game.coinPopup && game.coinPopup.life <= 0.05) game.coinPopup = null;
  if (game.popups.length > 7) game.popups.shift();
  const arr = game.particles;
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i];
    p.life -= dt; if (p.life <= 0) { arr.splice(i, 1); continue; }
    p.vy += (p.grav || 0) * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
  const pops = game.popups;
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i];
    p.life -= dt; p.y += p.vy * dt; p.vy *= (1 - dt * 1.6);
    if (p.life <= 0) pops.splice(i, 1);
  }
}
function drawParticles() {
  for (const p of game.particles) {
    ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1) * (p.alpha ?? 1);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function drawPopups() {
  ctx.save();
  ctx.textAlign = 'center';
  for (const p of game.popups) {
    const a = clamp(p.life / p.maxLife, 0, 1);
    ctx.globalAlpha = a;
    ctx.font = `800 ${p.size}px Vazirmatn, Tahoma, sans-serif`;
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.65)';
    ctx.strokeText(p.text, p.x, p.y);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/* ───────── ۸) به‌روزرسانی ───────── */
function updateRace(dt) {
  const def = game.def;
  const playerSegment = findSegment(game.position + PLAYER_Z);
  const speedPercent = game.speed / MAX_SPEED;
  const steerInput = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);

  // فرمان + گریز از مرکز
  const dx = dt * 2.35 * speedPercent;
  game.playerX += steerInput * dx;
  game.playerX -= dx * speedPercent * playerSegment.curve * CENTRIFUGAL;
  game.steerVis += (steerInput - game.steerVis) * Math.min(1, dt * 9);

  // نیترو
  game.boosting = keys.space && game.nitro > 0.5 && game.speed > MAX_SPEED * 0.18;
  const topSpeed = MAX_SPEED * (game.boosting ? 1.36 : 1);
  if (keys.up) game.speed += (game.boosting ? ACCEL * 1.75 : ACCEL) * dt;
  else if (keys.down) game.speed += BRAKE * dt;
  else game.speed += DECEL * dt;

  if (game.boosting) game.nitro = Math.max(0, game.nitro - 30 * dt);
  else game.nitro = Math.min(100, game.nitro + 13 * dt);

  // خروج از جاده
  const offRoad = game.playerX < -1.02 || game.playerX > 1.02;
  if (offRoad && game.speed > OFFROAD_LIMIT) game.speed += OFFROAD_DECEL * dt;
  if (offRoad && game.speed > MAX_SPEED * 0.25) {
    game.bump = Math.min(1, game.bump + dt * 6);
    if (Math.random() < 0.55) {
      const side = game.playerX < 0 ? -1 : 1;
      spawnParticle({
        x: W / 2 + side * W * 0.16 + (Math.random() * 30 - 15), y: H - 30,
        vx: side * (40 + Math.random() * 80), vy: -(60 + Math.random() * 120),
        grav: 420, size: 3 + Math.random() * 5,
        color: def.id === 'desert' ? '#d9a05e' : '#5a6b4a', life: .7, maxLife: .7,
      });
    }
  } else {
    game.bump = Math.max(0, game.bump - dt * 5);
  }
  game.playerX = clamp(game.playerX, -1.55, 1.55);
  game.speed = clamp(game.speed, 0, topSpeed);

  // پیشروی
  game.position += game.speed * dt;
  game.raceTime += dt;
  game.skyOffset = increase(game.skyOffset + playerSegment.curve * speedPercent * dt * 0.42, 0, 1);

  // امتیازِ مسافت
  game.score += speedPercent * dt * 11;

  // تایمرهای محافظت/تکان
  if (game.invuln > 0) game.invuln -= dt;
  if (game.shake > 0) game.shake -= dt;

  // ترافیک
  maintainTraffic(def);
  for (const car of game.cars) {
    car.z += car.speed * dt;
    car.wob += dt;
    const rel = car.z - (game.position + PLAYER_Z);
    // برخورد
    if (game.invuln <= 0 && Math.abs(rel) < SEG_LEN * 0.72 && overlap(game.playerX, 0.62, car.offset, 0.68, 0.9)) {
      game.invuln = 1.5; game.shake = 0.65;
      game.speed = Math.max(game.speed * 0.34, car.speed * 0.6);
      car.counted = true;
      AudioSys.crashSnd();
      popup('برخورد!', '#ff6a5e', 34);
      for (let i = 0; i < 22; i++) {
        spawnParticle({
          x: W / 2 + (Math.random() - 0.5) * 90, y: H - 120 + (Math.random() - 0.5) * 40,
          vx: (Math.random() - 0.5) * 520, vy: -(80 + Math.random() * 320),
          grav: 640, size: 2.5 + Math.random() * 4.5,
          color: ['#ffd23f', '#ff8a3d', '#c9c9d6', '#7a7a8a'][(Math.random() * 4) | 0], life: .9, maxLife: .9,
        });
      }
      continue;
    }
    // سبقتِ نزدیک
    if (!car.counted && car.z + SEG_LEN < game.position + PLAYER_Z) {
      car.counted = true;
      const gap = Math.abs(car.offset - game.playerX);
      if (gap < 1.02 && gap >= 0.55 && game.speed > MAX_SPEED * 0.42 && game.invuln <= 0) {
        game.nearMisses += 1;
        AudioSys.nearMiss();
        popup('نزدیک بود! +۷۵', '#4de3ff', 24);
      }
    }
  }

  // سکه‌ها
  for (const coin of game.coins) {
    if (coin.taken) continue;
    if (coin.z < game.position - 400) continue;
    if (coin.z > game.position + PLAYER_Z + 200) break; // سکه‌ها مرتب‌اند
    if (Math.abs(coin.z - (game.position + PLAYER_Z)) < 150 && Math.abs(coin.offset - game.playerX) < 0.42) {
      coin.taken = true; game.coinsTaken += 1;
      AudioSys.coin();
      game.coinChain = (game.coinChainT > 0 ? game.coinChain : 0) + 1;
      game.coinChainT = 1.15;
      const text = '+' + (50 * game.coinChain);
      if (game.coinPopup && game.coinPopup.life > 0.05) {
        game.coinPopup.text = text; game.coinPopup.life = game.coinPopup.maxLife = 1.4;
      } else {
        game.coinPopup = { text, color: '#ffd75e', size: 29, x: W / 2 + (Math.random() * 230 - 115), y: H * 0.36, vy: -42, life: 1.4, maxLife: 1.4 };
        game.popups.push(game.coinPopup);
      }
    }
  }

  // دودِ درفت / گردِ نیترو
  if (game.boosting) {
    for (let i = 0; i < 3; i++) {
      const side = i % 2 ? 1 : -1;
      spawnParticle({
        x: W / 2 + side * 34 + (Math.random() - 0.5) * 14, y: H - 52,
        vx: (Math.random() - 0.5) * 60, vy: 130 + Math.random() * 90,
        size: 4 + Math.random() * 5, grav: -80,
        color: Math.random() < 0.55 ? '#ff9a3d' : (Math.random() < 0.5 ? '#19d3ff' : '#ffd75e'),
        life: .32, maxLife: .32, alpha: .95,
      });
    }
  }
  if (Math.abs(steerInput) > 0 && speedPercent > 0.62 && !offRoad && Math.random() < 0.35) {
    spawnParticle({
      x: W / 2 - steerInput * W * 0.13, y: H - 34,
      vx: -steerInput * 60 + (Math.random() - 0.5) * 40, vy: 40 + Math.random() * 60,
      size: 5 + Math.random() * 6, color: 'rgba(220,220,230,.55)', life: .5, maxLife: .5,
    });
  }

  updateParticles(dt);
  AudioSys.setEngine(speedPercent, game.boosting);

  // پایان؟
  if (game.position >= game.finishZ) finishRace();
}

function updateCountdown(dt) {
  game.countdownT -= dt;
  const c = Math.ceil(game.countdownT);
  if (c !== game.lastCount) {
    game.lastCount = c;
    const el = $('#count-num');
    if (c > 0) { el.textContent = String(c); el.classList.remove('go'); AudioSys.countBeep(false); }
    else { el.textContent = 'برو!'; el.classList.add('go'); AudioSys.countBeep(true); }
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  }
  // موتور درجا می‌کشد
  AudioSys.setEngine(0.16 + 0.1 * Math.sin(performance.now() * 0.012), false);
  updateParticles(dt);
  if (game.countdownT <= -0.55) {
    game.state = 'race';
    $('#countdown').classList.add('hidden');
  }
}

function updateFinish(dt) {
  // ماشین کم‌کم می‌ایستد؛ کاغذرنگین‌باران
  game.speed = Math.max(0, game.speed - MAX_SPEED * 0.35 * dt);
  game.position = Math.min(game.position + game.speed * dt, game.finishZ + SEG_LEN * 40);
  game.skyOffset = increase(game.skyOffset + 0.0004, 0, 1);
  game.confettiT += dt;
  if (game.confettiT < 2.6) {
    for (let i = 0; i < 4; i++) {
      spawnParticle({
        x: Math.random() * W, y: -12,
        vx: (Math.random() - 0.5) * 90, vy: 60 + Math.random() * 130,
        grav: 60, size: 3 + Math.random() * 4.5,
        color: ['#ff2e96', '#19d3ff', '#ffd75e', '#3ddc84', '#ffffff', '#ff8a3d'][(Math.random() * 6) | 0],
        life: 2.2, maxLife: 2.2,
      });
    }
  }
  updateParticles(dt);
  AudioSys.setEngine(game.speed / MAX_SPEED, false);
}

/* ───────── ۹) رندر ───────── */
function polygon(x1, y1, x2, y2, x3, y3, x4, y4, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4);
  ctx.closePath(); ctx.fill();
}
function rr(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function renderBackground() {
  const def = game.def;
  const horizon = H * 0.44;
  ctx.fillStyle = game.skyGrad;
  ctx.fillRect(0, 0, W, H);
  // هاله‌ی افق
  const glow = ctx.createRadialGradient(W / 2, horizon, 10, W / 2, horizon, W * 0.62);
  glow.addColorStop(0, def.horizonGlow); glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  // خورشید/ماه
  const s = def.sun;
  const sunX = W / 2 - game.skyOffset * W * 0.45;
  const sunY = H * s.y, sunR = H * s.r;
  const sg = ctx.createRadialGradient(sunX, sunY, sunR * 0.15, sunX, sunY, sunR * 2.6);
  sg.addColorStop(0, s.inner); sg.addColorStop(0.32, s.mid); sg.addColorStop(0.62, s.outer); sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sg;
  ctx.beginPath(); ctx.arc(sunX, sunY, sunR * 2.6, 0, TAU); ctx.fill();
  ctx.fillStyle = s.mid;
  ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, TAU); ctx.fill();
  if (s.slits) {
    ctx.fillStyle = def.sky[2];
    for (let i = 0; i < 4; i++) {
      const yy = sunY + sunR * (0.15 + i * 0.24);
      ctx.fillRect(sunX - sunR * 1.15, yy, sunR * 2.3, sunR * (0.05 + i * 0.035));
    }
  }
  // لایه‌ی دور (پارالاکس)
  const img = game.bgLayer, layerH = H * 0.46, layerW = W * 2.1;
  let off = -(game.skyOffset * layerW) % layerW; if (off > 0) off -= layerW;
  for (let x = off; x < W; x += layerW) ctx.drawImage(img, x, horizon - layerH + 26, layerW, layerH);
  // مهِ پایینِ افق
  const mist = ctx.createLinearGradient(0, horizon - 34, 0, horizon + 30);
  mist.addColorStop(0, 'rgba(0,0,0,0)'); mist.addColorStop(1, def.fogColor);
  ctx.globalAlpha = 0.75; ctx.fillStyle = mist; ctx.fillRect(0, horizon - 34, W, 64); ctx.globalAlpha = 1;
}

function renderSegment(seg) {
  const def = game.def;
  const p1 = seg.p1.screen, p2 = seg.p2.screen;
  const c = def[seg.color];
  const r1 = p1.w / 5.2, r2 = p2.w / 5.2;

  // چ grass/شانه
  ctx.fillStyle = c.grass;
  ctx.fillRect(0, p2.y, W, p1.y - p2.y);
  // رامبل‌استریپ‌ها
  polygon(p1.x - p1.w - r1, p1.y, p1.x - p1.w, p1.y, p2.x - p2.w, p2.y, p2.x - p2.w - r2, p2.y, c.rumble);
  polygon(p1.x + p1.w + r1, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x + p2.w + r2, p2.y, c.rumble);
  // آسفالت
  if (seg.isFinish) {
    polygon(p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x - p2.w, p2.y, '#e8e8e8');
    checkerRow(p1, p2, 2);
  } else {
    polygon(p1.x - p1.w, p1.y, p1.x + p1.w, p1.y, p2.x + p2.w, p2.y, p2.x - p2.w, p2.y, c.road);
  }
  // خطوط لان
  if (c.lane) {
    const lw1 = Math.max(2, p1.w / 34), lw2 = Math.max(1, p2.w / 34);
    for (const lanePos of [-1 / 3, 1 / 3]) {
      const lx1 = p1.x + lanePos * 2 * p1.w, lx2 = p2.x + lanePos * 2 * p2.w;
      polygon(lx1 - lw1 / 2, p1.y, lx1 + lw1 / 2, p1.y, lx2 + lw2 / 2, p2.y, lx2 - lw2 / 2, p2.y, c.lane);
    }
  }
  // مه
  if (seg.fog < 1) {
    ctx.globalAlpha = 1 - seg.fog;
    ctx.fillStyle = def.fogColor;
    ctx.fillRect(0, p2.y, W, p1.y - p2.y);
    ctx.globalAlpha = 1;
  }
}
function checkerRow(p1, p2, rows) {
  const cols = 14;
  for (let r = 0; r < rows; r++) {
    const t1 = r / rows, t2 = (r + 1) / rows;
    const yTop = lerp(p2.y, p1.y, t2), yBot = lerp(p2.y, p1.y, t1);
    const xlTop = lerp(p2.x - p2.w, p1.x - p1.w, t2), xlBot = lerp(p2.x - p2.w, p1.x - p1.w, t1);
    const xrTop = lerp(p2.x + p2.w, p1.x + p1.w, t2), xrBot = lerp(p2.x + p2.w, p1.x + p1.w, t1);
    for (let i = 0; i < cols; i++) {
      if ((i + r) % 2 === 0) continue;
      const a1 = xlTop + (xrTop - xlTop) * (i / cols), b1 = xlTop + (xrTop - xlTop) * ((i + 1) / cols);
      const a2 = xlBot + (xrBot - xlBot) * (i / cols), b2 = xlBot + (xrBot - xlBot) * ((i + 1) / cols);
      polygon(a2, yBot, b2, yBot, b1, yTop, a1, yTop, '#141414');
    }
  }
}

/* ─ طراحی اسپرایت‌ها ─ */
function drawScenerySprite(sprite, scale, destX, destY, clipY) {
  if (destY > clipY) return;
  const h = scale * sprite.worldH * (H / 2);
  if (h < 2 && sprite.type !== 'arch') return;
  const rng = mulberry32(sprite.seed);
  switch (sprite.type) {
    case 'building': {
      const w = h * (0.5 + rng() * 0.35);
      const g = ctx.createLinearGradient(0, destY - h, 0, destY);
      g.addColorStop(0, '#1d1330'); g.addColorStop(1, '#0c0818');
      ctx.fillStyle = g; ctx.fillRect(destX - w / 2, destY - h, w, h);
      // لبه‌ی نئون
      const neon = ['#ff2e96', '#19d3ff', '#ffb347', '#3ddc84'][(rng() * 4) | 0];
      ctx.fillStyle = neon; ctx.shadowColor = neon; ctx.shadowBlur = 12;
      ctx.fillRect(destX - w / 2 - 2, destY - h, 3.5, h);
      ctx.fillRect(destX + w / 2 - 1.5, destY - h, 3.5, h);
      ctx.shadowBlur = 0;
      // پنجره‌ها
      const cols = 3 + ((rng() * 3) | 0), rows = Math.max(4, (h / 26) | 0);
      for (let r = 0; r < rows; r++) for (let cN = 0; cN < cols; cN++) {
        if (rng() < 0.42) {
          ctx.fillStyle = rng() < 0.75 ? 'rgba(255,214,130,.95)' : 'rgba(110,235,255,.95)';
          ctx.fillRect(destX - w / 2 + 6 + cN * (w - 12) / cols, destY - h + 8 + r * (h - 14) / rows, Math.max(2.4, w / cols * 0.3), Math.max(3.4, h / rows * 0.32));
        }
      }
      break;
    }
    case 'palm': {
      const trunkH = h * 0.66;
      ctx.strokeStyle = '#4a3320'; ctx.lineWidth = Math.max(2.5, h * 0.055); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(destX, destY);
      ctx.quadraticCurveTo(destX + h * 0.1, destY - trunkH * 0.6, destX + h * 0.04, destY - trunkH);
      ctx.stroke();
      const topX = destX + h * 0.04, topY = destY - trunkH;
      ctx.strokeStyle = '#1f6b38'; ctx.lineWidth = Math.max(2, h * 0.045);
      for (let i = 0; i < 7; i++) {
        const a = (-Math.PI * 0.92) + (i / 6) * Math.PI * 0.84 + (rng() - 0.5) * 0.2;
        const len = h * (0.34 + rng() * 0.14);
        ctx.beginPath(); ctx.moveTo(topX, topY);
        ctx.quadraticCurveTo(topX + Math.cos(a) * len * 0.6, topY + Math.sin(a) * len * 0.6 - 6, topX + Math.cos(a) * len, topY + Math.sin(a) * len + len * 0.42);
        ctx.stroke();
      }
      break;
    }
    case 'lamp': {
      ctx.strokeStyle = '#2a2a34'; ctx.lineWidth = Math.max(2.5, h * 0.05);
      ctx.beginPath(); ctx.moveTo(destX, destY); ctx.lineTo(destX, destY - h * 0.92); ctx.lineTo(destX + h * 0.22, destY - h * 0.92); ctx.stroke();
      const lg = ctx.createRadialGradient(destX + h * 0.22, destY - h * 0.9, 1, destX + h * 0.22, destY - h * 0.9, h * 0.3);
      lg.addColorStop(0, 'rgba(200,235,255,.95)'); lg.addColorStop(1, 'rgba(200,235,255,0)');
      ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(destX + h * 0.22, destY - h * 0.9, h * 0.3, 0, TAU); ctx.fill();
      break;
    }
    case 'cactus': {
      const w = h * 0.34;
      const g = ctx.createLinearGradient(destX - w, 0, destX + w, 0);
      g.addColorStop(0, '#2e7d43'); g.addColorStop(0.5, '#3f9c56'); g.addColorStop(1, '#256a37');
      ctx.fillStyle = g;
      rr(destX - w * 0.32, destY - h, w * 0.64, h, w * 0.3); ctx.fill();
      rr(destX - w * 1.05, destY - h * 0.78, w * 0.42, h * 0.42, w * 0.2); ctx.fill();
      rr(destX + w * 0.62, destY - h * 0.62, w * 0.42, h * 0.34, w * 0.2); ctx.fill();
      ctx.fillRect(destX - w * 1.0, destY - h * 0.5, w * 0.75, w * 0.34);
      ctx.fillRect(destX + w * 0.28, destY - h * 0.42, w * 0.78, w * 0.3);
      ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = Math.max(1, h * 0.012);
      ctx.beginPath(); ctx.moveTo(destX, destY - h * 0.92); ctx.lineTo(destX, destY - h * 0.08); ctx.stroke();
      break;
    }
    case 'rock': {
      const w = h * (SCENERY_DEF.rock.aspect);
      ctx.fillStyle = '#6b4a38';
      ctx.beginPath();
      const n = 7;
      for (let i = 0; i <= n; i++) {
        const a = Math.PI + (i / n) * Math.PI;
        const rr2 = h * (0.55 + rng() * 0.5);
        const px = destX + Math.cos(a) * w * 0.62, py = destY + Math.sin(a) * rr2 * 0.9;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.lineTo(destX + w * 0.62, destY); ctx.lineTo(destX - w * 0.62, destY);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.14)';
      ctx.beginPath(); ctx.ellipse(destX - w * 0.18, destY - h * 0.32, w * 0.22, h * 0.12, -0.4, 0, TAU); ctx.fill();
      break;
    }
    case 'bush': {
      ctx.strokeStyle = '#4d3421'; ctx.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI / 2 + (rng() - 0.5) * 1.9;
        const len = h * (0.5 + rng() * 0.55);
        ctx.lineWidth = Math.max(1.2, h * 0.05 * (1 - rng() * 0.6));
        ctx.beginPath(); ctx.moveTo(destX, destY);
        const mx = destX + Math.cos(a) * len * 0.55, my = destY + Math.sin(a) * len * 0.55;
        ctx.quadraticCurveTo(mx, my, destX + Math.cos(a) * len * (0.8 + rng() * 0.4), destY + Math.sin(a) * len);
        ctx.stroke();
      }
      break;
    }
    case 'sign':
    case 'msign': {
      const board = sprite.type === 'sign' ? '#e8b93c' : '#7a5a34';
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(destX - h * 0.028, destY - h * 0.52, h * 0.056, h * 0.52);
      ctx.fillStyle = board;
      rr(destX - h * 0.3, destY - h * 0.92, h * 0.6, h * 0.36, h * 0.05); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = Math.max(1, h * 0.02); ctx.stroke();
      // فلش جهت‌نما
      ctx.fillStyle = sprite.type === 'sign' ? '#221f16' : '#f5ecdc';
      ctx.beginPath();
      const ay = destY - h * 0.74, ah = h * 0.085;
      ctx.moveTo(destX - h * 0.2, ay); ctx.lineTo(destX + h * 0.02, ay); ctx.lineTo(destX + h * 0.02, ay - ah);
      ctx.lineTo(destX + h * 0.22, ay + ah * 0.5); ctx.lineTo(destX + h * 0.02, ay + 2 * ah); ctx.lineTo(destX + h * 0.02, ay + ah); ctx.lineTo(destX - h * 0.2, ay + ah);
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'pine':
    case 'pine2': {
      const tall = sprite.type === 'pine2' ? 1.15 : 1;
      const trunkH = h * 0.18 * tall;
      ctx.fillStyle = '#3a2a1c';
      ctx.fillRect(destX - h * 0.045, destY - trunkH, h * 0.09, trunkH);
      const layers = 3;
      let apexY = destY - h;
      for (let i = 0; i < layers; i++) {
        const t = i / layers;
        const lw = h * (0.5 - t * 0.27);
        const ly = destY - trunkH - h * 0.16 - t * h * 0.30 * tall;
        const lh = h * (0.36 - t * 0.06) * tall;
        if (i === layers - 1) apexY = ly - lh;
        const g = ctx.createLinearGradient(destX - lw, 0, destX + lw, 0);
        g.addColorStop(0, '#173d24'); g.addColorStop(0.5, '#2c5a36'); g.addColorStop(1, '#122e1c');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(destX - lw, ly); ctx.lineTo(destX, ly - lh); ctx.lineTo(destX + lw, ly); ctx.closePath(); ctx.fill();
      }
      if (sprite.type === 'pine2') { // برفک روی نوک
        ctx.fillStyle = 'rgba(240,248,250,.92)';
        ctx.beginPath();
        ctx.moveTo(destX - h * 0.062, apexY + h * 0.105); ctx.lineTo(destX, apexY - 1); ctx.lineTo(destX + h * 0.062, apexY + h * 0.105);
        ctx.lineTo(destX + h * 0.025, apexY + h * 0.078); ctx.lineTo(destX - h * 0.024, apexY + h * 0.115);
        ctx.closePath(); ctx.fill();
      }
      break;
    }
    case 'arch': {
      // بنر خط پایان — عرض بر اساس جاده
      const roadW = scale * ROAD_WIDTH * (W / 2) * 2;
      const pillarW = roadW * 0.04, bannerH = Math.max(6, roadW * 0.062), pillarH = roadW * 0.21;
      ctx.fillStyle = '#d8d8de';
      ctx.fillRect(destX - roadW * 0.56, destY - pillarH, pillarW, pillarH);
      ctx.fillRect(destX + roadW * 0.56 - pillarW, destY - pillarH, pillarW, pillarH);
      // بنر چکر‌برد
      const bx = destX - roadW * 0.56, bw = roadW * 1.12, by = destY - pillarH - bannerH;
      const cols = 18, sq = bw / cols, rows = 2, sqH = bannerH / rows;
      for (let r = 0; r < rows; r++) for (let cN = 0; cN < cols; cN++) {
        ctx.fillStyle = (r + cN) % 2 ? '#101014' : '#f2f2f2';
        ctx.fillRect(bx + cN * sq, by + r * sqH, sq + 0.5, sqH + 0.5);
      }
      // پنل وسط با نوشته
      const pw = bannerH * 4.4, ph = bannerH * 0.86;
      ctx.fillStyle = 'rgba(8,8,12,.92)';
      rr(destX - pw / 2, by + bannerH / 2 - ph / 2, pw, ph, ph * 0.28); ctx.fill();
      ctx.fillStyle = '#ffd75e';
      ctx.font = `900 ${Math.max(6, ph * 0.52)}px Vazirmatn, Tahoma, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('خط پایان', destX, by + bannerH / 2 + 0.5);
      ctx.textBaseline = 'alphabetic';
      break;
    }
  }
}
function drawCoinSprite(coin, scale, x, y) {
  const r = Math.min(46, Math.max(1.5, scale * 130 * (H / 2)));
  const spin = Math.abs(Math.cos(performance.now() * 0.005 + coin.z * 0.013));
  const rx = Math.max(r * 0.22, r * spin);
  const hover = r * 1.5 + Math.sin(performance.now() * 0.0032 + coin.z * 0.01) * r * 0.22;
  const cy = y - hover;
  const g = ctx.createRadialGradient(x - rx * 0.3, cy - r * 0.3, r * 0.1, x, cy, r);
  g.addColorStop(0, '#fff6b8'); g.addColorStop(0.45, '#ffd75e'); g.addColorStop(1, '#c98a1b');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(x, cy, rx, r, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#8a5e10'; ctx.lineWidth = Math.max(0.8, r * 0.09); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(x, cy, rx * 0.55, r * 0.55, 0, 0, TAU); ctx.stroke();
}

function drawCarSprite(car, scale, x, y, segClipY) {
  const wUnits = car.type === 'truck' ? 1000 : car.type === 'suv' ? 880 : 780;
  const w = scale * wUnits * (W / 2);
  const h = w * (car.type === 'truck' ? 0.82 : car.type === 'suv' ? 0.72 : 0.58);
  if (w < 3 || w > W * 0.72) return; // خیلی نزدیک = برخورد رخ داده
  if (y - h > segClipY + h * 0.35) return;
  const color = car.color;
  const dark = shadeColor(color, -0.32);
  const light = shadeColor(color, 0.28);
  // سایه
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  ctx.beginPath(); ctx.ellipse(x, y + h * 0.03, w * 0.62, h * 0.16, 0, 0, TAU); ctx.fill();
  // بدنه (نمای عقب)
  const bodyG = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  bodyG.addColorStop(0, dark); bodyG.addColorStop(0.28, color); bodyG.addColorStop(0.52, light); bodyG.addColorStop(0.78, color); bodyG.addColorStop(1, dark);
  ctx.fillStyle = bodyG;
  rr(x - w / 2, y - h * 0.46, w, h * 0.44, w * 0.09); ctx.fill();
  // کابین
  const cabW = car.type === 'truck' ? w * 0.86 : w * 0.74;
  const cabH = car.type === 'truck' ? h * 0.52 : h * 0.4;
  rr(x - cabW / 2, y - h * 0.46 - cabH + 2, cabW, cabH, w * 0.07); ctx.fill();
  // شیشه‌ی عقب
  const winG = ctx.createLinearGradient(0, y - h, 0, y - h * 0.45);
  winG.addColorStop(0, '#0e1420'); winG.addColorStop(0.55, '#33415c'); winG.addColorStop(1, '#0e1420');
  ctx.fillStyle = winG;
  rr(x - cabW * 0.4, y - h * 0.46 - cabH + h * 0.06 + 2, cabW * 0.8, cabH * 0.6, w * 0.04); ctx.fill();
  // سپر
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  rr(x - w * 0.46, y - h * 0.12, w * 0.92, h * 0.1, w * 0.04); ctx.fill();
  // چراغ‌های عقب
  const tailG = ctx.createLinearGradient(x - w * 0.42, 0, x + w * 0.42, 0);
  tailG.addColorStop(0, '#ff2a1a'); tailG.addColorStop(0.5, '#ff7a5e'); tailG.addColorStop(1, '#ff2a1a');
  ctx.fillStyle = tailG; ctx.shadowColor = '#ff3a1a'; ctx.shadowBlur = Math.min(14, w * 0.06);
  rr(x - w * 0.4, y - h * 0.33, w * 0.24, h * 0.075, 3); ctx.fill();
  rr(x + w * 0.16, y - h * 0.33, w * 0.24, h * 0.075, 3); ctx.fill();
  ctx.shadowBlur = 0;
  // لاستیک‌ها
  ctx.fillStyle = '#0c0c10';
  rr(x - w * 0.52, y - h * 0.16, w * 0.13, h * 0.17, 2); ctx.fill();
  rr(x + w * 0.39, y - h * 0.16, w * 0.13, h * 0.17, 2); ctx.fill();
  // تاکسی؟
  if (car.color === '#ffd23f') {
    ctx.fillStyle = '#17170f';
    rr(x - w * 0.14, y - h * 0.46 - cabH - h * 0.075 + 2, w * 0.28, h * 0.075, 2); ctx.fill();
  }
}
function shadeColor(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function drawPlayerCar(now) {
  const cx = W / 2 + game.steerVis * 22;
  const speedPercent = game.speed / MAX_SPEED;
  const bounce = Math.sin(now * 0.02) * 1.6 * speedPercent + (game.bump > 0 ? (Math.random() - 0.5) * 7 * game.bump : 0);
  const gy = H - 14 + bounce;
  const cw = W * 0.315, ch = cw * 0.47;
  const steer = game.steerVis;

  ctx.save();
  ctx.translate(cx, gy);
  ctx.rotate(steer * 0.05);
  ctx.translate(-cx, -gy);

  // سایه
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.beginPath(); ctx.ellipse(cx, gy + 4, cw * 0.56, ch * 0.14, 0, 0, TAU); ctx.fill();

  const yB = gy - ch * 0.03;
  const yBelt = gy - ch * 0.46;
  const yT = gy - ch * 0.9;

  // بدنه‌ی اصلی
  const bodyG = ctx.createLinearGradient(cx - cw / 2, 0, cx + cw / 2, 0);
  bodyG.addColorStop(0, '#8f1408'); bodyG.addColorStop(0.22, '#d92b14'); bodyG.addColorStop(0.5, '#ff5a35'); bodyG.addColorStop(0.78, '#d92b14'); bodyG.addColorStop(1, '#8f1408');
  ctx.fillStyle = bodyG;
  ctx.beginPath();
  ctx.moveTo(cx - cw * 0.485, yB);
  ctx.lineTo(cx - cw * 0.5, yBelt + ch * 0.12);
  ctx.quadraticCurveTo(cx - cw * 0.5, yBelt - ch * 0.06, cx - cw * 0.38, yBelt - ch * 0.05);
  ctx.lineTo(cx - cw * 0.30, yT + ch * 0.16);
  ctx.quadraticCurveTo(cx, yT - ch * 0.02, cx + cw * 0.30, yT + ch * 0.16);
  ctx.lineTo(cx + cw * 0.38, yBelt - ch * 0.05);
  ctx.quadraticCurveTo(cx + cw * 0.5, yBelt - ch * 0.06, cx + cw * 0.5, yBelt + ch * 0.12);
  ctx.lineTo(cx + cw * 0.485, yB);
  ctx.quadraticCurveTo(cx, yB + ch * 0.045, cx - cw * 0.485, yB);
  ctx.closePath(); ctx.fill();

  // هایلایت کاپوت/صندوق
  ctx.fillStyle = 'rgba(255,255,255,.16)';
  ctx.beginPath();
  ctx.ellipse(cx, yBelt + ch * 0.02, cw * 0.33, ch * 0.055, 0, 0, TAU);
  ctx.fill();

  // شیشه‌ی عقب
  const glassG = ctx.createLinearGradient(0, yT, 0, yBelt);
  glassG.addColorStop(0, '#0a1018'); glassG.addColorStop(0.5, '#3d5372'); glassG.addColorStop(1, '#0a1018');
  ctx.fillStyle = glassG;
  ctx.beginPath();
  ctx.moveTo(cx - cw * 0.245, yT + ch * 0.155);
  ctx.quadraticCurveTo(cx, yT + ch * 0.055, cx + cw * 0.245, yT + ch * 0.155);
  ctx.lineTo(cx + cw * 0.30, yBelt - ch * 0.075);
  ctx.lineTo(cx - cw * 0.30, yBelt - ch * 0.075);
  ctx.closePath(); ctx.fill();
  // راننده (کلاه‌خود)
  ctx.fillStyle = '#14141c';
  ctx.beginPath(); ctx.arc(cx, yBelt - ch * 0.145, ch * 0.078, Math.PI, 0); ctx.fill();
  ctx.fillStyle = 'rgba(120,225,255,.85)';
  ctx.fillRect(cx - ch * 0.055, yBelt - ch * 0.165, ch * 0.11, ch * 0.022);

  // اسپویلر
  ctx.fillStyle = '#a81c0c';
  rr(cx - cw * 0.34, yBelt + ch * 0.015, cw * 0.055, ch * 0.075, 3); ctx.fill();
  rr(cx + cw * 0.285, yBelt + ch * 0.015, cw * 0.055, ch * 0.075, 3); ctx.fill();
  const wingG = ctx.createLinearGradient(0, yBelt - ch * 0.06, 0, yBelt + ch * 0.03);
  wingG.addColorStop(0, '#ff6a3d'); wingG.addColorStop(1, '#b81f0f');
  ctx.fillStyle = wingG;
  rr(cx - cw * 0.40, yBelt - ch * 0.055, cw * 0.8, ch * 0.052, ch * 0.02); ctx.fill();

  // نوار چراغ عقب (تمام‌عرض)
  const braking = keys.down;
  const tail = ctx.createLinearGradient(cx - cw * 0.42, 0, cx + cw * 0.42, 0);
  tail.addColorStop(0, braking ? '#ff1a0a' : '#c21e10');
  tail.addColorStop(0.5, braking ? '#ff8a70' : '#ff4a2e');
  tail.addColorStop(1, braking ? '#ff1a0a' : '#c21e10');
  ctx.fillStyle = tail;
  ctx.shadowColor = braking ? '#ff2a0a' : '#ff3a1a';
  ctx.shadowBlur = braking ? 34 : 20;
  rr(cx - cw * 0.40, yB - ch * 0.185, cw * 0.8, ch * 0.062, ch * 0.03); ctx.fill();
  ctx.shadowBlur = 0;
  // دیفیوزر + اگزوز
  ctx.fillStyle = '#160b08';
  rr(cx - cw * 0.30, yB - ch * 0.075, cw * 0.6, ch * 0.075, 3); ctx.fill();
  for (const sx of [-1, 1]) {
    ctx.fillStyle = '#2e2e36';
    ctx.beginPath(); ctx.arc(cx + sx * cw * 0.17, yB - ch * 0.037, ch * 0.026, 0, TAU); ctx.fill();
    ctx.fillStyle = '#050506';
    ctx.beginPath(); ctx.arc(cx + sx * cw * 0.17, yB - ch * 0.037, ch * 0.014, 0, TAU); ctx.fill();
  }

  // شعله‌ی نیترو
  if (game.boosting) {
    const t = now * 0.05;
    for (const sx of [-1, 1]) {
      const ex = cx + sx * cw * 0.17, ey = yB - ch * 0.02;
      const len = ch * (0.32 + 0.24 * Math.abs(Math.sin(t * 1.7 + sx)) + Math.random() * 0.14);
      const fg = ctx.createLinearGradient(ex, ey, ex, ey + len);
      fg.addColorStop(0, '#fff6a0'); fg.addColorStop(0.3, '#ffb340'); fg.addColorStop(0.75, '#ff5f1e'); fg.addColorStop(1, 'rgba(255,60,20,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(ex - ch * 0.035, ey); ctx.lineTo(ex + ch * 0.035, ey); ctx.lineTo(ex, ey + len);
      ctx.closePath(); ctx.fill();
      // هسته‌ی آبی
      const bg2 = ctx.createLinearGradient(ex, ey, ex, ey + len * 0.55);
      bg2.addColorStop(0, '#c8f4ff'); bg2.addColorStop(1, 'rgba(60,180,255,0)');
      ctx.fillStyle = bg2;
      ctx.beginPath();
      ctx.moveTo(ex - ch * 0.018, ey); ctx.lineTo(ex + ch * 0.018, ey); ctx.lineTo(ex, ey + len * 0.55);
      ctx.closePath(); ctx.fill();
    }
  }

  // خط برقِ میان کاپوت
  ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(cx, yBelt + ch * 0.02); ctx.lineTo(cx, yB - ch * 0.2); ctx.stroke();

  ctx.restore();

  // خطوط سرعت در لبه‌ها هنگام نیترو
  if (game.boosting) {
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < 12; i++) {
      const side = i % 2 ? 1 : -1;
      const yy = Math.random() * H * 0.72;
      const len = 50 + Math.random() * 130;
      ctx.strokeStyle = `rgba(255,255,255,${0.1 + Math.random() * 0.2})`;
      ctx.lineWidth = 1.5 + Math.random() * 2;
      const x0 = side < 0 ? 0 : W;
      ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x0 - side * len, yy + (Math.random() - 0.5) * 12); ctx.stroke();
    }
    ctx.restore();
  }
}

const visibleSegs = [];
function renderWorld(now) {
  ctx.save();
  if (game.shake > 0) {
    const mag = 15 * (game.shake / 0.65);
    ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
  } else if (game.bump > 0) {
    ctx.translate((Math.random() - 0.5) * 3 * game.bump, (Math.random() - 0.5) * 3 * game.bump);
  }

  renderBackground();

  const baseSegment = findSegment(game.position);
  const basePercent = (game.position % SEG_LEN) / SEG_LEN;
  const playerSegment = findSegment(game.position + PLAYER_Z);
  const playerPercent = ((game.position + PLAYER_Z) % SEG_LEN) / SEG_LEN;
  game.playerY = lerp(playerSegment.p1.world.y, playerSegment.p2.world.y, playerPercent);

  let maxy = H;
  let x = 0, dx = -(baseSegment.curve * basePercent);
  visibleSegs.length = 0;

  for (let n = 0; n < DRAW_DISTANCE; n++) {
    const idx = baseSegment.index + n;
    if (idx >= game.segments.length) break;
    const segment = game.segments[idx];
    segment.fog = exponentialFog(n / DRAW_DISTANCE, game.def.fogDensity);
    segment.clip = maxy;

    project(segment.p1, game.playerX * ROAD_WIDTH - x, game.playerY + CAMERA_HEIGHT, game.position);
    project(segment.p2, game.playerX * ROAD_WIDTH - x - dx, game.playerY + CAMERA_HEIGHT, game.position);
    x += dx; dx += segment.curve;

    if (segment.p1.camera.z <= FOV_DEPTH) continue;
    if (segment.p2.screen.y >= segment.p1.screen.y) continue;
    if (segment.p2.screen.y >= maxy) continue;

    renderSegment(segment);
    maxy = segment.p1.screen.y;
    visibleSegs.push(segment);
  }

  // ماشین‌های ترافیک بر حسب سگمنت
  const carSegs = new Map();
  for (const car of game.cars) {
    if (car.z < game.position) continue;
    const idx = Math.floor(car.z / SEG_LEN);
    if (!carSegs.has(idx)) carSegs.set(idx, []);
    carSegs.get(idx).push(car);
  }
  // سکه‌ها بر حسب سگمنت
  const coinSegs = new Map();
  for (const coin of game.coins) {
    if (coin.taken || coin.z < game.position) continue;
    const idx = Math.floor(coin.z / SEG_LEN);
    if (!coinSegs.has(idx)) coinSegs.set(idx, []);
    coinSegs.get(idx).push(coin);
  }

  // اسپرایت‌ها از دور به نزدیک
  for (let n = visibleSegs.length - 1; n >= 0; n--) {
    const seg = visibleSegs[n];
    const p1 = seg.p1.screen, p2 = seg.p2.screen;
    const scaleAt = t => lerp(p1.scale, p2.scale, t);
    const xAt = t => lerp(p1.x, p2.x, t);
    const yAt = t => lerp(p1.y, p2.y, t);

    const camDist1 = seg.p1.camera.z;
    for (const coin of coinSegs.get(seg.index) || []) {
      const t = (coin.z % SEG_LEN) / SEG_LEN;
      if (coin.z - game.position < 270) continue; // زیر دوربین
      drawCoinSprite(coin, scaleAt(t), xAt(t) + scaleAt(t) * coin.offset * ROAD_WIDTH * (W / 2), yAt(t));
    }
    for (const car of carSegs.get(seg.index) || []) {
      const t = (car.z % SEG_LEN) / SEG_LEN;
      if (car.z - game.position < 250) continue; // روی سرِ بازیکن
      drawCarSprite(car, scaleAt(t), xAt(t) + scaleAt(t) * car.offset * ROAD_WIDTH * (W / 2), yAt(t), seg.clip);
    }
    for (const sprite of seg.sprites) {
      if (sprite.type !== 'arch' && camDist1 < 110) continue; // اسپرایتِ غول‌پیکر
      drawScenerySprite(sprite, p1.scale, p1.x + p1.scale * sprite.offset * ROAD_WIDTH * (W / 2), p1.y, seg.clip);
    }
  }

  drawParticles();
  drawPlayerCar(now);
  drawPopups();
  ctx.restore();
}
function project(p, cameraX, cameraY, cameraZ) {
  p.camera.x = (p.world.x || 0) - cameraX;
  p.camera.y = (p.world.y || 0) - cameraY;
  p.camera.z = (p.world.z || 0) - cameraZ;
  p.screen.scale = FOV_DEPTH / p.camera.z;
  p.screen.x = Math.round(W / 2 + p.screen.scale * p.camera.x * W / 2);
  p.screen.y = Math.round(H / 2 - p.screen.scale * p.camera.y * H / 2);
  p.screen.w = Math.round(p.screen.scale * ROAD_WIDTH * W / 2);
}

/* ───────── ۱۰) HUD و DOM ───────── */
const hud = {
  root: $('#hud'), track: $('#hud-track-name'), score: $('#hud-score'), coins: $('#hud-coins'),
  time: $('#hud-time'), speed: $('#speed-num'), nitroFill: $('#nitro-fill'), nitroWrap: $('#nitro-wrap'),
  fill: $('#progress-fill'), car: $('#progress-car'),
  lastScore: -1, lastCoins: -1, lastSpeed: -1, lastTime: '', lastNitro: -1, lastProg: -1,
};
function updateHUD() {
  const total = Math.floor(game.score + game.coinsTaken * 50 + game.nearMisses * 75);
  if (total !== hud.lastScore) { hud.score.textContent = fmtNum(total); hud.lastScore = total; }
  if (game.coinsTaken !== hud.lastCoins) { hud.coins.textContent = game.coinsTaken; hud.lastCoins = game.coinsTaken; }
  const t = fmtTime(game.raceTime);
  if (t !== hud.lastTime) { hud.time.textContent = t; hud.lastTime = t; }
  const kmh = Math.round((game.speed / MAX_SPEED) * DISPLAY_KMH);
  if (kmh !== hud.lastSpeed) { hud.speed.textContent = kmh; hud.lastSpeed = kmh; }
  const nitro = Math.round(game.nitro);
  if (nitro !== hud.lastNitro) {
    hud.nitroFill.style.width = nitro + '%';
    hud.nitroWrap.classList.toggle('full', nitro >= 99);
    hud.nitroWrap.classList.toggle('boost', game.boosting);
    hud.lastNitro = nitro;
  } else {
    hud.nitroWrap.classList.toggle('boost', game.boosting);
  }
  const prog = clamp(game.position / (game.finishZ || game.trackLength), 0, 1) * 100;
  if (Math.abs(prog - hud.lastProg) > 0.05) {
    hud.fill.style.width = prog + '%';
    hud.car.style.left = (100 - prog) + '%'; // پر می‌شود از راست
    hud.lastProg = prog;
  }
}

const screens = {
  menu: $('#screen-menu'), tracks: $('#screen-tracks'),
  pause: $('#screen-pause'), finish: $('#screen-finish'),
};
function showOnly(name) {
  for (const key of Object.keys(screens)) screens[key].classList.toggle('hidden', key !== name);
  const hudStates = ['countdown', 'race', 'paused', 'finish'];
  hud.root.classList.toggle('hidden', !(name === null && hudStates.includes(game.state)));
}
function showMenu() {
  game.state = 'menu';
  AudioSys.stopEngine();
  hud.root.classList.add('hidden');
  $('#countdown').classList.add('hidden');
  showOnly('menu');
}
function showTracks() {
  game.state = 'tracks';
  AudioSys.stopEngine();
  hud.root.classList.add('hidden');
  $('#countdown').classList.add('hidden');
  // رکوردهای هر مسیر
  $$('.tc-best').forEach(el => {
    const id = el.getAttribute('data-best-for');
    const best = getBest(id);
    el.textContent = best === null ? 'رکورد: —' : `رکورد: ${fmtNum(best)}`;
  });
  showOnly('tracks');
}
function startRace(trackId) {
  const def = TRACKS[trackId];
  if (!def) return;
  resetRace(def);
  game.track = trackId;
  game.state = 'countdown';
  game.countdownT = 3.0; game.lastCount = 99;
  hud.track.textContent = def.name;
  hud.lastScore = -1; hud.lastCoins = -1; hud.lastSpeed = -1; hud.lastTime = ''; hud.lastNitro = -1; hud.lastProg = -1;
  showOnly(null); // فقط HUD
  hud.root.classList.remove('hidden');
  $('#countdown').classList.remove('hidden');
  AudioSys.ensure();
  AudioSys.startEngine();
  AudioSys.click();
}
function pauseRace() {
  if (game.state !== 'race') return;
  game.state = 'paused';
  AudioSys.setEngine(0, false);
  screens.pause.classList.remove('hidden');
}
function resumeRace() {
  if (game.state !== 'paused') return;
  game.state = 'race';
  screens.pause.classList.add('hidden');
  AudioSys.click();
}
function togglePause() {
  if (game.state === 'race') { pauseRace(); AudioSys.click(); }
  else if (game.state === 'paused') resumeRace();
}
function finishRace() {
  game.state = 'finish';
  game.confettiT = 0;
  const def = game.def;
  const base = Math.floor(game.score);
  const coinScore = game.coinsTaken * 50;
  const nearScore = game.nearMisses * 75;
  const timeBonus = Math.max(0, Math.round((def.parTime - game.raceTime) * 20));
  const finalScore = base + coinScore + nearScore + timeBonus;

  const prevBest = getBest(def.id);
  const isRecord = prevBest === null || finalScore > prevBest;
  if (isRecord) setBest(def.id, finalScore);

  $('#stat-time').textContent = fmtTime(game.raceTime);
  $('#stat-coins').textContent = `${game.coinsTaken} ×50 = ${fmtNum(coinScore)}`;
  $('#stat-nearmiss').textContent = `${game.nearMisses} ×75 = ${fmtNum(nearScore)}`;
  $('#stat-bonus').textContent = `+${fmtNum(timeBonus)}`;
  $('#stat-score').textContent = fmtNum(finalScore);
  $('#finish-best').textContent = fmtNum(isRecord ? finalScore : prevBest);
  $('#new-record-badge').classList.toggle('hidden', !isRecord);
  screens.finish.classList.remove('hidden');
  AudioSys.fanfare();
}

/* ───────── ۱۱) ورودی کیبورد ───────── */
const keyMap = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  Space: 'space',
};
window.addEventListener('keydown', e => {
  if (keyMap[e.code] !== undefined) { keys[keyMap[e.code]] = true; e.preventDefault(); }
  switch (e.code) {
    case 'KeyM': {
      const m = AudioSys.toggleMute();
      $('#snd-on').style.display = m ? 'none' : '';
      $('#snd-off').style.display = m ? '' : 'none';
      break;
    }
    case 'KeyP': case 'Escape':
      e.preventDefault();
      togglePause();
      break;
    case 'Enter':
      e.preventDefault();
      if (game.state === 'menu') { AudioSys.click(); showTracks(); }
      else if (game.state === 'tracks') { AudioSys.click(); startRace('city'); }
      else if (game.state === 'finish') { startRace(game.track); }
      else if (game.state === 'paused') resumeRace();
      break;
    case 'Digit1': if (game.state === 'tracks') startRace('city'); break;
    case 'Digit2': if (game.state === 'tracks') startRace('desert'); break;
    case 'Digit3': if (game.state === 'tracks') startRace('mountain'); break;
    case 'KeyR':
      if (game.state === 'finish' || game.state === 'paused') startRace(game.track);
      break;
  }
});
window.addEventListener('keyup', e => { if (keyMap[e.code] !== undefined) keys[keyMap[e.code]] = false; });
window.addEventListener('blur', () => { if (game.state === 'race') pauseRace(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'race') pauseRace(); });

/* ───────── ۱۲) دکمه‌های DOM ───────── */
$('#btn-start').addEventListener('click', () => { AudioSys.ensure(); AudioSys.click(); showTracks(); });
$('#btn-howto').addEventListener('click', () => { AudioSys.click(); $('#howto-panel').classList.toggle('hidden'); });
$('#btn-back-menu').addEventListener('click', () => { AudioSys.click(); showMenu(); });
$$('.track-card').forEach(card => card.addEventListener('click', () => startRace(card.dataset.track)));
$('#pause-btn').addEventListener('click', togglePause);
$('#btn-resume').addEventListener('click', resumeRace);
$('#btn-restart-pause').addEventListener('click', () => startRace(game.track));
$('#btn-menu-pause').addEventListener('click', () => { AudioSys.click(); showMenu(); });
$('#btn-retry').addEventListener('click', () => startRace(game.track));
$('#btn-next').addEventListener('click', () => {
  const i = TRACK_ORDER.indexOf(game.track);
  startRace(TRACK_ORDER[(i + 1) % TRACK_ORDER.length]);
});
$('#btn-menu-finish').addEventListener('click', () => { AudioSys.click(); showMenu(); });
$('#mute-btn').addEventListener('click', () => {
  AudioSys.ensure();
  const m = AudioSys.toggleMute();
  $('#snd-on').style.display = m ? 'none' : '';
  $('#snd-off').style.display = m ? '' : 'none';
});
// وضعیت اولیه‌ی آیکن صدا
if (AudioSys.muted) { $('#snd-on').style.display = 'none'; $('#snd-off').style.display = ''; }

/* ───────── ۱۳) حلقه‌ی اصلی ───────── */
let lastTime = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (!lastTime) lastTime = now;
  const dt = Math.min((now - lastTime) / 1000, 1 / 20);
  lastTime = now;

  switch (game.state) {
    case 'countdown':
      updateCountdown(dt);
      renderWorld(now);
      updateHUD();
      break;
    case 'race':
      updateRace(dt);
      renderWorld(now);
      updateHUD();
      break;
    case 'finish':
      updateFinish(dt);
      renderWorld(now);
      updateHUD();
      break;
    case 'paused':
      // فریز — رندر نمی‌کنیم تا آخرین فریم بماند
      break;
    default:
      break;
  }
}
requestAnimationFrame(frame);
showMenu();
