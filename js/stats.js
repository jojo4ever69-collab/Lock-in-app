// Aggregations over finished sessions.

import { addDays, dayKey, daysBetween, parseDayKey, startOfDay, startOfWeek } from './ui.js';

export function totals(list) {
  let total = 0;
  let longest = 0;
  for (const s of list) {
    total += s.duration;
    longest = Math.max(longest, s.duration);
  }
  return { count: list.length, total, longest };
}

// Map of 'YYYY-MM-DD' -> focus ms, keyed by the day each session started.
export function byDay(list) {
  const days = new Map();
  for (const s of list) {
    const key = dayKey(s.startedAt);
    days.set(key, (days.get(key) ?? 0) + s.duration);
  }
  return days;
}

export function periodBounds(kind, now = new Date()) {
  const today = startOfDay(now);
  if (kind === 'week') {
    const start = startOfWeek(today);
    return { start, end: addDays(start, 7), prevStart: addDays(start, -7) };
  }
  if (kind === 'month') {
    const y = today.getFullYear();
    const m = today.getMonth();
    return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1), prevStart: new Date(y, m - 1, 1) };
  }
  return null;
}

// Summary for 'week' | 'month' | 'all'. `delta` compares against the same
// stretch of the previous period (Oct 1–21 vs Sep 1–21), or is null.
export function periodSummary(list, kind, now = new Date()) {
  if (kind === 'all') {
    const t = totals(list);
    const first = list.reduce((min, s) => Math.min(min, s.startedAt), Infinity);
    const days = first === Infinity ? 1 : daysBetween(first, now) + 1;
    return { ...t, dailyAvg: t.total / days, delta: null };
  }
  const { start, end, prevStart } = periodBounds(kind, now);
  const elapsedDays = daysBetween(start, now) + 1;
  const prevEnd = Math.min(+addDays(prevStart, elapsedDays), +start);
  const cur = totals(list.filter((s) => s.startedAt >= +start && s.startedAt < +end));
  const prev = totals(list.filter((s) => s.startedAt >= +prevStart && s.startedAt < prevEnd));
  return {
    ...cur,
    dailyAvg: cur.total / elapsedDays,
    delta: prev.total ? (cur.total - prev.total) / prev.total : null,
    hadPrevious: prev.count > 0,
  };
}

export function streaks(list, now = new Date()) {
  const days = byDay(list);
  let current = 0;
  let cursor = startOfDay(now);
  if (!days.has(dayKey(cursor))) cursor = addDays(cursor, -1);
  while (days.has(dayKey(cursor))) {
    current++;
    cursor = addDays(cursor, -1);
  }
  let best = 0;
  let run = 0;
  let prev = null;
  for (const key of [...days.keys()].sort()) {
    const day = parseDayKey(key);
    run = prev && daysBetween(prev, day) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = day;
  }
  return { current, best };
}

// Heat level 0–4 for a day's focus time.
export function level(ms) {
  const min = ms / 60000;
  if (min <= 0) return 0;
  if (min < 30) return 1;
  if (min < 60) return 2;
  if (min < 120) return 3;
  return 4;
}

// Minutes per category per day for one person, as a Map of dayKey -> { category: minutes }.
export function minutesByDayAndCategory(list) {
  const days = new Map();
  for (const s of list) {
    const key = dayKey(s.startedAt);
    const rec = days.get(key) ?? {};
    rec[s.category] = (rec[s.category] ?? 0) + s.duration / 60000;
    days.set(key, rec);
  }
  return days;
}
