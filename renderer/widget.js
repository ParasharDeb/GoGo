const { fmtClock, remainingMs, progress, isDone, findTask } = Shared;

const dog = document.getElementById('dog');
const bubble = document.getElementById('bubble');
const titleEl = document.getElementById('b-title');
const timeEl = document.getElementById('b-time');
const barEl = document.getElementById('b-bar');
const toggleBtn = document.getElementById('b-toggle');

const PLAY = '<svg viewBox="0 0 12 12"><path d="M3 1.8v8.4c0 .5.5.8.9.5l6.6-4.2c.4-.2.4-.8 0-1L3.9 1.3c-.4-.3-.9 0-.9.5z" fill="currentColor"/></svg>';
const PAUSE = '<svg viewBox="0 0 12 12"><rect x="2.2" y="1.5" width="2.8" height="9" rx=".8" fill="currentColor"/><rect x="7" y="1.5" width="2.8" height="9" rx=".8" fill="currentColor"/></svg>';
const CELEBRATE_MS = 8000;

let state = null;

api.getState().then((s) => { state = s; update(); });
api.onState((s) => { state = s; update(); });
setInterval(update, 250);

function active() {
  return state && state.activeTaskId ? findTask(state, state.activeTaskId) : null;
}

function update() {
  if (!state) return;
  const f = active();
  const t = f && f.task;
  const running = !!(t && t.startedAt);
  const done = !!(t && isDone(t));
  const celebrate = done && Date.now() - t.finishedAt < CELEBRATE_MS;

  setClass(dog, { sleep: !t, run: running, done, celebrate });
  setClass(bubble, { empty: !t, running, done, celebrate });

  if (!t) {
    setText(titleEl, 'Zzz… no task running');
    return;
  }
  setText(titleEl, t.title || 'Untitled');
  setText(timeEl, done ? "Woof! Time's up" : fmtClock(remainingMs(t)));
  barEl.style.width = `${(progress(t) * 100).toFixed(2)}%`;
  const icon = running ? 'pause' : 'play';
  if (toggleBtn.dataset.icon !== icon) {
    toggleBtn.dataset.icon = icon;
    toggleBtn.innerHTML = running ? PAUSE : PLAY;
  }
}

function setClass(el, map) {
  for (const [k, v] of Object.entries(map)) el.classList.toggle(k, v);
}
function setText(el, v) {
  if (el.textContent !== v) el.textContent = v;
}

toggleBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
toggleBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  const f = active();
  if (!f) return;
  const r = await api.dispatch(f.task.startedAt ? 'pauseTimer' : 'startTimer', { id: f.task.id });
  state = r.state;
  update();
});

// ---------- click-through: only the dog and bubble catch the mouse ----------

let ignoring = true;
let dragging = false;
function setIgnore(v) {
  if (v === ignoring) return;
  ignoring = v;
  api.widget.ignore(v);
}
document.addEventListener('mousemove', (e) => setIgnore(!dragging && !e.target.closest('.hit')));
document.addEventListener('mouseleave', () => { if (!dragging) setIgnore(true); });

// ---------- drag to move, click to open, right-click for menu ----------

function draggable(el) {
  let start = null;
  let moved = false;
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    el.setPointerCapture(e.pointerId);
    start = { x: e.screenX, y: e.screenY };
    moved = false;
    dragging = true;
    api.widget.dragStart();
  });
  el.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dx = e.screenX - start.x;
    const dy = e.screenY - start.y;
    if (!moved && Math.hypot(dx, dy) < 4) return;
    moved = true;
    api.widget.drag(dx, dy);
  });
  el.addEventListener('pointerup', () => {
    if (!start) return;
    start = null;
    dragging = false;
    if (moved) {
      api.widget.dragEnd();
    } else {
      dog.classList.remove('squish');
      void dog.offsetWidth;
      dog.classList.add('squish');
      api.widget.click();
    }
  });
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    api.widget.menu();
  });
}
draggable(dog);
draggable(bubble);

// ---------- petting: stroke the mouse up and down over the dog ----------

const PET_STROKES = 2; // up/down strokes (within PET_WINDOW_MS) before it counts as petting
const PET_WINDOW_MS = 1500;
const PET_MIN_TRAVEL = 10; // px of travel before a direction change counts as a stroke

let petY = null;
let petDir = 0;
let petTravel = 0;
let strokes = [];
let petEnd = null;

dog.addEventListener('mousemove', (e) => {
  if (e.buttons || dragging) return;
  const dy = petY === null ? 0 : e.clientY - petY;
  petY = e.clientY;
  if (!dy) return;
  const dir = Math.sign(dy);
  if (dir === petDir) {
    petTravel += Math.abs(dy);
    return;
  }
  if (petTravel >= PET_MIN_TRAVEL) stroke();
  petDir = dir;
  petTravel = Math.abs(dy);
});
dog.addEventListener('mouseleave', () => {
  petY = null;
  petDir = 0;
  petTravel = 0;
});

function stroke() {
  const now = Date.now();
  strokes = strokes.filter((t) => now - t < PET_WINDOW_MS);
  strokes.push(now);
  if (strokes.length < PET_STROKES) return;
  dog.classList.add('pet');
  heart();
  clearTimeout(petEnd);
  petEnd = setTimeout(() => dog.classList.remove('pet'), 900);
}

function heart() {
  const h = document.createElement('span');
  h.className = 'heart';
  h.textContent = '♥';
  h.style.left = `${36 + Math.random() * 56}px`;
  h.addEventListener('animationend', () => h.remove());
  dog.appendChild(h);
}

// ---------- walks (driven by the main process, which moves the window) ----------

api.onWalk((w) => {
  dog.classList.toggle('walk', !!w);
  if (w) dog.style.setProperty('--dir', w.dir);
});
