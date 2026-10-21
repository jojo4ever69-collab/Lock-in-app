// Share card (PNG) and timelapse video export, both drawn on a canvas.

import { frames } from './db.js';
import { fmtClock, fmtDuration, fmtStamp, sleep } from './ui.js';

const SERIF = '"Instrument Serif", "Iowan Old Style", Georgia, serif';
const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
const INK = '#f3efe6';
const GOLD = '#e6c35c';

function fontsReady() {
  return Promise.all([
    document.fonts.load(`400 100px ${SERIF}`),
    document.fonts.load(`400 20px ${MONO}`),
    document.fonts.load(`500 20px ${MONO}`),
  ]).catch(() => {});
}

// Letter-spaced text, centered on x. ctx.letterSpacing isn't everywhere yet.
function spaced(ctx, text, x, y, spacing) {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let cursor = x - total / 2;
  const align = ctx.textAlign;
  ctx.textAlign = 'left';
  chars.forEach((c, i) => {
    ctx.fillText(c, cursor, y);
    cursor += widths[i] + spacing;
  });
  ctx.textAlign = align;
}

function drawCover(ctx, img, W, H) {
  const scale = Math.max(W / img.width, H / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

function wordmark(ctx, x, y, size) {
  ctx.font = `400 ${size}px ${SERIF}`;
  ctx.textAlign = 'left';
  const word = 'Lock In';
  const ww = ctx.measureText(word).width;
  const dw = ctx.measureText('.').width;
  const left = x - (ww + dw) / 2;
  ctx.fillStyle = INK;
  ctx.fillText(word, left, y);
  ctx.fillStyle = GOLD;
  ctx.fillText('.', left + ww, y);
  ctx.textAlign = 'center';
}

function shade(ctx, W, H, stops) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  for (const [at, alpha] of stops) g.addColorStop(at, `rgba(8, 8, 7, ${alpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// The stacked stamp from the card: CATEGORY / duration / date / wordmark.
function stamp(ctx, session, W, top, unit) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK;
  ctx.font = `500 ${unit * 1.0}px ${MONO}`;
  spaced(ctx, session.category.toUpperCase(), W / 2, top, unit * 0.32);

  ctx.font = `400 ${unit * 6.6}px ${SERIF}`;
  ctx.fillText(fmtDuration(session.duration), W / 2, top + unit * 6.6);

  ctx.fillStyle = 'rgba(243, 239, 230, 0.5)';
  ctx.fillRect(W / 2 - unit * 1.6, top + unit * 7.9, unit * 3.2, Math.max(1, unit * 0.06));

  ctx.fillStyle = 'rgba(243, 239, 230, 0.8)';
  ctx.font = `400 ${unit * 0.9}px ${MONO}`;
  spaced(ctx, fmtStamp(session.startedAt), W / 2, top + unit * 9.4, unit * 0.22);

  wordmark(ctx, W / 2, top + unit * 12, unit * 2.2);
}

export async function renderShareCard(session) {
  await fontsReady();
  const W = 1080;
  const H = 1920;
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0c0c0b';
  ctx.fillRect(0, 0, W, H);
  if (session.cover) {
    const img = await createImageBitmap(session.cover);
    drawCover(ctx, img, W, H);
    img.close?.();
  }
  shade(ctx, W, H, [[0, 0.62], [0.5, 0.28], [1, 0.55]]);
  stamp(ctx, session, W, H * 0.2, 40);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

function pickVideoType() {
  if (!window.MediaRecorder) return null;
  const types = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

export function canExportVideo() {
  return !!pickVideoType() && 'captureStream' in HTMLCanvasElement.prototype;
}

// Plays the timelapse into a MediaRecorder with a running clock burned in,
// then holds on the full stamp. Runs in real time (about 15–25 s).
export async function exportTimelapse(session, onProgress) {
  const blobs = await frames.all(session.id);
  if (!blobs.length) throw new Error('This session has no timelapse frames to export.');
  const type = pickVideoType();
  if (!type || !canExportVideo()) throw new Error('This browser can’t make videos. Try Safari or Chrome.');
  await fontsReady();

  const first = await createImageBitmap(blobs[0]);
  const W = first.width & ~1;
  const H = first.height & ~1;
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = canvas.getContext('2d');
  // One type unit that fits portrait and landscape frames; the end stamp is
  // about 13 units tall.
  const unit = Math.min(W / 27, H / 20);
  const stampTop = Math.max(unit * 1.2, H * 0.42 - unit * 5.6);
  const fps = 30;
  const n = blobs.length;

  const paint = (bmp, progress, final) => {
    drawCover(ctx, bmp, W, H);
    if (final) {
      shade(ctx, W, H, [[0, 0.7], [0.55, 0.4], [1, 0.6]]);
      stamp(ctx, session, W, stampTop, unit);
      return;
    }
    shade(ctx, W, H, [[0, 0.5], [0.22, 0], [0.75, 0], [1, 0.55]]);
    ctx.textAlign = 'center';
    ctx.fillStyle = INK;
    ctx.font = `500 ${unit * 0.85}px ${MONO}`;
    spaced(ctx, session.category.toUpperCase(), W / 2, unit * 2.4, unit * 0.28);
    ctx.font = `400 ${unit * 3.4}px ${SERIF}`;
    ctx.fillText(fmtClock(progress * session.duration), W / 2, unit * 5.8);
    wordmark(ctx, W / 2, H - unit * 2, unit * 1.5);
  };

  paint(first, 0, false);
  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 5_000_000 });
  const chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((resolve) => (recorder.onstop = resolve));
  recorder.start(250);

  let due = performance.now();
  let current = first;
  let upcoming = n > 1 ? createImageBitmap(blobs[1]) : null;
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      current.close?.();
      current = await upcoming;
      upcoming = i + 1 < n ? createImageBitmap(blobs[i + 1]) : null;
    }
    due += 1000 / fps;
    const wait = due - performance.now();
    if (wait > 0) await sleep(wait);
    paint(current, n > 1 ? i / (n - 1) : 1, false);
    onProgress?.((i + 1) / (n + 45));
  }
  // Hold the end card for 1.5 s, repainting so every encoder keeps the frames.
  for (let k = 0; k < 45; k++) {
    paint(current, 1, true);
    await sleep(1000 / fps);
    onProgress?.((n + k + 1) / (n + 45));
  }
  current.close?.();
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  return new Blob(chunks, { type: type.split(';')[0] });
}

export function videoExtension(blob) {
  return blob.type.includes('mp4') ? 'mp4' : 'webm';
}
