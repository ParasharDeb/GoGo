// Helpers shared by the main app page and the dog widget.
(function () {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const elapsedMs = (t) => t.elapsedMs + (t.startedAt ? Date.now() - t.startedAt : 0);
  const remainingMs = (t) => t.durationSec * 1000 - elapsedMs(t);
  const progress = (t) => (t.durationSec ? Math.min(1, elapsedMs(t) / (t.durationSec * 1000)) : 0);
  const isDone = (t) => !t.startedAt && !!t.finishedAt && remainingMs(t) <= 0;

  const pad = (n) => String(n).padStart(2, '0');

  // 25:00, 4:59, 1:02:03
  function fmtClock(ms) {
    const s = Math.ceil(Math.max(0, ms) / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
  }

  // 1h 30m, 25m, 45s
  function fmtDur(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return [h && `${h}h`, m && `${m}m`, s && `${s}s`].filter(Boolean).join(' ') || '0m';
  }

  // "25" (minutes), "1h 30m", "90 min", "1:30" (h:mm), "45s"
  function parseDur(str) {
    str = String(str).trim().toLowerCase();
    if (!str) return null;
    if (/^\d+(\.\d+)?$/.test(str)) return Math.round(parseFloat(str) * 60) || null;
    const hm = str.match(/^(\d+):(\d{1,2})$/);
    if (hm) return +hm[1] * 3600 + +hm[2] * 60 || null;
    const units = { h: 3600, m: 60, s: 1 };
    let total = 0;
    let matched = '';
    for (const [whole, num, unit] of str.matchAll(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)/g)) {
      total += parseFloat(num) * units[unit[0]];
      matched += whole;
    }
    if (!matched || str.replace(/[\s,]/g, '') !== matched.replace(/\s/g, '')) return null;
    return Math.round(total) || null;
  }

  function findTask(state, id) {
    for (const project of state.projects) {
      const task = project.tasks.find((t) => t.id === id);
      if (task) return { project, task };
    }
    return null;
  }

  window.Shared = { esc, elapsedMs, remainingMs, progress, isDone, fmtClock, fmtDur, parseDur, findTask };
})();
