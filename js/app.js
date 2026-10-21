import { h, toast } from './ui.js';
import { sessions, frames } from './db.js';
import { RecordView } from './views/record.js';
import { HistoryView } from './views/history.js';
import { SessionView } from './views/session.js';
import { ProfileView } from './views/profile.js';
import { FriendsView } from './views/friends.js';

const ROUTES = [
  { pattern: /^#\/record$/, tab: 'record', view: RecordView },
  { pattern: /^#\/history$/, tab: 'history', view: HistoryView },
  { pattern: /^#\/s\/([\w-]+)(?:\/(new))?$/, tab: 'history', view: SessionView },
  { pattern: /^#\/friends$/, tab: 'friends', view: FriendsView },
  { pattern: /^#\/add\/([\w-]+)$/, tab: 'friends', view: FriendsView },
  { pattern: /^#\/profile$/, tab: 'profile', view: ProfileView },
];

const viewEl = document.getElementById('view');
const tabsEl = document.getElementById('tabs');
let current = null;
let currentHash = null;
let renderToken = 0;

const ctx = {
  navigate(hash) {
    location.hash = hash;
  },
  replaceHash(hash) {
    history.replaceState(null, '', hash);
    currentHash = hash;
  },
  refresh() {
    render(currentHash);
  },
  setRecording(on) {
    document.body.classList.toggle('recording', on);
  },
};

function onHashChange() {
  const hash = location.hash || '#/record';
  if (hash === currentHash) return;
  if (current?.canLeave && !current.canLeave()) {
    history.replaceState(null, '', currentHash);
    toast('Hold the record button to finish your session first.');
    return;
  }
  render(hash);
}

async function render(hash) {
  let route = ROUTES.find((r) => r.pattern.test(hash));
  if (!route) {
    route = ROUTES[0];
    hash = '#/record';
    history.replaceState(null, '', hash);
  }
  const params = hash.match(route.pattern).slice(1);
  current?.destroy?.();
  current = null;
  currentHash = hash;
  const token = ++renderToken;

  const root = h('div', { class: 'view-root' });
  viewEl.replaceChildren(root);
  document.body.dataset.route = route.tab;
  for (const a of tabsEl.querySelectorAll('a')) {
    if (a.dataset.tab === route.tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  window.scrollTo(0, 0);

  try {
    const instance = await route.view(root, { ...ctx, params });
    if (token !== renderToken) {
      instance?.destroy?.();
      return;
    }
    current = instance ?? null;
  } catch (err) {
    console.error(err);
    if (token !== renderToken) return;
    root.replaceChildren(h('section', { class: 'page' },
      h('div', { class: 'empty' },
        h('p', { class: 'empty-title' }, 'Something went wrong.'),
        h('p', {}, err?.message || String(err)),
        h('button', { class: 'btn', onClick: () => location.reload() }, 'Reload'))));
  }
}

// A session still marked "recording" at launch means the app was closed or
// crashed mid-session. Its frames are already saved, so finish it.
async function recoverUnfinished() {
  for (const s of await sessions.all()) {
    if (s.status !== 'recording') continue;
    if (s.duration < 5000) {
      await sessions.delete(s.id);
      continue;
    }
    const seqs = await frames.seqs(s.id);
    const cover = seqs.length ? await frames.get(s.id, seqs[seqs.length - 1]) : null;
    await sessions.put({ ...s, status: 'done', recovered: true, frameCount: seqs.length, cover });
    toast('Recovered a session that was interrupted.');
  }
}

async function boot() {
  try {
    await recoverUnfinished();
  } catch (err) {
    console.warn('Recovery skipped', err);
  }
  window.addEventListener('hashchange', onHashChange);
  onHashChange();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
