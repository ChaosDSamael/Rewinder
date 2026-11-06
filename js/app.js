// Rewinder — the app: state, routes, actions, saving.
import * as M from './model.js';
import * as store from './store.js';
import * as V from './views.js';
import { esc } from './ui.js';
import { morphChildren } from './morph.js';

const root = document.getElementById('root');
const dlg = document.getElementById('dlg');
const toastBox = document.getElementById('toasts');
const importInput = document.getElementById('import-file');

const listDefaults = () => ({ cat: 'all', platform: '', status: '', fav: false, q: '', sort: 'recent' });

const state = {
  ready: false,
  error: '',
  titles: [],
  settings: { ...M.DEFAULT_SETTINGS },
  route: { name: 'home' },
  current: null,
  history: {},
  canInstall: false,
  standalone: false,
  persisted: false,
  ui: {
    list: listDefaults(),
    browseSort: 'recent',
    openSeasons: new Set(),
    openEp: null,
    addSeasonOpen: false,
    homeScore: {},
    focusAfter: null
  }
};

const byId = (id) => state.titles.find((t) => t.id === id) || null;
const cur = () => state.current;
const splitKey = (key) => String(key).split(':').map(Number);

/* ---------- rendering ---------- */

let pointerDown = false;
let renderQueued = false;

function view() {
  const r = state.route;
  if (state.error) return V.errorView(state.error);
  if (!state.ready) return '<div class="page"><p class="panel-sub">Loading…</p></div>';
  if (r.name === 'home') return V.homeView(state);
  if (r.name === 'list') return V.listView(state);
  if (r.name === 'browse') return V.browseView(state, r.kind);
  if (r.name === 'title') return state.current ? V.titleView(state, state.current) : V.notFoundView();
  if (r.name === 'settings') return V.settingsView(state);
  return V.notFoundView();
}

function render() {
  renderQueued = false;
  const r = state.route;
  const t = r.name === 'title' ? byId(r.id) : null;
  state.current = t && !t.deletedAt ? t : null;

  const active = document.activeElement;
  const hadFocus = active && active !== document.body && root.contains(active) ? active.id : '';
  const focusAfter = state.ui.focusAfter;
  state.ui.focusAfter = null;

  root.classList.toggle('spoiler-on', Boolean(state.settings.spoiler));
  root.classList.toggle('scan-off', !state.settings.scanlines);
  const tpl = document.createElement('template');
  tpl.innerHTML = V.header(state) + `<main id="main" tabindex="-1">${view()}</main>` + V.footer();
  morphChildren(root, tpl.content);

  const target = focusAfter || (hadFocus && !root.contains(document.activeElement) ? hadFocus : '');
  if (target) {
    const el = document.getElementById(target);
    if (el) {
      el.focus({ preventScroll: true });
      if (focusAfter && typeof el.value === 'string') {
        try { el.setSelectionRange(el.value.length, el.value.length); } catch { /* not a text field */ }
      }
    }
  }
}

// While a mouse button is down, wait: the click it starts must land on the element the person pressed.
function requestRender() {
  if (pointerDown) { renderQueued = true; return; }
  render();
}

document.addEventListener('pointerdown', () => { pointerDown = true; }, true);
const release = () => {
  pointerDown = false;
  if (renderQueued) setTimeout(() => { if (renderQueued && !pointerDown) render(); }, 0);
};
document.addEventListener('pointerup', release, true);
document.addEventListener('pointercancel', release, true);

function refreshHistory(id) {
  if (state.route.name !== 'title' || !state.current || state.current.id !== id) return;
  const panel = document.getElementById('history-panel');
  if (!panel) return;
  const tpl = document.createElement('template');
  tpl.innerHTML = V.historyPanel(state.history[id]);
  morphChildren(panel, tpl.content.firstElementChild);
}

/* ---------- routes ---------- */

function parseRoute() {
  let parts;
  try {
    parts = location.hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return { name: 'notfound' };
  }
  if (!parts.length) return { name: 'home' };
  if (parts[0] === 'list') return { name: 'list' };
  if (M.PATH_KIND[parts[0]]) return { name: 'browse', kind: M.PATH_KIND[parts[0]] };
  if (parts[0] === 'title' && parts[1]) return { name: 'title', id: parts[1] };
  if (parts[0] === 'settings') return { name: 'settings' };
  return { name: 'notfound' };
}

function go(hash) {
  if (location.hash === hash) onRoute();
  else location.hash = hash;
}

function openDefaultSeason(t) {
  if (!t || !M.hasEpisodes(t)) return;
  const nx = M.nextEpisode(t);
  const s = nx ? nx.season : t.seasons.length === 1 ? t.seasons[0] : null;
  if (s) state.ui.openSeasons.add(`${t.id}:${s.n}`);
}

function onRoute() {
  const prev = state.route;
  state.route = parseRoute();
  const r = state.route;
  const sameTitle = prev.name === 'title' && r.name === 'title' && prev.id === r.id;
  if (dlg.open) closeDialog();
  if (!sameTitle) {
    state.ui.openEp = null;
    state.ui.addSeasonOpen = false;
    if (r.name === 'title') openDefaultSeason(byId(r.id));
  }
  render();
  if (!sameTitle) {
    window.scrollTo(0, 0);
    if (!root.contains(document.activeElement) || document.activeElement === root) {
      const main = document.getElementById('main');
      if (main) main.focus({ preventScroll: true });
    }
  }
  const t = state.current;
  document.title = r.name === 'title' && t ? `${t.title} · Rewinder`
    : r.name === 'list' ? 'Full List · Rewinder'
      : r.name === 'browse' ? `${M.KIND_TAB[r.kind]} · Rewinder`
        : r.name === 'settings' ? 'Settings · Rewinder' : 'Rewinder';
  if (t) loadHistory(t.id);
}

async function loadHistory(id) {
  if (state.history[id]) return;
  try {
    state.history[id] = await store.historyFor(id, 30);
  } catch (err) {
    console.warn('History could not be read', err);
    state.history[id] = [];
  }
  refreshHistory(id);
}

/* ---------- saving ---------- */

const saveTimers = new Map();
let settingsTimer = null;

// Rewinder open in two windows (the app and a tab): each tells the other what it saved.
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('rewinder') : null;
const announce = (msg) => {
  if (!channel) return;
  try { channel.postMessage(msg); } catch { /* channel closed */ }
};

async function syncFromOtherWindow(msg) {
  if (!msg || !state.ready || state.error) return;
  if (msg.type === 'title' && typeof msg.id === 'string') {
    if (saveTimers.has(msg.id)) return;
    const raw = await store.getTitle(msg.id);
    const i = state.titles.findIndex((t) => t.id === msg.id);
    if (!raw) { if (i >= 0) state.titles.splice(i, 1); }
    else if (i >= 0) state.titles[i] = M.normalizeTitle(raw);
    else state.titles.push(M.normalizeTitle(raw));
    if (state.history[msg.id]) {
      delete state.history[msg.id];
      if (state.route.name === 'title' && state.route.id === msg.id) loadHistory(msg.id);
    }
  } else if (msg.type === 'settings') {
    state.settings = await store.getSettings();
    applyTheme();
  } else if (msg.type === 'all') {
    const fresh = await store.loadAll();
    state.titles = fresh.titles.map(M.normalizeTitle);
    state.settings = { ...M.DEFAULT_SETTINGS, ...fresh.settings };
    state.history = {};
    applyTheme();
  } else {
    return;
  }
  requestRender();
}

if (channel) channel.onmessage = (e) => { syncFromOtherWindow(e.data).catch((err) => console.warn('Sync failed', err)); };

function touch(t) {
  const now = new Date().toISOString();
  t.updatedAt = now;
  t.lastActivity = now;
}

async function persist(t) {
  try {
    await store.putTitle(t);
    announce({ type: 'title', id: t.id });
  } catch (err) {
    console.error(err);
    toast('Could not save your change. The browser refused to store it.');
  }
}

function putSettingsNow() {
  return store.putSettings(state.settings).then(() => announce({ type: 'settings' }));
}

async function log(t, text) {
  if (!text) return null;
  try {
    const entry = await store.addHistory(t.id, text);
    const list = state.history[t.id];
    if (list) {
      list.unshift(entry);
      if (list.length > 30) list.length = 30;
    }
    refreshHistory(t.id);
    return entry;
  } catch (err) {
    console.warn('History entry not saved', err);
    return null;
  }
}

// Nudging a score with the arrow keys fires a change per step: keep that burst as one history line.
let scoreTrail = null;
let scoreQueue = Promise.resolve();

// One at a time, so a quick series of key presses sees the line the previous press wrote.
function commitScore(...args) {
  const run = scoreQueue.then(() => commitScoreNow(...args));
  scoreQueue = run.catch(() => {});
  return run;
}

async function commitScoreNow(t, key, before, after, describe) {
  const now = Date.now();
  const trail = scoreTrail;
  const latest = (state.history[t.id] || [])[0];
  const same = Boolean(trail && latest && latest.seq === trail.seq && trail.id === t.id && trail.key === key && now - trail.time < 90e3);
  const text = describe(same ? trail.before : before, after);
  if (!same) {
    await commit(t, '');
    const entry = await log(t, text);
    scoreTrail = entry ? { id: t.id, key, before, time: now, seq: entry.seq } : null;
    return;
  }
  trail.time = now;
  await commit(t, '');
  try {
    await store.updateHistory(trail.seq, text);
    const line = (state.history[t.id] || []).find((h) => h.seq === trail.seq);
    if (line) line.text = text;
    refreshHistory(t.id);
  } catch (err) {
    console.warn('History entry not updated', err);
  }
}

function countChange() {
  state.settings.changesSinceBackup = (state.settings.changesSinceBackup || 0) + 1;
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => { settingsTimer = null; putSettingsNow().catch(console.error); }, 500);
}

// Saves a title now, with an optional line in its history.
async function commit(t, historyText) {
  clearTimeout(saveTimers.get(t.id));
  saveTimers.delete(t.id);
  touch(t);
  await persist(t);
  countChange();
  await log(t, historyText);
}

// Saves a title a moment after the last keystroke.
function commitSoon(t) {
  clearTimeout(saveTimers.get(t.id));
  saveTimers.set(t.id, setTimeout(() => {
    saveTimers.delete(t.id);
    touch(t);
    persist(t);
    countChange();
  }, 600));
}

function flushSaves() {
  for (const [id, timer] of saveTimers) {
    clearTimeout(timer);
    const t = byId(id);
    if (t) { touch(t); persist(t); }
  }
  saveTimers.clear();
  if (settingsTimer) {
    clearTimeout(settingsTimer);
    settingsTimer = null;
    putSettingsNow().catch(console.error);
  }
}

async function saveSettings() {
  clearTimeout(settingsTimer);
  settingsTimer = null;
  try {
    await putSettingsNow();
  } catch (err) {
    console.error(err);
    toast('Could not save your settings.');
  }
}

// Notes are saved as you type; the history gets one line per editing session, not one per keystroke.
async function commitEdited(t, text) {
  const last = (state.history[t.id] || [])[0];
  const recent = last && last.text === text && Date.now() - Date.parse(last.at) < 30 * 60e3;
  await commit(t, recent ? '' : text);
}

window.addEventListener('pagehide', flushSaves);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSaves(); });

/* ---------- toasts and dialogs ---------- */

function toast(message, { action, timeout = 4500 } = {}) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="toast-text">${esc(message)}</span>`;
  const remove = () => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 220);
  };
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toast-btn';
    b.textContent = action.label;
    b.addEventListener('click', () => { remove(); action.run(); });
    el.append(b);
  }
  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'toast-x';
  x.setAttribute('aria-label', 'Dismiss');
  x.textContent = '×';
  x.addEventListener('click', remove);
  el.append(x);
  toastBox.append(el);
  while (toastBox.children.length > 3) toastBox.firstElementChild.remove();
  if (timeout) setTimeout(remove, timeout);
}

let confirmResolve = null;
let returnFocus = null;

function openDialog(html, focusSelector) {
  if (!dlg.open) returnFocus = document.activeElement;
  dlg.innerHTML = html;
  if (!dlg.open) {
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }
  const first = focusSelector ? dlg.querySelector(focusSelector) : null;
  if (first) first.focus();
}

function closeDialog() {
  if (typeof dlg.close === 'function' && dlg.open) dlg.close();
  else { dlg.removeAttribute('open'); onDialogClosed(); }
}

function onDialogClosed() {
  dlg.innerHTML = '';
  if (confirmResolve) {
    const resolve = confirmResolve;
    confirmResolve = null;
    resolve(false);
  }
  if (returnFocus && document.contains(returnFocus)) returnFocus.focus({ preventScroll: true });
  returnFocus = null;
}
dlg.addEventListener('close', onDialogClosed);

function ask(options) {
  return new Promise((resolve) => {
    openDialog(V.confirmDialog(options), '[data-action="confirm-no"]');
    confirmResolve = resolve;
  });
}

function formError(id, message) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.hidden = !message;
}

/* ---------- theme ---------- */

function applyTheme(color) {
  const accent = M.isHexColor(color) ? color : M.isHexColor(state.settings.accent) ? state.settings.accent : M.DEFAULT_SETTINGS.accent;
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--on-accent', M.onAccent(accent));
}

async function setAccent(color) {
  if (!M.isHexColor(color)) return;
  state.settings.accent = color;
  applyTheme();
  render();
  await saveSettings();
}

/* ---------- status rules ---------- */

function addViewToday(t) {
  const d = M.today();
  if (!t.views.length || t.views[t.views.length - 1].date !== d) t.views.push({ date: d });
}

// Checking episodes moves the status along: first one → In Progress, last one → Completed.
function autoStatus(t) {
  if (!M.hasEpisodes(t)) return '';
  const p = M.progress(t);
  const before = t.status;
  let after = before;
  if (p.total && p.watched === p.total) after = 'completed';
  else if (p.watched > 0 && ['watchlist', 'hold', 'dropped'].includes(before)) after = 'progress';
  if (after === before) return '';
  t.status = after;
  if (after === 'completed') addViewToday(t);
  return `Status · ${M.STATUS_LABEL[before]} → ${M.STATUS_LABEL[after]}`;
}

/* ---------- actions: titles ---------- */

function openAdd(kind) {
  const r = state.route;
  const k = M.KINDS.includes(kind) ? kind : r.name === 'browse' ? r.kind : state.current ? state.current.kind : 'movie';
  openDialog(V.addDialog(k), '#add-title');
}

function checkDuplicate(value) {
  const box = document.getElementById('add-dup');
  if (!box) return;
  const q = value.trim().toLowerCase();
  const hit = q ? M.live(state.titles).find((t) => t.title.toLowerCase() === q || (t.titleQc && t.titleQc.toLowerCase() === q)) : null;
  if (!hit) {
    box.hidden = true;
    box.textContent = '';
    return;
  }
  box.hidden = false;
  box.innerHTML = `Already in your list (${esc(M.KIND_LABEL[hit.kind])}${hit.year ? ', ' + hit.year : ''}). <a href="#/title/${encodeURIComponent(hit.id)}">Open it</a>`;
}

async function submitAdd(form) {
  const data = new FormData(form);
  const title = String(data.get('title') || '').trim();
  if (!title) {
    formError('add-error', 'Give it a title.');
    form.elements.title.focus();
    return;
  }
  const kind = M.KINDS.includes(data.get('kind')) ? data.get('kind') : 'movie';
  const status = M.STATUSES.includes(data.get('status')) ? data.get('status') : 'watchlist';
  const t = M.newTitle({
    kind,
    title: title.slice(0, 300),
    titleQc: String(data.get('titleQc') || '').trim().slice(0, 300),
    year: M.clampInt(data.get('year'), 1870, 2100, null),
    status
  });
  if (M.hasEpisodes(t)) {
    const seasons = M.clampInt(data.get('seasons'), 0, 60, 1);
    const eps = M.clampInt(data.get('eps'), 0, 500, 12);
    for (let i = 1; i <= seasons; i++) t.seasons.push(M.makeSeason(i, eps));
  }
  state.titles.push(t);
  state.history[t.id] = [];
  closeDialog();
  go('#/title/' + encodeURIComponent(t.id));
  toast(`${t.title} added`);
  await persist(t);
  countChange();
  await log(t, `Added · ${M.STATUS_LABEL[status]}`);
}

function openEdit() {
  const t = cur();
  if (t) openDialog(V.editDialog(t), '#edit-title');
}

async function submitEdit(form) {
  const t = cur();
  if (!t) { closeDialog(); return; }
  const data = new FormData(form);
  const title = String(data.get('title') || '').trim();
  if (!title) {
    formError('edit-error', 'The title cannot be empty.');
    form.elements.title.focus();
    return;
  }
  const kind = M.KINDS.includes(data.get('kind')) ? data.get('kind') : t.kind;
  const changed = [];
  if (kind !== t.kind) changed.push(`category → ${M.KIND_LABEL[kind]}`);
  if (title !== t.title) changed.push('title');
  t.kind = kind;
  t.title = title.slice(0, 300);
  t.titleQc = String(data.get('titleQc') || '').trim().slice(0, 300);
  t.year = M.clampInt(data.get('year'), 1870, 2100, null);
  t.genres = M.splitList(data.get('genres'), 12);
  const oldCast = new Map(t.cast.map((c) => [c.name.toLowerCase(), c]));
  t.cast = M.splitList(data.get('cast'), 40).map((name) => oldCast.get(name.toLowerCase()) || { name, role: '' });
  t.overview = String(data.get('overview') || '').trim().slice(0, 4000);
  closeDialog();
  render();
  document.title = `${t.title} · Rewinder`;
  await commit(t, changed.length ? `Edited info · ${changed.join(', ')}` : 'Edited info');
}

async function setStatus(value) {
  const t = cur();
  if (!t || !M.STATUSES.includes(value) || value === t.status) return;
  const before = t.status;
  t.status = value;
  render();
  await commit(t, `Status · ${M.STATUS_LABEL[before]} → ${M.STATUS_LABEL[value]}`);
}

async function toggleFav() {
  const t = cur();
  if (!t) return;
  t.fav = !t.fav;
  render();
  await commit(t, t.fav ? 'Added to favorites' : 'Removed from favorites');
}

async function addView() {
  const t = cur();
  if (!t) return;
  t.views.push({ date: M.today() });
  let statusText = '';
  if (t.status !== 'completed' && (t.kind === 'movie' || M.progress(t).watched === M.progress(t).total)) {
    statusText = `Status · ${M.STATUS_LABEL[t.status]} → Completed`;
    t.status = 'completed';
  }
  render();
  await commit(t, `Seen ×${t.views.length}`);
  await log(t, statusText);
}

async function removeView(index) {
  const t = cur();
  if (!t || !t.views[index]) return;
  const [gone] = t.views.splice(index, 1);
  render();
  await commit(t, `Removed the viewing of ${M.fmtDate(gone.date, true)}`);
}

async function trashTitle() {
  const t = cur();
  if (!t) return;
  t.deletedAt = new Date().toISOString();
  go('#/');
  toast(`${t.title} moved to the trash`, { action: { label: 'Undo', run: () => restoreTitle(t.id, true) }, timeout: 8000 });
  await commit(t, 'Moved to the trash');
}

async function restoreTitle(id, reopen) {
  const t = byId(id);
  if (!t || !t.deletedAt) return;
  t.deletedAt = null;
  if (reopen) go('#/title/' + encodeURIComponent(t.id));
  else render();
  toast(`${t.title} restored`);
  await commit(t, 'Restored from the trash');
}

async function purgeTitle(id) {
  const t = byId(id);
  if (!t) return;
  const ok = await ask({ title: 'Delete forever?', body: `${t.title} and its history will be erased. This can't be undone.`, yes: 'Delete forever', danger: true });
  if (!ok) return;
  state.titles = state.titles.filter((x) => x.id !== id);
  delete state.history[id];
  render();
  try {
    await store.deleteTitle(id);
    announce({ type: 'title', id });
    countChange();
  } catch (err) {
    console.error(err);
    toast('Could not delete it. Try again.');
  }
}

async function purgeExpired() {
  const limit = Date.now() - M.TRASH_DAYS * 864e5;
  const expired = state.titles.filter((t) => t.deletedAt && Date.parse(t.deletedAt) < limit);
  if (!expired.length) return;
  state.titles = state.titles.filter((t) => !expired.includes(t));
  for (const t of expired) {
    try { await store.deleteTitle(t.id); } catch (err) { console.warn(err); }
  }
}

/* ---------- actions: ratings ---------- */

function liveRate(el) {
  const box = el.closest('.rater');
  if (!box) return;
  const v = M.clampScore(el.value);
  const fill = box.querySelector('.stars-fill');
  if (fill) fill.style.width = `${v === null ? 0 : v * 10}%`;
  if (el.type === 'range') {
    const num = box.querySelector('.num');
    if (num) num.value = v === null ? '' : v.toFixed(1);
    el.setAttribute('aria-valuetext', v === null ? 'Not rated' : `${v.toFixed(1)} out of 10`);
  } else {
    const range = box.querySelector('input[type="range"]');
    if (range) range.value = v === null ? 0 : v;
  }
  const key = el.dataset.rate;
  if (key.startsWith('next:')) {
    const id = key.slice(5);
    if (v === null) delete state.ui.homeScore[id];
    else state.ui.homeScore[id] = v;
  }
}

async function commitRate(key, raw) {
  const v = M.clampScore(raw);
  if (key.startsWith('next:')) {
    const id = key.slice(5);
    if (v === null) delete state.ui.homeScore[id];
    else state.ui.homeScore[id] = v;
    requestRender();
    return;
  }
  const t = cur();
  if (!t) return;
  if (key === 'title') return setTitleScore(t, v);
  if (key.startsWith('season:')) return setSeasonScore(t, Number(key.slice(7)), v);
  if (key.startsWith('ep:')) {
    const [sn, en] = splitKey(key.slice(3));
    return setEpisodeScore(t, sn, en, v);
  }
}

async function setTitleScore(t, v) {
  if (t.score === v) { requestRender(); return; }
  const before = M.effectiveScore(t);
  t.score = v;
  const after = M.effectiveScore(t);
  requestRender();
  if (v === null) {
    scoreTrail = null;
    await commit(t, M.hasEpisodes(t) ? `Back to the average${after !== null ? ' · ' + after.toFixed(1) : ''}` : 'Score cleared');
    return;
  }
  await commitScore(t, 'title', before, v, (from, to) => (from === null ? `Rated ${to.toFixed(1)}` : `Score ${from.toFixed(1)} → ${to.toFixed(1)}`));
}

async function setSeasonScore(t, n, v) {
  const s = M.findSeason(t, n);
  if (!s) return;
  if (s.score === v) { requestRender(); return; }
  s.score = v;
  requestRender();
  if (v === null) {
    scoreTrail = null;
    await commit(t, `${M.seasonName(n)} back to the average`);
    return;
  }
  await commitScore(t, 'season:' + n, null, v, (from, to) => `${M.seasonName(n)} rated ${to.toFixed(1)}`);
}

async function setEpisodeScore(t, sn, en, v) {
  const ep = M.findEpisode(t, sn, en);
  if (!ep) return;
  if (ep.score === v) { requestRender(); return; }
  ep.score = v;
  const code = M.epCode(sn, en);
  requestRender();
  if (v === null) {
    scoreTrail = null;
    await commit(t, `Cleared the score of ${code}`);
    return;
  }
  if (!ep.watched) {
    // Rating an episode means you saw it.
    ep.watched = M.today();
    const statusText = autoStatus(t);
    requestRender();
    await commitScore(t, `ep:${sn}:${en}`, 'watched', v, (from, to) => `Watched ${code} · ${to.toFixed(1)}`);
    await log(t, statusText);
    return;
  }
  await commitScore(t, `ep:${sn}:${en}`, 'rated', v, (from, to) => `${from === 'watched' ? 'Watched' : 'Rated'} ${code} · ${to.toFixed(1)}`);
}

/* ---------- actions: seasons and episodes ---------- */

async function watchNext(id) {
  const t = byId(id);
  if (!t) return;
  const nx = M.nextEpisode(t);
  if (!nx) return;
  const score = state.ui.homeScore[id];
  const code = M.epCode(nx.season.n, nx.ep.n);
  nx.ep.watched = M.today();
  if (typeof score === 'number') nx.ep.score = score;
  delete state.ui.homeScore[id];
  const statusText = autoStatus(t);
  render();
  toast(t.status === 'completed' ? `${t.title} · completed` : `${code} logged${typeof score === 'number' ? ' · ' + score.toFixed(1) : ''}`);
  await commit(t, `Watched ${code}${typeof score === 'number' ? ' · ' + score.toFixed(1) : ''}`);
  await log(t, statusText);
}

async function setEpisodeWatched(key, checked) {
  const t = cur();
  if (!t) return;
  const [sn, en] = splitKey(key);
  const ep = M.findEpisode(t, sn, en);
  if (!ep) return;
  const code = M.epCode(sn, en);
  ep.watched = checked ? M.today() : null;
  const statusText = checked ? autoStatus(t) : '';
  requestRender();
  if (statusText && t.status === 'completed') toast(`${t.title} · completed`);
  await commit(t, checked ? `Watched ${code}${typeof ep.score === 'number' ? ' · ' + ep.score.toFixed(1) : ''}` : `Unchecked ${code}`);
  await log(t, statusText);
}

async function markSeasonWatched(n) {
  const t = cur();
  const s = M.findSeason(t, n);
  if (!s) return;
  const d = M.today();
  let count = 0;
  for (const e of s.episodes) {
    if (!e.watched) { e.watched = d; count++; }
  }
  if (!count) return;
  const statusText = autoStatus(t);
  render();
  await commit(t, `Watched all of ${M.seasonName(n)} · ${count} episode${count === 1 ? '' : 's'}`);
  await log(t, statusText);
}

async function addSeason(form) {
  const t = cur();
  if (!t) return;
  const n = M.clampInt(form.elements.n.value, 0, 999, null);
  const count = M.clampInt(form.elements.count.value, 0, 500, 0);
  if (n === null) { toast('Enter a season number.'); return; }
  if (M.findSeason(t, n)) { toast(`${M.seasonName(n)} is already there.`); return; }
  t.seasons.push(M.makeSeason(n, count));
  t.seasons.sort((a, b) => a.n - b.n);
  state.ui.addSeasonOpen = false;
  state.ui.openSeasons.add(`${t.id}:${n}`);
  render();
  await commit(t, `Added ${M.seasonName(n)} · ${count} episode${count === 1 ? '' : 's'}`);
}

async function removeSeason(n) {
  const t = cur();
  const s = M.findSeason(t, n);
  if (!s) return;
  const watched = s.episodes.filter((e) => e.watched).length;
  const ok = await ask({
    title: `Remove ${M.seasonName(n)}?`,
    body: `Its ${s.episodes.length} episodes go with it${watched ? `, including ${watched} you checked and their scores and notes` : ''}.`,
    yes: 'Remove season',
    danger: true
  });
  if (!ok) return;
  t.seasons = t.seasons.filter((x) => x !== s);
  render();
  await commit(t, `Removed ${M.seasonName(n)}`);
}

async function addEpisode(n) {
  const t = cur();
  const s = M.findSeason(t, n);
  if (!s) return;
  const next = s.episodes.reduce((m, e) => Math.max(m, e.n), 0) + 1;
  s.episodes.push(M.makeEpisode(next));
  state.ui.openSeasons.add(`${t.id}:${n}`);
  state.ui.openEp = `${t.id}:${n}:${next}`;
  state.ui.focusAfter = `ep-title-${n}-${next}`;
  render();
  await commit(t, `Added ${M.epCode(n, next)}`);
}

async function removeEpisode(key) {
  const t = cur();
  const [sn, en] = splitKey(key);
  const s = M.findSeason(t, sn);
  const ep = M.findEpisode(t, sn, en);
  if (!s || !ep) return;
  const ok = await ask({ title: `Remove ${M.epCode(sn, en)}?`, body: 'Its score and note go with it.', yes: 'Remove episode', danger: true });
  if (!ok) return;
  s.episodes = s.episodes.filter((e) => e !== ep);
  state.ui.openEp = null;
  render();
  await commit(t, `Removed ${M.epCode(sn, en)}`);
}

async function setEpisodeField(key, field, value) {
  const t = cur();
  const [sn, en] = splitKey(key);
  const ep = M.findEpisode(t, sn, en);
  if (!ep) return;
  const code = M.epCode(sn, en);
  if (field === 'title') {
    ep.title = value.trim().slice(0, 300);
    requestRender();
    await commitEdited(t, `Renamed ${code}`);
  } else if (field === 'aired') {
    ep.aired = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
    requestRender();
    await commit(t, '');
  } else if (field === 'watched' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    ep.watched = value;
    requestRender();
    await commit(t, `${code} watched on ${M.fmtDate(value, true)}`);
  }
}

/* ---------- actions: games, platforms, tags ---------- */

async function toggleGameMark(mark) {
  const t = cur();
  if (!t || !['story', 'full'].includes(mark)) return;
  const on = !t.game[mark];
  t.game[mark] = on ? M.today() : null;
  const lines = [on ? (mark === 'story' ? 'Finished the story' : 'Got 100%') : (mark === 'story' ? 'Story mark removed' : '100% mark removed')];
  if (on && mark === 'full' && !t.game.story) t.game.story = M.today();
  if (on && t.status !== 'completed') {
    lines.push(`Status · ${M.STATUS_LABEL[t.status]} → Completed`);
    t.status = 'completed';
  }
  render();
  await commit(t, lines[0]);
  await log(t, lines[1]);
}

async function toggleGamePlatform(name) {
  const t = cur();
  if (!t || !name) return;
  const has = t.platforms.includes(name);
  t.platforms = has ? t.platforms.filter((p) => p !== name) : [...t.platforms, name];
  render();
  await commit(t, has ? `No longer on ${name}` : `Played on ${name}`);
}

async function addGamePlatform(form) {
  const t = cur();
  const name = form.elements.name.value.trim().slice(0, 40);
  if (!t || !name) return;
  form.elements.name.value = '';
  if (!t.platforms.some((p) => p.toLowerCase() === name.toLowerCase())) t.platforms.push(name);
  state.ui.focusAfter = 'plat-other';
  render();
  await commit(t, `Played on ${name}`);
}

function canonicalName(name, list) {
  return list.find((x) => x.toLowerCase() === name.toLowerCase()) || name;
}

async function addProvider(form) {
  const t = cur();
  const raw = form.elements.name.value.trim().slice(0, 60);
  if (!t || !raw) return;
  const known = [...M.STREAMING, ...M.STORES, ...M.live(state.titles).flatMap((x) => x.providers.map((p) => p.name))];
  const name = canonicalName(raw, known);
  form.elements.name.value = '';
  state.ui.focusAfter = 'prov-input';
  if (t.providers.some((p) => p.name.toLowerCase() === name.toLowerCase())) { render(); return; }
  t.providers.push({ name, source: 'manual' });
  render();
  await commit(t, `${t.kind === 'game' ? 'Where to buy' : 'Where to watch'} · ${name}`);
}

async function removeProvider(name) {
  const t = cur();
  if (!t) return;
  t.providers = t.providers.filter((p) => p.name !== name);
  render();
  await commit(t, `Removed ${name}`);
}

async function addTags(form) {
  const t = cur();
  if (!t) return;
  const known = M.live(state.titles).flatMap((x) => x.tags);
  const fresh = M.splitList(form.elements.tags.value, 12)
    .map((tag) => canonicalName(tag, known))
    .filter((tag) => !t.tags.some((x) => x.toLowerCase() === tag.toLowerCase()));
  form.elements.tags.value = '';
  state.ui.focusAfter = 'tag-input';
  if (!fresh.length) { render(); return; }
  t.tags = [...t.tags, ...fresh].slice(0, 30);
  render();
  await commit(t, `Tagged ${fresh.map((x) => '#' + x).join(' ')}`);
}

async function removeTag(tag) {
  const t = cur();
  if (!t) return;
  t.tags = t.tags.filter((x) => x !== tag);
  render();
  await commit(t, `Removed the tag #${tag}`);
}

/* ---------- backup ---------- */

async function exportBackup() {
  flushSaves();
  try {
    const data = await store.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rewinder-backup-${M.today()}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    state.settings.lastBackupAt = new Date().toISOString();
    state.settings.changesSinceBackup = 0;
    state.settings.backupSnoozeUntil = null;
    render();
    toast('Backup downloaded. Keep it somewhere safe.');
    await saveSettings();
  } catch (err) {
    console.error(err);
    toast('The backup failed. ' + (err && err.message ? err.message : ''));
  }
}

async function importBackup(file) {
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    toast('That file is not a Rewinder backup.');
    return;
  }
  if (!store.isBackup(data)) {
    toast('That file is not a Rewinder backup.');
    return;
  }
  const have = M.live(state.titles).length;
  const incoming = data.titles.filter((t) => t && !t.deletedAt).length;
  if (state.titles.length) {
    const ok = await ask({
      title: 'Restore this backup?',
      body: `Your current list (${have} titles) will be replaced by the backup (${incoming} titles${data.exportedAt ? ', from ' + M.fmtDate(data.exportedAt, true) : ''}). This can't be undone.`,
      yes: 'Replace my list',
      danger: true
    });
    if (!ok) return;
  }
  flushSaves();
  try {
    await store.importAll(data);
    announce({ type: 'all' });
    const fresh = await store.loadAll();
    state.titles = fresh.titles.map(M.normalizeTitle);
  } catch (err) {
    console.error(err);
    toast('The restore failed. ' + (err && err.message ? err.message : ''));
    return;
  }
  const look = data.settings || {};
  if (M.isHexColor(look.accent)) state.settings.accent = look.accent;
  if (typeof look.scanlines === 'boolean') state.settings.scanlines = look.scanlines;
  state.settings.lastBackupAt = typeof data.exportedAt === 'string' ? data.exportedAt : new Date().toISOString();
  state.settings.changesSinceBackup = 0;
  state.history = {};
  state.ui.homeScore = {};
  applyTheme();
  await saveSettings();
  go('#/');
  render();
  toast(`Backup restored · ${incoming} titles`);
}

/* ---------- install and updates ---------- */

let installEvent = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e;
  state.canInstall = true;
  if (state.ready) requestRender();
});

window.addEventListener('appinstalled', () => {
  installEvent = null;
  state.canInstall = false;
  requestRender();
  toast('Rewinder is installed. Find it in your Start menu.');
});

async function installApp() {
  if (!installEvent) {
    toast('Open your browser menu and choose Install Rewinder.');
    return;
  }
  installEvent.prompt();
  try { await installEvent.userChoice; } catch { /* closed */ }
  installEvent = null;
  state.canInstall = false;
  render();
}

function registerWorker() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    flushSaves();
    location.reload();
  });
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const offer = (worker) => toast('A new version of Rewinder is ready.', {
      action: { label: 'Update', run: () => worker.postMessage('skipWaiting') },
      timeout: 0
    });
    if (reg.waiting && hadController) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker);
      });
    });
    let lastCheck = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheck > 3600e3) {
        lastCheck = Date.now();
        reg.update().catch(() => {});
      }
    });
  }).catch((err) => console.warn('Offline mode unavailable', err));
}

/* ---------- events ---------- */

const actions = {
  add: (el) => openAdd(el.dataset.kind),
  'dlg-close': () => closeDialog(),
  'confirm-yes': () => {
    const resolve = confirmResolve;
    confirmResolve = null;
    closeDialog();
    if (resolve) resolve(true);
  },
  'confirm-no': () => closeDialog(),
  spoiler: async () => {
    state.settings.spoiler = !state.settings.spoiler;
    render();
    await saveSettings();
  },
  install: () => installApp(),
  import: () => {
    importInput.value = '';
    importInput.click();
  },
  export: () => exportBackup(),
  'backup-later': async () => {
    state.settings.backupSnoozeUntil = new Date(Date.now() + 3 * 864e5).toISOString();
    render();
    await saveSettings();
  },
  'watch-next': (el) => watchNext(el.dataset.id),
  'list-cat': (el) => { state.ui.list.cat = el.dataset.cat; render(); },
  'list-clear': (el) => {
    const k = el.dataset.key;
    state.ui.list[k] = k === 'fav' ? false : '';
    render();
  },
  'see-all': (el) => {
    const d = el.dataset;
    state.ui.list = { ...listDefaults(), q: d.q || '', status: M.STATUSES.includes(d.status) ? d.status : '', fav: d.fav === '1' };
    go('#/list');
  },
  'search-for': (el) => {
    state.ui.list = { ...listDefaults(), q: el.dataset.q || '' };
    go('#/list');
  },
  'browse-view': async (el) => {
    state.settings.browseView = el.dataset.view === 'list' ? 'list' : 'wall';
    render();
    await saveSettings();
  },
  'score-reset': () => cur() && setTitleScore(cur(), null),
  'season-toggle': (el) => {
    const key = `${cur().id}:${el.dataset.n}`;
    if (state.ui.openSeasons.has(key)) state.ui.openSeasons.delete(key);
    else state.ui.openSeasons.add(key);
    render();
  },
  'season-form': (el) => {
    state.ui.addSeasonOpen = el.dataset.open === '1';
    if (state.ui.addSeasonOpen) state.ui.focusAfter = 'season-count';
    render();
  },
  'season-all': (el) => markSeasonWatched(Number(el.dataset.n)),
  'season-remove': (el) => removeSeason(Number(el.dataset.n)),
  'season-score-reset': (el) => cur() && setSeasonScore(cur(), Number(el.dataset.n), null),
  'ep-toggle': (el) => {
    const key = `${cur().id}:${el.dataset.ep}`;
    state.ui.openEp = state.ui.openEp === key ? null : key;
    render();
  },
  'ep-add': (el) => addEpisode(Number(el.dataset.n)),
  'ep-remove': (el) => removeEpisode(el.dataset.ep),
  'view-add': () => addView(),
  'view-remove': (el) => removeView(Number(el.dataset.i)),
  fav: () => toggleFav(),
  edit: () => openEdit(),
  trash: () => trashTitle(),
  restore: (el) => restoreTitle(el.dataset.id, false),
  purge: (el) => purgeTitle(el.dataset.id),
  'prov-remove': (el) => removeProvider(el.dataset.name),
  'tag-remove': (el) => removeTag(el.dataset.tag),
  'game-mark': (el) => toggleGameMark(el.dataset.mark),
  'game-platform': (el) => toggleGamePlatform(el.dataset.p),
  accent: (el) => setAccent(el.dataset.color),
  reveal: (el) => {
    const input = document.getElementById(el.dataset.for);
    if (!input) return;
    const shown = input.classList.toggle('shown');
    el.textContent = shown ? 'Hide' : 'Show';
  },
  skip: () => {
    const main = document.getElementById('main');
    if (main) main.focus();
  }
};

const fail = (err) => {
  console.error(err);
  toast('Something went wrong. ' + (err && err.message ? err.message : ''));
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  Promise.resolve().then(() => fn(el, e)).catch(fail);
});

let listTimer = null;
document.addEventListener('input', (e) => {
  const el = e.target;
  if (e.isComposing) return;
  if (el.dataset.rate !== undefined) { liveRate(el); return; }
  if (el.id === 'q-head') {
    state.ui.list = { ...listDefaults(), q: el.value };
    state.ui.focusAfter = 'q-list';
    go('#/list');
    return;
  }
  if (el.dataset.filter === 'q') {
    state.ui.list.q = el.value;
    clearTimeout(listTimer);
    listTimer = setTimeout(requestRender, 80);
    return;
  }
  if (el.id === 'add-title') { checkDuplicate(el.value); formError('add-error', ''); return; }
  if (el.dataset.setting === 'accent') { applyTheme(el.value); return; }
  const t = cur();
  if (!t || !root.contains(el)) return;
  if (el.dataset.field === 'notes') { t.notes = el.value.slice(0, 10000); commitSoon(t); return; }
  if (el.dataset.field === 'via') { t.via = el.value.slice(0, 60); commitSoon(t); return; }
  if (el.dataset.seasonNote !== undefined) {
    const s = M.findSeason(t, el.dataset.seasonNote);
    if (s) { s.notes = el.value.slice(0, 10000); commitSoon(t); }
    return;
  }
  if (el.dataset.epNote !== undefined) {
    const [sn, en] = splitKey(el.dataset.epNote);
    const ep = M.findEpisode(t, sn, en);
    if (ep) { ep.note = el.value.slice(0, 10000); commitSoon(t); }
    return;
  }
  if (el.dataset.epField === 'title') {
    const [sn, en] = splitKey(el.dataset.ep);
    const ep = M.findEpisode(t, sn, en);
    if (ep) {
      ep.title = el.value.slice(0, 300);
      const label = root.querySelector(`[data-ep-label="${el.dataset.ep}"]`);
      if (label) label.textContent = ep.title || `Episode ${en}`;
      commitSoon(t);
    }
  }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el === importInput) { importBackup(el.files && el.files[0]).catch(fail); return; }
  if (el.dataset.rate !== undefined) { commitRate(el.dataset.rate, el.value).catch(fail); return; }
  if (el.dataset.epCheck) { setEpisodeWatched(el.dataset.epCheck, el.checked).catch(fail); return; }
  if (el.dataset.filter) {
    if (el.dataset.filter === 'browseSort') state.ui.browseSort = el.value;
    else if (el.dataset.filter !== 'q') state.ui.list[el.dataset.filter] = el.value;
    requestRender();
    return;
  }
  if (el.dataset.setting) {
    const name = el.dataset.setting;
    if (name === 'scanlines') state.settings.scanlines = el.checked;
    else if (name === 'accent' && M.isHexColor(el.value)) state.settings.accent = el.value;
    else if (name === 'tmdbKey' || name === 'rawgKey') {
      state.settings[name] = el.value.trim().slice(0, 400);
      toast(state.settings[name] ? 'Key saved in this browser.' : 'Key removed.');
    }
    applyTheme();
    requestRender();
    saveSettings();
    return;
  }
  const t = cur();
  if (!t || !root.contains(el)) return;
  if (el.dataset.field === 'status') { setStatus(el.value).catch(fail); return; }
  if (el.dataset.field === 'notes') { commitEdited(t, 'Edited notes').catch(fail); return; }
  if (el.dataset.field === 'via') {
    t.via = el.value.trim().slice(0, 60);
    requestRender();
    commit(t, t.via ? `Recommended by ${t.via}` : 'Recommendation removed').catch(fail);
    return;
  }
  if (el.dataset.seasonNote !== undefined) { commitEdited(t, `Edited the notes on ${M.seasonName(Number(el.dataset.seasonNote))}`).catch(fail); return; }
  if (el.dataset.epNote !== undefined) {
    const [sn, en] = splitKey(el.dataset.epNote);
    requestRender();
    commitEdited(t, `Edited the note on ${M.epCode(sn, en)}`).catch(fail);
    return;
  }
  if (el.dataset.epField) setEpisodeField(el.dataset.ep, el.dataset.epField, el.value).catch(fail);
});

const forms = {
  add: submitAdd,
  edit: submitEdit,
  'add-season': addSeason,
  'tag-add': addTags,
  'prov-add': addProvider,
  'game-plat-add': addGamePlatform
};

document.addEventListener('submit', (e) => {
  const form = e.target;
  const fn = forms[form.dataset.form];
  if (!fn) return;
  e.preventDefault();
  Promise.resolve().then(() => fn(form)).catch(fail);
});

document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || dlg.open) return;
  const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
  if (['input', 'textarea', 'select'].includes(tag) || (e.target && e.target.isContentEditable)) return;
  const box = document.getElementById('q-head') || document.getElementById('q-list');
  if (box) {
    e.preventDefault();
    box.focus();
  }
});

window.addEventListener('hashchange', onRoute);

/* ---------- start ---------- */

async function start() {
  state.standalone = window.matchMedia('(display-mode: standalone)').matches;
  applyTheme(M.DEFAULT_SETTINGS.accent);
  state.route = parseRoute();
  try {
    const { titles, settings } = await store.loadAll();
    state.titles = titles.map(M.normalizeTitle);
    state.settings = { ...M.DEFAULT_SETTINGS, ...settings };
  } catch (err) {
    console.error(err);
    state.error = err && err.message ? err.message : 'The browser refused to open the storage.';
  }
  applyTheme();
  state.ready = true;
  await purgeExpired();
  onRoute();
  registerWorker();
  state.persisted = await store.persist();
  if (state.route.name === 'settings') requestRender();
}

start();
