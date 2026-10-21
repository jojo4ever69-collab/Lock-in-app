// Camera + timelapse capture.
//
// Instead of recording video, we grab one small JPEG every few seconds and
// write it straight to IndexedDB. When a session reaches MAX_FRAMES we drop
// every other frame and halve the capture rate, so a 20-minute session and a
// 6-hour session both end up as a 12–24 second timelapse of a few MB.

import { frames } from './db.js';

export const MAX_FRAMES = 720;   // 24 s at 30 fps
const FIRST_INTERVAL = 1000;     // ms between frames until the first thinning
const LONG_EDGE = { saver: 640, standard: 960 };
const JPEG_QUALITY = 0.72;

export class Recorder {
  constructor(video) {
    this.video = video;
    this.stream = null;
    this.facing = 'environment';
    this.canvas = document.createElement('canvas');
    this.capturing = false;
    this.seqs = [];
    this.interval = FIRST_INTERVAL;
  }

  get hasCamera() {
    return !!this.stream && this.stream.getVideoTracks().some((t) => t.readyState === 'live');
  }

  get isFront() {
    const mode = this.stream?.getVideoTracks()[0]?.getSettings?.().facingMode;
    return (mode || this.facing) === 'user';
  }

  get frameCount() {
    return this.seqs.length;
  }

  async openCamera(facing = this.facing) {
    this.closeCamera();
    const generation = this.generation;
    this.facing = facing;
    if (!navigator.mediaDevices?.getUserMedia) {
      const err = new Error('Camera unavailable');
      err.name = window.isSecureContext ? 'NotSupportedError' : 'InsecureContextError';
      throw err;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: facing },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        // A low sensor frame rate is one of the bigger battery wins.
        frameRate: { ideal: 10, max: 15 },
      },
    });
    // The camera was closed (or reopened) while the permission prompt was up.
    if (generation !== this.generation) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.stream = stream;
    this.video.srcObject = stream;
    this.video.classList.toggle('mirror', this.isFront);
    await this.video.play().catch(() => {});
  }

  closeCamera() {
    this.generation = (this.generation ?? 0) + 1;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  startCapture(sessionId, quality = 'standard') {
    this.sessionId = sessionId;
    this.longEdge = LONG_EDGE[quality] ?? LONG_EDGE.standard;
    this.seqs = [];
    this.nextSeq = 0;
    this.interval = FIRST_INTERVAL;
    this.lastBlob = null;
    this.width = 0;
    this.height = 0;
    this.capturing = true;
    this.paused = false;
    this.schedule(0);
  }

  pause() {
    this.paused = true;
    clearTimeout(this.timer);
  }

  resume() {
    if (!this.capturing) return;
    this.paused = false;
    this.schedule(0);
  }

  async stopCapture() {
    this.capturing = false;
    clearTimeout(this.timer);
    await this.inFlight;
    return {
      frameCount: this.seqs.length,
      interval: this.interval,
      width: this.width,
      height: this.height,
      cover: this.lastBlob,
    };
  }

  schedule(delay) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.tick(), delay);
  }

  async tick() {
    if (!this.capturing || this.paused) return;
    const started = performance.now();
    this.inFlight = this.grab().catch((err) => console.warn('Frame capture failed', err));
    await this.inFlight;
    if (this.capturing && !this.paused) {
      this.schedule(Math.max(0, this.interval - (performance.now() - started)));
    }
  }

  async grab() {
    const { video, canvas } = this;
    if (!this.hasCamera || video.readyState < 2 || !video.videoWidth) return;
    const scale = Math.min(1, this.longEdge / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.round(video.videoWidth * scale);
    const h = Math.round(video.videoHeight * scale);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d');
    // Front-camera frames are mirrored so the timelapse matches the preview.
    ctx.setTransform(this.isFront ? -1 : 1, 0, 0, 1, this.isFront ? w : 0, 0);
    ctx.drawImage(video, 0, 0, w, h);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob) return;
    const seq = this.nextSeq++;
    await frames.put(this.sessionId, seq, blob);
    this.seqs.push(seq);
    this.lastBlob = blob;
    this.width = w;
    this.height = h;
    if (this.seqs.length >= MAX_FRAMES) this.thin();
  }

  // Keep every other frame and capture half as often from here on.
  thin() {
    const drop = this.seqs.filter((_, i) => i % 2 === 1);
    this.seqs = this.seqs.filter((_, i) => i % 2 === 0);
    this.interval *= 2;
    frames.deleteMany(this.sessionId, drop).catch((err) => console.warn('Thinning failed', err));
  }
}

// ---- Keep the screen awake while it's dimmed --------------------------
// If the phone locks, the browser suspends the page and the camera stops,
// so we hold a wake lock and paint the screen black instead. On OLED
// screens, black pixels are switched off.

let wakeLock = null;

export async function keepAwake() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch {
    wakeLock = null;
  }
}

export function releaseAwake() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

// ---- Goal chime ---------------------------------------------------------

let audio = null;

// Call from a tap so browsers let us play sound later.
export function primeAudio() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume?.();
  } catch {
    audio = null;
  }
}

export function chime() {
  navigator.vibrate?.([120, 80, 120]);
  if (!audio) return;
  const now = audio.currentTime;
  for (const [freq, at] of [[659.25, 0], [987.77, 0.2]]) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + at);
    gain.gain.exponentialRampToValueAtTime(0.22, now + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 1.4);
    osc.connect(gain).connect(audio.destination);
    osc.start(now + at);
    osc.stop(now + at + 1.5);
  }
}
