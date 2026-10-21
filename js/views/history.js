import { h, icon, fmtDuration, fmtStamp, fmtDayLabel, dayKey } from '../ui.js';
import { sessions } from '../db.js';
import { getCategories, colorFor } from '../store.js';

export async function HistoryView(root) {
  const [list, categories] = await Promise.all([sessions.done(), getCategories()]);
  const urls = [];

  const page = h('section', { class: 'page' },
    h('header', { class: 'page-head' },
      h('h1', { class: 'page-title' }, 'History', h('span', { class: 'dot' }, '.')),
      list.length > 0 && h('span', { class: 'mono' }, `${list.length} ${list.length === 1 ? 'session' : 'sessions'}`)));

  if (!list.length) {
    page.append(h('div', { class: 'empty' },
      h('p', { class: 'empty-title' }, 'No sessions yet.'),
      h('p', {}, 'Prop your phone up, hit record, and get to work. Your timelapses land here.'),
      h('a', { class: 'btn primary', href: '#/record' }, 'Record a session')));
  }

  let day = null;
  let group = null;
  for (const s of list) {
    if (dayKey(s.startedAt) !== day) {
      day = dayKey(s.startedAt);
      group = h('div', { class: 'day-group' }, h('h2', { class: 'mono day-label' }, fmtDayLabel(s.startedAt)));
      page.append(group);
    }
    group.append(card(s));
  }

  root.append(page);

  function card(s) {
    let cover;
    if (s.cover) {
      const url = URL.createObjectURL(s.cover);
      urls.push(url);
      cover = h('img', { src: url, alt: '', loading: 'lazy', decoding: 'async' });
    } else {
      cover = h('div', { class: 'cover-empty' }, icon('film', 28));
    }
    return h('a', { class: 'session-card', href: `#/s/${s.id}` },
      h('div', { class: 'card-cover' },
        cover,
        h('div', { class: 'card-overlay' },
          h('div', { class: 'card-dur' }, fmtDuration(s.duration)),
          h('div', { class: 'mono' }, fmtStamp(s.startedAt))),
        s.frameCount > 1 && h('span', { class: 'card-badge mono' }, icon('play', 12), 'Timelapse')),
      h('div', { class: 'card-meta' },
        h('span', { class: 'cat' }, h('i', { class: 'swatch', style: { background: colorFor(categories, s.category) } }), s.category),
        s.note && h('span', { class: 'card-note' }, s.note),
        s.distractions > 0 && h('span', { class: 'mono card-away' }, `Left app ${s.distractions}×`)));
  }

  return {
    destroy() {
      urls.forEach((u) => URL.revokeObjectURL(u));
    },
  };
}
