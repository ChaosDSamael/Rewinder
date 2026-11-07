// Rewinder — the app: state, routes, actions, saving.
import * as M from './model.js';
import * as store from './store.js';
import * as V from './views.js';
import * as tmdb from './tmdb.js';
import * as rawg from './rawg.js';
import { animeGenres } from './anilist.js';
import * as L from './importer.js';
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
    focusAfter: null,
    dateEdit: null,
    friendsOpen: false,
    friendTab: 'common',
    friendAll: false,
    guideTab: null,
    tvDetail: null,
    tvShow: null,
    tvSpin: false,
    tvKind: 'all',
    rescanning: null,
    heroId: null,
    heroDir: null
  },
  imp: null
};

const importDefaults = (kind = '') => ({ step: 'paste', kind, text: '', useTags: true, items: [], matching: false, noKey: false, done: 0, total: 0, current: '', results: null, changeId: null, changeQuery: '', changeResults: null, changeLoading: false });
state.imp = importDefaults();
state.guide = { step: 0, tmdb: { state: '', msg: '' }, rawg: { state: '', msg: '' } };
state.friends = [];
state.folder = { supported: typeof window.showDirectoryPicker === 'function', name: '', granted: false, handle: null };

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
  if (r.name === 'import') return V.importView(state);
  if (r.name === 'friend') return V.friendView(state, friendById(r.id));
  if (r.name === 'guides') return V.guidesView(state);
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
  const tv = r.name === 'tv' && state.ready && !state.error;
  document.body.classList.toggle('tv-mode', tv);
  tpl.innerHTML = r.name === 'welcome' && state.ready && !state.error
    ? `<main id="main" tabindex="-1">${V.guideView(state)}</main>`
    : tv ? `<main id="main" tabindex="-1">${V.tvView(state)}</main>`
      : V.header(state) + `<main id="main" tabindex="-1">${view()}</main>` + V.footer() + V.tabbar(state);
  morphChildren(root, tpl.content);

  const target = focusAfter || (hadFocus && !root.contains(document.activeElement) ? hadFocus : '');
  if (target) {
    const el = target === 'tv-first' ? document.querySelector('.tv-body [data-tv]') || document.querySelector('.tv [data-tv]') : document.getElementById(target);
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
  if (parts[0] === 'all') return { name: 'browse', kind: 'all' };
  if (M.PATH_KIND[parts[0]]) return { name: 'browse', kind: M.PATH_KIND[parts[0]] };
  if (parts[0] === 'title' && parts[1]) return { name: 'title', id: parts[1] };
  if (parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 'import') return { name: 'import' };
  if (parts[0] === 'welcome') return { name: 'welcome' };
  if (parts[0] === 'tv-mode') return { name: 'tv', section: parts[1] || 'top' };
  if (parts[0] === 'guides') return { name: 'guides' };
  if (parts[0] === 'friend' && parts[1]) return { name: 'friend', id: parts[1] };
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
  state.ui.friendsOpen = false;
  state.ui.tvDetail = null;
  if (r.name === 'guides' && prev.name !== 'guides' && !state.ui.guideTab) state.ui.guideTab = deviceGuide();
  if (r.name === 'tv') state.ui.focusAfter = state.ui.focusAfter || 'tv-first';
  if (r.name === 'tv' && prev.name !== 'tv') toastBox.replaceChildren();
  if (prev.name === 'tv' && r.name !== 'tv' && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  if (!(prev.name === 'friend' && r.name === 'friend' && prev.id === r.id)) {
    state.ui.friendTab = 'common';
    state.ui.friendAll = false;
  }
  state.ui.heroDir = null;
  if (!sameTitle) {
    state.ui.openEp = null;
    state.ui.addSeasonOpen = false;
    state.ui.dateEdit = null;
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
      : r.name === 'browse' ? `${r.kind === 'all' ? 'All' : M.KIND_TAB[r.kind]} · Rewinder`
        : r.name === 'settings' ? 'Settings · Rewinder' : r.name === 'import' ? 'Import · Rewinder' : r.name === 'welcome' ? 'Welcome · Rewinder'
          : r.name === 'friend' && friendById(r.id) ? `${friendById(r.id).name} · Rewinder`
            : r.name === 'tv' ? 'TV mode · Rewinder' : r.name === 'guides' ? 'Guides · Rewinder' : 'Rewinder';
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
  } else if (msg.type === 'friends') {
    state.friends = await loadFriends();
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
  countChange();
  await persist(t);
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
  const most = window.matchMedia && window.matchMedia('(max-width: 759px)').matches ? 2 : 3;
  while (toastBox.children.length > most) toastBox.firstElementChild.remove();
  if (timeout) setTimeout(remove, timeout);
}

let confirmResolve = null;
let returnFocus = null;

function openDialog(html, focusSelector, look = '') {
  if (!dlg.open) returnFocus = document.activeElement;
  dlg.className = look ? `dlg ${look}` : 'dlg';
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
  // The close event comes a moment after close(); if another dialog opened meanwhile, leave it alone.
  if (dlg.open) return;
  stopScanSearch();
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

// Resolves with the value of the button picked, or false when the dialog is closed.
function choose(options) {
  return new Promise((resolve) => {
    openDialog(V.choiceDialog(options), '.dlg-actions .btn-primary');
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

function seenNewSeason(t, sn) {
  if (t.newSeason === null || sn < t.newSeason) return '';
  t.newSeason = null;
  if (t.status !== 'completed') return '';
  t.status = 'progress';
  return 'Status · Completed → In Progress (new season)';
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

function kindFromPage(kind) {
  const r = state.route;
  if (M.KINDS.includes(kind)) return kind;
  return r.name === 'browse' && M.KINDS.includes(r.kind) ? r.kind : '';
}

function openAdd(kind, title = '') {
  const k = kindFromPage(kind) || 'movie';
  openDialog(V.addDialog(k, { title, noKey: k === 'game' ? !state.settings.rawgKey : !state.settings.tmdbKey }), '#add-title');
  if (title) checkDuplicate(title);
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
  const seen = status === 'completed' ? markSeenOnComplete(t) : '';
  state.titles.push(t);
  state.history[t.id] = [];
  closeDialog();
  go('#/title/' + encodeURIComponent(t.id));
  toast(`${t.title} added`);
  countChange();
  await persist(t);
  await log(t, `Added · ${M.STATUS_LABEL[status]}`);
  await log(t, seen);
  if (status === 'completed') await offerCatchUp(t);
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
  const oldMakers = new Map((t.makers || []).map((x) => [x.name.toLowerCase(), x]));
  const makers = M.splitList(data.get('makers'), 6).map((name) => oldMakers.get(name.toLowerCase()) || { name, role: M.makerRoleFor(kind) });
  if (makers.length || t.makers) t.makers = makers;
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
  const seen = value === 'completed' ? markSeenOnComplete(t) : '';
  render();
  await commit(t, `Status · ${M.STATUS_LABEL[before]} → ${M.STATUS_LABEL[value]}`);
  await log(t, seen);
  if (value === 'completed') await offerCatchUp(t);
}

// Completed means seen: a movie gets a viewing, a game its story mark. Today; the date can be changed.
function markSeenOnComplete(t) {
  if (t.kind === 'movie' && !t.views.length) {
    t.views.push({ date: M.today() });
    return 'Seen ×1';
  }
  if (t.kind === 'game' && !t.game.story && !t.game.full) {
    t.game.story = M.today();
    return 'Finished the story';
  }
  return '';
}

// Waits until the title page of id is the one on screen (a new title opens a moment after it is added).
function whenOnTitle(id) {
  return new Promise((resolve) => {
    let tries = 0;
    const check = () => {
      if (state.route.name === 'title' && state.route.id === id) resolve(true);
      else if (++tries > 90) resolve(false);
      else requestAnimationFrame(check);
    };
    check();
  });
}

// A show set to Completed with aired episodes left unchecked: ask once, then check them.
async function offerCatchUp(t) {
  if (!M.hasEpisodes(t)) return;
  const left = M.episodes(t).filter((x) => !x.ep.watched && M.isAired(x.ep));
  if (!left.length || !(await whenOnTitle(t.id))) return;
  const n = left.length;
  const pick = await choose({
    title: 'Mark the episodes watched?',
    body: `${t.title} has ${n} aired episode${n === 1 ? '' : 's'} not checked yet.`,
    date: { label: 'Watched on', value: M.today(), max: M.today() },
    choices: [
      { value: 'none', label: 'Just the status' },
      { value: 'unknown', label: 'Date unknown' },
      { value: 'date', label: 'Check them', primary: true }
    ]
  });
  if (typeof pick !== 'string' || pick === 'none' || t.status !== 'completed' || t.deletedAt) return;
  const typed = pick.startsWith('date:') ? pick.slice(5) : '';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(typed) && typed <= M.today() ? typed : pick === 'unknown' || pick.startsWith('date:') ? 'unknown' : null;
  if (!d) return;
  let count = 0;
  for (const x of left) {
    if (!x.ep.watched) { x.ep.watched = d; count++; }
  }
  if (!count) return;
  if (!t.views.length) t.views.push({ date: d });
  const fresh = t.newSeason !== null ? M.findSeason(t, t.newSeason) : null;
  if (fresh && fresh.episodes.some((e) => M.isAired(e))) t.newSeason = null;
  render();
  await commit(t, `Checked ${count} aired episode${count === 1 ? '' : 's'} · ${M.shownDate(d, true)}`);
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
  await commit(t, `Removed the viewing of ${M.shownDate(gone.date, true)}`);
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

// Once, for titles saved Completed before Completed meant seen: the real date is not known.
async function fixCompletedSeen() {
  if (state.settings.seenFixed) return;
  for (const t of M.live(state.titles)) {
    if (t.status !== 'completed') continue;
    let line = '';
    if (t.kind === 'movie' && !t.views.length) {
      t.views.push({ date: 'unknown' });
      line = 'Counted as seen (Completed) · date unknown';
    } else if (t.kind === 'game' && !t.game.story && !t.game.full) {
      t.game.story = 'unknown';
      line = 'Story counted as done (Completed) · date unknown';
    }
    if (!line) continue;
    try {
      // Another window may have done it a moment ago.
      const saved = await store.getTitle(t.id);
      if (saved && ((t.kind === 'movie' && saved.views && saved.views.length) || (t.kind === 'game' && saved.game && (saved.game.story || saved.game.full)))) {
        if (t.kind === 'movie') t.views = saved.views;
        else t.game = saved.game;
        continue;
      }
      await store.putTitle(t);
      await store.addHistory(t.id, line);
    } catch (err) {
      console.warn('Could not update', t.title, err);
      return;
    }
  }
  state.settings.seenFixed = true;
  await saveSettings();
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
  state.ui.heroId = id;
  const statusText = seenNewSeason(t, nx.season.n) || autoStatus(t);
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
  const statusText = checked ? seenNewSeason(t, sn) || autoStatus(t) : '';
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
  const statusText = seenNewSeason(t, n) || autoStatus(t);
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
  } else if (field === 'watched' && ep.watched && (value === 'unknown' || (/^\d{4}-\d{2}-\d{2}$/.test(value) && value <= M.today()))) {
    if (ep.watched === value) return;
    ep.watched = value;
    requestRender();
    await commit(t, value === 'unknown' ? `${code} · watched date unknown` : `${code} watched on ${M.fmtDate(value, true)}`);
  }
}

/* ---------- actions: games, platforms, tags ---------- */

// key: view-<n> for a viewing, game-story or game-full for a game mark.
async function setDate(key, value) {
  const t = cur();
  if (!t) return;
  const date = value === 'unknown' ? 'unknown' : /^\d{4}-\d{2}-\d{2}$/.test(value || '') && value <= M.today() ? value : null;
  if (!date) return;
  const view = /^view-(\d+)$/.exec(key);
  const mark = /^game-(story|full)$/.exec(key);
  const season = /^season-(\d+)$/.exec(key);
  let line = '';
  if (season && M.findSeason(t, Number(season[1]))) {
    const s = M.findSeason(t, Number(season[1]));
    const seen = s.episodes.filter((e) => e.watched && e.watched !== date);
    if (!seen.length) return;
    for (const e of seen) e.watched = date;
    line = `${M.seasonName(s.n)} watched · ${M.shownDate(date, true)}`;
  } else if (view && t.views[Number(view[1])]) {
    const v = t.views[Number(view[1])];
    if (v.date === date) return;
    v.date = date;
    line = `Viewing date · ${M.shownDate(date, true)}`;
  } else if (mark && t.game && t.game[mark[1]]) {
    if (t.game[mark[1]] === date) return;
    t.game[mark[1]] = date;
    line = `${mark[1] === 'story' ? 'Story' : '100%'} date · ${M.shownDate(date, true)}`;
  } else {
    return;
  }
  if (date === 'unknown') state.ui.dateEdit = null;
  render();
  await commit(t, line);
}

function editDate(key) {
  state.ui.dateEdit = key;
  state.ui.focusAfter = `de-${key}`;
  render();
}

function closeDateEdit() {
  if (!state.ui.dateEdit) return false;
  const key = state.ui.dateEdit;
  state.ui.dateEdit = null;
  state.ui.focusAfter = null;
  render();
  const back = document.querySelector(`[data-action="date-edit"][data-key="${key}"]`);
  if (back) back.focus();
  return true;
}

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

/* ---------- the Scan ---------- */

const scan = { mode: 'add', linkId: null, linkTitle: '', query: '', results: [], notes: [], sources: [], loading: false, error: '', busy: '', status: 'watchlist', kindHint: '', timer: null, controller: null };

function stopScanSearch() {
  clearTimeout(scan.timer);
  if (scan.controller) scan.controller.abort();
  scan.controller = null;
}

function refreshScan() {
  const box = document.getElementById('scan-results');
  if (box) box.innerHTML = V.scanResults(scan, state.titles);
}

function openScan(kind, link) {
  const k = link ? link.kind : kindFromPage(kind);
  const keys = { tmdb: state.settings.tmdbKey, rawg: state.settings.rawgKey };
  let sources;
  if (link) sources = [k === 'game' ? 'rawg' : 'tmdb'].filter((x) => keys[x]);
  else if (k === 'game') sources = keys.rawg ? ['rawg', ...(keys.tmdb ? ['tmdb'] : [])] : [];
  else sources = ['tmdb', 'rawg'].filter((x) => keys[x]);
  if (!sources.length) {
    if (link) toast(`Add your ${k === 'game' ? 'RAWG' : 'TMDB'} key in Settings to scan.`, { action: { label: 'Settings', run: () => go('#/settings') } });
    else openAdd(k);
    return;
  }
  stopScanSearch();
  Object.assign(scan, {
    mode: link ? 'link' : 'add',
    linkId: link ? link.id : null,
    linkTitle: link ? link.title : '',
    query: link ? link.title : '',
    results: [],
    notes: [],
    sources,
    loading: false,
    error: '',
    busy: '',
    status: 'watchlist',
    kindHint: k
  });
  openDialog(V.scanDialog(scan, state.titles), '#scan-q');
  const input = document.getElementById('scan-q');
  if (input) input.select();
  if (scan.query) runSearch();
}

function scanTyped(value) {
  scan.query = value;
  scan.error = '';
  clearTimeout(scan.timer);
  scan.timer = setTimeout(runSearch, 350);
}

async function runSearch() {
  const q = scan.query.trim();
  if (scan.controller) scan.controller.abort();
  scan.controller = null;
  if (q.length < 2) {
    scan.results = [];
    scan.notes = [];
    scan.loading = false;
    refreshScan();
    return;
  }
  const controller = new AbortController();
  scan.controller = controller;
  scan.loading = true;
  scan.error = '';
  refreshScan();
  // Both services at once; if one is down, the other still answers.
  const out = await Promise.all(scan.sources.map((src) => {
    const job = src === 'rawg' ? rawg.search(q, state.settings.rawgKey, controller.signal) : tmdb.search(q, state.settings.tmdbKey, controller.signal);
    return job.then((results) => ({ src, results }), (error) => ({ src, error }));
  }));
  if (controller.signal.aborted) return;
  scan.controller = null;
  scan.loading = false;
  const failed = out.filter((o) => o.error);
  const answered = out.filter((o) => !o.error);
  if (!answered.length) {
    scan.results = [];
    scan.notes = [];
    scan.error = failed[0].error && failed[0].error.message ? failed[0].error.message : 'The search failed.';
    refreshScan();
    return;
  }
  scan.notes = failed.map((o) => (o.error && o.error.message) || `${o.src.toUpperCase()} did not answer.`);
  const of = (src) => (answered.find((o) => o.src === src) || { results: [] }).results;
  const hint = scan.kindHint;
  let list = hint === 'game' ? [...of('rawg'), ...of('tmdb')] : [...of('tmdb'), ...of('rawg')];
  if (hint && hint !== 'game') list = [...list.filter((r) => r.kind === hint), ...list.filter((r) => r.kind !== hint)];
  scan.results = list;
  refreshScan();
}

// TMDB says "Animation"; AniList knows the real anime genres. If it doesn't answer, TMDB's stay.
async function addAnimeGenres(data) {
  const genres = await animeGenres([data.original, data.title], data.year);
  if (genres) data.genres = genres;
}

async function fetchScan(type, id, wantAnime) {
  if (type === 'game') return rawg.fetchGame(id, state.settings.rawgKey);
  const data = await tmdb.fetchTitle(type, id, state.settings.tmdbKey, (step) => { scan.busy = step; refreshScan(); });
  if (data.tmdbType === 'tv' && (data.kind === 'anime' || wantAnime)) {
    scan.busy = 'Reading anime genres…';
    refreshScan();
    await addAnimeGenres(data);
  }
  return data;
}

async function pickScan(type, id, openId) {
  if (openId) {
    closeDialog();
    go('#/title/' + encodeURIComponent(openId));
    return;
  }
  if (scan.busy || !['movie', 'tv', 'game'].includes(type) || !Number.isInteger(id)) return;
  const statusBox = document.getElementById('scan-status');
  const status = statusBox && M.STATUSES.includes(statusBox.value) ? statusBox.value : 'watchlist';
  const mode = scan.mode;
  const linkId = scan.linkId;
  const linked = mode === 'link' ? byId(linkId) : null;
  stopScanSearch();
  scan.busy = 'Scanning…';
  scan.error = '';
  refreshScan();
  let data;
  try {
    data = await fetchScan(type, id, Boolean(linked && linked.kind === 'anime'));
  } catch (err) {
    scan.busy = '';
    scan.error = err && err.message ? err.message : 'The scan failed.';
    refreshScan();
    return;
  }
  scan.busy = '';
  const already = M.live(state.titles).find((t) => t.id !== linkId && (data.source === 'rawg' ? t.rawgId === data.rawgId : t.tmdbId === data.tmdbId && t.tmdbType === data.tmdbType));
  if (already) {
    closeDialog();
    go('#/title/' + encodeURIComponent(already.id));
    toast(`${already.title} is already in your list.`);
    return;
  }
  const size = data.seasons ? ` · ${data.seasons.length} season${data.seasons.length === 1 ? '' : 's'}, ${data.seasons.reduce((n, x) => n + x.episodes.length, 0)} episodes` : '';
  const via = data.source === 'rawg' ? 'RAWG' : 'TMDB';
  if (mode === 'link') {
    closeDialog();
    if (!linked) return;
    M.mergeScan(linked, data);
    state.ui.openSeasons.clear();
    openDefaultSeason(linked);
    render();
    document.title = `${linked.title} · Rewinder`;
    toast(`${linked.title} scanned${size}`);
    await commit(linked, `Scanned with ${via}${size}`);
    return;
  }
  const t = M.newTitle({ kind: data.kind, status });
  M.mergeScan(t, data);
  const seen = status === 'completed' ? markSeenOnComplete(t) : '';
  state.titles.push(t);
  state.history[t.id] = [];
  closeDialog();
  go('#/title/' + encodeURIComponent(t.id));
  toast(`${t.title} added${size}`);
  countChange();
  await persist(t);
  await log(t, `Added with Scan · ${M.STATUS_LABEL[status]}`);
  await log(t, seen);
  if (status === 'completed') await offerCatchUp(t);
}

async function rescan() {
  const t = cur();
  if (!t || state.ui.rescanning) return;
  const game = t.kind === 'game';
  if (!(game ? state.settings.rawgKey : state.settings.tmdbKey)) {
    toast(`Add your ${game ? 'RAWG' : 'TMDB'} key in Settings to scan.`, { action: { label: 'Settings', run: () => go('#/settings') } });
    return;
  }
  if (!(game ? t.rawgId : t.tmdbId)) {
    openScan(t.kind, t);
    return;
  }
  state.ui.rescanning = t.id;
  render();
  try {
    let data;
    if (game) {
      data = await rawg.fetchGame(t.rawgId, state.settings.rawgKey);
    } else {
      data = await tmdb.fetchTitle(t.tmdbType, t.tmdbId, state.settings.tmdbKey);
      if (data.tmdbType === 'tv' && (data.kind === 'anime' || t.kind === 'anime')) await addAnimeGenres(data);
    }
    const counts = M.mergeScan(t, data);
    const news = [counts.seasons ? `${counts.seasons} new season${counts.seasons === 1 ? '' : 's'}` : '', counts.episodes ? `${counts.episodes} new episode${counts.episodes === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ');
    toast(news ? `${t.title} · ${news}` : `${t.title} is up to date`);
    await commit(t, news ? `Rescanned · ${news}` : 'Rescanned · up to date');
  } catch (err) {
    toast(err && err.message ? err.message : 'The scan failed.');
  } finally {
    state.ui.rescanning = null;
    render();
  }
}

/* ---------- import a list ---------- */

let matchToken = 0;
const impItem = (id) => state.imp.items.find((it) => it.id === id) || null;
const impKey = () => (state.imp.kind === 'game' ? state.settings.rawgKey : state.settings.tmdbKey);

function openListFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.txt,text/plain';
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    if (file.size > 2e6) { toast('That file is too big for a list.'); return; }
    state.imp.text = await file.text();
    if (!state.imp.kind) {
      const name = file.name.toLowerCase();
      state.imp.kind = /anim/.test(name) ? 'anime' : /movie|film/.test(name) ? 'movie' : /game|jeu/.test(name) ? 'game' : /show|serie|série|tv/.test(name) ? 'tv' : '';
    }
    render();
  });
  input.click();
}

function findExisting(it) {
  const live = M.live(state.titles);
  const m = it.match;
  if (m) {
    const hit = live.find((t) => (m.type === 'game' ? t.rawgId === m.id : t.tmdbId === m.id && t.tmdbType === m.type));
    if (hit) return hit;
  }
  const k = L.keyOf(it.title);
  const kind = state.imp.kind;
  const sameShelf = (t) => t.kind === kind || (M.hasEpisodes(t) && (kind === 'tv' || kind === 'anime'));
  return live.find((t) => sameShelf(t) && (L.keyOf(t.title) === k || (t.titleQc && L.keyOf(t.titleQc) === k))) || null;
}

async function matchItem(it, key, token) {
  try {
    const kind = state.imp.kind;
    const results = kind === 'game' ? await rawg.search(it.title, key) : await tmdb.searchKind(it.title, kind, it.year, key);
    if (token !== matchToken) return;
    it.candidates = results;
    const grade = (r) => L.matchQuality(it.title, r);
    const best = results.find((r) => grade(r) === 'sure') || results.find((r) => grade(r) === 'likely') || results[0] || null;
    it.match = best;
    it.quality = best ? grade(best) : 'none';
  } catch (err) {
    if (token !== matchToken) return;
    it.quality = 'error';
    it.error = err && err.message ? err.message : 'Search failed';
    it.match = null;
  }
  const ex = findExisting(it);
  it.existingId = ex ? ex.id : null;
  it.searched = true;
}

async function matchAll() {
  const token = ++matchToken;
  const imp = state.imp;
  const key = impKey();
  imp.noKey = !key;
  for (const it of imp.items) {
    if (it.heading) continue;
    const ex = findExisting(it);
    it.existingId = ex ? ex.id : null;
  }
  if (!key) {
    for (const it of imp.items) it.searched = true;
    render();
    return;
  }
  imp.matching = true;
  render();
  const queue = imp.items.filter((it) => !it.heading && !it.searched);
  const worker = async () => {
    while (queue.length && token === matchToken) {
      const it = queue.shift();
      await matchItem(it, key, token);
      if (state.route.name === 'import') requestRender();
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  if (token !== matchToken) return;
  imp.matching = false;
  render();
}

function startReview() {
  const imp = state.imp;
  if (!imp.kind || !imp.text.trim()) return;
  imp.items = L.parseList(imp.text).map((it) => ({ ...it, include: !it.heading, status: L.defaultStatus(it), match: null, candidates: [], quality: '', searched: false, existingId: null }));
  if (!imp.items.some((it) => !it.heading)) { toast('No titles found in that list.'); return; }
  imp.step = 'review';
  imp.changeId = null;
  render();
  window.scrollTo(0, 0);
  matchAll();
}

function toggleHeading(id) {
  const it = impItem(id);
  if (!it) return;
  it.heading = !it.heading;
  it.include = !it.heading;
  L.regroup(state.imp.items);
  if (!it.heading && !it.searched) {
    const key = impKey();
    if (key) matchItem(it, key, matchToken).then(() => requestRender());
    else it.searched = true;
  }
  render();
}

let changeTimer = null;
let changeController = null;

function toggleChange(id) {
  const imp = state.imp;
  if (imp.changeId === id) {
    imp.changeId = null;
    render();
    return;
  }
  const it = impItem(id);
  if (!it) return;
  imp.changeId = id;
  imp.changeQuery = it.title;
  imp.changeResults = null;
  imp.changeLoading = false;
  state.ui.focusAfter = 'imp-q';
  render();
}

function changeTyped(value) {
  state.imp.changeQuery = value;
  clearTimeout(changeTimer);
  changeTimer = setTimeout(async () => {
    const q = state.imp.changeQuery.trim();
    if (changeController) changeController.abort();
    if (q.length < 2) return;
    const controller = new AbortController();
    changeController = controller;
    state.imp.changeLoading = true;
    requestRender();
    try {
      // Any kind here: a movie listed with the shows, or the other way around, can still be found.
      const found = state.imp.kind === 'game'
        ? await rawg.search(q, state.settings.rawgKey, controller.signal)
        : await tmdb.search(q, state.settings.tmdbKey, controller.signal);
      if (controller.signal.aborted) return;
      state.imp.changeResults = found;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      state.imp.changeResults = [];
      toast(err && err.message ? err.message : 'The search failed.');
    }
    state.imp.changeLoading = false;
    requestRender();
  }, 350);
}

function pickMatch(id, type, rid) {
  const imp = state.imp;
  const it = impItem(id);
  if (!it) return;
  const pool = [...(imp.changeResults || []), ...it.candidates];
  const r = pool.find((x) => x.type === type && x.id === rid);
  if (!r) return;
  it.match = r;
  it.quality = 'sure';
  const ex = findExisting(it);
  it.existingId = ex ? ex.id : null;
  imp.changeId = null;
  render();
}

async function importItem(it) {
  const imp = state.imp;
  const kind = imp.kind;
  const useGroups = imp.useTags;
  const existing = it.existingId ? byId(it.existingId) : null;
  if (existing && !existing.deletedAt) {
    L.applyLine(existing, it, { useGroups });
    await commit(existing, `Updated from your list: ${it.line}`.slice(0, 200));
    imp.results.updated++;
    return;
  }
  let t;
  if (it.match) {
    const m = it.match;
    let data;
    if (m.type === 'game') {
      data = await rawg.fetchGame(m.id, state.settings.rawgKey);
    } else {
      data = await tmdb.fetchTitle(m.type, m.id, state.settings.tmdbKey);
      if (data.tmdbType === 'tv' && (kind === 'anime' || data.kind === 'anime')) await addAnimeGenres(data);
    }
    // Two lines of the same list can point to the same show.
    const twin = M.live(state.titles).find((x) => (data.source === 'rawg' ? x.rawgId === data.rawgId : x.tmdbId === data.tmdbId && x.tmdbType === data.tmdbType));
    if (twin) {
      L.applyLine(twin, it, { useGroups });
      await commit(twin, `Updated from your list: ${it.line}`.slice(0, 200));
      imp.results.updated++;
      return;
    }
    t = M.newTitle({ kind: data.source === 'rawg' ? 'game' : kind === 'game' ? data.kind : kind });
    M.mergeScan(t, data);
    imp.results.added++;
  } else {
    t = M.newTitle({ kind, title: it.title.slice(0, 300), year: it.year });
    imp.results.manual++;
  }
  L.applyLine(t, it, { useGroups, status: it.status });
  state.titles.push(t);
  countChange();
  await persist(t);
  await log(t, `Imported from your list: ${it.line}`.slice(0, 200));
}

async function runImport() {
  const imp = state.imp;
  if (imp.matching) return;
  const todo = imp.items.filter((it) => !it.heading && it.include);
  if (!todo.length) return;
  imp.step = 'running';
  imp.total = todo.length;
  imp.done = 0;
  imp.current = '';
  imp.results = { added: 0, updated: 0, manual: 0, failed: [] };
  render();
  window.scrollTo(0, 0);
  const queue = [...todo];
  const worker = async () => {
    while (queue.length) {
      const it = queue.shift();
      imp.current = it.title;
      try {
        await importItem(it);
      } catch (err) {
        console.error(err);
        imp.results.failed.push(it.title);
      }
      imp.done++;
      if (state.route.name === 'import') requestRender();
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  imp.step = 'done';
  imp.current = '';
  if (state.route.name === 'import') render();
  toast(`List imported · ${imp.results.added + imp.results.manual} added, ${imp.results.updated} updated`);
}

/* ---------- start guide ---------- */

async function finishGuide(to) {
  if (!state.settings.onboarded) {
    state.settings.onboarded = true;
    await saveSettings();
  }
  state.guide.step = 0;
  go(to);
}

async function checkGuideKey(which) {
  const input = document.getElementById(`g-${which}`);
  const key = (input ? input.value : '').trim();
  const g = state.guide[which];
  const name = which === 'tmdb' ? 'tmdbKey' : 'rawgKey';
  if (!key) {
    g.state = 'bad';
    g.msg = 'Paste the key first.';
    render();
    return;
  }
  state.settings[name] = key.slice(0, 400);
  g.state = 'checking';
  render();
  try {
    if (which === 'tmdb') await tmdb.checkKey(key);
    else await rawg.checkKey(key);
    g.state = 'ok';
    g.msg = '';
  } catch (err) {
    g.state = 'bad';
    g.msg = err && err.message ? err.message : 'That key did not work.';
  }
  await saveSettings();
  state.ui.focusAfter = g.state === 'ok' ? 'guide-next' : `g-${which}`;
  render();
}

/* ---------- new seasons, once a day ---------- */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Shows you follow (in progress, finished, on hold) get checked on TMDB once a day, when Rewinder opens.
// New episodes slip in quietly; a new season gets a NEW badge, a spot in New Seasons and a heads-up.
async function checkNewSeasons() {
  const key = state.settings.tmdbKey;
  const day = M.today();
  if (!key || state.settings.lastSeasonCheck === day || (typeof navigator.onLine === 'boolean' && !navigator.onLine)) return;
  state.settings.lastSeasonCheck = day;
  await saveSettings();
  const follow = M.live(state.titles).filter((t) => M.hasEpisodes(t) && t.tmdbId && t.tmdbType === 'tv' && ['progress', 'completed', 'hold'].includes(t.status));
  const fresh = [];
  for (const t of follow) {
    try {
      const data = await tmdb.fetchTitle('tv', t.tmdbId, key);
      const before = t.seasons.reduce((m, s) => Math.max(m, s.n), 0);
      M.mergeProviders(t, data);
      const counts = M.mergeSeasons(t, data);
      const after = t.seasons.reduce((m, s) => Math.max(m, s.n), 0);
      if (after > before && before > 0) {
        t.newSeason = after;
        fresh.push(t);
        await commit(t, `New season: ${M.seasonName(after)}`);
      } else if (counts.episodes) {
        await commit(t, `${counts.episodes} new episode${counts.episodes === 1 ? '' : 's'} from TMDB`);
      }
    } catch (err) {
      if (err && (err.code === 'auth' || err.code === 'network')) break;
    }
    await sleep(250);
  }
  if (!fresh.length) return;
  requestRender();
  toast(fresh.length === 1 ? `New season: ${fresh[0].title}, ${M.seasonName(fresh[0].newSeason)}` : `${fresh.length} shows have a new season`, {
    action: { label: 'See', run: () => go('#/') },
    timeout: 10000
  });
}

/* ---------- backups to a folder ---------- */

const BACKUP_NAME = /^rewinder-backup-\d{4}-\d{2}-\d{2}\.json$/;

async function permissionOf(handle, ask) {
  try {
    const opts = { mode: 'readwrite' };
    let p = await handle.queryPermission(opts);
    if (p !== 'granted' && ask) p = await handle.requestPermission(opts);
    return p === 'granted';
  } catch {
    return false;
  }
}

async function loadBackupFolder() {
  if (!state.folder.supported) return;
  let handle = null;
  try { handle = await store.getMeta('backupDir'); } catch { handle = null; }
  if (!handle) return;
  state.folder.handle = handle;
  state.folder.name = handle.name || 'your folder';
  state.folder.granted = await permissionOf(handle, false);
}

async function folderBackup(manual) {
  const f = state.folder;
  if (!f.handle) return false;
  f.granted = await permissionOf(f.handle, manual);
  if (!f.granted) { requestRender(); return false; }
  try {
    flushSaves();
    const data = await store.exportAll();
    const file = await f.handle.getFileHandle(`rewinder-backup-${M.today()}.json`, { create: true });
    const out = await file.createWritable();
    await out.write(JSON.stringify(data, null, 1));
    await out.close();
    const names = [];
    for await (const [name, h] of f.handle.entries()) if (h.kind === 'file' && BACKUP_NAME.test(name)) names.push(name);
    names.sort();
    for (const old of names.slice(0, -10)) await f.handle.removeEntry(old).catch(() => {});
    const now = new Date().toISOString();
    state.settings.folderBackupAt = now;
    state.settings.lastBackupAt = now;
    state.settings.changesSinceBackup = 0;
    state.settings.backupSnoozeUntil = null;
    await saveSettings();
    requestRender();
    if (manual) toast(`Backup saved in ${f.name}.`);
    return true;
  } catch (err) {
    console.error(err);
    if (manual) toast('The folder backup failed. ' + (err && err.message ? err.message : ''));
    return false;
  }
}

// Once per title, for titles scanned before Rewinder kept who made them. Quiet and slow;
// a source that refuses or is down is left for the next opening.
async function fillMakers() {
  if (typeof navigator.onLine === 'boolean' && !navigator.onLine) return;
  const todo = M.live(state.titles).filter((t) => t.makers === null);
  const jobs = [
    { key: state.settings.tmdbKey, list: todo.filter((t) => t.tmdbId && t.tmdbType), ask: (t, key) => tmdb.fetchMakers(t.tmdbType, t.tmdbId, key) },
    { key: state.settings.rawgKey, list: todo.filter((t) => t.rawgId && t.kind === 'game'), ask: (t, key) => rawg.fetchStudios(t.rawgId, key) }
  ];
  let filled = 0;
  for (const job of jobs) {
    if (!job.key) continue;
    for (const t of job.list) {
      if (t.makers !== null || t.deletedAt) continue;
      try {
        t.makers = await job.ask(t, job.key);
      } catch (err) {
        if (!err || err.code !== 'notfound') break;
        t.makers = [];
      }
      try {
        await store.putTitle(t);
        announce({ type: 'title', id: t.id });
      } catch (err) {
        console.warn('Could not save who made', t.title, err);
        return;
      }
      filled++;
      if (filled % 10 === 0) requestRender();
      await sleep(200);
    }
  }
  if (filled) requestRender();
}

// Once a day at most, and only when something changed. After a restart the
// browser may want its OK again: a toast then asks for it, one click.
async function autoFolderBackup() {
  const f = state.folder;
  if (!f.handle || !(state.settings.changesSinceBackup > 0)) return;
  const last = state.settings.folderBackupAt ? Date.parse(state.settings.folderBackupAt) : 0;
  if (Date.now() - last < 20 * 3600e3) return;
  if (!f.granted) {
    toast(`A backup is due in ${f.name}.`, { action: { label: 'Allow', run: () => { allowBackupFolder(); } }, timeout: 15000 });
    return;
  }
  await folderBackup(false);
}

async function pickBackupFolder() {
  if (!state.folder.supported) return;
  let handle;
  try {
    handle = await window.showDirectoryPicker({ id: 'rewinder-backups', mode: 'readwrite' });
  } catch (err) {
    if (err && err.name !== 'AbortError') toast('Could not use that folder.');
    return;
  }
  state.folder.handle = handle;
  state.folder.name = handle.name || 'your folder';
  state.folder.granted = true;
  try { await store.putMeta('backupDir', handle); } catch (err) { console.warn('Folder not remembered', err); }
  await folderBackup(true);
}

async function allowBackupFolder() {
  if (!state.folder.handle) return;
  state.folder.granted = await permissionOf(state.folder.handle, true);
  render();
  if (state.folder.granted) await folderBackup(true);
}

async function stopBackupFolder() {
  state.folder = { ...state.folder, handle: null, name: '', granted: false };
  try { await store.putMeta('backupDir', null); } catch { /* nothing to forget */ }
  render();
  toast('Automatic folder backups stopped. The files already there stay.');
}

/* ---------- friends' cards ---------- */

const cardInput = document.getElementById('card-file');
const friendById = (id) => state.friends.find((f) => f.id === id) || null;

async function loadFriends() {
  let saved = null;
  try { saved = await store.getMeta('friends'); } catch { saved = null; }
  return (Array.isArray(saved) ? saved : []).filter((f) => f && Array.isArray(f.titles)).map((f) => ({ ...M.normalizeCard(f), loadedAt: f.loadedAt || null }));
}

async function saveFriends() {
  await store.putMeta('friends', state.friends);
  announce({ type: 'friends' });
}

function downloadJson(data, name) {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const fileSlug = (name) => String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'me';

async function shareCard() {
  const field = document.getElementById('card-name');
  if (field && field.value.trim() !== (state.settings.cardName || '')) state.settings.cardName = field.value.trim().slice(0, 40);
  const name = (state.settings.cardName || '').trim();
  if (!name) {
    toast('Add your name first: your friends see it on your card.');
    if (field) field.focus();
    return;
  }
  if (!state.settings.cardId) state.settings.cardId = 'card-' + M.uid();
  await saveSettings();
  flushSaves();
  const card = M.makeCard(state.titles, { id: state.settings.cardId, name });
  const file = `rewinder-card-${fileSlug(name)}.json`;
  downloadJson(card, file);
  toast(`Card saved as ${file}. Send it to your friends.`);
}

function pickCard() {
  cardInput.value = '';
  cardInput.click();
}

async function readCardFile(file) {
  if (!file) return;
  if (file.size > 5e6) { toast('That file is too big for a card.'); return; }
  let data = null;
  try { data = JSON.parse(await file.text()); } catch { data = null; }
  if (M.isCard(data)) { await addCard(data); return; }
  if (store.isBackup(data)) { toast('This is a backup, not a card. To use it, go to Settings → Restore a backup.'); return; }
  toast('This file is not a Rewinder card.');
}

function acquired(f, c, replaced) {
  return new Promise((resolve) => {
    openDialog(V.acquiredDialog(f, c, replaced), '[data-action="choice"][data-value="compare"]', 'dlg-acq');
    confirmResolve = resolve;
  });
}

async function addCard(raw) {
  const card = { ...M.normalizeCard(raw), loadedAt: new Date().toISOString() };
  if (card.id === state.settings.cardId) { toast('That is your own card.'); return; }
  const i = state.friends.findIndex((f) => f.id === card.id);
  if (i >= 0 && Date.parse(state.friends[i].at) > Date.parse(card.at)) {
    toast(`You already have a newer card from ${state.friends[i].name}.`);
    return;
  }
  if (i >= 0) state.friends[i] = card;
  else state.friends.push(card);
  try {
    await saveFriends();
  } catch (err) {
    console.error(err);
    toast('Could not keep that card. The browser refused to store it.');
    return;
  }
  state.ui.friendsOpen = false;
  render();
  const pick = await acquired(card, M.compareCard(state.titles, card), i >= 0);
  if (pick === 'compare') go('#/friend/' + encodeURIComponent(card.id));
}

async function removeFriend(id) {
  const f = friendById(id);
  if (!f) return;
  const ok = await ask({ title: `Remove ${f.name}?`, body: `${f.name}'s card leaves this device. Add it again any time.`, yes: 'Remove', danger: true });
  if (!ok) return;
  state.friends = state.friends.filter((x) => x.id !== id);
  await saveFriends();
  go('#/');
  toast(`${f.name}'s card removed.`);
}

// A title from a friend's card, straight into your watchlist, "Recommended by" them.
async function addFromFriend(index) {
  const f = state.route.name === 'friend' ? friendById(state.route.id) : null;
  if (!f) return;
  const p = M.compareCard(state.titles, f).picks[index];
  if (!p) return;
  if (p.mine) { go('#/title/' + encodeURIComponent(p.mine.id)); return; }
  const x = p.theirs;
  const t = M.newTitle({ kind: x.kind, title: x.title, year: x.year, poster: x.poster, status: 'watchlist', via: f.name });
  if (x.tmdb) { const [type, id] = x.tmdb.split(':'); t.tmdbType = type; t.tmdbId = Number(id); }
  if (x.rawg) t.rawgId = x.rawg;
  state.titles.push(t);
  state.history[t.id] = [];
  countChange();
  await persist(t);
  render();
  toast(`${t.title} is in your watchlist.`, { action: { label: 'Open', run: () => go('#/title/' + encodeURIComponent(t.id)) } });
  await log(t, `Added from ${f.name}'s card · Watchlist`);
  // The rest (seasons, cast, where to watch) comes quietly when a key is there.
  const type = t.rawgId ? 'game' : t.tmdbType;
  const id = t.rawgId || t.tmdbId;
  const key = t.rawgId ? state.settings.rawgKey : state.settings.tmdbKey;
  if (!id || !key) return;
  try {
    const data = await fetchScan(type, id, t.kind === 'anime');
    if (t.deletedAt) return;
    M.mergeScan(t, data);
    t.status = 'watchlist';
    t.via = f.name;
    await persist(t);
    requestRender();
  } catch (err) {
    console.warn('Could not fill in', t.title, err);
  }
}

function toggleFriends(open) {
  state.ui.friendsOpen = typeof open === 'boolean' ? open : !state.ui.friendsOpen;
  if (state.ui.friendsOpen) state.ui.focusAfter = state.friends.length ? null : 'card-name';
  render();
}

/* ---------- TV mode, guides ---------- */

// Phones and tablets open the guides on their own tab; computers on theirs.
function deviceGuide() {
  const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  return touch ? 'phone' : 'pc';
}

function enterTv() {
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {});
  go('#/tv-mode/top');
}

function exitTv() {
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  go('#/');
}

function openTvDetail(id) {
  if (!state.titles.some((t) => t.id === id)) return;
  state.ui.tvBack = document.activeElement && document.activeElement.id ? document.activeElement.id : null;
  state.ui.tvBackKey = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.key || null : null;
  state.ui.tvDetail = id;
  state.ui.focusAfter = 'tv-back';
  render();
}

function closeTvDetail() {
  const key = state.ui.tvBackKey;
  state.ui.tvDetail = null;
  render();
  const back = key ? document.querySelector(`[data-key="${CSS.escape(key)}"]`) : null;
  if (back) back.focus();
}

// Tonight: a short spin through the watchlist, then one title.
let spinTimer = null;
function pickTonight() {
  const pool = M.live(state.titles).filter((t) => t.status === 'watchlist' && (state.ui.tvKind === 'all' || t.kind === state.ui.tvKind));
  if (!pool.length) return;
  clearTimeout(spinTimer);
  const final = pool[Math.floor(Math.random() * pool.length)];
  const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (still || pool.length === 1) {
    state.ui.tvSpin = false;
    state.ui.tvShow = final.id;
    state.ui.focusAfter = 'tv-pick';
    render();
    return;
  }
  let step = 0;
  const steps = 14;
  state.ui.tvSpin = true;
  const tick = () => {
    step++;
    if (step >= steps) {
      state.ui.tvSpin = false;
      state.ui.tvShow = final.id;
      state.ui.focusAfter = 'tv-pick';
      render();
      return;
    }
    state.ui.tvShow = pool[(Math.floor(Math.random() * pool.length) + step) % pool.length].id;
    render();
    spinTimer = setTimeout(tick, 50 + step * step * 1.2);
  };
  tick();
}

// The remote: arrows move to the nearest thing in that direction.
// The arrows move to the nearest thing that way. Lined up beats off to the side,
// and the opposite arrow goes back to where you came from.
const TV_OPPOSITE = { ArrowUp: 'ArrowDown', ArrowDown: 'ArrowUp', ArrowLeft: 'ArrowRight', ArrowRight: 'ArrowLeft' };
let tvLast = null;
const tvGap = (a1, a2, b1, b2) => Math.max(0, Math.max(a1, b1) - Math.min(a2, b2));

function tvMove(dir) {
  const scope = document.querySelector('.tv-detail') || document.querySelector('.tv');
  if (!scope) return;
  const items = [...scope.querySelectorAll('[data-tv]')].filter((el) => !el.disabled && el.getClientRects().length);
  if (!items.length) return;
  const cur = items.includes(document.activeElement) ? document.activeElement : null;
  if (!cur) { items[0].focus(); return; }
  const a = cur.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  let best = null;
  if (tvLast && tvLast.to === cur && TV_OPPOSITE[tvLast.dir] === dir && items.includes(tvLast.from)) best = tvLast.from;
  let bestScore = Infinity;
  for (const el of best ? [] : items) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    const dx = b.left + b.width / 2 - ax;
    const dy = b.top + b.height / 2 - ay;
    const across = dir === 'ArrowRight' || dir === 'ArrowLeft';
    const main = dir === 'ArrowRight' ? dx : dir === 'ArrowLeft' ? -dx : dir === 'ArrowDown' ? dy : -dy;
    if (main <= 1) continue;
    const cross = across ? tvGap(a.top, a.bottom, b.top, b.bottom) : tvGap(a.left, a.right, b.left, b.right);
    const score = main + cross * 3;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (!best) return;
  tvLast = { from: cur, to: best, dir };
  best.focus({ preventScroll: true });
  best.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

const TV_BACK_KEYS = new Set(['Escape', 'Backspace', 'GoBack', 'BrowserBack']);

/* ---------- backup ---------- */

async function exportBackup() {
  flushSaves();
  try {
    const data = await store.exportAll();
    downloadJson(data, `rewinder-backup-${M.today()}.json`);
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
    const track = (worker) => worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker);
    });
    if (reg.waiting && hadController) offer(reg.waiting);
    if (reg.installing) track(reg.installing);
    reg.addEventListener('updatefound', () => { if (reg.installing) track(reg.installing); });
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
  add: (el) => openScan(el.dataset.kind),
  'scan-pick': (el) => pickScan(el.dataset.type, Number(el.dataset.id), el.dataset.open),
  'scan-manual': () => openAdd(scan.kindHint, scan.query.trim()),
  rescan: () => rescan(),
  'dlg-close': () => closeDialog(),
  'confirm-yes': () => {
    const resolve = confirmResolve;
    confirmResolve = null;
    closeDialog();
    if (resolve) resolve(true);
  },
  'confirm-no': () => closeDialog(),
  choice: (el) => {
    const resolve = confirmResolve;
    const field = dlg.querySelector('[data-choice-date]');
    const value = el.dataset.value === 'date' ? `date:${field ? field.value : ''}` : el.dataset.value;
    confirmResolve = null;
    closeDialog();
    if (resolve) resolve(value);
  },
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
  'hero-go': (el) => {
    state.ui.heroId = el.dataset.id;
    state.ui.heroDir = el.dataset.dir === 'prev' ? 'prev' : 'next';
    render();
  },
  'imp-kind': (el) => { state.imp.kind = el.dataset.kind; render(); },
  'imp-file': () => openListFile(),
  'imp-read': () => startReview(),
  'imp-back': () => {
    matchToken++;
    state.imp.matching = false;
    state.imp.step = 'paste';
    state.imp.changeId = null;
    render();
  },
  'imp-again': () => { state.imp = importDefaults(state.imp.kind); render(); },
  'imp-heading': (el) => toggleHeading(Number(el.dataset.id)),
  'imp-change': (el) => toggleChange(Number(el.dataset.id)),
  'imp-pick': (el) => pickMatch(Number(el.dataset.id), el.dataset.type, Number(el.dataset.rid)),
  'imp-nomatch': (el) => {
    const it = impItem(Number(el.dataset.id));
    if (!it) return;
    it.match = null;
    it.quality = 'none';
    it.existingId = findExisting(it) ? findExisting(it).id : null;
    state.imp.changeId = null;
    render();
  },
  'imp-run': () => runImport(),
  'guide-open': () => { state.guide.step = 0; go('#/welcome'); },
  'guide-next': () => { state.guide.step = Math.min(4, state.guide.step + 1); state.ui.focusAfter = 'guide-next'; render(); },
  'guide-back': () => { state.guide.step = Math.max(0, state.guide.step - 1); state.ui.focusAfter = 'guide-next'; render(); },
  'guide-to': (el) => finishGuide(el.dataset.to || '#/'),
  'guide-add': async () => { await finishGuide('#/'); openScan(); },
  'guide-restore': async () => { await finishGuide('#/'); importInput.value = ''; importInput.click(); },
  'guide-check': (el) => checkGuideKey(el.dataset.which),
  'folder-pick': () => pickBackupFolder(),
  'folder-now': () => folderBackup(true),
  'folder-allow': () => allowBackupFolder(),
  'folder-stop': () => stopBackupFolder(),
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
  'date-edit': (el) => editDate(el.dataset.key),
  'friends-toggle': () => toggleFriends(),
  'search-open': () => { state.ui.focusAfter = 'q-list'; go('#/list'); },
  'tv-enter': () => enterTv(),
  'tv-exit': () => exitTv(),
  'tv-open': (el) => openTvDetail(el.dataset.id),
  'tv-close': () => closeTvDetail(),
  'tv-pick': () => pickTonight(),
  'tv-kind': (el) => { state.ui.tvKind = el.dataset.kind; state.ui.tvShow = null; state.ui.focusAfter = null; render(); },
  'guide-tab': (el) => { state.ui.guideTab = el.dataset.tab; state.ui.focusAfter = `gd-${el.dataset.tab}`; render(); },
  'card-share': () => shareCard(),
  'card-pick': () => pickCard(),
  'friend-tab': (el) => {
    state.ui.friendTab = el.dataset.tab;
    state.ui.friendAll = false;
    state.ui.focusAfter = `tab-${el.dataset.tab}`;
    render();
  },
  'friend-all': () => { state.ui.friendAll = true; render(); },
  'friend-add': (el) => addFromFriend(Number(el.dataset.i)),
  'friend-remove': (el) => removeFriend(el.dataset.id),
  'ep-unknown': (el) => setEpisodeField(el.dataset.ep, 'watched', 'unknown').catch(fail),
  'date-unknown': (el) => setDate(el.dataset.key, 'unknown').catch(fail),
  'date-close': () => closeDateEdit(),
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
  if (state.ui.friendsOpen && !e.target.closest('.friends-wrap, [data-action="friends-toggle"]') && !dlg.open && document.contains(e.target)) {
    state.ui.friendsOpen = false;
    requestRender();
  }
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  Promise.resolve().then(() => fn(el, e)).catch(fail);
});

const hasFiles = (e) => Boolean(e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files'));
window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (!file) return;
  if (state.route.name === 'import' && /\.txt$/i.test(file.name)) {
    file.text().then((text) => { state.imp.text = text; render(); }).catch(fail);
    return;
  }
  readCardFile(file).catch(fail);
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
  if (el.id === 'scan-q') { scanTyped(el.value); return; }
  if (el.id === 'imp-text') {
    state.imp.text = el.value;
    clearTimeout(listTimer);
    listTimer = setTimeout(requestRender, 150);
    return;
  }
  if (el.dataset.impQ !== undefined) { changeTyped(el.value); return; }
  if (el.dataset.guideKey) {
    const which = el.dataset.guideKey;
    state.settings[which === 'tmdb' ? 'tmdbKey' : 'rawgKey'] = el.value.trim().slice(0, 400);
    state.guide[which] = { state: '', msg: '' };
    clearTimeout(listTimer);
    listTimer = setTimeout(() => { requestRender(); saveSettings(); }, 300);
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
  if (el === cardInput) { readCardFile(el.files && el.files[0]).catch(fail); return; }
  if (el.dataset.rate !== undefined) { commitRate(el.dataset.rate, el.value).catch(fail); return; }
  if (el.dataset.epCheck) { setEpisodeWatched(el.dataset.epCheck, el.checked).catch(fail); return; }
  if (el.dataset.filter) {
    if (el.dataset.filter === 'browseSort') state.ui.browseSort = el.value;
    else if (el.dataset.filter !== 'q') state.ui.list[el.dataset.filter] = el.value;
    requestRender();
    return;
  }
  if (el.dataset.imp === 'useTags') { state.imp.useTags = el.checked; render(); return; }
  if (el.dataset.impInclude !== undefined) {
    const it = impItem(Number(el.dataset.impInclude));
    if (it) { it.include = el.checked; render(); }
    return;
  }
  if (el.dataset.impStatus !== undefined) {
    const it = impItem(Number(el.dataset.impStatus));
    if (it && M.STATUSES.includes(el.value)) { it.status = el.value; render(); }
    return;
  }
  if (el.dataset.setting) {
    const name = el.dataset.setting;
    if (name === 'scanlines') state.settings.scanlines = el.checked;
    else if (name === 'accent' && M.isHexColor(el.value)) state.settings.accent = el.value;
    else if (name === 'cardName') state.settings.cardName = el.value.trim().slice(0, 40);
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
  if (el.dataset.dateEdit) { setDate(el.dataset.dateEdit, el.value).catch(fail); return; }
  if (el.dataset.epField) setEpisodeField(el.dataset.ep, el.dataset.epField, el.value).catch(fail);
});

const forms = {
  'scan-search': () => { clearTimeout(scan.timer); runSearch(); },
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
  if (state.route.name === 'tv' && !dlg.open) {
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      tvMove(e.key);
      return;
    }
    if (TV_BACK_KEYS.has(e.key) || e.keyCode === 10009 || e.keyCode === 461) {
      e.preventDefault();
      if (state.ui.tvDetail) closeTvDetail();
      else exitTv();
      return;
    }
  }
  // Escape closes the dialog in one press, even from a search box (which would otherwise just clear itself).
  if (e.key === 'Escape' && dlg.open && !e.defaultPrevented) {
    e.preventDefault();
    closeDialog();
    return;
  }
  if (e.key === 'Escape' && state.ui.friendsOpen && !dlg.open) {
    e.preventDefault();
    state.ui.friendsOpen = false;
    state.ui.focusAfter = 'friends-btn';
    render();
    return;
  }
  if (e.key === 'Escape' && state.ui.dateEdit && e.target && e.target.closest && e.target.closest('.date-edit')) {
    e.preventDefault();
    closeDateEdit();
    return;
  }
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && dlg.open && e.target && (e.target.id === 'scan-q' || e.target.classList.contains('scan-item'))) {
    const items = [...dlg.querySelectorAll('.scan-item')];
    if (!items.length) return;
    const at = items.indexOf(e.target);
    const next = e.key === 'ArrowDown' ? items[Math.min(items.length - 1, at + 1)] : at <= 0 ? document.getElementById('scan-q') : items[at - 1];
    if (next) { e.preventDefault(); next.focus(); }
    return;
  }
  if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && state.route.name === 'home' && !dlg.open && !e.altKey && !e.ctrlKey && !e.metaKey) {
    const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
    if (!['input', 'textarea', 'select'].includes(tag)) {
      const dir = e.key === 'ArrowLeft' ? 'prev' : 'next';
      const btn = document.getElementById(`hero-side-${dir}`) || document.getElementById(`hero-${dir}`);
      if (btn) { e.preventDefault(); btn.click(); }
      return;
    }
  }
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
  state.route = { name: 'boot' };
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
  if (!state.error) await fixCompletedSeen();
  if (!state.error && !state.settings.onboarded && !M.live(state.titles).length && !location.hash.replace(/^#\/?/, '')) {
    history.replaceState(null, '', '#/welcome');
  }
  await loadBackupFolder();
  if (!state.error) state.friends = await loadFriends();
  onRoute();
  registerWorker();
  state.persisted = await store.persist();
  if (state.route.name === 'settings') requestRender();
  setTimeout(() => {
    checkNewSeasons()
      .catch((err) => console.warn('Season check failed', err))
      .then(() => fillMakers())
      .catch((err) => console.warn('Could not fill who made the titles', err));
    autoFolderBackup().catch((err) => console.warn('Folder backup failed', err));
  }, 2500);
}

start();
