import { h, icon, openSheet, toast } from './ui.js';

export function download(url, filename) {
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
}

// Preview a finished image or video, then share it or save it. The share
// button sits behind a fresh tap because browsers only allow sharing
// right after the user touches something.
export function readySheet(blob, filename, { title = 'Ready to share' } = {}) {
  const url = URL.createObjectURL(blob);
  const isVideo = blob.type.startsWith('video/');
  const file = new File([blob], filename, { type: blob.type });
  const canShare = !!navigator.canShare?.({ files: [file] });

  const preview = isVideo
    ? h('video', { src: url, autoplay: true, loop: true, muted: true, playsinline: true })
    : h('img', { src: url, alt: 'Preview of your share card' });
  if (isVideo) preview.setAttribute('muted', '');

  openSheet((close) => [
    h('h2', { class: 'sheet-title serif' }, title),
    h('div', { class: 'ready-preview' }, preview),
    !isVideo && h('p', { class: 'sheet-note mono' }, 'Tip: press and hold the image to save it to Photos.'),
    h('div', { class: 'sheet-actions' },
      h('button', { class: 'btn', onClick: () => download(url, filename) }, icon('download', 18), 'Save'),
      canShare && h('button', {
        class: 'btn primary',
        onClick: async () => {
          try {
            await navigator.share({ files: [file] });
            close();
          } catch (err) {
            if (err.name !== 'AbortError') toast('Sharing didn’t work here. Use Save instead.');
          }
        },
      }, icon('share', 18), 'Share')),
  ], { label: title, onClose: () => setTimeout(() => URL.revokeObjectURL(url), 1000) });
}

export async function shareLink({ title, text, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return true;
    } catch (err) {
      if (err.name === 'AbortError') return false;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied. Paste it to a friend.');
    return true;
  } catch {
    return false;
  }
}
