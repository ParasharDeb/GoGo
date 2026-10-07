'use strict';
const { esc, fmtClock, fmtDur, parseDur, remainingMs, elapsedMs, progress, isDone, findTask } = Shared;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const STATUS = { todo: 'Not started', doing: 'In progress', done: 'Done' };
const EMOJIS = ['🐶', '🐾', '📁', '📝', '📚', '💼', '🎯', '🧠', '💡', '🏠',
  '🛒', '🎨', '🎵', '🏋️', '🍳', '✈️', '💻', '🔧', '📈', '🗂️',
  '📌', '⭐', '🔥', '🌙', '☕', '🎮', '📷', '🧹', '💰', '🩺',
  '🌱', '🚀', '🧪', '📦', '🗓️', '✏️', '🎓', '🧩', '🎬', '❤️'];

let state = null;
let pendingRender = false;

// UI-only preferences live in localStorage; the real data lives in the backend.
const ui = Object.assign(
  { route: { type: 'home' }, width: 240, collapsed: false, expanded: {}, views: {} },
  readUI(),
);
function readUI() {
  try { return JSON.parse(localStorage.getItem('ui')) || {}; } catch { return {}; }
}
function saveUI() {
  try { localStorage.setItem('ui', JSON.stringify(ui)); } catch { /* ignore */ }
}

// ---------------------------------------------------------------- backend calls

async function act(type, payload) {
  const r = await api.dispatch(type, payload);
  state = r.state;
  render();
  return r.result;
}

// Debounced saves for text that is typed character by character.
const saves = new Map();
function queueSave(key, fn, ms = 300) {
  clearTimeout(saves.get(key)?.timer);
  saves.set(key, { fn, timer: setTimeout(() => runSave(key), ms) });
}
function runSave(key) {
  const s = saves.get(key);
  if (!s) return Promise.resolve();
  saves.delete(key);
  clearTimeout(s.timer);
  return s.fn().then((r) => { state = r.state; });
}
function flushSaves() {
  return Promise.all([...saves.keys()].map(runSave));
}

// ---------------------------------------------------------------- lookups

const getProject = (id) => state.projects.find((p) => p.id === id);
const getTask = (id) => findTask(state, id)?.task;

function current() {
  const r = ui.route;
  if (r.type === 'project') {
    const project = getProject(r.id);
    if (project) return { type: 'project', project };
  }
  if (r.type === 'task') {
    const f = findTask(state, r.id);
    if (f) return { type: 'task', ...f };
  }
  return { type: 'home' };
}

function go(route) {
  flushSaves();
  ui.route = route;
  if (route.type === 'task') {
    const f = findTask(state, route.id);
    if (f) ui.expanded[f.project.id] = true;
  }
  saveUI();
  closeLayer();
  render(true);
  $('#scroller').scrollTop = 0;
}

// ---------------------------------------------------------------- render

function isEditing() {
  const a = document.activeElement;
  return !!a && !a.closest('#layer') && (a.isContentEditable || a.tagName === 'INPUT');
}

function render(force) {
  if (!state) return;
  if (!force && isEditing()) { pendingRender = true; return; }
  pendingRender = false;
  renderSidebar();
  renderTopbar();
  renderPage();
  tick();
}

const projIcon = (p) => (p.icon ? `<span class="emoji">${esc(p.icon)}</span>` : I.doc);
const pill = (status) => `<span class="pill ${status}">${STATUS[status]}</span>`;
const fmtDate = (ts) => new Date(ts).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).replace(' at ', ' ');

function timeAgo(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function timerInline(t) {
  const on = !!t.startedAt;
  return `<div class="timer-inline">
    <button class="tbtn ${on ? 'on' : ''}" data-action="timer-toggle" data-id="${t.id}" title="${on ? 'Pause' : 'Start'}">${on ? I.pause : I.play}</button>
    <span class="ttime" data-timer="${t.id}"></span>
    <span class="tbar"><i data-bar="${t.id}"></i></span>
    <button class="icon-btn xs treset" data-action="timer-reset" data-id="${t.id}" title="Reset timer">${I.reset}</button>
  </div>`;
}

// ---- sidebar

function renderSidebar() {
  document.body.classList.toggle('sb-collapsed', ui.collapsed);
  const sb = $('#sidebar');
  sb.style.width = `${ui.width}px`;
  const r = current();
  sb.innerHTML = `
    <div class="sb-top">
      <div class="sb-switcher" data-action="nav-home">
        <div class="ws-avatar emoji">🐶</div><div class="ws-name">My Workspace</div>${I.chevronDown}
      </div>
      <div class="sb-top-btns">
        <button class="icon-btn" data-action="toggle-sidebar" title="Close sidebar (Ctrl+\\)">${I.dbl}</button>
        <button class="icon-btn" data-action="new-project" title="New project">${I.compose}</button>
      </div>
    </div>
    <div class="sb-nav">
      <div class="sb-item" data-action="search-open"><span class="sb-icon">${I.search}</span><span class="sb-label">Search</span><span class="kbd">Ctrl+K</span></div>
      <div class="sb-item ${r.type === 'home' ? 'selected' : ''}" data-action="nav-home"><span class="sb-icon">${I.home}</span><span class="sb-label">Home</span></div>
    </div>
    <div class="sb-scroll">
      <div class="sb-section"><span>Projects</span><button class="icon-btn" data-action="new-project" title="Add a project">${I.plus}</button></div>
      ${state.projects.map((p) => treeProject(p, r)).join('')}
      <div class="sb-item muted" data-action="new-project"><span class="sb-icon">${I.plus}</span><span class="sb-label">Add new</span></div>
    </div>
    <div class="sb-bottom">
      <div class="sb-item" data-action="widget-toggle"><span class="sb-icon">${I.paw}</span><span class="sb-label">${state.settings.widgetVisible ? 'Hide' : 'Show'} desktop dog</span></div>
    </div>
    <div class="sb-resizer"></div>`;
}

function treeProject(p, r) {
  const open = !!ui.expanded[p.id];
  const selected = r.type === 'project' && r.project.id === p.id;
  const children = p.tasks.length
    ? p.tasks.map((t) => treeTask(t, r)).join('')
    : '<div class="sb-empty" style="--depth:1">No tasks inside</div>';
  return `
    <div class="sb-item tree ${selected ? 'selected' : ''}" data-action="nav-project" data-id="${p.id}">
      <span class="sb-icon tree-icon"><span class="ic">${projIcon(p)}</span>
        <button class="tree-toggle ${open ? 'open' : ''}" data-action="tree-toggle" data-id="${p.id}">${I.chevron}</button></span>
      <span class="sb-label" data-label-project="${p.id}">${esc(p.name) || 'Untitled'}</span>
      <span class="sb-actions">
        <button class="icon-btn" data-action="tree-more" data-id="${p.id}" title="Delete, rename, and more…">${I.more}</button>
        <button class="icon-btn" data-action="tree-add" data-id="${p.id}" title="Add a task inside">${I.plus}</button>
      </span>
    </div>
    ${open ? children : ''}`;
}

function treeTask(t, r) {
  const selected = r.type === 'task' && r.task.id === t.id;
  return `
    <div class="sb-item ${selected ? 'selected' : ''} ${t.status === 'done' ? 'done' : ''}" style="--depth:1" data-action="nav-task" data-id="${t.id}">
      <span class="sb-icon">${t.startedAt ? '<span class="run-dot"></span>' : I.doc}</span>
      <span class="sb-label" data-label-task="${t.id}">${esc(t.title) || 'Untitled'}</span>
      <span class="sb-actions"><button class="icon-btn" data-action="row-more" data-id="${t.id}">${I.more}</button></span>
    </div>`;
}

// ---- topbar

function renderTopbar() {
  const r = current();
  const crumb = (icon, label, action = '', id = '', labelAttr = '') =>
    `<div class="crumb" ${action ? `data-action="${action}" data-id="${id}"` : ''}>${icon}<span class="crumb-label" ${labelAttr}>${esc(label) || 'Untitled'}</span></div>`;
  let crumbs = '';
  let right = '';
  if (r.type === 'home') {
    crumbs = crumb(I.home, 'Home');
  } else {
    crumbs = crumb(projIcon(r.project), r.project.name, 'nav-project', r.project.id, `data-label-project="${r.project.id}"`);
    if (r.type === 'task') {
      crumbs += `<span class="crumb-sep">/</span>${crumb(I.doc, r.task.title, 'nav-task', r.task.id, `data-label-task="${r.task.id}"`)}`;
      right += `<span class="tb-meta">Edited ${timeAgo(r.task.updatedAt || r.task.createdAt)}</span>`;
    }
    right += `<button class="icon-btn" data-action="page-more" title="More">${I.more}</button>`;
  }
  const a = state.activeTaskId && findTask(state, state.activeTaskId);
  const timerChip = a && (a.task.startedAt || isDone(a.task))
    ? `<div class="tb-timer" data-action="nav-task" data-id="${a.task.id}" title="${esc(a.task.title || 'Untitled')}">${I.timer}<span data-timer="${a.task.id}"></span></div>`
    : '';
  $('#topbar').innerHTML = `
    ${ui.collapsed ? `<button class="icon-btn" data-action="toggle-sidebar" title="Open sidebar (Ctrl+\\)">${I.menu}</button>` : ''}
    <div class="crumbs">${crumbs}</div>
    <div class="tb-right">${timerChip}${right}</div>`;
}

// ---- pages

function renderPage() {
  const r = current();
  const page = $('#page');
  if (r.type === 'project') page.innerHTML = projectPage(r.project);
  else if (r.type === 'task') page.innerHTML = taskPage(r.project, r.task);
  else page.innerHTML = homePage();
}

function homePage() {
  const h = new Date().getHours();
  const greet = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const all = state.projects.flatMap((p) => p.tasks.map((t) => ({ p, t })));
  const active = state.activeTaskId && findTask(state, state.activeTaskId);
  const doing = all.filter(({ t }) => t.status === 'doing' && (!active || t.id !== active.task.id));
  const row = ({ p, t }) => `
    <div class="list-row" data-action="nav-task" data-id="${t.id}">
      <span class="row-icon">${t.startedAt ? '<span class="run-dot"></span>' : I.doc}</span>
      <span class="lr-title">${esc(t.title) || 'Untitled'}</span>
      <span class="lr-path">${esc(p.name) || 'Untitled'}</span>
      ${pill(t.status)}
      ${timerInline(t)}
    </div>`;
  return `
    <div class="home">
      <h1 class="home-greet">${greet}</h1>
      <div class="home-section">
        <div class="hs-title">${I.clock} Projects</div>
        <div class="cards">
          ${state.projects.map((p) => `
            <div class="pcard" data-action="nav-project" data-id="${p.id}">
              <div class="pcard-top"></div>
              <div class="pcard-icon">${projIcon(p)}</div>
              <div class="pcard-name">${esc(p.name) || 'Untitled'}</div>
              <div class="pcard-meta">${p.tasks.filter((t) => t.status === 'done').length}/${p.tasks.length} done</div>
            </div>`).join('')}
          <div class="pcard new" data-action="new-project">${I.plus}<span>New project</span></div>
        </div>
      </div>
      <div class="home-section">
        <div class="hs-title">${I.timer} Current focus</div>
        ${active ? `<div class="list">${row({ p: active.project, t: active.task })}</div>`
          : '<div class="empty">No timer yet. Open a task and press play — the dog will keep an eye on it.</div>'}
      </div>
      <div class="home-section">
        <div class="hs-title">${I.status} In progress</div>
        ${doing.length ? `<div class="list">${doing.map(row).join('')}</div>` : '<div class="empty">Nothing else in progress.</div>'}
      </div>
    </div>`;
}

function projectPage(p) {
  const view = ui.views[p.id] || 'table';
  return `
    <div class="page-wide">
      <div class="page-head">
        <div class="page-controls">
          ${p.icon ? '' : `<button class="ghost-btn" data-action="icon-pick" data-id="${p.id}">${I.smile}Add icon</button>`}
        </div>
        ${p.icon ? `<div class="page-icon emoji" data-action="icon-pick" data-id="${p.id}">${esc(p.icon)}</div>` : ''}
        <h1 class="page-title" contenteditable="plaintext-only" spellcheck="false" data-edit="project-name" data-id="${p.id}" data-placeholder="Untitled">${esc(p.name)}</h1>
      </div>
      <div class="db">
        <div class="db-bar">
          <div class="db-tabs">
            <button class="db-tab ${view === 'table' ? 'active' : ''}" data-action="view" data-id="${p.id}" data-view="table">${I.table}Table</button>
            <button class="db-tab ${view === 'board' ? 'active' : ''}" data-action="view" data-id="${p.id}" data-view="board">${I.board}Board</button>
          </div>
          <div class="db-tools">
            <span class="db-count">${p.tasks.length} ${p.tasks.length === 1 ? 'task' : 'tasks'}</span>
            <button class="new-btn" data-action="new-task" data-id="${p.id}">New</button>
          </div>
        </div>
        ${view === 'board' ? boardView(p) : tableView(p)}
      </div>
    </div>`;
}

function tableView(p) {
  const rows = p.tasks.map((t) => `
    <div class="tr ${t.startedAt ? 'running' : ''} ${t.status === 'done' ? 'is-done' : ''}" data-row="${t.id}">
      <div class="row-handle"><button class="icon-btn xs" data-action="row-more" data-id="${t.id}" title="Task options">${I.grip}</button></div>
      <div class="td name" data-action="edit-name" data-id="${t.id}">
        <span class="row-icon">${I.doc}</span>
        <span class="cell-title" data-title-for="${t.id}" data-placeholder="Untitled">${esc(t.title)}</span>
        <button class="open-btn" data-action="nav-task" data-id="${t.id}">${I.open}OPEN</button>
      </div>
      <div class="td clickable" data-action="status" data-id="${t.id}">${pill(t.status)}</div>
      <div class="td clickable" data-action="duration" data-id="${t.id}">${fmtDur(t.durationSec)}</div>
      <div class="td">${timerInline(t)}</div>
      <div class="td muted">${fmtDate(t.createdAt)}</div>
      <div class="td"></div>
    </div>`).join('');
  return `
    <div class="table-scroll">
      <div class="table">
        <div class="thr">
          <div class="th">${I.title}Name</div>
          <div class="th">${I.status}Status</div>
          <div class="th">${I.clock}Time</div>
          <div class="th">${I.timer}Timer</div>
          <div class="th">${I.calendar}Created</div>
          <div class="th"></div>
        </div>
        ${rows}
        <div class="tr-new" data-action="new-task" data-id="${p.id}">${I.plus}New task</div>
      </div>
    </div>`;
}

function boardView(p) {
  return `<div class="board">${Object.keys(STATUS).map((status) => {
    const tasks = p.tasks.filter((t) => t.status === status);
    return `
      <div class="bcol" data-col="${status}">
        <div class="bcol-head">${pill(status)}<span class="bcount">${tasks.length}</span></div>
        <div class="bcards">${tasks.map((t) => `
          <div class="bcard ${t.status === 'done' ? 'is-done' : ''}" draggable="true" data-card="${t.id}" data-action="nav-task" data-id="${t.id}">
            <div class="bcard-title">${esc(t.title)}</div>
            <div class="bcard-props">
              <span class="chip">${I.clock}${fmtDur(t.durationSec)}</span>
              <span class="chip">
                <button class="tbtn ${t.startedAt ? 'on' : ''}" data-action="timer-toggle" data-id="${t.id}">${t.startedAt ? I.pause : I.play}</button>
                <span data-timer="${t.id}"></span>
              </span>
            </div>
          </div>`).join('')}
        </div>
        <div class="bnew" data-action="new-task" data-id="${p.id}" data-status="${status}">${I.plus}New task</div>
      </div>`;
  }).join('')}</div>`;
}

function taskPage(p, t) {
  const running = !!t.startedAt;
  const done = isDone(t);
  const started = elapsedMs(t) > 0;
  const label = running ? 'Focusing' : done ? 'Finished' : started ? 'Paused' : 'Ready';
  const prop = (icon, name, value, action) => `
    <div class="prop">
      <div class="prop-name">${icon}${name}</div>
      <div class="prop-value ${action ? 'clickable' : ''}" ${action ? `data-action="${action}" data-id="${t.id}"` : ''}>${value}</div>
    </div>`;
  return `
    <div class="page-narrow">
      <div class="page-head">
        <div class="page-controls"></div>
        <h1 class="page-title" contenteditable="plaintext-only" spellcheck="false" data-edit="task-title" data-id="${t.id}" data-placeholder="Untitled">${esc(t.title)}</h1>
      </div>
      <div class="props">
        ${prop(I.status, 'Status', pill(t.status), 'status')}
        ${prop(I.clock, 'Time', fmtDur(t.durationSec), 'duration')}
        ${prop(I.timer, 'Timer', timerInline(t))}
        ${prop(I.folder, 'Project', `<span class="prop-link" data-action="nav-project" data-id="${p.id}">${projIcon(p)}${esc(p.name) || 'Untitled'}</span>`)}
        ${prop(I.calendar, 'Created', fmtDate(t.createdAt))}
      </div>
      <div class="divider"></div>
      <div class="callout">
        <div class="callout-icon emoji">⏱️</div>
        <div class="focus-body">
          <div class="focus-label">${label} · ${fmtDur(t.durationSec)} assigned</div>
          <div class="focus-time" data-timer="${t.id}"></div>
          <div class="focus-bar"><i data-bar="${t.id}"></i></div>
          <div class="focus-actions">
            <button class="btn primary" data-action="timer-toggle" data-id="${t.id}">${running ? `${I.pause}Pause` : `${I.play}${started && !done ? 'Resume' : 'Start'}`}</button>
            <button class="btn" data-action="timer-add" data-id="${t.id}" data-sec="300">${I.plus}5 min</button>
            <button class="btn" data-action="timer-reset" data-id="${t.id}">${I.reset}Reset</button>
            ${t.status === 'done' ? '' : `<button class="btn" data-action="mark-done" data-id="${t.id}">${I.check}Mark done</button>`}
          </div>
        </div>
      </div>
      <div class="notes" contenteditable="plaintext-only" spellcheck="false" data-edit="task-notes" data-id="${t.id}" data-placeholder="Write notes… (Ctrl+Enter starts / pauses the timer)">${esc(t.notes)}</div>
    </div>`;
}

// ---------------------------------------------------------------- live timer updates

function tick() {
  if (!state) return;
  const map = new Map();
  for (const p of state.projects) for (const t of p.tasks) map.set(t.id, t);
  for (const el of $$('[data-timer]')) {
    const t = map.get(el.dataset.timer);
    if (!t) continue;
    const done = isDone(t);
    const txt = done ? "Time's up" : fmtClock(remainingMs(t));
    if (el.textContent !== txt) el.textContent = txt;
    el.classList.toggle('is-done', done);
  }
  for (const el of $$('[data-bar]')) {
    const t = map.get(el.dataset.bar);
    if (t) el.style.width = `${(progress(t) * 100).toFixed(2)}%`;
  }
  const a = state.activeTaskId && map.get(state.activeTaskId);
  document.title = a && a.startedAt ? `${fmtClock(remainingMs(a))} · ${a.title || 'Untitled'}` : 'Todo';
}
setInterval(tick, 250);

// ---------------------------------------------------------------- click actions

function toggleTimer(id) {
  const t = getTask(id);
  if (t) act(t.startedAt ? 'pauseTimer' : 'startTimer', { id });
}

async function newTask(projectId, status, inline) {
  const id = await act('addTask', { projectId, status: status || 'todo' });
  ui.expanded[projectId] = true;
  saveUI();
  if (inline) {
    render(true);
    startEditName(id);
  } else {
    go({ type: 'task', id });
    focusTitle();
  }
}

const handlers = {
  'nav-home': () => go({ type: 'home' }),
  'nav-project': (el) => go({ type: 'project', id: el.dataset.id }),
  'nav-task': (el) => go({ type: 'task', id: el.dataset.id }),
  'search-open': () => openSearch(),
  'toggle-sidebar': () => { ui.collapsed = !ui.collapsed; saveUI(); render(true); },
  'new-project': async () => {
    const id = await act('addProject', {});
    ui.expanded[id] = true;
    go({ type: 'project', id });
    focusTitle();
  },
  'tree-toggle': (el) => { ui.expanded[el.dataset.id] = !ui.expanded[el.dataset.id]; saveUI(); renderSidebar(); },
  'tree-add': (el) => newTask(el.dataset.id),
  'tree-more': (el) => projectMenu(el, el.dataset.id),
  'icon-pick': (el) => openIconPicker(el, el.dataset.id),
  'view': (el) => { ui.views[el.dataset.id] = el.dataset.view; saveUI(); render(true); },
  'new-task': (el) => newTask(el.dataset.id, el.dataset.status, (ui.views[el.dataset.id] || 'table') === 'table'),
  'edit-name': (el) => startEditName(el.dataset.id),
  'status': (el) => statusMenu(el, el.dataset.id),
  'duration': (el) => openDuration(el, el.dataset.id),
  'timer-toggle': (el) => toggleTimer(el.dataset.id),
  'timer-reset': (el) => act('resetTimer', { id: el.dataset.id }),
  'timer-add': (el) => act('addTime', { id: el.dataset.id, sec: +el.dataset.sec }),
  'mark-done': (el) => act('updateTask', { id: el.dataset.id, status: 'done' }),
  'row-more': (el) => taskMenu(el, el.dataset.id),
  'page-more': (el) => {
    const r = current();
    if (r.type === 'task') taskMenu(el, r.task.id, 'right');
    else if (r.type === 'project') projectMenu(el, r.project.id, 'right');
  },
  'widget-toggle': () => api.toggleWidget(),
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.closest('#layer')) return;
  handlers[el.dataset.action]?.(el, e);
});

// ---------------------------------------------------------------- inline editing

function placeCaretEnd(el) {
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function focusTitle() {
  const el = $('.page-title');
  if (el) placeCaretEnd(el);
}

function setLabels(kind, id, value) {
  for (const n of $$(`[data-label-${kind}="${id}"]`)) n.textContent = value || 'Untitled';
}

function startEditName(id) {
  const span = $(`[data-title-for="${id}"]`);
  if (!span || span.isContentEditable) return;
  const original = span.textContent;
  const cell = span.closest('.td');
  span.contentEditable = 'plaintext-only';
  span.classList.add('editing');
  cell.classList.add('editing');
  placeCaretEnd(span);
  span.onkeydown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); span.blur(); }
    if (e.key === 'Escape') { span.textContent = original; span.blur(); }
  };
  span.addEventListener('blur', () => {
    span.contentEditable = 'false';
    span.classList.remove('editing');
    cell.classList.remove('editing');
    const title = span.textContent.trim();
    if (title !== original) act('updateTask', { id, title });
    else if (pendingRender) render();
  }, { once: true });
}

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset?.titleFor) { setLabels('task', el.dataset.titleFor, el.textContent); return; }
  const kind = el.dataset?.edit;
  if (!kind) return;
  const id = el.dataset.id;
  if (!el.textContent.trim() && !el.textContent.includes(' ')) el.textContent = '';
  if (kind === 'project-name') {
    const name = el.textContent;
    const p = getProject(id);
    if (p) p.name = name;
    setLabels('project', id, name);
    queueSave(`p:${id}`, () => api.dispatch('updateProject', { id, name }));
  } else if (kind === 'task-title') {
    const title = el.textContent;
    const t = getTask(id);
    if (t) t.title = title;
    setLabels('task', id, title);
    queueSave(`t:${id}`, () => api.dispatch('updateTask', { id, title }));
  } else if (kind === 'task-notes') {
    const notes = el.innerText.replace(/\n$/, '');
    const t = getTask(id);
    if (t) t.notes = notes;
    queueSave(`n:${id}`, () => api.dispatch('updateTask', { id, notes }), 500);
  }
});

document.addEventListener('focusout', (e) => {
  if (e.target.dataset?.edit) {
    flushSaves().then(() => { if (!isEditing()) render(); });
  } else if (pendingRender) {
    setTimeout(() => { if (pendingRender && !isEditing()) render(); });
  }
});

// ---------------------------------------------------------------- keyboard

document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (mod && (key === 'k' || key === 'p')) { e.preventDefault(); openSearch(); return; }
  if (mod && key === '\\') { e.preventDefault(); handlers['toggle-sidebar'](); return; }
  if (mod && key === 'n') {
    e.preventDefault();
    const r = current();
    if (r.type === 'home') handlers['new-project']();
    else newTask(r.project.id);
    return;
  }
  if (e.key === 'Escape' && $('#layer').classList.contains('open')) { closeLayer(); return; }
  const kind = e.target.dataset?.edit;
  if ((kind === 'project-name' || kind === 'task-title') && e.key === 'Enter') {
    e.preventDefault();
    e.target.blur();
    if (kind === 'task-title') placeCaretEnd($('.notes'));
  }
  if (kind === 'task-notes' && mod && e.key === 'Enter') {
    e.preventDefault();
    flushSaves().then(() => toggleTimer(e.target.dataset.id));
  }
});

// ---------------------------------------------------------------- popovers & menus

function closeLayer() {
  const layer = $('#layer');
  layer.innerHTML = '';
  layer.classList.remove('open');
}

function showPopover(el, anchor, align = 'left') {
  const layer = $('#layer');
  layer.innerHTML = '';
  const back = document.createElement('div');
  back.className = 'backdrop';
  back.addEventListener('mousedown', closeLayer);
  layer.append(back, el);
  layer.classList.add('open');
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  let x = align === 'right' ? r.right - w : r.left;
  let y = r.bottom + 4;
  if (y + h > innerHeight - 8) y = Math.max(8, r.top - h - 4);
  x = Math.max(8, Math.min(x, innerWidth - w - 8));
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

function showModal(el) {
  const layer = $('#layer');
  layer.innerHTML = '';
  const back = document.createElement('div');
  back.className = 'backdrop dim';
  back.addEventListener('mousedown', closeLayer);
  layer.append(back, el);
  layer.classList.add('open');
}

function openMenu(anchor, items, align) {
  const m = document.createElement('div');
  m.className = 'menu';
  m.innerHTML = items.map((it, i) => {
    if (it === 'sep') return '<div class="menu-sep"></div>';
    if (it.header) return `<div class="menu-header">${esc(it.header)}</div>`;
    return `<div class="menu-item ${it.danger ? 'danger' : ''}" data-i="${i}">
      ${it.icon ? `<span class="mi-icon">${it.icon}</span>` : ''}
      <span class="mi-label">${it.html ?? esc(it.label)}</span>
      ${it.hint ? `<span class="mi-hint">${esc(it.hint)}</span>` : ''}
      ${it.checked ? `<span class="mi-check">${I.check}</span>` : ''}
    </div>`;
  }).join('');
  m.addEventListener('click', (e) => {
    const el = e.target.closest('.menu-item');
    if (!el) return;
    closeLayer();
    items[+el.dataset.i].onClick?.();
  });
  showPopover(m, anchor, align);
}

function statusMenu(anchor, id) {
  const t = getTask(id);
  if (!t) return;
  openMenu(anchor, [
    { header: 'Select an option' },
    ...Object.keys(STATUS).map((s) => ({
      html: pill(s),
      checked: t.status === s,
      onClick: () => act('updateTask', { id, status: s }),
    })),
  ]);
}

function openDuration(anchor, id) {
  const t = getTask(id);
  if (!t) return;
  const el = document.createElement('div');
  el.className = 'menu dur-pop';
  el.innerHTML = `
    <input class="pop-input" value="${esc(fmtDur(t.durationSec))}" placeholder="e.g. 25m, 1h 30m" spellcheck="false">
    <div class="menu-header">Quick pick</div>
    <div class="dur-presets">${[5, 10, 15, 25, 30, 45, 60, 90, 120].map((m) =>
      `<button class="chip-btn ${t.durationSec === m * 60 ? 'on' : ''}" data-m="${m}">${fmtDur(m * 60)}</button>`).join('')}</div>
    <div class="pop-hint">Type minutes (“40”), or “1h 30m” · Enter to save</div>`;
  showPopover(el, anchor);
  const input = el.querySelector('input');
  input.focus();
  input.select();
  const commit = (sec) => {
    if (!sec) {
      input.classList.remove('err');
      void input.offsetWidth;
      input.classList.add('err');
      return;
    }
    closeLayer();
    act('updateTask', { id, durationSec: sec });
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(parseDur(input.value)); });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-m]');
    if (b) commit(+b.dataset.m * 60);
  });
}

function openIconPicker(anchor, id) {
  const p = getProject(id);
  if (!p) return;
  const el = document.createElement('div');
  el.className = 'menu icon-pop';
  el.innerHTML = `
    <div class="icon-pop-head"><span>Emoji</span>${p.icon ? '<button class="ghost-btn" data-remove>Remove</button>' : ''}</div>
    <div class="emoji-grid">${EMOJIS.map((e) => `<button class="emoji" data-e="${e}">${e}</button>`).join('')}</div>`;
  showPopover(el, anchor);
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-e]');
    if (b) { closeLayer(); act('updateProject', { id, icon: b.dataset.e }); }
    if (e.target.closest('[data-remove]')) { closeLayer(); act('updateProject', { id, icon: '' }); }
  });
}

function projectMenu(anchor, id, align) {
  const p = getProject(id);
  if (!p) return;
  openMenu(anchor, [
    { icon: I.plus, label: 'Add task', onClick: () => newTask(id) },
    { icon: I.pencil, label: 'Rename', onClick: () => { go({ type: 'project', id }); focusTitle(); } },
    { icon: I.smile, label: 'Change icon', onClick: () => { go({ type: 'project', id }); openIconPicker($('.page-icon') || $('.page-title'), id); } },
    'sep',
    {
      icon: I.trash, label: 'Delete', danger: true,
      onClick: async () => {
        const snapshot = structuredClone(state);
        await act('deleteProject', { id });
        toast(`Deleted “${p.name || 'Untitled'}”`, 'Undo', () => act('replaceState', { state: snapshot }));
      },
    },
  ], align);
}

function taskMenu(anchor, id, align) {
  const t = getTask(id);
  if (!t) return;
  const isActive = state.activeTaskId === id;
  openMenu(anchor, [
    { icon: I.open, label: 'Open', onClick: () => go({ type: 'task', id }) },
    { icon: t.startedAt ? I.pause : I.play, label: t.startedAt ? 'Pause timer' : 'Start timer', onClick: () => toggleTimer(id) },
    { icon: I.paw, label: isActive ? 'Shown on the dog' : 'Show on the dog', checked: isActive, onClick: () => act('setActive', { id: isActive ? null : id }) },
    { icon: I.reset, label: 'Reset timer', onClick: () => act('resetTimer', { id }) },
    'sep',
    {
      icon: I.trash, label: 'Delete', danger: true,
      onClick: async () => {
        const snapshot = structuredClone(state);
        await act('deleteTask', { id });
        toast(`Deleted “${t.title || 'Untitled'}”`, 'Undo', () => act('replaceState', { state: snapshot }));
      },
    },
  ], align);
}

// ---------------------------------------------------------------- search (Ctrl+K)

function openSearch() {
  const el = document.createElement('div');
  el.className = 'search';
  el.innerHTML = `
    <div class="search-bar">${I.search}<input placeholder="Search projects and tasks…" spellcheck="false"></div>
    <div class="search-list"></div>
    <div class="search-foot"><span>↑↓ Select</span><span>↵ Open</span><span>Esc Close</span></div>`;
  showModal(el);
  const input = el.querySelector('input');
  const list = el.querySelector('.search-list');
  let items = [];
  let sel = 0;

  const draw = () => {
    const q = input.value.trim().toLowerCase();
    items = [];
    for (const p of state.projects) {
      if (!q || (p.name || 'untitled').toLowerCase().includes(q)) items.push({ p });
      for (const t of p.tasks) {
        if ((t.title || 'untitled').toLowerCase().includes(q) || (q && t.notes.toLowerCase().includes(q))) items.push({ p, t });
      }
    }
    items = items.slice(0, 60);
    sel = Math.max(0, Math.min(sel, items.length - 1));
    list.innerHTML = items.length
      ? `<div class="menu-header">${q ? 'Best matches' : 'All pages'}</div>${items.map((it, i) => `
          <div class="search-item ${i === sel ? 'sel' : ''}" data-i="${i}">
            <span class="si-icon">${it.t ? (it.t.startedAt ? '<span class="run-dot"></span>' : I.doc) : projIcon(it.p)}</span>
            <span class="si-title">${esc(it.t ? it.t.title : it.p.name) || 'Untitled'}</span>
            ${it.t ? `<span class="si-path">— ${esc(it.p.name) || 'Untitled'}</span>` : ''}
            <span class="si-enter">↵</span>
          </div>`).join('')}`
      : '<div class="search-empty">No results</div>';
  };
  const select = (i) => {
    sel = i;
    $$('.search-item', list).forEach((n) => n.classList.toggle('sel', +n.dataset.i === sel));
    $(`.search-item[data-i="${sel}"]`, list)?.scrollIntoView({ block: 'nearest' });
  };
  const open = (it) => {
    if (!it) return;
    closeLayer();
    go(it.t ? { type: 'task', id: it.t.id } : { type: 'project', id: it.p.id });
  };

  input.addEventListener('input', () => { sel = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); select(Math.min(items.length - 1, sel + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); select(Math.max(0, sel - 1)); }
    if (e.key === 'Enter') open(items[sel]);
  });
  list.addEventListener('mousemove', (e) => {
    const n = e.target.closest('.search-item');
    if (n && +n.dataset.i !== sel) select(+n.dataset.i);
  });
  list.addEventListener('click', (e) => {
    const n = e.target.closest('.search-item');
    if (n) open(items[+n.dataset.i]);
  });
  draw();
  input.focus();
}

// ---------------------------------------------------------------- toast

function toast(msg, actionLabel, onAction) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${actionLabel ? `<button>${esc(actionLabel)}</button>` : ''}`;
  el.classList.add('show');
  if (actionLabel) {
    el.querySelector('button').onclick = () => { el.classList.remove('show'); onAction(); };
  }
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 6000);
}

// ---------------------------------------------------------------- sidebar resize

document.addEventListener('mousedown', (e) => {
  if (!e.target.classList.contains('sb-resizer')) return;
  e.preventDefault();
  const startX = e.clientX;
  const startW = ui.width;
  document.body.classList.add('resizing');
  const move = (ev) => {
    ui.width = Math.max(200, Math.min(480, startW + ev.clientX - startX));
    $('#sidebar').style.width = `${ui.width}px`;
  };
  const up = () => {
    removeEventListener('mousemove', move);
    removeEventListener('mouseup', up);
    document.body.classList.remove('resizing');
    saveUI();
  };
  addEventListener('mousemove', move);
  addEventListener('mouseup', up);
});

// ---------------------------------------------------------------- board drag & drop

let dragId = null;
const dropLine = document.createElement('div');
dropLine.className = 'drop-line';

function cardBefore(col, y) {
  return $$('.bcard:not(.dragging)', col).find((c) => {
    const r = c.getBoundingClientRect();
    return y < r.top + r.height / 2;
  });
}

document.addEventListener('dragstart', (e) => {
  const card = e.target.closest?.('.bcard');
  if (!card) return;
  dragId = card.dataset.card;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragId);
  requestAnimationFrame(() => card.classList.add('dragging'));
});
document.addEventListener('dragover', (e) => {
  const col = e.target.closest?.('.bcol');
  if (!col || !dragId) return;
  e.preventDefault();
  $$('.bcol.over').forEach((c) => c !== col && c.classList.remove('over'));
  col.classList.add('over');
  $('.bcards', col).insertBefore(dropLine, cardBefore(col, e.clientY) || null);
});
document.addEventListener('drop', (e) => {
  const col = e.target.closest?.('.bcol');
  if (!col || !dragId) return;
  e.preventDefault();
  const before = cardBefore(col, e.clientY);
  act('moveTask', { id: dragId, status: col.dataset.col, beforeId: before ? before.dataset.card : null });
});
document.addEventListener('dragend', () => {
  dragId = null;
  dropLine.remove();
  $$('.bcard.dragging').forEach((c) => c.classList.remove('dragging'));
  $$('.bcol.over').forEach((c) => c.classList.remove('over'));
});

// ---------------------------------------------------------------- boot

api.onState((s) => { state = s; render(); });
api.onNavigate((route) => go(route));
api.getState().then((s) => {
  state = s;
  for (const p of state.projects) if (!(p.id in ui.expanded)) ui.expanded[p.id] = true;
  render(true);
});
