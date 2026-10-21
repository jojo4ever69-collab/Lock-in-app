import { h, icon, avatarEl, fmtDuration, fmtMonth, fmtBytes, dayKey, addDays, startOfDay, startOfWeek, WEEKDAYS, toast, openSheet, confirmSheet } from '../ui.js';
import { sessions } from '../db.js';
import { getProfile, saveProfile, getCategories, getSettings, saveSettings } from '../store.js';
import { totals, periodSummary, byDay, level, streaks } from '../stats.js';
import { loadSampleData, removeSampleData, hasSampleData } from '../demo.js';

const PERIODS = { week: 'This Week', month: 'This Month', all: 'All Time' };
const PERIOD_ORDER = ['week', 'month', 'all'];
const HEAT_WEEKS = 20;

export async function ProfileView(root, { refresh }) {
  const [profile, list, categories, settings] = await Promise.all([getProfile(), sessions.done(), getCategories(), getSettings()]);
  let tab = 'stats';
  let category = null;
  let period = 'month';
  const urls = [];
  const all = totals(list);

  const tabStats = h('button', { role: 'tab', 'aria-label': 'Stats', onClick: () => setTab('stats') }, icon('trend'));
  const tabGrid = h('button', { role: 'tab', 'aria-label': 'All sessions', onClick: () => setTab('grid') }, icon('grid'));
  const body = h('div', { class: 'profile-body', role: 'tabpanel' });

  root.append(h('section', { class: 'page profile' },
    h('header', { class: 'profile-head' },
      h('div', { class: 'who' },
        avatarEl(profile, 60),
        h('div', { class: 'who-text' },
          h('h1', { class: 'profile-name' }, profile.name || 'Your name'),
          h('div', { class: 'mono' }, profile.handle ? `@${profile.handle}` : 'Add your name and photo')),
        h('button', { class: 'round-btn', 'aria-label': 'Profile and settings', onClick: openSettings }, icon('sliders'))),
      profile.bio && h('p', { class: 'bio' }, profile.bio),
      h('dl', { class: 'stat-row' },
        stat('Sessions', all.count),
        stat('Longest', fmtDuration(all.longest)),
        stat('Total time', fmtDuration(all.total)))),
    h('div', { class: 'seg', role: 'tablist' }, tabStats, tabGrid),
    body));

  setTab('stats');

  function setTab(next) {
    tab = next;
    tabStats.setAttribute('aria-selected', String(tab === 'stats'));
    tabGrid.setAttribute('aria-selected', String(tab === 'grid'));
    body.replaceChildren(...(tab === 'stats' ? statsTab() : gridTab()));
  }

  // ---- Stats tab --------------------------------------------------------

  function statsTab() {
    if (!list.length) return [emptyState()];
    const used = new Set(list.map((s) => s.category));
    const filtered = category ? list.filter((s) => s.category === category) : list;
    const sum = periodSummary(filtered, period);
    const streak = streaks(filtered);
    const chip = (label, value, color) => h('button', {
      class: 'chip',
      'aria-pressed': String(category === value),
      onClick: () => {
        category = value;
        setTab('stats');
      },
    }, color && h('i', { class: 'swatch', style: { background: color } }), label);

    return [
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by category' },
        chip('All', null),
        ...categories.filter((c) => used.has(c.name)).map((c) => chip(c.name, c.name, c.color))),
      h('dl', { class: 'stat-row big' },
        stat('Sessions', sum.count),
        stat('Total time', fmtDuration(sum.total)),
        stat('Daily average', fmtDuration(sum.dailyAvg))),
      h('div', { class: 'period-row' },
        h('button', {
          class: 'period-btn',
          'aria-label': `Showing ${PERIODS[period]}. Change period`,
          onClick: () => {
            period = PERIOD_ORDER[(PERIOD_ORDER.indexOf(period) + 1) % PERIOD_ORDER.length];
            setTab('stats');
          },
        }, PERIODS[period], icon('next', 14)),
        deltaLine(sum)),
      period === 'week' ? weekBars(filtered) : period === 'month' ? monthCalendar(filtered) : heatGrid(filtered),
      h('p', { class: 'mono streak' }, `Current streak ${streak.current} ${streak.current === 1 ? 'day' : 'days'} · Best ${streak.best}`),
    ];
  }

  function deltaLine(sum) {
    if (period === 'all') return null;
    const last = period === 'week' ? 'last week' : 'last month';
    if (sum.delta == null) {
      return h('span', { class: 'delta none' }, sum.count ? `Nothing ${last} to compare with` : `No sessions yet ${period === 'week' ? 'this week' : 'this month'}`);
    }
    const up = sum.delta >= 0;
    return h('span', { class: `delta ${up ? 'up' : 'down'}` },
      icon('trend', 16),
      `${Math.round(Math.abs(sum.delta) * 100)}% ${up ? 'more' : 'less'} than this time ${last}`);
  }

  function weekBars(filtered) {
    const start = startOfWeek(new Date());
    const today = startOfDay(new Date());
    const days = byDay(filtered);
    const values = Array.from({ length: 7 }, (_, i) => days.get(dayKey(addDays(start, i))) ?? 0);
    const max = Math.max(3600000, ...values);
    return h('div', { class: 'bars', role: 'img', 'aria-label': 'Focus time per day this week' }, values.map((ms, i) => {
      const date = addDays(start, i);
      const cls = ['bar-col', +date === +today && 'today', date > today && 'future'].filter(Boolean).join(' ');
      return h('div', { class: cls },
        h('span', { class: 'mono bar-val' }, ms ? compact(ms) : ''),
        h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: { height: `${(ms / max) * 100}%` } })),
        h('span', { class: 'mono' }, WEEKDAYS[i].charAt(0)));
    }));
  }

  function monthCalendar(filtered) {
    const now = new Date();
    const today = startOfDay(now);
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const length = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const days = byDay(filtered);
    const cells = WEEKDAYS.map((d) => h('span', { class: 'mono cal-head', 'aria-hidden': 'true' }, d.charAt(0)));
    for (let i = 0; i < first.getDay(); i++) cells.push(h('span'));
    for (let d = 1; d <= length; d++) {
      const date = new Date(now.getFullYear(), now.getMonth(), d);
      const ms = days.get(dayKey(date)) ?? 0;
      const cls = ['cal-day', `lv${level(ms)}`, +date === +today && 'today', date > today && 'future'].filter(Boolean).join(' ');
      cells.push(h('span', { class: cls, title: ms ? fmtDuration(ms) : null }, d));
    }
    return h('div', { class: 'viz' },
      h('div', { class: 'mono viz-title' }, fmtMonth(now)),
      h('div', { class: 'calendar' }, cells),
      legend());
  }

  function heatGrid(filtered) {
    const today = startOfDay(new Date());
    const start = addDays(startOfWeek(today), -7 * (HEAT_WEEKS - 1));
    const days = byDay(filtered);
    const cells = [];
    for (let i = 0; i < HEAT_WEEKS * 7; i++) {
      const date = addDays(start, i);
      const ms = days.get(dayKey(date)) ?? 0;
      cells.push(h('span', { class: `heat lv${level(ms)}${date > today ? ' future' : ''}`, title: `${dayKey(date)}${ms ? ' · ' + fmtDuration(ms) : ''}` }));
    }
    return h('div', { class: 'viz' },
      h('div', { class: 'mono viz-title' }, `Last ${HEAT_WEEKS} weeks`),
      h('div', { class: 'heatgrid' }, cells),
      legend());
  }

  function legend() {
    return h('div', { class: 'legend mono', 'aria-hidden': 'true' },
      'Less', [0, 1, 2, 3, 4].map((l) => h('i', { class: `lv${l}` })), 'More');
  }

  // ---- Grid tab ---------------------------------------------------------

  function gridTab() {
    if (!list.length) return [emptyState()];
    return [h('div', { class: 'cover-grid' }, list.map((s) => {
      let media = h('span', { class: 'cover-empty' }, icon('film', 20));
      if (s.cover) {
        const url = URL.createObjectURL(s.cover);
        urls.push(url);
        media = h('img', { src: url, alt: '', loading: 'lazy', decoding: 'async' });
      }
      return h('a', { class: 'cover-tile', href: `#/s/${s.id}`, 'aria-label': `${s.category}, ${fmtDuration(s.duration)}` },
        media, h('span', { class: 'mono tile-dur' }, fmtDuration(s.duration)));
    }))];
  }

  function emptyState() {
    return h('div', { class: 'empty' },
      h('p', { class: 'empty-title' }, 'Your stats start here.'),
      h('p', {}, 'Record a session and your calendar, streaks and totals fill in. Want a preview first? Load sample data from the settings button up top.'),
      h('a', { class: 'btn primary', href: '#/record' }, 'Record a session'));
  }

  // ---- Settings sheet ---------------------------------------------------

  async function openSettings() {
    const hasSample = await hasSampleData();
    openSheet((close) => {
      let avatar = profile.avatar;
      let quality = settings.quality;
      const avatarSlot = h('span', {}, avatarEl({ ...profile, avatar }, 56));
      const fileInput = h('input', { type: 'file', accept: 'image/*', hidden: true });
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        try {
          avatar = await squareThumb(file, 256);
          avatarSlot.replaceChildren(avatarEl({ ...profile, avatar }, 56));
        } catch {
          toast('That photo couldn’t be opened.');
        }
      });
      const name = h('input', { id: 'p-name', class: 'field', maxLength: 40, value: profile.name, autocomplete: 'nickname', placeholder: 'What friends call you' });
      const handle = h('input', { id: 'p-handle', class: 'field', maxLength: 30, value: profile.handle, autocapitalize: 'none', autocomplete: 'off', spellcheck: 'false', placeholder: 'handle' });
      const bio = h('input', { id: 'p-bio', class: 'field', maxLength: 80, value: profile.bio, placeholder: 'lock in szn' });
      const qualityChips = h('div', { class: 'chips wrap', role: 'group', 'aria-label': 'Timelapse quality' });
      const renderQuality = () => qualityChips.replaceChildren(...[
        ['saver', 'Battery saver'],
        ['standard', 'Standard'],
      ].map(([value, label]) => h('button', {
        type: 'button',
        class: 'chip',
        'aria-pressed': String(quality === value),
        onClick: () => {
          quality = value;
          renderQuality();
        },
      }, label)));
      renderQuality();
      const storage = h('p', { class: 'storage-line' }, 'Checking storage…');
      navigator.storage?.estimate?.().then(({ usage }) => {
        storage.textContent = `Lock In is using ${fmtBytes(usage ?? 0)} on this device. Free up space from any session’s page.`;
      }).catch(() => (storage.textContent = ''));

      const sampleBtn = h('button', {
        type: 'button',
        class: 'btn',
        onClick: async () => {
          sampleBtn.disabled = true;
          if (hasSample) {
            const ok = await confirmSheet({ title: 'Remove sample data?', body: 'Your own sessions and friends stay.', action: 'Remove', danger: true });
            if (!ok) {
              sampleBtn.disabled = false;
              return;
            }
            await removeSampleData();
            toast('Sample data removed');
          } else {
            sampleBtn.textContent = 'Loading…';
            await loadSampleData();
            toast('Sample data loaded');
          }
          close();
          refresh();
        },
      }, hasSample ? 'Remove sample data' : 'Load sample data');

      const submit = async (e) => {
        e.preventDefault();
        Object.assign(profile, {
          name: name.value.trim(),
          handle: handle.value.trim().replace(/^@/, '').toLowerCase().replace(/[^a-z0-9_.]/g, ''),
          bio: bio.value.trim(),
          avatar,
        });
        await saveProfile(profile);
        await saveSettings({ quality });
        close();
        refresh();
      };

      return h('form', { class: 'sheet-form', onSubmit: submit },
        h('h2', { class: 'sheet-title serif' }, 'Profile'),
        h('div', { class: 'avatar-edit' },
          avatarSlot,
          h('button', { type: 'button', class: 'btn', onClick: () => fileInput.click() }, avatar ? 'Change photo' : 'Add photo'),
          fileInput),
        h('label', { class: 'mono', for: 'p-name' }, 'Name'), name,
        h('label', { class: 'mono', for: 'p-handle' }, 'Handle'), handle,
        h('label', { class: 'mono', for: 'p-bio' }, 'Bio'), bio,
        h('div', { class: 'settings-section' },
          h('span', { class: 'mono' }, 'Timelapse quality'),
          qualityChips,
          h('p', { class: 'storage-line' }, 'Battery saver takes smaller frames. Both thin themselves out on long sessions, so a timelapse never runs past 24 seconds.')),
        h('div', { class: 'settings-section' },
          h('span', { class: 'mono' }, 'Storage'),
          storage),
        h('div', { class: 'settings-section' },
          h('span', { class: 'mono' }, 'Preview'),
          h('p', { class: 'storage-line' }, 'Fill History, You and Friends with made-up sessions to see how everything looks. Remove it any time.'),
          sampleBtn),
        h('div', { class: 'sheet-actions' },
          h('button', { type: 'button', class: 'btn', onClick: () => close() }, 'Cancel'),
          h('button', { type: 'submit', class: 'btn primary' }, 'Save')));
    }, { label: 'Profile and settings' });
  }

  return {
    destroy() {
      urls.forEach((u) => URL.revokeObjectURL(u));
    },
  };
}

function stat(label, value) {
  return h('div', { class: 'stat' }, h('dt', { class: 'mono' }, label), h('dd', {}, String(value)));
}

// "<1m", "35m", "1.4h"
function compact(ms) {
  const min = ms / 60000;
  if (min < 1) return '<1m';
  return min < 60 ? `${Math.round(min)}m` : `${(min / 60).toFixed(1)}h`;
}

async function squareThumb(file, size) {
  const img = await createImageBitmap(file);
  const side = Math.min(img.width, img.height);
  const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
  canvas.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
  img.close?.();
  return canvas.toDataURL('image/jpeg', 0.85);
}
