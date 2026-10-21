// Friends without a server: your "friend link" carries your last four weeks
// of focus minutes per category. Opening a friend's link adds them, and
// opening a newer link from the same person replaces their old numbers.

import { addDays, dayKey, daysBetween, parseDayKey, startOfDay, startOfWeek } from './ui.js';
import { colorFor } from './store.js';
import { minutesByDayAndCategory, totals } from './stats.js';

export const LINK_DAYS = 28;

export function buildPayload(profile, list, categories, now = new Date()) {
  const start = addDays(startOfWeek(now), -(LINK_DAYS - 7));
  const cats = [];
  const index = new Map();
  const days = Array.from({ length: LINK_DAYS }, () => []);
  for (const s of list) {
    const i = daysBetween(start, s.startedAt);
    if (i < 0 || i >= LINK_DAYS) continue;
    if (!index.has(s.category)) {
      index.set(s.category, cats.length);
      cats.push([s.category, colorFor(categories, s.category)]);
    }
    const ci = index.get(s.category);
    days[i][ci] = (days[i][ci] ?? 0) + s.duration / 60000;
  }
  const all = totals(list);
  return {
    v: 1,
    u: profile.uid,
    n: profile.name || 'Friend',
    h: profile.handle || '',
    hue: profile.hue,
    t: Date.now(),
    s: dayKey(start),
    c: cats,
    d: days.map((row) => Array.from(row, (m) => Math.round(m ?? 0))),
    tm: Math.round(all.total / 60000),
    sc: all.count,
  };
}

function toBase64Url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodePayload(payload) {
  const json = new TextEncoder().encode(JSON.stringify(payload));
  if ('CompressionStream' in window) {
    try {
      return 'z' + toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
    } catch {
      // fall through to the uncompressed form
    }
  }
  return 'j' + toBase64Url(json);
}

export async function decodePayload(code) {
  const kind = code[0];
  let bytes = fromBase64Url(code.slice(1));
  if (kind === 'z') {
    if (!('DecompressionStream' in window)) throw new Error('Update your browser to open this link.');
    bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  } else if (kind !== 'j') {
    throw new Error('That isn’t a Lock In friend link.');
  }
  return validate(JSON.parse(new TextDecoder().decode(bytes)));
}

// Pull the code out of a pasted link, or accept a bare code.
export function codeFromText(text) {
  const trimmed = text.trim();
  const match = trimmed.match(/#\/add\/([\w-]+)/);
  if (match) return match[1];
  return /^[zj][\w-]+$/.test(trimmed) ? trimmed : null;
}

const COLOR = /^#[0-9a-f]{6}$/i;
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v, max) => (Number.isFinite(v) ? Math.min(Math.max(0, v), max) : 0);

// Friend links are untrusted input: keep only well-formed fields.
function validate(p) {
  if (!p || p.v !== 1 || typeof p.u !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.s)) {
    throw new Error('That friend link is damaged or out of date.');
  }
  const cats = (Array.isArray(p.c) ? p.c : []).slice(0, 12).map(([name, color]) => [
    str(name, 30) || 'Focus',
    COLOR.test(color) ? color : '#d9d4c7',
  ]);
  const days = (Array.isArray(p.d) ? p.d : []).slice(0, LINK_DAYS).map((row) =>
    (Array.isArray(row) ? row : []).slice(0, cats.length).map((m) => num(m, 1440)));
  return {
    v: 1,
    u: str(p.u, 64),
    n: str(p.n, 40) || 'Friend',
    h: str(p.h, 30).replace(/[^\w.]/g, ''),
    hue: num(p.hue, 360),
    t: num(p.t, Date.now() + 864e5),
    s: p.s,
    c: cats,
    d: days,
    tm: num(p.tm, 1e8),
    sc: num(p.sc, 1e6),
  };
}

// Shape used by the leaderboard for both you and your friends.
export function personFromPayload(p) {
  const start = parseDayKey(p.s);
  const days = new Map();
  p.d.forEach((row, i) => {
    const rec = {};
    row.forEach((min, ci) => {
      if (min > 0) rec[p.c[ci][0]] = min;
    });
    if (Object.keys(rec).length) days.set(dayKey(addDays(start, i)), rec);
  });
  return {
    uid: p.u,
    name: p.n,
    handle: p.h,
    hue: p.hue,
    colors: Object.fromEntries(p.c),
    days,
    coversFrom: start,
    coversTo: addDays(start, LINK_DAYS),
    updatedAt: p.t,
    sample: !!p.sample,
  };
}

export function personFromSessions(profile, list, categories) {
  return {
    uid: profile.uid,
    name: profile.name || 'You',
    handle: profile.handle,
    hue: profile.hue,
    avatar: profile.avatar,
    colors: Object.fromEntries(categories.map((c) => [c.name, c.color])),
    days: minutesByDayAndCategory(list),
    you: true,
  };
}

// Minutes per category and cumulative minutes per day for one week.
export function personWeek(person, weekStart, now = new Date()) {
  const byCategory = {};
  const cumulative = [];
  let running = 0;
  const today = startOfDay(now);
  for (let i = 0; i < 7; i++) {
    const day = addDays(weekStart, i);
    const rec = person.days.get(dayKey(day)) ?? {};
    for (const [cat, min] of Object.entries(rec)) {
      byCategory[cat] = (byCategory[cat] ?? 0) + min;
      running += min;
    }
    if (day <= today) cumulative.push(running);
  }
  return { total: running, byCategory, cumulative };
}

export function friendLink(code) {
  return `${location.origin}${location.pathname}#/add/${code}`;
}
