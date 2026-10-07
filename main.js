// Main process = the "backend". Holds the state, persists it to a JSON file,
// runs the timers, and owns the two windows (Notion-style app + floating dog).
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification, screen } = require('electron');
const path = require('path');
const fs = require('fs');

app.setAppUserModelId('com.local.tododog');

const DATA_FILE = path.join(app.getPath('userData'), 'data.json');
const WIDGET_W = 240;
const WIDGET_H = 270;
const WALK_EVERY_MS = 15 * 60 * 1000;
const WALK_SPEED = 70; // px per second
const startHidden = process.argv.includes('--hidden');

let state;
let mainWin = null;
let widgetWin = null;
let tray = null;
let quitting = false;

// ---------- state helpers ----------

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const elapsed = (t) => t.elapsedMs + (t.startedAt ? Date.now() - t.startedAt : 0);

function newTask(title = '', durationSec = 25 * 60) {
  const now = Date.now();
  return {
    id: uid(), title, status: 'todo', durationSec,
    elapsedMs: 0, startedAt: null, finishedAt: null,
    notes: '', createdAt: now, updatedAt: now,
  };
}

function defaultState() {
  return {
    projects: [{
      id: uid(), name: 'Getting Started', icon: '🐶', createdAt: Date.now(),
      tasks: [
        newTask('Click the dog to open this window', 5 * 60),
        newTask('Press play on a task to start its timer', 25 * 60),
        newTask('Drag the dog anywhere on your screen', 10 * 60),
      ],
    }],
    activeTaskId: null,
    settings: { widgetVisible: true, widgetPos: null },
  };
}

function load() {
  if (!fs.existsSync(DATA_FILE)) return defaultState();
  try {
    const s = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    s.projects ||= [];
    s.settings = { widgetVisible: true, widgetPos: null, ...s.settings };
    return s;
  } catch {
    fs.copyFileSync(DATA_FILE, DATA_FILE.replace(/\.json$/, `.corrupt-${Date.now()}.json`));
    return defaultState();
  }
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 250);
}
function saveNow() {
  clearTimeout(saveTimer);
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function findProject(id) {
  const p = state.projects.find((x) => x.id === id);
  if (!p) throw new Error('Project not found');
  return p;
}
function findTask(id) {
  for (const project of state.projects) {
    const task = project.tasks.find((t) => t.id === id);
    if (task) return { project, task };
  }
  return null;
}
function mustTask(id) {
  const f = findTask(id);
  if (!f) throw new Error('Task not found');
  return f;
}
function pause(t) {
  if (!t.startedAt) return;
  t.elapsedMs = Math.min(elapsed(t), t.durationSec * 1000);
  t.startedAt = null;
}

// Every mutation the UI can make. Each returns an optional result (e.g. a new id).
const actions = {
  addProject({ name = '', icon = '' }) {
    const p = { id: uid(), name, icon, createdAt: Date.now(), tasks: [] };
    state.projects.push(p);
    return p.id;
  },
  updateProject({ id, name, icon }) {
    const p = findProject(id);
    if (name !== undefined) p.name = name;
    if (icon !== undefined) p.icon = icon;
  },
  deleteProject({ id }) {
    const p = findProject(id);
    if (p.tasks.some((t) => t.id === state.activeTaskId)) state.activeTaskId = null;
    state.projects = state.projects.filter((x) => x !== p);
  },
  addTask({ projectId, title = '', status = 'todo', durationSec = 25 * 60 }) {
    const t = newTask(title, durationSec);
    t.status = status;
    findProject(projectId).tasks.push(t);
    return t.id;
  },
  updateTask({ id, title, notes, status, durationSec }) {
    const { task: t } = mustTask(id);
    if (title !== undefined) t.title = title;
    if (notes !== undefined) t.notes = notes;
    if (status !== undefined) {
      t.status = status;
      if (status === 'done') pause(t);
    }
    if (durationSec !== undefined && durationSec > 0) {
      t.durationSec = durationSec;
      if (elapsed(t) < durationSec * 1000) t.finishedAt = null;
      else { pause(t); t.elapsedMs = durationSec * 1000; t.finishedAt ||= Date.now(); }
    }
    t.updatedAt = Date.now();
  },
  deleteTask({ id }) {
    const { project } = mustTask(id);
    project.tasks = project.tasks.filter((t) => t.id !== id);
    if (state.activeTaskId === id) state.activeTaskId = null;
  },
  moveTask({ id, status, beforeId }) {
    const { project, task } = mustTask(id);
    project.tasks.splice(project.tasks.indexOf(task), 1);
    if (status) {
      task.status = status;
      if (status === 'done') pause(task);
    }
    let idx = beforeId ? project.tasks.findIndex((t) => t.id === beforeId) : -1;
    if (idx < 0) idx = project.tasks.length;
    project.tasks.splice(idx, 0, task);
  },
  startTimer({ id }) {
    for (const p of state.projects) p.tasks.forEach(pause); // one timer at a time
    const { task: t } = mustTask(id);
    if (elapsed(t) >= t.durationSec * 1000) t.elapsedMs = 0; // restart a finished timer
    t.finishedAt = null;
    t.startedAt = Date.now();
    if (t.status === 'todo') t.status = 'doing';
    state.activeTaskId = id;
  },
  pauseTimer({ id }) {
    pause(mustTask(id).task);
  },
  resetTimer({ id }) {
    const { task: t } = mustTask(id);
    t.elapsedMs = 0;
    t.finishedAt = null;
    if (t.startedAt) t.startedAt = Date.now();
  },
  addTime({ id, sec }) {
    const { task: t } = mustTask(id);
    t.durationSec += sec;
    if (elapsed(t) < t.durationSec * 1000) t.finishedAt = null;
  },
  setActive({ id }) {
    state.activeTaskId = id;
  },
  replaceState({ state: s }) {
    s.settings = state.settings;
    state = s;
  },
};

// Save + push the new state to every window except the one that made the change
// (it gets the state back as the dispatch result).
function commit(sender) {
  scheduleSave();
  for (const w of [mainWin, widgetWin]) {
    if (w && !w.isDestroyed() && w.webContents !== sender) w.webContents.send('state', state);
  }
}

// Timer watchdog: finish timers that ran out and notify.
setInterval(() => {
  if (!state) return;
  let changed = false;
  for (const p of state.projects) {
    for (const t of p.tasks) {
      if (t.startedAt && elapsed(t) >= t.durationSec * 1000) {
        t.elapsedMs = t.durationSec * 1000;
        t.startedAt = null;
        t.finishedAt = Date.now();
        changed = true;
        if (Notification.isSupported()) {
          const n = new Notification({ title: "Time's up! 🐶", body: `${t.title || 'Untitled'} — ${p.name || 'Untitled'}` });
          n.on('click', () => showMain({ type: 'task', id: t.id }));
          n.show();
        }
      }
    }
  }
  if (changed) commit(null);
  updateTrayTooltip();
}, 500);

// ---------- icon (16px pixel dog, drawn in code so there are no asset files) ----------

function dogIcon(scale = 1) {
  const art = [
    '................',
    '.dd..........dd.',
    'dddd........dddd',
    'ddddwwwwwwwwdddd',
    'dddwwwwwwwwwwddd',
    'ddwwwwwwwwwwwwdd',
    '.dwwkkwwwwkkwwd.',
    '..wwkkwwwwkkww..',
    '..wwwwwwwwwwww..',
    '..wwwwwkkwwwww..',
    '...wwwwkkwwww...',
    '...wwwkwwkwww...',
    '....wwwwwwww....',
    '.....wwwwww.....',
    '................',
    '................',
  ];
  const colors = { k: [20, 20, 20], w: [236, 236, 236], d: [120, 120, 120] };
  const size = 16 * scale;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = colors[art[Math.floor(y / scale)][Math.floor(x / scale)]];
      if (!c) continue;
      const i = (y * size + x) * 4;
      buf[i] = c[2]; buf[i + 1] = c[1]; buf[i + 2] = c[0]; buf[i + 3] = 255; // BGRA
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

// ---------- windows ----------

const preload = path.join(__dirname, 'preload.js');

function createMain(show) {
  mainWin = new BrowserWindow({
    width: 1280, height: 820, minWidth: 760, minHeight: 480,
    show: false,
    backgroundColor: '#191919',
    title: 'Todo',
    icon: dogIcon(4),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#191919', symbolColor: '#9b9b9b', height: 44 },
    webPreferences: { preload },
  });
  mainWin.setMenu(null);
  mainWin.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (show) mainWin.once('ready-to-show', () => mainWin.show());
  // Closing just hides the window — the dog keeps running. Quit from the tray or the dog's menu.
  mainWin.on('close', (e) => {
    if (!quitting) { e.preventDefault(); mainWin.hide(); }
  });
}

function showMain(route) {
  if (!mainWin || mainWin.isDestroyed()) createMain(false);
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.show();
  mainWin.focus();
  if (!route) return;
  const send = () => mainWin.webContents.send('navigate', route);
  if (mainWin.webContents.isLoading()) mainWin.webContents.once('did-finish-load', send);
  else send();
}

function widgetBounds() {
  const pos = state.settings.widgetPos;
  if (pos) {
    const onScreen = screen.getAllDisplays().some(({ workArea: a }) =>
      pos.x + WIDGET_W / 2 > a.x && pos.x + WIDGET_W / 2 < a.x + a.width &&
      pos.y + WIDGET_H / 2 > a.y && pos.y + WIDGET_H / 2 < a.y + a.height);
    if (onScreen) return { ...pos, width: WIDGET_W, height: WIDGET_H };
  }
  const a = screen.getPrimaryDisplay().workArea;
  return { x: a.x + a.width - WIDGET_W - 16, y: a.y + a.height - WIDGET_H, width: WIDGET_W, height: WIDGET_H };
}

function createWidget() {
  widgetWin = new BrowserWindow({
    ...widgetBounds(),
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    alwaysOnTop: true,
    webPreferences: { preload },
  });
  widgetWin.setAlwaysOnTop(true, 'screen-saver');
  widgetWin.setVisibleOnAllWorkspaces(true);
  // Transparent pixels pass clicks through to whatever is underneath;
  // the widget page turns this off while the cursor is over the dog or bubble.
  widgetWin.setIgnoreMouseEvents(true, { forward: true });
  widgetWin.loadFile(path.join(__dirname, 'renderer', 'widget.html'));
  widgetWin.once('ready-to-show', () => {
    if (state.settings.widgetVisible) widgetWin.showInactive();
  });
}

function setWidgetVisible(v) {
  state.settings.widgetVisible = v;
  if (v) widgetWin.showInactive();
  else widgetWin.hide();
  commit(null);
  buildTray();
}

// ---------- walks: every so often the dog strolls a little left or right ----------

let walkTimer = null;

function walk() {
  if (!widgetWin || widgetWin.isDestroyed() || !widgetWin.isVisible() || dragOrigin || walkTimer) return;
  const b = widgetWin.getBounds();
  const a = screen.getDisplayMatching(b).workArea;
  const dist = 90 + Math.round(Math.random() * 90);
  let dir = Math.random() < 0.5 ? -1 : 1;
  // turn around rather than walk off the edge of the screen
  if (b.x + dir * dist < a.x || b.x + WIDGET_W + dir * dist > a.x + a.width) dir = -dir;
  const fromX = b.x;
  const toX = Math.max(a.x, Math.min(a.x + a.width - WIDGET_W, fromX + dir * dist));
  const ms = (Math.abs(toX - fromX) / WALK_SPEED) * 1000;
  if (ms < 300) return;
  widgetWin.webContents.send('walk', { dir });
  const t0 = Date.now();
  walkTimer = setInterval(() => {
    if (widgetWin.isDestroyed()) return stopWalk();
    const k = Math.min(1, (Date.now() - t0) / ms);
    widgetWin.setBounds({ x: Math.round(fromX + (toX - fromX) * k), y: b.y, width: WIDGET_W, height: WIDGET_H });
    if (k === 1) stopWalk();
  }, 16);
}

function stopWalk() {
  if (!walkTimer) return;
  clearInterval(walkTimer);
  walkTimer = null;
  if (widgetWin.isDestroyed()) return;
  widgetWin.webContents.send('walk', null);
  const [x, y] = widgetWin.getPosition();
  state.settings.widgetPos = { x, y };
  scheduleSave();
}

// ---------- tray + menus ----------

function timerMenuItems() {
  const f = state.activeTaskId && findTask(state.activeTaskId);
  if (!f) return [];
  const running = !!f.task.startedAt;
  return [{
    label: `${running ? 'Pause' : 'Start'} "${(f.task.title || 'Untitled').slice(0, 30)}"`,
    click: () => { actions[running ? 'pauseTimer' : 'startTimer']({ id: f.task.id }); commit(null); },
  }, { type: 'separator' }];
}

function buildTray() {
  if (!tray) {
    tray = new Tray(dogIcon(1));
    tray.on('click', () => showMain());
  }
  const login = app.getLoginItemSettings({ path: process.execPath, args: loginArgs() }).openAtLogin;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Todo', click: () => showMain() },
    { label: 'Show dog', type: 'checkbox', checked: state.settings.widgetVisible, click: (i) => setWidgetVisible(i.checked) },
    { label: 'Start with Windows', type: 'checkbox', checked: login, click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked, path: process.execPath, args: loginArgs() }) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
  updateTrayTooltip();
}

function loginArgs() {
  return app.isPackaged ? ['--hidden'] : [path.resolve(__dirname), '--hidden'];
}

function updateTrayTooltip() {
  if (!tray) return;
  const f = state.activeTaskId && findTask(state.activeTaskId);
  if (!f) return tray.setToolTip('Todo');
  const left = Math.max(0, Math.ceil((f.task.durationSec * 1000 - elapsed(f.task)) / 1000));
  const mm = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  tray.setToolTip(`${f.task.title || 'Untitled'} — ${mm}${f.task.startedAt ? '' : ' (paused)'}`);
}

// ---------- IPC ----------

ipcMain.handle('state:get', () => state);
ipcMain.handle('dispatch', (e, type, payload) => {
  const fn = actions[type];
  if (!fn) throw new Error(`Unknown action: ${type}`);
  const result = fn(payload || {});
  commit(e.sender);
  return { state, result };
});

let dragOrigin = null;
ipcMain.on('widget:ignore', (_e, ignore) => widgetWin?.setIgnoreMouseEvents(ignore, { forward: true }));
ipcMain.on('widget:drag-start', () => { stopWalk(); dragOrigin = widgetWin.getPosition(); });
ipcMain.on('widget:drag', (_e, dx, dy) => {
  // setBounds (not setPosition) avoids the transparent-window size drift on scaled displays.
  if (dragOrigin) widgetWin.setBounds({ x: Math.round(dragOrigin[0] + dx), y: Math.round(dragOrigin[1] + dy), width: WIDGET_W, height: WIDGET_H });
});
ipcMain.on('widget:drag-end', () => {
  dragOrigin = null;
  const [x, y] = widgetWin.getPosition();
  state.settings.widgetPos = { x, y };
  scheduleSave();
});
ipcMain.on('widget:click', () => {
  const id = state.activeTaskId;
  showMain(id && findTask(id) ? { type: 'task', id } : { type: 'home' });
});
ipcMain.on('widget:menu', () => {
  Menu.buildFromTemplate([
    { label: 'Open Todo', click: () => showMain() },
    ...timerMenuItems(),
    { label: 'Go for a walk', click: walk },
    { label: 'Hide dog', click: () => setWidgetVisible(false) },
    { label: 'Quit', click: () => app.quit() },
  ]).popup({ window: widgetWin });
});
ipcMain.on('widget:toggle', () => setWidgetVisible(!state.settings.widgetVisible));

// ---------- lifecycle ----------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showMain());
  app.whenReady().then(() => {
    state = load();
    createMain(!startHidden);
    createWidget();
    buildTray();
    setInterval(walk, WALK_EVERY_MS);
    screen.on('display-removed', () => widgetWin.setBounds(widgetBounds()));
  });
  app.on('before-quit', () => {
    quitting = true;
    if (state) saveNow();
  });
  app.on('window-all-closed', () => {}); // keep running in the tray
}
