// Sample data for previewing the app: about four months of made-up
// sessions with painted desk-scene covers, three of them with a playable
// timelapse, plus three sample friends. Everything is flagged `sample`
// so it can be removed without touching real data.

import { sessions, frames } from './db.js';
import { getCategories, getFriends, saveFriends } from './store.js';
import { addDays, dayKey, startOfDay, startOfWeek } from './ui.js';
import { LINK_DAYS } from './friends.js';

const W = 540;
const H = 720;

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weighted(items, weights, rand) {
  let r = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function makeLook(rand) {
  const two = rand() < 0.6;
  return {
    hue: 200 + rand() * 40,
    night: rand() < 0.5,
    lamp: rand() < 0.7 ? 0.15 + rand() * 0.7 : null,
    window: rand() < 0.5 ? 0.05 + rand() * 0.6 : null,
    monitors: two
      ? [{ x: 0.1, y: 0.3, w: 0.4, warm: rand() < 0.5 }, { x: 0.53, y: 0.27, w: 0.38, warm: rand() < 0.3 }]
      : [{ x: 0.25 + rand() * 0.1, y: 0.28, w: 0.46, warm: rand() < 0.5 }],
    seed: Math.floor(rand() * 1000),
  };
}

const fract = (v) => v - Math.floor(v);

// One frame of a dim desk scene; t runs 0→1 across the session.
function paint(ctx, look, t) {
  const base = look.night ? 8 : 15;
  const wall = ctx.createLinearGradient(0, 0, 0, H);
  wall.addColorStop(0, `hsl(${look.hue} 16% ${base + 5}%)`);
  wall.addColorStop(1, `hsl(${look.hue} 12% ${base - 3}%)`);
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, W, H);

  if (look.window != null) {
    const dusk = Math.min(1, t * 1.3);
    const wx = look.window * W;
    ctx.fillStyle = look.night
      ? `hsl(225 30% ${12 - dusk * 4}%)`
      : `hsl(${205 - dusk * 25} ${45 - dusk * 20}% ${66 - dusk * 42}%)`;
    ctx.fillRect(wx, H * 0.06, W * 0.3, H * 0.28);
    ctx.fillStyle = `hsl(${look.hue} 10% 7%)`;
    ctx.fillRect(wx + W * 0.145, H * 0.06, W * 0.012, H * 0.28);
    ctx.fillRect(wx, H * 0.19, W * 0.3, H * 0.008);
  }

  if (look.lamp != null) {
    const flicker = 0.32 + Math.sin(t * 90) * 0.015;
    const g = ctx.createRadialGradient(look.lamp * W, H * 0.5, 4, look.lamp * W, H * 0.5, W * 0.55);
    g.addColorStop(0, `rgba(255, 196, 120, ${flicker})`);
    g.addColorStop(1, 'rgba(255, 196, 120, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.fillStyle = `hsl(28 20% ${look.night ? 9 : 13}%)`;
  ctx.fillRect(0, H * 0.64, W, H * 0.36);

  look.monitors.forEach((m, mi) => {
    const x = m.x * W;
    const y = m.y * H;
    const w = m.w * W;
    const h = w * 0.6;
    ctx.fillStyle = '#09090b';
    ctx.fillRect(x + w / 2 - 4, y + h, 8, H * 0.64 - y - h);
    ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
    const screen = ctx.createLinearGradient(x, y, x, y + h);
    screen.addColorStop(0, m.warm ? '#f0d8a8' : '#a3bad9');
    screen.addColorStop(1, m.warm ? '#cfae78' : '#6d84a8');
    ctx.fillStyle = screen;
    ctx.fillRect(x, y, w, h);
    const glow = ctx.createRadialGradient(x + w / 2, y + h / 2, 10, x + w / 2, y + h / 2, w);
    glow.addColorStop(0, m.warm ? 'rgba(240, 210, 150, 0.16)' : 'rgba(150, 180, 230, 0.16)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    // lines of "text" that scroll as the session goes on
    ctx.fillStyle = m.warm ? 'rgba(70, 45, 10, 0.5)' : 'rgba(15, 25, 50, 0.55)';
    const rows = 10;
    const step = Math.floor(t * 60 * (mi + 1));
    for (let r = 0; r < rows; r++) {
      const len = 0.25 + 0.65 * fract(Math.sin((r + step + look.seed) * 12.9898) * 43758.5453);
      ctx.fillRect(x + w * 0.07, y + h * 0.08 + r * (h * 0.84 / rows), w * 0.86 * len, Math.max(2, h * 0.035));
    }
  });

  // someone working, hood up, shifting a little
  const sway = Math.sin(t * 47) * W * 0.012 + Math.sin(t * 11) * W * 0.03;
  const lean = Math.sin(t * 23) * H * 0.01;
  const px = W * 0.5 + sway;
  ctx.fillStyle = '#111113';
  ctx.beginPath();
  ctx.ellipse(px, H * 0.95, W * 0.3, H * 0.27, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(px, H * 0.6 + lean, W * 0.115, H * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.beginPath();
  ctx.ellipse(px - W * 0.04, H * 0.56 + lean, W * 0.05, H * 0.05, -0.4, 0, Math.PI * 2);
  ctx.fill();
}

function render(look, t) {
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  paint(canvas.getContext('2d'), look, t);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.72));
}

const NOTES = ['problem set 4', 'finally fixed the auth bug', 'ch. 7 + flashcards', 'essay draft', 'reading for seminar', 'leetcode grind', 'lab report', 'thesis lit review', 'so much to do', 'midterm prep'];

export async function loadSampleData() {
  const rand = rng(2026);
  const names = (await getCategories()).map((c) => c.name);
  const weights = names.map((_, i) => [0.42, 0.3, 0.16, 0.12][i] ?? 0.08);
  const looks = Array.from({ length: 6 }, () => makeLook(rand));
  const covers = await Promise.all(looks.map((look) => render(look, 0.8)));
  const today = startOfDay(new Date());
  const list = [];

  for (let ago = 120; ago >= 0; ago--) {
    const day = addDays(today, -ago);
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const busier = 0.55 + 0.45 * (1 - ago / 120);
    if (rand() > (weekend ? 0.5 : 0.82) * busier) continue;
    const count = 1 + (rand() < 0.45 ? 1 : 0) + (rand() < 0.15 ? 1 : 0);
    let hour = 9 + rand() * 5;
    for (let k = 0; k < count && hour < 23; k++) {
      const minutes = 18 + Math.pow(rand(), 1.5) * 140;
      const start = new Date(day);
      start.setMinutes(Math.round(hour * 60));
      const distractions = rand() < 0.3 ? 1 + Math.floor(rand() * 3) : 0;
      const awayMs = distractions * Math.round(40000 + rand() * 120000);
      if (+start + minutes * 60000 + awayMs > Date.now()) break;
      const lookIndex = Math.floor(rand() * looks.length);
      list.push({
        id: `sample-${dayKey(day)}-${k}`,
        sample: true,
        status: 'done',
        startedAt: +start,
        endedAt: Math.round(+start + minutes * 60000 + awayMs),
        duration: Math.round(minutes * 60000),
        awayMs,
        distractions,
        category: weighted(names, weights, rand),
        goalMs: [25, 50, 90, 0][Math.floor(rand() * 4)] * 60000,
        note: rand() < 0.45 ? NOTES[Math.floor(rand() * NOTES.length)] : '',
        frameCount: 0,
        interval: 0,
        width: W,
        height: H,
        cover: covers[lookIndex],
        look: lookIndex,
      });
      hour += minutes / 60 + 0.4 + rand() * 3;
    }
  }

  // The three most recent sessions get a real, playable timelapse.
  const FRAMES = 150;
  for (const s of list.slice(-3)) {
    const look = looks[s.look];
    let last = null;
    for (let i = 0; i < FRAMES; i++) {
      last = await render(look, i / (FRAMES - 1));
      await frames.put(s.id, i, last);
    }
    s.frameCount = FRAMES;
    s.interval = Math.round(s.duration / FRAMES);
    s.cover = last;
  }
  for (const s of list) {
    delete s.look;
    await sessions.put(s);
  }

  const friends = (await getFriends()).filter((f) => !f.sample);
  friends.push(
    sampleFriend(rand, 'sample-maya', 'Maya', 'maya.studies', 330, [['Orgo', '#e77fa8'], ['MCAT prep', '#6fa8e6']], 1.1),
    sampleFriend(rand, 'sample-theo', 'Theo', 'theo', 150, [['Startup', '#86cf8a'], ['Design', '#a98be6'], ['Reading', '#e6c35c']], 0.8),
    sampleFriend(rand, 'sample-priya', 'Priya', 'priya.k', 25, [['Thesis', '#e8955a'], ['Python', '#5ccfc4']], 0.6),
  );
  await saveFriends(friends);
}

function sampleFriend(rand, u, n, h, hue, c, intensity) {
  const start = addDays(startOfWeek(new Date()), -(LINK_DAYS - 7));
  const today = startOfDay(new Date());
  const partOfToday = Math.min(1, (Date.now() - +today) / (16 * 3600000));
  const d = Array.from({ length: LINK_DAYS }, (_, i) => {
    const day = addDays(start, i);
    if (day > today) return [];
    const scale = +day === +today ? partOfToday : 1;
    return c.map(() => (rand() < 0.6 ? Math.round(rand() * 150 * intensity * scale) : 0));
  });
  const recent = d.flat().reduce((a, b) => a + b, 0);
  return {
    v: 1, u, n, h, hue,
    t: Date.now() - Math.round(rand() * 20) * 3600000,
    s: dayKey(start),
    c,
    d,
    tm: recent + Math.round(3000 + rand() * 9000),
    sc: Math.round(recent / 55) + Math.round(40 + rand() * 120),
    sample: true,
  };
}

export async function removeSampleData() {
  for (const s of await sessions.all()) {
    if (s.sample) await sessions.delete(s.id);
  }
  await saveFriends((await getFriends()).filter((f) => !f.sample));
}

export async function hasSampleData() {
  const [all, friends] = await Promise.all([sessions.all(), getFriends()]);
  return all.some((s) => s.sample) || friends.some((f) => f.sample);
}
