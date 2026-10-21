// Small DOM, formatting and date helpers shared by every view.

const SVG_NS = 'http://www.w3.org/2000/svg';

export function h(tag, props, ...children) {
  return build(document.createElement(tag), props, children, false);
}

export function s(tag, props, ...children) {
  return build(document.createElementNS(SVG_NS, tag), props, children, true);
}

function build(el, props, children, isSvg) {
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.setAttribute('class', value);
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key === 'html') el.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (!isSvg && key in el && typeof value !== 'string') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

const ICONS = {
  moon: '<path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z"/>',
  flip: '<path d="M4.5 10a7.5 7.5 0 0 1 13.6-3.6"/><path d="M19.5 14a7.5 7.5 0 0 1-13.6 3.6"/><path d="M18.6 3v3.6H15"/><path d="M5.4 21v-3.6H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  share: '<path d="M12 3.5v11"/><path d="M7.5 8L12 3.5 16.5 8"/><path d="M5.5 12.5v6a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-6"/>',
  film: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M10.5 9.3v5.4l4.4-2.7z" fill="currentColor"/>',
  trash: '<path d="M4.5 7h15"/><path d="M9.5 7V4.8h5V7"/><path d="M6.5 7l.9 12.2a1.5 1.5 0 0 0 1.5 1.3h6.2a1.5 1.5 0 0 0 1.5-1.3L17.5 7"/>',
  broom: '<path d="M14 4l-4.5 8"/><path d="M6 12.5h8l1 7.5H5z"/><path d="M8.5 16v4M11.5 16v4"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  trend: '<path d="M3.5 17l6-6 4 4 7-7.5"/><path d="M15 7.5h5.5V13"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  userplus: '<circle cx="10" cy="8.5" r="3.5"/><path d="M3.5 20a6.5 6.5 0 0 1 13 0"/><path d="M19 8v6M16 11h6"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
  pause: '<path d="M8 5.5v13M16 5.5v13" stroke-width="3"/>',
  download: '<path d="M12 3.5v11"/><path d="M7.5 10L12 14.5 16.5 10"/><path d="M5 19.5h14"/>',
  camera: '<path d="M4 8.5a2 2 0 0 1 2-2h2l1.5-2h5L16 6.5h2a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="12.5" r="3.5"/>',
};

export function icon(name, size = 22) {
  return h('span', {
    class: 'icon',
    'aria-hidden': 'true',
    html: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`,
  });
}

// ---- Formatting --------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// "1h 4m", "55m 4s", "38s"
export function fmtDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const hrs = Math.floor(total / 3600);
  const min = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (hrs) return min ? `${hrs}h ${min}m` : `${hrs}h`;
  if (min) return sec ? `${min}m ${sec}s` : `${min}m`;
  return total ? `${sec}s` : '0m';
}

// "24:57", "1:04:12"
export function fmtClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hrs = Math.floor(total / 3600);
  const min = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const sec = String(total % 60).padStart(2, '0');
  return hrs ? `${hrs}:${min}:${sec}` : `${min}:${sec}`;
}

export function fmtTime(date) {
  const d = new Date(date);
  const hrs = d.getHours() % 12 || 12;
  return `${hrs}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() >= 12 ? 'PM' : 'AM'}`;
}

// "AUG 29 · 12:22 PM"
export function fmtStamp(date) {
  const d = new Date(date);
  return `${MONTHS[d.getMonth()].toUpperCase()} ${d.getDate()} · ${fmtTime(d)}`;
}

// "Sep 20 – Sep 26"
export function fmtWeek(start) {
  const end = addDays(start, 6);
  return `${MONTHS[start.getMonth()]} ${start.getDate()} – ${MONTHS[end.getMonth()]} ${end.getDate()}`;
}

export function fmtDayLabel(date, now = new Date()) {
  const diff = daysBetween(date, now);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  const d = new Date(date);
  const year = d.getFullYear() === now.getFullYear() ? '' : `, ${d.getFullYear()}`;
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}${year}`;
}

export function fmtMonth(date) {
  const d = new Date(date);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtBytes(bytes) {
  if (bytes < 1e6) return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
  if (bytes < 1e9) return `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)} MB`;
  return `${(bytes / 1e9).toFixed(1)} GB`;
}

export function fmtAgo(ts, now = Date.now()) {
  const min = Math.round((now - ts) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export { WEEKDAYS, MONTHS };

// ---- Dates (local time, weeks start on Sunday) -------------------------

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function startOfWeek(date) {
  const d = startOfDay(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
}

export function dayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// ---- Feedback -----------------------------------------------------------

export function toast(text) {
  const host = document.getElementById('toasts');
  const el = h('div', { class: 'toast', role: 'status' }, text);
  host.append(el);
  setTimeout(() => el.classList.add('leaving'), 2600);
  setTimeout(() => el.remove(), 3000);
}

// Bottom sheet. `build(close)` returns the sheet's content.
export function openSheet(build, { label = 'Dialog', onClose } = {}) {
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': label });
  const backdrop = h('div', { class: 'sheet-backdrop', onClick: (e) => e.target === backdrop && close() }, panel);
  const onKey = (e) => e.key === 'Escape' && close();
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    backdrop.classList.add('closing');
    setTimeout(() => backdrop.remove(), 220);
    onClose?.();
  }
  panel.append(h('div', { class: 'sheet-grip', 'aria-hidden': 'true' }), ...[build(close)].flat().filter(Boolean));
  document.body.append(backdrop);
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => panel.querySelector('input, textarea, [data-autofocus]')?.focus({ preventScroll: true }));
  return close;
}

export function confirmSheet({ title, body, action, danger = false }) {
  return new Promise((resolve) => {
    let confirmed = false;
    openSheet((close) => [
      h('h2', { class: 'sheet-title serif' }, title),
      body && h('p', { class: 'sheet-body' }, body),
      h('div', { class: 'sheet-actions' },
        h('button', { class: 'btn', onClick: () => close() }, 'Cancel'),
        h('button', {
          class: danger ? 'btn danger' : 'btn primary',
          'data-autofocus': true,
          onClick: () => { confirmed = true; close(); },
        }, action)),
    ], { label: title, onClose: () => resolve(confirmed) });
  });
}

export function avatarEl(person, size = 32) {
  const style = { width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.42)}px` };
  if (person.avatar) return h('img', { class: 'avatar', src: person.avatar, alt: '', style });
  const initial = (person.name || '?').trim().charAt(0).toUpperCase() || '?';
  return h('span', { class: 'avatar', style: { ...style, background: `hsl(${person.hue ?? 40} 32% 34%)` }, 'aria-hidden': 'true' }, initial);
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
