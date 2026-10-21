import { h, icon, fmtDuration, fmtStamp, fmtTime, fmtClock, fmtBytes, dayKey, toast, openSheet, confirmSheet } from '../ui.js';
import { sessions, frames } from '../db.js';
import { getCategories } from '../store.js';
import { TimelapsePlayer } from '../player.js';
import { renderShareCard, exportTimelapse, canExportVideo, videoExtension } from '../exporter.js';
import { readySheet } from '../share.js';

export async function SessionView(root, { params: [id, isNew], navigate, replaceHash, refresh }) {
  const session = await sessions.get(id);
  if (!session || session.status !== 'done') {
    root.append(h('section', { class: 'page' },
      backLink(),
      h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, 'This session is gone.'), h('p', {}, 'It may have been deleted.'))));
    return {};
  }
  if (isNew) replaceHash(`#/s/${id}`);

  const categories = await getCategories();
  const urls = [];
  let player = null;
  let scrubbing = false;
  let bytes = 0;

  // ---- Stage: timelapse, cover photo, or nothing ---------------------

  const aspect = session.width && session.height ? `${session.width} / ${session.height}` : '3 / 4';
  const clock = h('span', { class: 'mono stage-clock' });
  const overlayCat = h('span', { class: 'mono' }, session.category);
  const stage = h('div', { class: 'stage', style: { aspectRatio: aspect } },
    h('div', { class: 'stage-overlay' },
      h('div', { class: 'stage-top' }, overlayCat, clock),
      h('div', { class: 'stage-play', 'aria-hidden': 'true' }, icon('play', 30)),
      h('div', { class: 'stage-bottom' },
        h('div', { class: 'stage-dur' }, fmtDuration(session.duration)),
        h('div', { class: 'mono' }, fmtStamp(session.startedAt)))));
  const scrub = h('input', { type: 'range', class: 'scrub', min: 0, max: 1000, value: 0, 'aria-label': 'Timelapse position', hidden: true });

  if (session.frameCount > 1) {
    const canvas = h('canvas', { class: 'stage-media' });
    stage.prepend(canvas);
    stage.classList.add('interactive');
    stage.setAttribute('role', 'button');
    stage.setAttribute('tabindex', '0');
    stage.setAttribute('aria-label', 'Play or pause the timelapse');
    player = new TimelapsePlayer(canvas, {
      onFrame: (i, n) => {
        const f = n > 1 ? i / (n - 1) : 0;
        clock.textContent = fmtClock(f * session.duration);
        if (!scrubbing) scrub.value = Math.round(f * 1000);
      },
    });
    player.load(id).then((ok) => {
      if (!ok) return;
      bytes = player.blobs.reduce((sum, b) => sum + b.size, 0);
      freeBtn.lastChild.textContent = `Free up ${fmtBytes(bytes)}`;
      freeBtn.hidden = false;
      scrub.hidden = false;
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) togglePlay();
    });
    const togglePlay = () => stage.classList.toggle('playing', player.toggle());
    stage.addEventListener('click', togglePlay);
    stage.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        togglePlay();
      }
    });
    scrub.addEventListener('input', () => {
      scrubbing = true;
      player.pause();
      stage.classList.remove('playing');
      player.seek(scrub.value / 1000);
    });
    scrub.addEventListener('change', () => (scrubbing = false));
  } else if (session.cover) {
    const url = URL.createObjectURL(session.cover);
    urls.push(url);
    stage.prepend(h('img', { class: 'stage-media', src: url, alt: '' }));
  } else {
    stage.prepend(h('div', { class: 'stage-media stage-empty' }, icon('film', 30), h('span', { class: 'mono' }, 'No video for this session')));
  }

  // ---- Details ----------------------------------------------------------

  const goalLine = session.goalMs
    ? session.duration >= session.goalMs ? `${session.goalMs / 60000} min goal reached` : `of a ${session.goalMs / 60000} min goal`
    : null;

  const note = h('textarea', { id: 'session-note', class: 'field', rows: 2, maxLength: 200, placeholder: 'What did you work on?' });
  note.value = session.note || '';
  let noteTimer;
  note.addEventListener('input', () => {
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => {
      session.note = note.value.trim();
      save();
    }, 400);
  });

  const catRow = h('div', { class: 'chips wrap', role: 'group', 'aria-label': 'Category' });
  function renderCats() {
    catRow.replaceChildren(...categories.map((c) => h('button', {
      class: 'chip',
      'aria-pressed': String(c.name === session.category),
      onClick: () => {
        session.category = c.name;
        overlayCat.textContent = c.name;
        save();
        renderCats();
      },
    }, h('i', { class: 'swatch', style: { background: c.color } }), c.name)));
  }
  renderCats();

  const shareBtn = h('button', { class: 'btn primary', onClick: shareCard }, icon('share', 18), 'Share card');
  const videoBtn = h('button', {
    class: 'btn',
    onClick: saveVideo,
    disabled: session.frameCount < 2 || !canExportVideo(),
    title: session.frameCount < 2 ? 'This session has no timelapse' : null,
  }, icon('film', 18), 'Save video');
  const freeBtn = h('button', { class: 'btn subtle', onClick: freeSpace, hidden: true }, icon('broom', 18), h('span', {}, 'Free up space'));
  const deleteBtn = h('button', { class: 'btn subtle danger-text', onClick: remove }, icon('trash', 18), 'Delete session');

  const awayText = session.distractions
    ? `${session.distractions}× · ${fmtDuration(session.awayMs)} away`
    : 'Never';
  const lapseText = session.frameCount > 1
    ? `${(session.frameCount / 30).toFixed(1)}s long`
    : 'None';
  const lapseSub = session.frameCount > 1 ? `1 frame every ${fmtDuration(session.interval)}` : null;

  root.append(h('section', { class: 'page session' },
    h('header', { class: 'bar' }, backLink(), h('span', { class: 'mono' }, session.recovered ? 'Recovered session' : 'Session')),
    isNew && h('div', { class: 'saved-head' },
      h('h1', { class: 'page-title' }, 'Session saved', h('span', { class: 'dot' }, '.')),
      h('p', { class: 'muted' }, 'Add a note so you remember what this was.')),
    stage,
    scrub,
    h('dl', { class: 'facts' },
      fact('Focus time', fmtDuration(session.duration), goalLine),
      fact('Time', `${fmtTime(session.startedAt)} – ${fmtTime(session.endedAt)}`),
      fact('Left the app', awayText),
      fact('Timelapse', lapseText, lapseSub)),
    h('div', { class: 'field-group' }, h('label', { class: 'mono', for: 'session-note' }, 'Note'), note),
    h('div', { class: 'field-group' }, h('span', { class: 'mono' }, 'Category'), catRow),
    h('div', { class: 'action-row' }, shareBtn, videoBtn),
    h('div', { class: 'action-row quiet' }, freeBtn, deleteBtn)));

  function fact(label, value, sub) {
    return h('div', { class: 'fact' },
      h('dt', { class: 'mono' }, label),
      h('dd', {}, h('span', { class: 'fact-value' }, value), sub && h('small', {}, sub)));
  }

  function save() {
    return sessions.put(session).catch(() => toast('That change didn’t save. Try again.'));
  }

  // ---- Actions ----------------------------------------------------------

  async function shareCard() {
    shareBtn.disabled = true;
    try {
      const blob = await renderShareCard(session);
      readySheet(blob, `lock-in-${dayKey(session.startedAt)}.png`, { title: 'Your card' });
    } catch (err) {
      toast('The card couldn’t be made.');
      console.error(err);
    } finally {
      shareBtn.disabled = false;
    }
  }

  async function saveVideo() {
    player?.pause();
    stage.classList.remove('playing');
    let finished = false;
    let abandoned = false;
    const fill = h('i');
    const pct = h('span', { class: 'mono' }, '0%');
    const close = openSheet(() => [
      h('h2', { class: 'sheet-title serif' }, 'Making your video'),
      h('p', { class: 'sheet-body' }, 'Keep this screen open. It takes about as long as the video itself.'),
      h('div', { class: 'progress' }, fill),
      pct,
    ], { label: 'Making your video', onClose: () => { if (!finished) abandoned = true; } });
    try {
      const blob = await exportTimelapse(session, (p) => {
        fill.style.width = `${(p * 100).toFixed(1)}%`;
        pct.textContent = `${Math.round(p * 100)}%`;
      });
      finished = true;
      close();
      if (!abandoned) readySheet(blob, `lock-in-${dayKey(session.startedAt)}.${videoExtension(blob)}`, { title: 'Your timelapse' });
    } catch (err) {
      finished = true;
      close();
      toast(err.message || 'The video couldn’t be made.');
    }
  }

  async function freeSpace() {
    const ok = await confirmSheet({
      title: 'Delete the timelapse?',
      body: `The session, its stats and its cover photo stay. This frees ${fmtBytes(bytes)} on your phone.`,
      action: 'Delete timelapse',
      danger: true,
    });
    if (!ok) return;
    player?.destroy();
    await frames.clear(id);
    session.frameCount = 0;
    await save();
    toast(`Freed ${fmtBytes(bytes)}`);
    refresh();
  }

  async function remove() {
    const ok = await confirmSheet({
      title: 'Delete this session?',
      body: 'Its time comes off your stats. This can’t be undone.',
      action: 'Delete session',
      danger: true,
    });
    if (!ok) return;
    player?.destroy();
    await sessions.delete(id);
    toast('Session deleted');
    navigate('#/history');
  }

  return {
    destroy() {
      clearTimeout(noteTimer);
      if (note.value.trim() !== (session.note || '')) {
        session.note = note.value.trim();
        save();
      }
      player?.destroy();
      urls.forEach((u) => URL.revokeObjectURL(u));
    },
  };
}

function backLink() {
  return h('a', { class: 'round-btn', href: '#/history', 'aria-label': 'Back to history' }, icon('back'));
}
