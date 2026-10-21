// Plays stored frames back on a canvas at 30 fps. Frames stay compressed
// in memory and only a few are decoded ahead of the playhead at a time.

import { frames } from './db.js';

const LOOKAHEAD = 8;

export class TimelapsePlayer {
  constructor(canvas, { fps = 30, onFrame } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.fps = fps;
    this.onFrame = onFrame;
    this.blobs = [];
    this.ready = new Map();
    this.pending = new Map();
    this.index = 0;
    this.playing = false;
  }

  get length() {
    return this.blobs.length;
  }

  async load(sessionId) {
    this.blobs = await frames.all(sessionId);
    if (!this.blobs.length) return false;
    const first = await createImageBitmap(this.blobs[0]);
    this.canvas.width = first.width;
    this.canvas.height = first.height;
    this.ready.set(0, first);
    this.draw(0);
    return true;
  }

  play() {
    if (this.playing || this.length < 2) return;
    this.playing = true;
    this.last = 0;
    this.raf = requestAnimationFrame((t) => this.step(t));
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
    return this.playing;
  }

  async seek(fraction) {
    const i = Math.min(this.length - 1, Math.max(0, Math.round(fraction * (this.length - 1))));
    this.index = i;
    this.prefetch(i);
    await this.pending.get(i);
    if (this.index === i) this.draw(i);
  }

  step(now) {
    if (!this.playing) return;
    this.raf = requestAnimationFrame((t) => this.step(t));
    if (now - this.last < 1000 / this.fps - 2) return;
    const next = (this.index + 1) % this.length;
    this.prefetch(next);
    if (!this.ready.has(next)) return; // decoding fell behind; hold this frame
    this.last = now;
    this.index = next;
    this.draw(next);
  }

  prefetch(from) {
    const wanted = new Set();
    for (let k = 0; k < LOOKAHEAD; k++) wanted.add((from + k) % this.length);
    for (const i of wanted) {
      if (this.ready.has(i) || this.pending.has(i)) continue;
      const job = createImageBitmap(this.blobs[i]).then((bmp) => {
        this.pending.delete(i);
        if (this.blobs.length) this.ready.set(i, bmp);
        else bmp.close?.();
      });
      this.pending.set(i, job);
    }
    for (const [i, bmp] of this.ready) {
      if (i !== this.index && !wanted.has(i)) {
        bmp.close?.();
        this.ready.delete(i);
      }
    }
  }

  draw(i) {
    const bmp = this.ready.get(i);
    if (!bmp) return;
    this.ctx.drawImage(bmp, 0, 0, this.canvas.width, this.canvas.height);
    this.onFrame?.(i, this.length);
  }

  destroy() {
    this.pause();
    for (const bmp of this.ready.values()) bmp.close?.();
    this.ready.clear();
    this.blobs = [];
  }
}
