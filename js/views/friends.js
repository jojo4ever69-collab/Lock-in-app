import { h, s, icon, avatarEl, fmtDuration, fmtWeek, fmtAgo, addDays, startOfWeek, startOfDay, daysBetween, WEEKDAYS, toast, openSheet, confirmSheet } from '../ui.js';
import { sessions } from '../db.js';
import { getProfile, saveProfile, getCategories, getFriends, saveFriends } from '../store.js';
import { buildPayload, encodePayload, decodePayload, codeFromText, personFromPayload, personFromSessions, personWeek, friendLink } from '../friends.js';
import { shareLink } from '../share.js';

const WEEKS_BACK = 12;

export async function FriendsView(root, { params: [incoming], navigate, replaceHash }) {
  const [profile, list, categories] = await Promise.all([getProfile(), sessions.done(), getCategories()]);
  let friends = await getFriends();
  const thisWeek = startOfWeek(new Date());
  let weekStart = thisWeek;
  const me = personFromSessions(profile, list, categories);
  let myLink = makeLink();

  const weekLabel = h('span', { class: 'mono' });
  const prevBtn = h('button', { class: 'round-btn', 'aria-label': 'Previous week', onClick: () => shift(-1) }, icon('back', 18));
  const nextBtn = h('button', { class: 'round-btn', 'aria-label': 'Next week', onClick: () => shift(1) }, icon('next', 18));
  const body = h('div', { class: 'friends-body' });

  root.append(h('section', { class: 'page friends' },
    h('header', { class: 'week-nav' }, prevBtn, weekLabel, nextBtn),
    body,
    h('div', { class: 'action-row' },
      h('button', { class: 'btn primary', onClick: shareMine }, icon('link', 18), 'Share my link'),
      h('button', { class: 'btn', onClick: addFriendSheet }, icon('userplus', 18), 'Add friend')),
    h('p', { class: 'fineprint' }, 'No accounts and no servers. Your link carries your name and your last four weeks of focus time per category, nothing else. A friend’s numbers update when they send you a fresh link.')));

  render();

  if (incoming) {
    replaceHash('#/friends');
    importCode(incoming);
  }

  function makeLink() {
    return encodePayload(buildPayload(profile, list, categories)).then(friendLink);
  }

  function shift(dir) {
    weekStart = addDays(weekStart, dir * 7);
    render();
  }

  function render() {
    weekLabel.textContent = fmtWeek(weekStart);
    nextBtn.disabled = +weekStart >= +thisWeek;
    prevBtn.disabled = daysBetween(weekStart, thisWeek) >= WEEKS_BACK * 7;

    const people = [me, ...friends.map((f) => ({ ...personFromPayload(f), allMinutes: f.tm, allSessions: f.sc }))]
      .map((p) => ({ ...p, week: personWeek(p, weekStart), covered: covers(p, weekStart) }))
      .sort((a, b) => b.week.total - a.week.total);
    const together = people.reduce((sum, p) => sum + p.week.total, 0);
    const isCurrent = +weekStart === +thisWeek;

    body.replaceChildren(...[
      h('div', { class: 'together' },
        h('div', { class: 'together-value' },
          fmtDuration(together * 60000),
          h('span', { class: 'together-label' }, friends.length ? ' together' : isCurrent ? ' this week' : ' that week'))),
      chart(people),
      board(people),
      !friends.length && h('div', { class: 'empty' },
        h('p', { class: 'empty-title' }, 'Lock in with friends.'),
        h('p', {}, 'Send your link to a friend who uses Lock In and ask for theirs. You’ll see each other’s week here, like a running club for studying.')),
    ].filter(Boolean));
  }

  // ---- Cumulative chart -------------------------------------------------

  function chart(people) {
    const W = 340;
    const H = 196;
    const pad = { l: 8, r: 30, t: 16, b: 26 };
    const today = startOfDay(new Date());
    const max = Math.max(60, ...people.map((p) => p.week.total));
    const x = (i) => pad.l + (i / 6) * (W - pad.l - pad.r);
    const y = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
    const svg = s('svg', {
      class: 'chart',
      viewBox: `0 0 ${W} ${H}`,
      role: 'img',
      'aria-label': `Running total of focus time for the week of ${fmtWeek(weekStart)}`,
    });

    for (let k = 0; k <= 3; k++) {
      const gy = pad.t + (k * (H - pad.t - pad.b)) / 3;
      svg.append(s('line', { class: 'grid', x1: pad.l, x2: W - pad.r + 10, y1: gy, y2: gy }));
    }
    const todayIndex = daysBetween(weekStart, today);
    if (todayIndex >= 0 && todayIndex < 7) {
      svg.append(s('line', { class: 'now-line', x1: x(todayIndex), x2: x(todayIndex), y1: pad.t - 8, y2: H - pad.b }));
    }
    WEEKDAYS.forEach((d, i) => svg.append(s('text', {
      class: i === todayIndex ? 'axis now' : 'axis',
      x: x(i),
      y: H - 8,
      'text-anchor': 'middle',
    }, d)));
    svg.append(s('text', { class: 'axis', x: W - pad.r + 10, y: pad.t - 4, 'text-anchor': 'end' }, fmtDuration(max * 60000)));

    // Friends first so your line draws on top.
    const ordered = [...people].sort((a, b) => Number(!!a.you) - Number(!!b.you));
    const ends = [];
    let shade = 0;
    for (const p of ordered) {
      const pts = p.covered ? p.week.cumulative : [];
      if (!pts.length) continue;
      const d = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
      const opacity = p.you ? 1 : [0.9, 0.62, 0.42, 0.3][shade++ % 4];
      svg.append(s('path', { class: p.you ? 'line you' : 'line', d, 'stroke-opacity': opacity }));
      ends.push({ p, x: x(pts.length - 1), y: y(pts[pts.length - 1]) });
    }

    // Nudge end markers apart so the avatars don't stack.
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 19);
    const floor = H - pad.b - 2;
    for (let i = ends.length - 1; i >= 0; i--) {
      const limit = i === ends.length - 1 ? floor : ends[i + 1].y - 19;
      ends[i].y = Math.min(ends[i].y, limit);
    }
    for (const { p, x: ex, y: ey } of ends) {
      const g = s('g', { class: 'marker' });
      g.append(
        s('circle', { cx: ex, cy: ey, r: 9.5, fill: `hsl(${p.hue ?? 40} 32% 34%)`, class: p.you ? 'marker-you' : 'marker-bg' }),
        s('text', { x: ex, y: ey + 4, 'text-anchor': 'middle', class: 'marker-text' }, (p.name || '?').charAt(0).toUpperCase()),
      );
      svg.append(g);
    }
    return h('div', { class: 'chart-wrap' }, svg);
  }

  // ---- Leaderboard ----------------------------------------------------

  function board(people) {
    const max = Math.max(1, ...people.map((p) => p.week.total));
    return h('ol', { class: 'board' }, people.map((p) => {
      const cats = Object.entries(p.week.byCategory).sort((a, b) => b[1] - a[1]);
      const tags = [
        p.you && h('span', { class: 'mono tag' }, 'You'),
        p.sample && h('span', { class: 'mono tag muted-tag' }, 'Sample'),
      ];
      return h('li', { class: p.you ? 'board-row you' : 'board-row' },
        h('button', {
          class: 'board-who',
          onClick: () => (p.you ? navigate('#/profile') : friendSheet(p)),
        },
          avatarEl(p, 32),
          h('span', { class: 'board-id' },
            h('span', { class: 'board-name' }, p.name, ...tags),
            !p.you && h('span', { class: 'board-sub' }, `Updated ${fmtAgo(p.updatedAt)}`))),
        h('span', { class: 'board-total' }, p.covered ? fmtDuration(p.week.total * 60000) : '—'),
        p.week.total > 0 && h('div', { class: 'stack', style: { width: `${(p.week.total / max) * 100}%` } },
          cats.map(([c, m]) => h('i', { style: { flexGrow: String(m), background: p.colors[c] ?? '#d9d4c7' }, title: `${c} ${fmtDuration(m * 60000)}` }))),
        cats.length > 0 && h('div', { class: 'board-legend' }, cats.slice(0, 3).map(([c, m]) => h('span', {},
          h('i', { class: 'swatch', style: { background: p.colors[c] ?? '#d9d4c7' } }),
          c,
          h('span', { class: 'mono' }, fmtDuration(m * 60000))))),
        !p.covered && h('div', { class: 'board-legend muted' }, 'Their last link doesn’t cover this week.'));
    }));
  }

  function covers(p, start) {
    if (p.you) return true;
    return +start >= +addDays(p.coversFrom, -6) && +start < +p.coversTo;
  }

  // ---- Sharing and adding ---------------------------------------------

  async function shareMine() {
    if (!profile.name) {
      askName();
      return;
    }
    const url = await myLink;
    const shared = await shareLink({ title: 'Lock In', text: `Lock in with me. Here’s my week on Lock In:`, url });
    if (!shared) linkSheet(url);
  }

  function askName() {
    openSheet((close) => {
      const input = h('input', { id: 'my-name', class: 'field', maxLength: 40, placeholder: 'Your name', autocomplete: 'nickname' });
      return h('form', {
        class: 'sheet-form',
        onSubmit: async (e) => {
          e.preventDefault();
          if (!input.value.trim()) return;
          profile.name = input.value.trim();
          me.name = profile.name;
          await saveProfile(profile);
          myLink = makeLink();
          const url = await myLink;
          close();
          render();
          linkSheet(url);
        },
      },
        h('h2', { class: 'sheet-title serif' }, 'What should friends call you?'),
        h('p', { class: 'sheet-body' }, 'Your name goes in your link so friends know whose numbers they’re adding.'),
        input,
        h('div', { class: 'sheet-actions' },
          h('button', { type: 'button', class: 'btn', onClick: () => close() }, 'Cancel'),
          h('button', { type: 'submit', class: 'btn primary' }, 'Continue')));
    }, { label: 'Your name' });
  }

  function linkSheet(url) {
    openSheet((close) => [
      h('h2', { class: 'sheet-title serif' }, 'Your friend link'),
      h('p', { class: 'sheet-body' }, 'Send this to friends. When they open it, you show up on their Friends tab.'),
      h('div', { class: 'link-box', tabIndex: 0 }, url),
      h('div', { class: 'sheet-actions' },
        h('button', {
          class: 'btn',
          onClick: async () => {
            try {
              await navigator.clipboard.writeText(url);
              toast('Link copied');
              close();
            } catch {
              toast('Press and hold the link to copy it.');
            }
          },
        }, 'Copy'),
        navigator.share && h('button', {
          class: 'btn primary',
          onClick: () => navigator.share({ title: 'Lock In', url }).then(() => close()).catch(() => {}),
        }, icon('share', 18), 'Share')),
    ], { label: 'Your friend link' });
  }

  function addFriendSheet() {
    openSheet((close) => {
      const input = h('textarea', { id: 'friend-link', class: 'field', rows: 3, placeholder: 'Paste their link here', autocapitalize: 'none', spellcheck: 'false' });
      return h('form', {
        class: 'sheet-form',
        onSubmit: async (e) => {
          e.preventDefault();
          const code = codeFromText(input.value);
          if (!code) {
            toast('That doesn’t look like a Lock In link.');
            return;
          }
          close();
          await importCode(code);
        },
      },
        h('h2', { class: 'sheet-title serif' }, 'Add a friend'),
        h('p', { class: 'sheet-body' }, 'Ask them to tap “Share my link” on their Friends tab, then paste it here. Opening their link on this phone works too.'),
        input,
        h('div', { class: 'sheet-actions' },
          h('button', { type: 'button', class: 'btn', onClick: () => close() }, 'Cancel'),
          h('button', { type: 'submit', class: 'btn primary' }, 'Add')));
    }, { label: 'Add a friend' });
  }

  async function importCode(code) {
    let payload;
    try {
      payload = await decodePayload(code);
    } catch (err) {
      toast(err instanceof SyntaxError ? 'That link is incomplete. Ask for a fresh one.' : err.message || 'That link didn’t work.');
      return;
    }
    if (payload.u === profile.uid) {
      toast('That’s your own link. Send it to a friend instead.');
      return;
    }
    const existing = friends.find((f) => f.u === payload.u);
    if (existing && existing.t >= payload.t) {
      toast(`You already have ${payload.n}’s latest numbers.`);
      return;
    }
    friends = existing ? friends.map((f) => (f.u === payload.u ? payload : f)) : [...friends, payload];
    await saveFriends(friends);
    toast(existing ? `Updated ${payload.n}’s week` : `Added ${payload.n}`);
    render();
  }

  function friendSheet(p) {
    openSheet((close) => [
      h('div', { class: 'who' },
        avatarEl(p, 52),
        h('div', { class: 'who-text' },
          h('h2', { class: 'sheet-title serif' }, p.name),
          p.handle && h('span', { class: 'mono' }, `@${p.handle}`))),
      h('dl', { class: 'stat-row' },
        h('div', { class: 'stat' }, h('dt', { class: 'mono' }, 'Sessions'), h('dd', {}, String(p.allSessions ?? 0))),
        h('div', { class: 'stat' }, h('dt', { class: 'mono' }, 'Total time'), h('dd', {}, fmtDuration((p.allMinutes ?? 0) * 60000))),
        h('div', { class: 'stat' }, h('dt', { class: 'mono' }, 'Updated'), h('dd', {}, fmtAgo(p.updatedAt)))),
      h('div', { class: 'sheet-actions' },
        h('button', { class: 'btn', onClick: () => close() }, 'Done'),
        h('button', {
          class: 'btn danger',
          onClick: async () => {
            close();
            const ok = await confirmSheet({ title: `Remove ${p.name}?`, body: 'You can add them again from a new link.', action: 'Remove', danger: true });
            if (!ok) return;
            friends = friends.filter((f) => f.u !== p.uid);
            await saveFriends(friends);
            render();
          },
        }, 'Remove')),
    ], { label: p.name });
  }

  return {};
}
