// Profile, settings, categories and friends, kept in the kv store.

import { kv } from './db.js';

export const CATEGORY_COLORS = ['#e6c35c', '#e77fa8', '#6fa8e6', '#86cf8a', '#a98be6', '#e8955a', '#5ccfc4', '#d9d4c7'];
const DEFAULT_CATEGORIES = ['Studying', 'Coding', 'Reading', 'Writing'];

const DEFAULT_SETTINGS = {
  goalMin: 25,          // 0 means no time limit
  quality: 'standard',  // 'saver' | 'standard'
  facing: 'environment',
  category: null,
};

export function randomId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function getProfile() {
  let profile = await kv.get('profile');
  if (!profile) {
    profile = { uid: randomId(), name: '', handle: '', bio: '', avatar: null, hue: Math.floor(Math.random() * 360) };
    await kv.set('profile', profile);
  }
  return profile;
}

export function saveProfile(profile) {
  return kv.set('profile', profile);
}

export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(await kv.get('settings')) };
}

export async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await kv.set('settings', next);
  return next;
}

export async function getCategories() {
  let categories = await kv.get('categories');
  if (!categories) {
    categories = DEFAULT_CATEGORIES.map((name, i) => ({ name, color: CATEGORY_COLORS[i] }));
    await kv.set('categories', categories);
  }
  return categories;
}

export async function addCategory(name) {
  const categories = await getCategories();
  const clean = name.trim().slice(0, 30);
  if (!clean) return categories;
  if (!categories.some((c) => c.name.toLowerCase() === clean.toLowerCase())) {
    categories.push({ name: clean, color: CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length] });
    await kv.set('categories', categories);
  }
  return categories;
}

export function colorFor(categories, name) {
  return categories.find((c) => c.name === name)?.color ?? CATEGORY_COLORS[CATEGORY_COLORS.length - 1];
}

export async function getFriends() {
  return (await kv.get('friends')) ?? [];
}

export function saveFriends(friends) {
  return kv.set('friends', friends);
}
