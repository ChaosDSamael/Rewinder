// Rewinder — data helpers. Pure functions: no DOM, no storage.

export const APP_VERSION = '1.12.1';

export const KINDS = ['movie', 'tv', 'anime', 'game'];
export const KIND_LABEL = { movie: 'Movie', tv: 'TV Show', anime: 'Anime', game: 'Game' };
export const KIND_TAB = { movie: 'Movies', tv: 'TV Shows', anime: 'Anime', game: 'Games' };
export const KIND_SHORT = { movie: 'MOVIE', tv: 'TV', anime: 'ANIME', game: 'GAME' };
export const KIND_PATH = { movie: 'movies', tv: 'tv', anime: 'anime', game: 'games' };
export const PATH_KIND = { movies: 'movie', tv: 'tv', anime: 'anime', games: 'game' };
export const STATUSES = ['progress', 'completed', 'watchlist', 'hold', 'dropped'];
export const STATUS_LABEL = { progress: 'In Progress', completed: 'Completed', watchlist: 'Watchlist', hold: 'On Hold', dropped: 'Dropped' };
export const GAME_PLATFORMS = ['PC', 'PS5', 'PS4', 'Xbox Series', 'Xbox One', 'Switch 2', 'Switch', 'Steam Deck', 'Mobile'];
export const STREAMING = ['Netflix', 'Crave', 'Prime Video', 'Disney+', 'Apple TV+', 'Paramount+', 'Crunchyroll', 'Club illico', 'ICI TOU.TV', 'YouTube'];
export const STORES = ['Steam', 'PlayStation Store', 'Xbox Store', 'Nintendo eShop', 'Epic Games Store', 'GOG'];
export const PRESETS = [
  { id: 'codec', name: 'Codec', color: '#A6E35A' },
  { id: 'alert', name: 'Alert', color: '#F2463C' },
  { id: 'evasion', name: 'Evasion', color: '#F5A524' },
  { id: 'visor', name: 'Visor', color: '#3FD5E0' }
];
export const DEFAULT_SETTINGS = {
  accent: '#F2463C',
  scanlines: true,
  spoiler: false,
  browseView: 'wall',
  tmdbKey: '',
  rawgKey: '',
  lastBackupAt: null,
  changesSinceBackup: 0,
  backupSnoozeUntil: null,
  onboarded: false,
  seenFixed: false,
  cardId: '',
  cardName: '',
  lastSeasonCheck: null,
  folderBackupAt: null,
  wallSize: '',
  tvButton: false,
  shareRemind: true,
  cardSharedSig: '',
  cardSharedAt: null,
  shareNudgeAt: null,
  // Your keyword groups (vampire, gladiator…), in the order you added them.
  keywords: [],
  // Friends by name: the Rewinder server (empty: the one built in), your name there, and the secret that proves it.
  // The secret never goes in a backup or a card.
  server: '',
  liveName: '',
  liveSecret: '',
  // The server your name and secret belong to: they are never sent anywhere else.
  liveHost: '',
  liveSig: '',
  liveAt: null,
  // The key to your list on the server: it stays on your devices (never in a backup, never sent to the server).
  syncKey: ''
};
export const TRASH_DAYS = 30;

export const pad2 = (n) => String(n).padStart(2, '0');
export const hasEpisodes = (t) => t.kind === 'tv' || t.kind === 'anime';
export const epCode = (sn, en) => `S${pad2(sn)} E${pad2(en)}`;
export const seasonName = (n) => (n === 0 ? 'Specials' : `Season ${n}`);
export const fmtScore = (v) => (typeof v === 'number' ? v.toFixed(1) : '—');
export const live = (titles) => titles.filter((t) => !t.deletedAt);

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function uid() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function clampScore(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.min(10, Math.max(0, n)) * 10) / 10;
}

export function average(values) {
  const xs = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (!xs.length) return null;
  return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
}

export function episodes(t) {
  const out = [];
  for (const s of t.seasons || []) for (const e of s.episodes || []) out.push({ season: s, ep: e });
  return out;
}

const ratedWatched = (list) => list.filter((e) => e.watched && typeof e.score === 'number');

export const seasonAverage = (s) => average(ratedWatched(s.episodes || []).map((e) => e.score));
export const seasonScore = (s) => (typeof s.score === 'number' ? s.score : seasonAverage(s));
export const ratedEpisodeCount = (t) => ratedWatched(episodes(t).map((x) => x.ep)).length;

// The automatic series score: the average of your rated episodes.
// With no rated episode at all, it falls back to the scores you gave whole seasons.
export function autoScore(t) {
  const fromEpisodes = average(ratedWatched(episodes(t).map((x) => x.ep)).map((e) => e.score));
  if (fromEpisodes !== null) return { value: fromEpisodes, from: 'episodes', count: ratedEpisodeCount(t) };
  const seasonScores = (t.seasons || []).map((s) => s.score).filter((v) => typeof v === 'number');
  if (seasonScores.length) return { value: average(seasonScores), from: 'seasons', count: seasonScores.length };
  return { value: null, from: 'none', count: 0 };
}

// Movies and games: the score you set. Series and anime: your own score if you set one, else the automatic one.
export function effectiveScore(t) {
  if (typeof t.score === 'number') return t.score;
  return hasEpisodes(t) ? autoScore(t).value : null;
}

export function progress(t) {
  const all = episodes(t);
  return { watched: all.filter((x) => x.ep.watched).length, total: all.length };
}

export const nextEpisode = (t) => episodes(t).find((x) => !x.ep.watched) || null;

// An episode is out once its air date has passed. A scanned episode with no date yet is not.
export const shownDate = (v, withYear) => (v === 'unknown' ? 'date unknown' : fmtDate(v, withYear));

export const isAired = (e) => !e.tba && (!e.aired || e.aired <= today());

// Completed from memory (Add several): seen, the date is not known. Returns a line for the history.
export function markSeenUnknown(t) {
  if (t.kind === 'movie') {
    if (t.views.length) return '';
    t.views.push({ date: 'unknown' });
    return 'Counted as seen · date unknown';
  }
  if (t.kind === 'game') {
    if (t.game.story || t.game.full) return '';
    t.game.story = 'unknown';
    return 'Story counted as done · date unknown';
  }
  let n = 0;
  for (const s of t.seasons) {
    for (const e of s.episodes) {
      if (!e.watched && isAired(e)) { e.watched = 'unknown'; n++; }
    }
  }
  return n ? `${n} aired episode${n === 1 ? '' : 's'} checked · date unknown` : '';
}

export function airLabel(e) {
  if (e.tba) return 'Date TBA';
  if (!e.aired) return '';
  return `${e.aired > today() ? 'Airs' : 'Aired'} ${fmtDate(e.aired, true)}`;
}

export function findSeason(t, sn) {
  return t ? (t.seasons || []).find((x) => x.n === Number(sn)) || null : null;
}

export function findEpisode(t, sn, en) {
  const s = findSeason(t, sn);
  return s ? s.episodes.find((e) => e.n === Number(en)) || null : null;
}

// Accepts "2026-11-06" (a local day) or a full ISO timestamp.
export function fmtDate(value, withYear) {
  if (!value) return '';
  let date;
  const text = String(value);
  if (text.length > 10) {
    date = new Date(text);
  } else {
    const [y, m, d] = text.split('-').map(Number);
    date = y && m && d ? new Date(y, m - 1, d) : new Date(NaN);
  }
  if (Number.isNaN(date.getTime())) return '';
  const opts = { month: 'short', day: 'numeric' };
  if (withYear || date.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return date.toLocaleDateString('en-US', opts);
}

export function progressLabel(t) {
  if (t.kind === 'game') {
    const bits = [];
    if (t.game && t.game.story) bits.push('Story');
    if (t.game && t.game.full) bits.push('100%');
    if (t.platforms && t.platforms.length) bits.push(t.platforms[0]);
    return bits.join(' · ') || '—';
  }
  if (t.kind === 'movie') {
    const n = (t.views || []).length;
    return n ? `Seen ×${n}` : '—';
  }
  const p = progress(t);
  if (!p.total) return '—';
  const nx = nextEpisode(t);
  if (!nx || !p.watched) return `${p.watched}/${p.total}`;
  return epCode(nx.season.n, nx.ep.n);
}

export const activity = (t) => t.lastActivity || t.updatedAt || t.createdAt || '';

// The latest time a browser can read (year 275760).
export const MAX_TIME = 8.64e15;
// When a change happens: now, or just after the version it was made on, whichever is later. A device whose clock
// runs behind still makes a change newer than what it changed: it gets sent, and it wins on your other devices.
export function stamp(before) {
  const prev = Math.min((typeof before === 'number' ? before : Date.parse(before)) || 0, MAX_TIME - 1);
  return new Date(Math.max(Date.now(), prev + 1)).toISOString();
}

export function newTitle(fields = {}) {
  const now = new Date().toISOString();
  return {
    id: uid(), kind: 'movie', title: '', titleQc: '', year: null, genres: [], overview: '',
    poster: '', backdrop: '', status: 'watchlist', fav: false, score: null, notes: '',
    tags: [], via: '', views: [], platforms: [], game: { story: null, full: null },
    seasons: [], cast: [], makers: null, providers: [], newSeason: null,
    franchise: null, studios: [], released: '', groupsAt: null, keywords: [], keywordsAt: null,
    tmdbId: null, tmdbType: '', watchLink: '', scannedAt: null, rawgId: null, rawgSlug: '', available: [],
    createdAt: now, updatedAt: now, lastActivity: now, deletedAt: null,
    ...fields
  };
}

export function makeEpisode(n) {
  return { n, title: '', aired: '', tba: false, watched: null, score: null, note: '' };
}

export function makeSeason(n, count) {
  const list = [];
  for (let i = 1; i <= count; i++) list.push(makeEpisode(i));
  return { n, year: '', score: null, notes: '', episodes: list };
}

// Pictures only from the services the Scan uses.
const isImage = (v) => typeof v === 'string' && /^https:\/\/(image\.tmdb\.org|media\.rawg\.io)\/[\w./%-]+$/.test(v);
// Words in a list (genres, tags, platforms): so many, each one short.
const strList = (v, max = 50) => (Array.isArray(v) ? v.slice(0, 500).map((x) => String(x).trim().slice(0, 120)).filter(Boolean).slice(0, max) : []);
// One title holds at most this much: more than any real show, far less than what would choke a phone.
const MAX_SEASONS = 150;
const MAX_EPISODES = 20000;
const MAX_NOTES = 1000000;

// Keywords: lowercase, one space between words, each once.
export const cleanKeyword = (v) => String(v || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60);
export const keywordList = (v, max = 80) => (Array.isArray(v) ? [...new Set(v.map(cleanKeyword).filter(Boolean))].slice(0, max) : []);
const dayOrNull = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
// 'unknown': you saw it (an imported list says so) but the date is lost.
const seenDate = (v) => (v === 'unknown' ? 'unknown' : dayOrNull(v));
const markDate = (v) => (typeof v === 'string' ? seenDate(v) : v ? today() : null);

// Makes any stored or imported object safe to use: right types, known values, no surprises.
export function normalizeTitle(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const base = newTitle();
  const year = Number(r.year);
  let episodesLeft = MAX_EPISODES;
  let notesLeft = MAX_NOTES;
  const note = (v) => {
    const text = String(v || '').slice(0, Math.min(10000, notesLeft));
    notesLeft -= text.length;
    return text;
  };
  return {
    ...base,
    id: typeof r.id === 'string' && r.id ? r.id.slice(0, 80) : base.id,
    kind: KINDS.includes(r.kind) ? r.kind : 'movie',
    title: String(r.title || 'Untitled').slice(0, 300),
    titleQc: String(r.titleQc || '').slice(0, 300),
    year: Number.isInteger(year) && year > 1800 && year < 2200 ? year : null,
    genres: strList(r.genres, 12),
    overview: String(r.overview || '').slice(0, 4000),
    poster: isImage(r.poster) ? r.poster : '',
    backdrop: isImage(r.backdrop) ? r.backdrop : '',
    status: STATUSES.includes(r.status) ? r.status : 'watchlist',
    fav: Boolean(r.fav),
    score: typeof r.score === 'number' ? clampScore(r.score) : null,
    notes: String(r.notes || '').slice(0, 10000),
    tags: strList(r.tags, 30),
    via: String(r.via || '').slice(0, 60),
    views: Array.isArray(r.views) ? r.views.map((v) => seenDate(v && v.date)).filter(Boolean).map((date) => ({ date })) : [],
    platforms: strList(r.platforms, 12),
    game: { story: markDate(r.game && r.game.story), full: markDate(r.game && r.game.full) },
    seasons: Array.isArray(r.seasons) ? r.seasons.slice(0, MAX_SEASONS).map((s, i) => {
      const eps = Array.isArray(s && s.episodes) ? s.episodes.slice(0, Math.min(5000, episodesLeft)) : [];
      episodesLeft -= eps.length;
      return {
        n: Number.isInteger(Number(s && s.n)) ? Number(s.n) : i + 1,
        year: s && s.year ? String(s.year).slice(0, 4) : '',
        score: s && typeof s.score === 'number' ? clampScore(s.score) : null,
        notes: note(s && s.notes),
        episodes: eps.map((e, j) => ({
          n: Number.isInteger(Number(e && e.n)) ? Number(e.n) : j + 1,
          title: String((e && e.title) || '').slice(0, 200),
          aired: dayOrNull(e && e.aired) || '',
          tba: Boolean(e && e.tba),
          watched: seenDate(e && e.watched),
          score: e && typeof e.score === 'number' ? clampScore(e.score) : null,
          note: note(e && e.note)
        }))
      };
    }).sort((a, b) => a.n - b.n) : [],
    cast: Array.isArray(r.cast) ? r.cast.filter((c) => c && c.name).slice(0, 40).map((c) => ({ name: String(c.name).slice(0, 120), role: String(c.role || '').slice(0, 120) })) : [],
    // null: never asked (a title saved before Rewinder kept it); [] : asked, nobody listed.
    makers: Array.isArray(r.makers) ? r.makers.filter((x) => x && x.name).slice(0, 6).map((x) => ({ name: String(x.name).slice(0, 120), role: MAKER_ROLES.includes(x.role) ? x.role : 'Director' })) : null,
    providers: Array.isArray(r.providers) ? r.providers.filter((p) => p && p.name).slice(0, 30).map((p) => {
      const source = ['tmdb', 'rawg'].includes(p.source) ? p.source : 'manual';
      return {
        name: (source === 'tmdb' ? cleanProvider(p.name) : String(p.name)).slice(0, 60),
        source,
        url: source === 'rawg' ? storeLink(p.url) : ''
      };
    }).filter((p, i, all) => p.name && all.findIndex((q) => q.name.toLowerCase() === p.name.toLowerCase()) === i) : [],
    newSeason: Number.isInteger(r.newSeason) ? r.newSeason : null,
    // groupsAt null: never asked TMDB for the franchise and studios (a title saved before 1.8).
    franchise: r.franchise && Number.isInteger(r.franchise.id) && r.franchise.name ? { id: r.franchise.id, name: String(r.franchise.name).slice(0, 120) } : null,
    studios: strList(r.studios, 8),
    released: dayOrNull(r.released) || '',
    groupsAt: r.groupsAt ? String(r.groupsAt) : null,
    // keywordsAt null: never asked TMDB (or RAWG, for games) for its keywords (a title saved before 1.9).
    keywords: keywordList(r.keywords),
    keywordsAt: r.keywordsAt ? String(r.keywordsAt) : null,
    tmdbId: Number.isInteger(r.tmdbId) && r.tmdbId > 0 ? r.tmdbId : null,
    tmdbType: r.tmdbType === 'movie' || r.tmdbType === 'tv' ? r.tmdbType : '',
    watchLink: typeof r.watchLink === 'string' && r.watchLink.startsWith('https://www.themoviedb.org/') ? r.watchLink : '',
    scannedAt: r.scannedAt ? String(r.scannedAt) : null,
    rawgId: Number.isInteger(r.rawgId) && r.rawgId > 0 ? r.rawgId : null,
    rawgSlug: typeof r.rawgSlug === 'string' && /^[a-z0-9-]{1,120}$/.test(r.rawgSlug) ? r.rawgSlug : '',
    available: strList(r.available, 16),
    createdAt: String(r.createdAt || base.createdAt),
    updatedAt: String(r.updatedAt || base.updatedAt),
    lastActivity: String(r.lastActivity || r.updatedAt || base.lastActivity),
    deletedAt: r.deletedAt ? String(r.deletedAt) : null
  };
}

// Every genre in a list, the biggest first.
export function genreCounts(titles) {
  const counts = new Map();
  for (const t of titles) for (const g of t.genres || []) counts.set(g, (counts.get(g) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

// Studios: TMDB's production companies; for games, the studios RAWG lists.
export const studiosOf = (t) => (t.kind === 'game' ? (t.makers || []).filter((x) => x.role === 'Studio').map((x) => x.name) : t.studios || []);
// Directors: a movie's director; a show's creators (or the director of the most episodes).
export const directorsOf = (t) => (t.makers || []).filter((x) => x.role === 'Director' || x.role === 'Creator').map((x) => x.name);

// A keyword finds a whole word, plural included: "vampire" finds "vampire hunter" and "vampires", not "vampirism".
// It looks in the keywords from TMDB (RAWG for games), your own tags, the genres and the title.
const NOT_WORD = '[^\\p{L}\\p{N}]';
const reEscape = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function keywordTest(word) {
  const w = cleanKeyword(word);
  if (!w) return () => false;
  const re = new RegExp(`(?:^|${NOT_WORD})${reEscape(w)}(?:e?s)?(?:$|${NOT_WORD})`, 'u');
  return (text) => text.includes(w) && re.test(text);
}
const keywordHay = (t) => [...(t.keywords || []), ...(t.tags || []), ...(t.genres || []), t.title, t.titleQc].filter(Boolean).map((v) => String(v).toLowerCase());
// Reads each title once, then answers word after word.
function keywordFinder(list) {
  const hays = list.map(keywordHay);
  return (word) => {
    const test = keywordTest(word);
    return list.filter((t, i) => hays[i].some(test));
  };
}
export const withKeyword = (list, word) => keywordFinder(list)(word);

// Your keyword groups, cleaned: a backup from somewhere else can't break the page.
export const savedKeywords = (settings) => keywordList(settings && settings.keywords, 30);

// What to suggest while you type: keywords, tags and genres that start like the word, the most titles first,
// counted the way the group will count them. With nothing typed: the most common keywords, genres left out.
export function suggestKeywords(list, draft, saved = [], limit = 10) {
  const d = cleanKeyword(draft);
  const skip = new Set(saved);
  const genres = new Set(list.flatMap((t) => (t.genres || []).map(cleanKeyword)));
  const counts = new Map();
  for (const t of list) {
    const own = new Set([...(t.keywords || []), ...(t.tags || []).map(cleanKeyword), ...(d ? (t.genres || []).map(cleanKeyword) : [])].filter(Boolean));
    for (const k of own) counts.set(k, (counts.get(k) || 0) + 1);
  }
  const starts = d ? new RegExp(`(?:^|${NOT_WORD})${reEscape(d)}`, 'u') : null;
  const find = keywordFinder(list);
  const pool = [...counts.entries()]
    .filter(([k, n]) => !skip.has(k) && (starts ? starts.test(k) : n >= 2 && !genres.has(k)))
    .sort((a, b) => (d ? Number(b[0].startsWith(d)) - Number(a[0].startsWith(d)) : 0) || b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit * 3)
    .map(([k]) => [k, find(k).length]);
  return pool
    .sort((a, b) => (d ? Number(b[0].startsWith(d)) - Number(a[0].startsWith(d)) : 0) || b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));
}

const releaseKey = (t) => t.released || (t.year ? `${t.year}-99` : '9999');
const groupAverage = (items) => {
  const scores = items.map(effectiveScore).filter((v) => v !== null);
  return { rated: scores.length, avg: scores.length ? Math.round((scores.reduce((x, y) => x + y, 0) / scores.length) * 10) / 10 : null };
};

// Groups of titles, each in release order:
// franchise (TMDB collections, movies), director (and show creators), studio, or keyword (your own words, in `words`).
// Directors and studios need two titles. Names credited on exactly the same titles make one group:
// a show is often credited to four or five companies, two brothers direct together.
// The one credited first (TMDB's order) leads; the others are listed under it.
export function groupTitles(list, by, sort = 'score', words = []) {
  let groups;
  if (by === 'keyword') {
    const find = keywordFinder(list);
    groups = keywordList(words).map((word) => ({ name: word, also: [], items: find(word) }));
  } else {
    const namesOf = by === 'studio' ? studiosOf : by === 'director' ? directorsOf : (t) => (t.franchise ? [t.franchise.name] : []);
    const map = new Map();
    for (const t of list) {
      for (const name of new Set(namesOf(t))) {
        if (!map.has(name)) map.set(name, []);
        map.get(name).push(t);
      }
    }
    const same = new Map();
    for (const [name, items] of map) {
      if (by !== 'franchise' && items.length < 2) continue;
      const key = items.map((t) => t.id).sort().join(' ');
      if (same.has(key)) same.get(key).names.push(name);
      else same.set(key, { names: [name], items });
    }
    const credit = (name, items) => items.reduce((n, t) => n + namesOf(t).indexOf(name), 0);
    groups = [...same.values()].map(({ names, items }) => {
      names.sort((a, b) => credit(a, items) - credit(b, items) || a.localeCompare(b, 'en', { sensitivity: 'base' }));
      return { name: names[0], also: names.slice(1), items };
    });
  }
  for (const g of groups) {
    g.items.sort((a, b) => releaseKey(a).localeCompare(releaseKey(b)) || a.title.localeCompare(b.title));
    Object.assign(g, groupAverage(g.items));
  }
  if (sort === 'count') groups.sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
  else if (sort === 'name') groups.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  else groups.sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1) || b.items.length - a.items.length || a.name.localeCompare(b.name));
  return groups;
}

export function topGenres(titles, limit = 3) {
  const counts = new Map();
  for (const t of titles) for (const g of t.genres || []) counts.set(g, (counts.get(g) || 0) + 1);
  return [...counts.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([g]) => g);
}

// Cinematic hues only (teals, blues, violets, crimsons, ambers): they sit well under every accent color.
const HUES = [196, 208, 222, 238, 256, 274, 292, 332, 348, 8, 22, 34, 176, 186];

function hueIndex(text) {
  let h = 7;
  for (const ch of String(text)) h = (h * 31 + ch.codePointAt(0)) % 100003;
  return h % HUES.length;
}

export const hashHue = (text) => HUES[hueIndex(text)];
const nextHue = (text) => HUES[(hueIndex(text) + 1) % HUES.length];

// Placeholder artwork drawn from the title's name, until a real poster comes from the Scan.
export function artFor(t) {
  const h = hashHue(t.title || t.id);
  const h2 = nextHue(t.title || t.id);
  return `radial-gradient(90% 70% at 70% 22%, hsl(${h} 50% 50% / .75) 0%, transparent 58%), radial-gradient(70% 60% at 20% 90%, hsl(${h2} 48% 34% / .6) 0%, transparent 65%), linear-gradient(170deg, hsl(${h} 42% 17%) 0%, hsl(${h} 38% 6%) 100%)`;
}

export function heroArt(t, hue) {
  const h = typeof hue === 'number' ? hue : hashHue(t.title || t.id);
  const h2 = typeof hue === 'number' ? hue + 12 : nextHue(t.title || t.id);
  return `repeating-linear-gradient(176deg, rgba(255,255,255,.025) 0 2px, transparent 2px 16px), radial-gradient(70% 90% at 78% 28%, hsl(${h} 48% 52% / .55) 0%, transparent 60%), radial-gradient(60% 55% at 62% 92%, hsl(${h2} 55% 30% / .65) 0%, transparent 70%), linear-gradient(180deg, hsl(${h} 50% 14%) 0%, hsl(${h} 46% 9%) 55%, hsl(${h} 40% 5%) 100%)`;
}

// "Paramount Plus Premium" and "Paramount+ Amazon Channel" are the same service: one name per service.
export function cleanProvider(name) {
  let n = String(name || '').slice(0, 100).trim()
    .replace(/\s+(Basic|Standard)?\s*with Ads$/i, '')
    .replace(/\s+(Premium|Essential|Basic|Standard|Ad[- ]Free)$/i, '')
    .replace(/\s+(Amazon|Apple TV|Roku Premium)\s+Channel$/i, '')
    .replace(/ Plus$/, '+')
    .trim();
  if (/^Amazon Prime Video/i.test(n)) n = 'Prime Video';
  if (/^Netflix/i.test(n)) n = 'Netflix';
  return n;
}

// A store link only ever opens the store itself. A link anywhere else is dropped (the chip stays, without the link).
// itch.io only on itch.io itself: anyone gets a page of their own under it, with files to download.
const STORE_SITES = ['steampowered.com', 'gog.com', 'playstation.com', 'xbox.com', 'nintendo.com', 'epicgames.com'];
const STORE_HOSTS = ['apps.apple.com', 'itunes.apple.com', 'play.google.com', 'www.microsoft.com', 'apps.microsoft.com', 'itch.io'];
export function storeLink(url) {
  if (typeof url !== 'string' || url.length > 500) return '';
  let u;
  try {
    u = new URL(url);
  } catch {
    return '';
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return '';
  const host = u.hostname.toLowerCase();
  const ok = STORE_HOSTS.includes(host) || STORE_SITES.some((d) => host === d || host.endsWith('.' + d));
  return ok ? u.href : '';
}

export const MAKER_ROLES = ['Director', 'Creator', 'Studio'];
export const MAKER_LABEL = { Director: 'Directed by', Creator: 'Created by', Studio: 'Studio' };
// The role a hand-typed name gets on this kind of title.
export const makerRoleFor = (kind) => (kind === 'game' ? 'Studio' : kind === 'movie' ? 'Director' : 'Creator');

export const platformsOf = (t) => [...(t.providers || []).map((p) => p.name), ...(t.kind === 'game' ? t.platforms || [] : [])];

export function matches(t, needle) {
  const q = String(needle || '').trim().toLowerCase();
  if (!q) return true;
  const hay = [t.title, t.titleQc, t.via, String(t.year || ''), ...(t.tags || []), ...(t.genres || []), ...(t.cast || []).map((c) => c.name), ...(t.makers || []).map((x) => x.name), ...platformsOf(t), ...(t.studios || []), t.franchise ? t.franchise.name : ''].join(' \u0001 ').toLowerCase();
  return q.split(/\s+/).every((word) => hay.includes(word));
}

export function sortTitles(list, sort) {
  const arr = [...list];
  if (sort === 'title') arr.sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }));
  else if (sort === 'score') arr.sort((a, b) => (effectiveScore(b) ?? -1) - (effectiveScore(a) ?? -1) || a.title.localeCompare(b.title));
  else if (sort === 'year') arr.sort((a, b) => (b.year || 0) - (a.year || 0) || a.title.localeCompare(b.title));
  else arr.sort((a, b) => activity(b).localeCompare(activity(a)));
  return arr;
}

export function splitList(text, max = 12) {
  const seen = new Map();
  for (const part of String(text || '').split(',')) {
    const v = part.trim().replace(/^#/, '').slice(0, 60);
    if (v && !seen.has(v.toLowerCase()) && seen.size < max) seen.set(v.toLowerCase(), v);
  }
  return [...seen.values()];
}

export function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function seasonYear(s) {
  if (s.year) return s.year;
  const first = (s.episodes || []).find((e) => e.aired);
  return first ? first.aired.slice(0, 4) : '';
}

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = [...parts[0]][0] || '';
  const last = parts.length > 1 ? [...parts[parts.length - 1]][0] || '' : '';
  return (first + last).toUpperCase();
}

// Dark text on bright accents, light text on dark ones.
export function onAccent(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return '#0D0F0F';
  const n = parseInt(m[1], 16);
  const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.18 ? '#0D0F0F' : '#F4F6F5';
}

export const isHexColor = (v) => /^#[0-9a-f]{6}$/i.test(String(v || ''));

const episodeHasData = (e) => Boolean(e.watched || typeof e.score === 'number' || e.note);
const seasonHasData = (s) => Boolean(typeof s.score === 'number' || s.notes || s.episodes.some(episodeHasData));

// What a Scan brought back (TMDB, RAWG, AniList), checked like everything else before it goes into a title:
// whatever a service answers, a title only ever holds the right types, in the right sizes.
export function cleanScan(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const n = normalizeTitle({ ...s, id: 'scan', providers: [] });
  return {
    source: s.source === 'rawg' ? 'rawg' : 'tmdb',
    rawgId: n.rawgId, rawgSlug: n.rawgSlug, available: n.available,
    tmdbId: n.tmdbId, tmdbType: n.tmdbType, kind: n.kind,
    title: s.title ? n.title : '', titleQc: n.titleQc, year: n.year,
    genres: n.genres, overview: n.overview, poster: n.poster, backdrop: n.backdrop,
    cast: n.cast, makers: n.makers,
    groupsAt: n.groupsAt, franchise: n.franchise, studios: n.studios, released: n.released,
    keywordsAt: n.keywordsAt, keywords: n.keywords,
    watchLink: n.watchLink,
    providers: Array.isArray(s.providers) ? s.providers.filter((p) => p && p.name).slice(0, 30).map((p) => ({ name: String(p.name).slice(0, 100), url: typeof p.url === 'string' ? p.url : '' })) : [],
    seasons: Array.isArray(s.seasons) ? n.seasons.map((x) => ({ n: x.n, year: x.year, episodes: x.episodes.map((e) => ({ n: e.n, title: e.title, aired: e.aired, tba: e.tba })) })) : null
  };
}

// What a service filled in later (directors, studios, keywords): checked the same way, only those fields.
export function cleanFields(t, got) {
  const raw = got && typeof got === 'object' ? got : {};
  const n = normalizeTitle({ ...t, ...raw });
  const out = {};
  for (const k of Object.keys(raw)) if (Object.hasOwn(n, k)) out[k] = n[k];
  return out;
}

// Pours a Scan into a title. Your own things stay: status, scores, notes, checks, tags, friends, your platforms.
// Seasons and episodes made by hand that TMDB doesn't know are dropped, unless you put something in them.
export function mergeScan(t, raw) {
  const s = cleanScan(raw);
  if (s.source === 'rawg') {
    t.rawgId = s.rawgId;
    t.rawgSlug = s.rawgSlug || '';
    t.kind = 'game';
    if (s.available.length) t.available = s.available;
  } else {
    t.tmdbId = s.tmdbId;
    t.tmdbType = s.tmdbType;
    if (t.kind === 'game' || (s.tmdbType === 'tv' && t.kind === 'movie')) t.kind = s.kind;
    if (s.tmdbType === 'movie' && hasEpisodes(t)) t.kind = 'movie';
  }
  t.scannedAt = new Date().toISOString();
  t.title = s.title || t.title;
  t.titleQc = s.titleQc;
  t.year = s.year || t.year;
  if (s.genres.length) t.genres = s.genres;
  if (s.overview) t.overview = s.overview;
  if (s.poster) t.poster = s.poster;
  if (s.backdrop) t.backdrop = s.backdrop;
  if (s.cast.length) t.cast = s.cast;
  if (Array.isArray(s.makers)) t.makers = s.makers;
  if (s.groupsAt) Object.assign(t, { franchise: s.franchise || null, studios: s.studios || [], released: s.released || t.released, groupsAt: s.groupsAt });
  if (s.keywordsAt) Object.assign(t, { keywords: keywordList(s.keywords), keywordsAt: s.keywordsAt });
  t.watchLink = s.watchLink || '';
  providersInto(t, s);
  return seasonsInto(t, s);
}

export const mergeProviders = (t, raw) => providersInto(t, cleanScan(raw));
// Seasons and episodes only: what the daily new-season check refreshes.
export const mergeSeasons = (t, raw) => seasonsInto(t, cleanScan(raw));

function providersInto(t, s) {
  const source = s.source === 'rawg' ? 'rawg' : 'tmdb';
  const scanned = s.providers.map((p) => ({ name: p.name, source, url: source === 'rawg' ? storeLink(p.url) : '' }));
  const mine = t.providers.filter((p) => p.source === 'manual' && !scanned.some((n) => n.name.toLowerCase() === p.name.toLowerCase()));
  t.providers = [...scanned, ...mine];
  if (source === 'tmdb') t.watchLink = s.watchLink || '';
}

function seasonsInto(t, s) {
  const counts = { seasons: 0, episodes: 0 };
  if (!s.seasons) return counts;
  for (const ss of s.seasons) {
    let season = findSeason(t, ss.n);
    if (!season) {
      season = { n: ss.n, year: '', score: null, notes: '', episodes: [] };
      t.seasons.push(season);
      counts.seasons++;
    }
    season.year = ss.year || season.year;
    for (const se of ss.episodes) {
      let ep = season.episodes.find((e) => e.n === se.n);
      if (!ep) {
        ep = makeEpisode(se.n);
        season.episodes.push(ep);
        counts.episodes++;
      }
      if (se.title) ep.title = se.title;
      ep.aired = se.aired;
      ep.tba = se.tba;
    }
    season.episodes.sort((a, b) => a.n - b.n);
  }
  const known = new Map(s.seasons.map((ss) => [ss.n, new Set(ss.episodes.map((e) => e.n))]));
  t.seasons = t.seasons.filter((season) => known.has(season.n) || seasonHasData(season));
  for (const season of t.seasons) {
    const set = known.get(season.n);
    if (set) season.episodes = season.episodes.filter((e) => set.has(e.n) || episodeHasData(e));
  }
  t.seasons.sort((a, b) => a.n - b.n);
  return counts;
}

/* ---------- friends' cards ---------- */

// Seen: anything past the watchlist, or anything with a score.
export const isSeen = (status, score) => status !== 'watchlist' || typeof score === 'number';

const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const kindClass = (kind) => (kind === 'game' ? 'g' : kind === 'movie' ? 'm' : 's');

// How two lists can name the same title: its TMDB or RAWG number, then its name and year, then its name alone.
function keysOf(x) {
  const keys = [];
  if (x.tmdb) keys.push('tmdb:' + x.tmdb);
  if (x.rawg) keys.push('rawg:' + x.rawg);
  const name = plain(x.title);
  if (name) {
    if (x.year) keys.push(`name:${kindClass(x.kind)}:${name}:${x.year}`);
    keys.push(`name:${kindClass(x.kind)}:${name}`);
  }
  return keys;
}

const refOf = (t) => ({
  kind: t.kind,
  title: t.title,
  year: t.year || null,
  tmdb: t.tmdbId && t.tmdbType ? `${t.tmdbType}:${t.tmdbId}` : null,
  rawg: t.rawgId || null
});

// Two copies of one title on your devices (added on each before they were joined): the same TMDB or RAWG
// number, or, without numbers on both, the same kind, name and year.
export function sameTitle(a, b) {
  if (!a || !b || a.id === b.id) return false;
  const tmdbA = a.tmdbId && a.tmdbType ? `${a.tmdbType}:${a.tmdbId}` : '';
  const tmdbB = b.tmdbId && b.tmdbType ? `${b.tmdbType}:${b.tmdbId}` : '';
  if (tmdbA && tmdbB) return tmdbA === tmdbB;
  if (a.rawgId && b.rawgId) return a.rawgId === b.rawgId;
  if (kindClass(a.kind) !== kindClass(b.kind) || !a.year || a.year !== b.year) return false;
  const name = plain(a.title);
  // A title with no real name ("Untitled") is never taken for another one.
  return name.length > 1 && name !== 'untitled' && name === plain(b.title);
}

// One title out of two copies: the one changed last leads, and nothing either one knew is lost
// (viewings, watched episodes, scores, notes, tags). Every device does the same, under the same id.
export function mergeTwins(a, b, id) {
  const newer = Date.parse(b.updatedAt) > Date.parse(a.updatedAt);
  const base = newer ? b : a;
  const other = newer ? a : b;
  const t = JSON.parse(JSON.stringify(base));
  t.id = id;
  t.fav = Boolean(a.fav || b.fav);
  if (typeof t.score !== 'number' && typeof other.score === 'number') t.score = other.score;
  const mine = String(t.notes || '').trim();
  const theirs = String(other.notes || '').trim();
  if (!mine) t.notes = other.notes || '';
  else if (theirs && !mine.includes(theirs) && !theirs.includes(mine)) t.notes = `${t.notes}\n\n${other.notes}`;
  else if (theirs.includes(mine)) t.notes = other.notes;
  t.tags = [...new Set([...(t.tags || []), ...(other.tags || [])])];
  t.platforms = [...new Set([...(t.platforms || []), ...(other.platforms || [])])];
  const days = new Set((t.views || []).map((v) => v.date));
  for (const v of other.views || []) if (!days.has(v.date)) { t.views.push({ date: v.date }); days.add(v.date); }
  t.game = { story: (t.game && t.game.story) || (other.game && other.game.story) || null, full: (t.game && t.game.full) || (other.game && other.game.full) || null };
  for (const os of other.seasons || []) {
    const s = (t.seasons || []).find((x) => x.n === os.n);
    if (!s) { t.seasons.push(JSON.parse(JSON.stringify(os))); continue; }
    if (typeof s.score !== 'number' && typeof os.score === 'number') s.score = os.score;
    if (!String(s.notes || '').trim() && os.notes) s.notes = os.notes;
    for (const oe of os.episodes || []) {
      const e = s.episodes.find((x) => x.n === oe.n);
      if (!e) { s.episodes.push(JSON.parse(JSON.stringify(oe))); continue; }
      if (!e.watched && oe.watched) e.watched = oe.watched;
      if (typeof e.score !== 'number' && typeof oe.score === 'number') e.score = oe.score;
      if (!String(e.note || '').trim() && oe.note) e.note = oe.note;
    }
  }
  for (const key of ['tmdbId', 'tmdbType', 'rawgId', 'rawgSlug', 'watchLink', 'scannedAt', 'via', 'poster', 'backdrop', 'overview']) {
    if (!t[key] && other[key]) t[key] = other[key];
  }
  t.createdAt = [a.createdAt, b.createdAt].filter(Boolean).sort()[0] || t.createdAt;
  t.lastActivity = [a.lastActivity, b.lastActivity].filter(Boolean).sort().pop() || t.lastActivity;
  // Just after both copies, not "now": newer than either, but never newer than a change made after them elsewhere.
  t.updatedAt = new Date(Math.max(Date.parse(a.updatedAt) || 0, Date.parse(b.updatedAt) || 0) + 1).toISOString();
  return normalizeTitle(t);
}

// Your card: scores, statuses, favorites and tags. Never notes, dates, history or recommendations.
// Always in the same order: the same list makes the same card (and the same fingerprint) after every reload.
const cardOrder = (x) => `${x.kind}|${x.tmdb || ''}|${x.rawg || ''}|${x.title}|${x.year || ''}`;
const cardRows = (titles) => live(titles).map((t) => {
  const score = effectiveScore(t);
  return {
    ...refOf(t),
    score: typeof score === 'number' ? Math.round(score * 10) / 10 : null,
    status: t.status,
    fav: Boolean(t.fav),
    tags: t.tags || [],
    poster: t.poster || ''
  };
}).sort((a, b) => cardOrder(a).localeCompare(cardOrder(b)));
// On the card, what is empty is left out (a friend's Rewinder fills it back in): a quarter smaller.
function cardEntry(x) {
  const out = { kind: x.kind, title: x.title, status: x.status };
  if (x.year) out.year = x.year;
  if (x.tmdb) out.tmdb = x.tmdb;
  if (x.rawg) out.rawg = x.rawg;
  if (typeof x.score === 'number') out.score = x.score;
  if (x.fav) out.fav = true;
  const tags = x.tags.slice(0, 12).map((g) => String(g).slice(0, 60));
  if (tags.length) out.tags = tags;
  if (x.poster) out.poster = x.poster;
  return out;
}
export function makeCard(titles, { id, name }) {
  return { app: 'rewinder', kind: 'card', format: 1, id, name, at: new Date().toISOString(), titles: cardRows(titles).map(cardEntry) };
}

// A card for the server, which takes 1 MB at most (and a friend's Rewinder reads 5,000 titles): a very big list
// makes a smaller card, never a refused one. First the titles a friend can't compare go (watchlist, no score),
// then posters, from the titles a friend looks at least (friends see the drawn art there), then the last titles.
export const CARD_BYTES = 900000;
const sizeOf = (card) => new TextEncoder().encode(JSON.stringify(card)).length;
const weight = (x) => (x.fav ? 100 : 0) + (typeof x.score === 'number' ? x.score : 0);
export function fitCard(card, max = CARD_BYTES) {
  if (card.titles.length <= 5000 && sizeOf(card) <= max) return card;
  const fits = (list) => sizeOf({ ...card, titles: list }) <= max;
  const order = (list) => list.sort((a, b) => cardOrder(a).localeCompare(cardOrder(b)));
  const seen = card.titles.filter((x) => isSeen(x.status, x.score));
  const unseen = card.titles.filter((x) => !isSeen(x.status, x.score));
  const all = order([...seen, ...unseen].slice(0, 5000));
  if (fits(all)) return { ...card, titles: all };
  let titles = order(seen.slice(0, 5000));
  let excess = sizeOf({ ...card, titles }) - max;
  if (excess > 0) {
    const least = titles.map((x, i) => i).sort((a, b) => weight(titles[a]) - weight(titles[b]));
    for (const i of least) {
      if (excess <= 0) break;
      const { poster, ...rest } = titles[i];
      if (!poster) continue;
      titles[i] = rest;
      excess -= poster.length + 12;
    }
  }
  while (titles.length && !fits(titles)) titles = titles.slice(0, Math.floor(titles.length * 0.95));
  return { ...card, titles };
}

// A short fingerprint of what your card says: it changes when a title, score, status, favorite or tag does.
export function cardSignature(titles, name) {
  const text = JSON.stringify([name || '', cardRows(titles)]);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${(h >>> 0).toString(36)}.${text.length.toString(36)}`;
}

export const isCard = (d) => Boolean(d && d.app === 'rewinder' && d.kind === 'card' && Array.isArray(d.titles));

export function normalizeCard(d) {
  const at = typeof d.at === 'string' && !Number.isNaN(Date.parse(d.at)) ? new Date(d.at).toISOString() : new Date().toISOString();
  return {
    // live-…: kept for the friends added by name. A card file never takes one.
    id: typeof d.id === 'string' && /^[\w-]{6,64}$/.test(d.id) && !d.id.startsWith('live-') ? d.id : 'card-' + uid(),
    name: String(d.name || '').trim().slice(0, 40) || 'A friend',
    at,
    titles: d.titles.slice(0, 5000).filter((x) => x && typeof x.title === 'string' && x.title.trim()).map((x) => ({
      kind: KINDS.includes(x.kind) ? x.kind : 'movie',
      title: x.title.trim().slice(0, 300),
      year: Number.isInteger(x.year) && x.year > 1800 && x.year < 2200 ? x.year : null,
      tmdb: typeof x.tmdb === 'string' && /^(movie|tv):\d{1,9}$/.test(x.tmdb) ? x.tmdb : null,
      rawg: Number.isInteger(x.rawg) && x.rawg > 0 ? x.rawg : null,
      score: typeof x.score === 'number' && Number.isFinite(x.score) ? clampScore(x.score) : null,
      status: STATUSES.includes(x.status) ? x.status : 'completed',
      fav: x.fav === true,
      tags: Array.isArray(x.tags) ? x.tags.filter((g) => typeof g === 'string' && g.trim()).slice(0, 12).map((g) => g.trim().slice(0, 60)) : [],
      poster: isImage(x.poster) ? x.poster : ''
    }))
  };
}

// Your list against a friend's card: what you share, what they saw that you did not, where you disagree.
export function compareCard(titles, card) {
  const mine = live(titles);
  const index = new Map();
  for (const t of mine) for (const key of keysOf(refOf(t))) if (!index.has(key)) index.set(key, t);
  const find = (x) => {
    for (const key of keysOf(x)) if (index.has(key)) return index.get(key);
    return null;
  };
  const common = [];
  const picks = [];
  const used = new Set();
  for (const x of card.titles) {
    if (!isSeen(x.status, x.score)) continue;
    const t = find(x);
    if (t && used.has(t.id)) continue;
    const you = t ? effectiveScore(t) : null;
    if (t && isSeen(t.status, you)) {
      used.add(t.id);
      const both = typeof you === 'number' && typeof x.score === 'number';
      common.push({ mine: t, theirs: x, you, them: x.score, gap: both ? Math.round(Math.abs(you - x.score) * 10) / 10 : null });
    } else {
      picks.push({ mine: t, theirs: x });
    }
  }
  const scored = common.filter((c) => c.gap !== null);
  const within = scored.filter((c) => c.gap <= 1).length;
  const total = (c) => (typeof c.you === 'number' ? c.you : 0) + (typeof c.them === 'number' ? c.them : 0);
  common.sort((a, b) => total(b) - total(a) || a.theirs.title.localeCompare(b.theirs.title));
  picks.sort((a, b) => (b.theirs.score ?? -1) - (a.theirs.score ?? -1) || a.theirs.title.localeCompare(b.theirs.title));
  return {
    common,
    picks,
    gaps: scored.filter((c) => c.gap >= 2).sort((a, b) => b.gap - a.gap),
    scored: scored.length,
    within,
    agreement: scored.length ? Math.round((within / scored.length) * 100) : null,
    myAvg: average(mine.map(effectiveScore)),
    theirAvg: average(card.titles.map((x) => x.score)),
    bothFav: common.filter((c) => c.mine.fav && c.theirs.fav).length
  };
}
