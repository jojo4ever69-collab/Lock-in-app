import { h, icon, fmtClock, toast, openSheet, confirmSheet } from '../ui.js';
import { Recorder, keepAwake, releaseAwake, primeAudio, chime } from '../recorder.js';
import { sessions } from '../db.js';
import { getSettings, saveSettings, getCategories, addCategory } from '../store.js';

const DIM_AFTER = 6000;     // ms without a touch before the screen goes black
const HOLD_TO_FINISH = 900; // ms
const MIN_SESSION = 5000;   // shorter sessions aren't saved
const GOALS = [25, 50, 90, 0];

export async function RecordView(root, { navigate, setRecording }) {
  let settings = await getSettings();
  let categories = await getCategories();
  let category = categories.some((c) => c.name === settings.category) ? settings.category : categories[0].name;
  let goalMin = settings.goalMin;
  let state = 'idle'; // 'idle' | 'recording' | 'saving'
  let run = null;
  let hadCamera = false;
  let ticker, saver, dimTimeout, holdTimeout;

  const video = h('video', { class: 'cam', playsinline: true, muted: true, autoplay: true });
  video.setAttribute('muted', '');
  const recorder = new Recorder(video);

  const label = h('div', { class: 'mono rec-label' });
  const timer = h('div', { class: 'rec-timer', role: 'timer', 'aria-live': 'off' });
  const dimTimer = h('div', { class: 'dim-timer' });
  const dim = h('div', { class: 'dim', onPointerDown: wake }, dimTimer, h('div', { class: 'mono dim-hint' }, 'Tap to wake'));
  const pill = h('div', { class: 'pill', hidden: true },
    icon('moon', 18),
    h('div', {}, h('strong', {}, 'Automatic dimming'), h('small', {}, 'Screen off, battery saved')));
  const catChips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Category' });
  const goalChips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Focus goal' });
  const setup = h('div', { class: 'rec-setup' }, catChips, goalChips);

  const ring = h('span', {
    class: 'rec-ring',
    'aria-hidden': 'true',
    html: '<svg viewBox="0 0 80 80"><circle class="track" cx="40" cy="40" r="37"/><circle class="progress" cx="40" cy="40" r="37"/></svg>',
  });
  const recBtn = h('button', {
    class: 'rec-btn',
    'aria-label': 'Start recording',
    onClick: onRecClick,
    onPointerDown: holdStart,
    onPointerUp: holdEnd,
    onPointerLeave: holdEnd,
    onPointerCancel: holdEnd,
    onContextMenu: (e) => e.preventDefault(),
  }, ring, h('span', { class: 'core' }));
  const hint = h('div', { class: 'mono rec-hint' });
  const flipBtn = h('button', { class: 'round-btn glass', 'aria-label': 'Switch camera', onClick: flip }, icon('flip'));
  const camError = h('div', { class: 'cam-error', hidden: true });

  const el = h('section', { class: 'record', onPointerDown: () => state === 'recording' && scheduleDim() },
    video,
    h('div', { class: 'cam-shade' }),
    h('header', { class: 'rec-top' }, label, timer),
    camError,
    h('div', { class: 'rec-bottom' },
      setup,
      pill,
      h('div', { class: 'rec-controls' },
        h('span'),
        h('div', { class: 'rec-btn-wrap' }, recBtn, hint),
        flipBtn)),
    dim);
  root.append(el);

  renderChips();
  paintIdle();
  startCamera(settings.facing);

  // ---- Setup ----------------------------------------------------------

  function renderChips() {
    catChips.replaceChildren(
      ...categories.map((c) => h('button', {
        class: 'chip',
        'aria-pressed': String(c.name === category),
        onClick: () => {
          category = c.name;
          saveSettings({ category });
          renderChips();
          paintIdle();
        },
      }, h('i', { class: 'swatch', style: { background: c.color } }), c.name)),
      h('button', { class: 'chip ghost', onClick: newCategory }, icon('plus', 14), 'New'),
    );
    goalChips.replaceChildren(...GOALS.map((g) => h('button', {
      class: 'chip',
      'aria-pressed': String(g === goalMin),
      onClick: () => {
        goalMin = g;
        saveSettings({ goalMin });
        renderChips();
        paintIdle();
      },
    }, g ? `${g} min` : 'No limit')));
  }

  function newCategory() {
    openSheet((close) => {
      const input = h('input', { id: 'new-category', class: 'field', maxLength: 30, placeholder: 'e.g. Orgo, Thesis, Side project', autocomplete: 'off' });
      const submit = async (e) => {
        e.preventDefault();
        if (!input.value.trim()) return;
        categories = await addCategory(input.value);
        category = categories.find((c) => c.name.toLowerCase() === input.value.trim().toLowerCase())?.name ?? category;
        saveSettings({ category });
        renderChips();
        paintIdle();
        close();
      };
      return h('form', { class: 'sheet-form', onSubmit: submit },
        h('h2', { class: 'sheet-title serif' }, 'New category'),
        h('label', { class: 'mono', for: 'new-category' }, 'Name'),
        input,
        h('div', { class: 'sheet-actions' },
          h('button', { class: 'btn', type: 'button', onClick: () => close() }, 'Cancel'),
          h('button', { class: 'btn primary', type: 'submit' }, 'Add')));
    }, { label: 'New category' });
  }

  function paintIdle() {
    label.textContent = category.toUpperCase();
    timer.textContent = goalMin ? fmtClock(goalMin * 60000) : '00:00';
    timer.classList.remove('over');
    hint.textContent = 'Tap to start';
  }

  // ---- Camera ---------------------------------------------------------

  async function startCamera(facing) {
    camError.hidden = true;
    try {
      await recorder.openCamera(facing);
      hadCamera = true;
    } catch (err) {
      if (state !== 'recording') showCameraError(err);
    }
  }

  function showCameraError(err) {
    const messages = {
      NotAllowedError: 'Camera access is turned off for this site. Allow it in your browser’s site settings, then reload.',
      NotFoundError: 'No camera was found on this device.',
      NotReadableError: 'Another app is using the camera. Close it and try again.',
      OverconstrainedError: 'This camera doesn’t support the settings Lock In needs.',
      InsecureContextError: 'The camera only works when Lock In is opened over https.',
    };
    camError.replaceChildren(
      icon('camera', 28),
      h('p', {}, messages[err?.name] ?? 'The camera couldn’t start.'),
      h('button', { class: 'btn', onClick: () => startCamera(recorder.facing) }, 'Try again'),
      h('p', { class: 'mono' }, 'You can still track a session without video.'),
    );
    camError.hidden = false;
  }

  async function flip() {
    const facing = recorder.facing === 'user' ? 'environment' : 'user';
    settings = await saveSettings({ facing });
    startCamera(facing);
  }

  // ---- Recording ------------------------------------------------------

  function onRecClick(e) {
    if (state === 'idle') return begin();
    if (state !== 'recording') return;
    // Keyboard users can't hold, so they get a confirmation instead.
    if (e.detail === 0) return confirmFinish();
    hint.classList.remove('nudge');
    void hint.offsetWidth;
    hint.classList.add('nudge');
  }

  async function confirmFinish() {
    const ok = await confirmSheet({ title: 'Finish this session?', action: 'Finish' });
    if (ok) finish();
  }

  function begin() {
    primeAudio();
    state = 'recording';
    run = {
      id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      startedAt: Date.now(),
      awayMs: 0,
      awayFrom: null,
      distractions: 0,
      category,
      goalMs: goalMin * 60000,
      goalHit: false,
    };
    recorder.startCapture(run.id, settings.quality);
    keepAwake();
    setRecording(true);
    el.classList.add('is-recording');
    recBtn.setAttribute('aria-label', 'Hold to finish');
    hint.textContent = 'Hold to finish';
    pill.hidden = false;
    ticker = setInterval(tick, 250);
    saver = setInterval(saveDraft, 15000);
    tick();
    saveDraft();
    scheduleDim();
    document.addEventListener('visibilitychange', onVisibility);
    navigator.storage?.persist?.().catch(() => {});
  }

  function activeMs(now = Date.now()) {
    const away = run.awayMs + (run.awayFrom ? now - run.awayFrom : 0);
    return Math.max(0, now - run.startedAt - away);
  }

  function tick() {
    const ms = activeMs();
    let text;
    let over = false;
    if (run.goalMs) {
      const left = run.goalMs - ms;
      over = left <= 0;
      text = over ? '+' + fmtClock(-left) : fmtClock(left + 999);
      if (over && !run.goalHit) {
        run.goalHit = true;
        chime();
        wake();
        toast(`${run.goalMs / 60000} minutes done. Keep going, or hold to finish.`);
      }
    } else {
      text = fmtClock(ms);
    }
    timer.textContent = text;
    dimTimer.textContent = text;
    timer.classList.toggle('over', over);
    dimTimer.classList.toggle('over', over);
  }

  function scheduleDim() {
    clearTimeout(dimTimeout);
    dimTimeout = setTimeout(() => dim.classList.add('on'), DIM_AFTER);
  }

  function wake() {
    dim.classList.remove('on');
    if (state === 'recording') scheduleDim();
  }

  function holdStart(e) {
    if (state !== 'recording' || e.button > 0) return;
    recBtn.classList.add('holding');
    clearTimeout(holdTimeout);
    holdTimeout = setTimeout(finish, HOLD_TO_FINISH);
  }

  function holdEnd() {
    recBtn.classList.remove('holding');
    clearTimeout(holdTimeout);
  }

  function draft(status) {
    return {
      id: run.id,
      status,
      startedAt: run.startedAt,
      endedAt: Date.now(),
      duration: activeMs(),
      awayMs: run.awayMs,
      distractions: run.distractions,
      category: run.category,
      goalMs: run.goalMs,
      note: '',
      frameCount: recorder.frameCount,
      interval: recorder.interval,
      width: recorder.width || 0,
      height: recorder.height || 0,
      cover: null,
    };
  }

  // Saved every 15 s so a crash or a killed tab doesn't lose the session.
  function saveDraft() {
    if (state === 'recording') sessions.put(draft('recording')).catch(() => {});
  }

  async function onVisibility() {
    if (state !== 'recording') return;
    if (document.hidden) {
      run.awayFrom = Date.now();
      run.distractions++;
      recorder.pause();
      saveDraft();
      return;
    }
    if (run.awayFrom) {
      run.awayMs += Date.now() - run.awayFrom;
      run.awayFrom = null;
    }
    keepAwake();
    wake();
    // Phones often stop the camera while the app is in the background.
    if (hadCamera && !recorder.hasCamera) await startCamera(recorder.facing);
    recorder.resume();
    toast(run.distractions === 1 ? 'You left the app once this session.' : `You’ve left the app ${run.distractions} times this session.`);
  }

  function stopTimers() {
    clearInterval(ticker);
    clearInterval(saver);
    clearTimeout(dimTimeout);
    clearTimeout(holdTimeout);
    document.removeEventListener('visibilitychange', onVisibility);
  }

  async function finish() {
    if (state !== 'recording') return;
    state = 'saving';
    holdEnd();
    stopTimers();
    releaseAwake();
    dim.classList.remove('on');
    hint.textContent = 'Saving…';
    const session = draft('done');
    const shot = await recorder.stopCapture();
    Object.assign(session, {
      frameCount: shot.frameCount,
      interval: shot.interval,
      width: shot.width,
      height: shot.height,
      cover: shot.cover ?? null,
    });
    recorder.closeCamera();
    setRecording(false);

    if (session.duration < MIN_SESSION) {
      await sessions.delete(session.id);
      toast('Sessions shorter than 5 seconds aren’t saved.');
      resetToIdle();
      return;
    }
    await sessions.put(session);
    navigate(`#/s/${session.id}/new`);
  }

  function resetToIdle() {
    state = 'idle';
    run = null;
    el.classList.remove('is-recording');
    recBtn.setAttribute('aria-label', 'Start recording');
    pill.hidden = true;
    paintIdle();
    startCamera(recorder.facing);
  }

  return {
    canLeave: () => state !== 'recording',
    destroy() {
      stopTimers();
      releaseAwake();
      // Only reachable if the view is torn down mid-session; the draft is
      // finished on the next launch.
      if (state === 'recording') saveDraft();
      recorder.stopCapture();
      recorder.closeCamera();
      setRecording(false);
    },
  };
}
