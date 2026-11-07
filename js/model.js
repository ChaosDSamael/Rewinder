// Rewinder — data helpers. Pure functions: no DOM, no storage.

export const APP_VERSION = '1.5.0';

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
  folderBackupAt: null
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

export function newTitle(fields = {}) {
  const now = new Date().toISOString();
  return {
    id: uid(), kind: 'movie', title: '', titleQc: '', year: null, genres: [], overview: '',
    poster: '', backdrop: '', status: 'watchlist', fav: false, score: null, notes: '',
    tags: [], via: '', views: [], platforms: [], game: { story: null, full: null },
    seasons: [], cast: [], makers: null, providers: [], newSeason: null,
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
const strList = (v, max = 50) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, max) : []);
const dayOrNull = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
// 'unknown': you saw it (an imported list says so) but the date is lost.
const seenDate = (v) => (v === 'unknown' ? 'unknown' : dayOrNull(v));
const markDate = (v) => (typeof v === 'string' ? seenDate(v) : v ? today() : null);

// Makes any stored or imported object safe to use: right types, known values, no surprises.
export function normalizeTitle(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const base = newTitle();
  const year = Number(r.year);
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
    seasons: Array.isArray(r.seasons) ? r.seasons.map((s, i) => ({
      n: Number.isInteger(Number(s && s.n)) ? Number(s.n) : i + 1,
      year: s && s.year ? String(s.year).slice(0, 4) : '',
      score: s && typeof s.score === 'number' ? clampScore(s.score) : null,
      notes: String((s && s.notes) || '').slice(0, 10000),
      episodes: Array.isArray(s && s.episodes) ? s.episodes.map((e, j) => ({
        n: Number.isInteger(Number(e && e.n)) ? Number(e.n) : j + 1,
        title: String((e && e.title) || '').slice(0, 300),
        aired: dayOrNull(e && e.aired) || '',
        tba: Boolean(e && e.tba),
        watched: seenDate(e && e.watched),
        score: e && typeof e.score === 'number' ? clampScore(e.score) : null,
        note: String((e && e.note) || '').slice(0, 10000)
      })) : []
    })).sort((a, b) => a.n - b.n) : [],
    cast: Array.isArray(r.cast) ? r.cast.filter((c) => c && c.name).slice(0, 40).map((c) => ({ name: String(c.name).slice(0, 120), role: String(c.role || '').slice(0, 120) })) : [],
    // null: never asked (a title saved before Rewinder kept it); [] : asked, nobody listed.
    makers: Array.isArray(r.makers) ? r.makers.filter((x) => x && x.name).slice(0, 6).map((x) => ({ name: String(x.name).slice(0, 120), role: MAKER_ROLES.includes(x.role) ? x.role : 'Director' })) : null,
    providers: Array.isArray(r.providers) ? r.providers.filter((p) => p && p.name).slice(0, 30).map((p) => {
      const source = ['tmdb', 'rawg'].includes(p.source) ? p.source : 'manual';
      return {
        name: (source === 'tmdb' ? cleanProvider(p.name) : String(p.name)).slice(0, 60),
        source,
        url: typeof p.url === 'string' && /^https:\/\/[\w.-]+\.[a-z]{2,}\//i.test(p.url) ? p.url.slice(0, 500) : ''
      };
    }).filter((p, i, all) => p.name && all.findIndex((q) => q.name.toLowerCase() === p.name.toLowerCase()) === i) : [],
    newSeason: Number.isInteger(r.newSeason) ? r.newSeason : null,
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
  let n = String(name || '').trim()
    .replace(/\s+(Basic|Standard)?\s*with Ads$/i, '')
    .replace(/\s+(Premium|Essential|Basic|Standard|Ad[- ]Free)$/i, '')
    .replace(/\s+(Amazon|Apple TV|Roku Premium)\s+Channel$/i, '')
    .replace(/ Plus$/, '+')
    .trim();
  if (/^Amazon Prime Video/i.test(n)) n = 'Prime Video';
  if (/^Netflix/i.test(n)) n = 'Netflix';
  return n;
}

export const MAKER_ROLES = ['Director', 'Creator', 'Studio'];
export const MAKER_LABEL = { Director: 'Directed by', Creator: 'Created by', Studio: 'Studio' };
// The role a hand-typed name gets on this kind of title.
export const makerRoleFor = (kind) => (kind === 'game' ? 'Studio' : kind === 'movie' ? 'Director' : 'Creator');

export const platformsOf = (t) => [...(t.providers || []).map((p) => p.name), ...(t.kind === 'game' ? t.platforms || [] : [])];

export function matches(t, needle) {
  const q = String(needle || '').trim().toLowerCase();
  if (!q) return true;
  const hay = [t.title, t.titleQc, t.via, String(t.year || ''), ...(t.tags || []), ...(t.genres || []), ...(t.cast || []).map((c) => c.name), ...(t.makers || []).map((x) => x.name), ...platformsOf(t)].join(' \u0001 ').toLowerCase();
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

// Pours a Scan into a title. Your own things stay: status, scores, notes, checks, tags, friends, your platforms.
// Seasons and episodes made by hand that TMDB doesn't know are dropped, unless you put something in them.
export function mergeScan(t, s) {
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
  t.watchLink = s.watchLink || '';
  mergeProviders(t, s);
  return mergeSeasons(t, s);
}

export function mergeProviders(t, s) {
  const source = s.source === 'rawg' ? 'rawg' : 'tmdb';
  const scanned = s.providers.map((p) => ({ name: p.name, source, url: p.url || '' }));
  const mine = t.providers.filter((p) => p.source === 'manual' && !scanned.some((n) => n.name.toLowerCase() === p.name.toLowerCase()));
  t.providers = [...scanned, ...mine];
  if (source === 'tmdb') t.watchLink = s.watchLink || '';
}

// Seasons and episodes only: what the daily new-season check refreshes.
export function mergeSeasons(t, s) {
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

// Your card: scores, statuses, favorites and tags. Never notes, dates, history or recommendations.
export function makeCard(titles, { id, name }) {
  return {
    app: 'rewinder',
    kind: 'card',
    format: 1,
    id,
    name,
    at: new Date().toISOString(),
    titles: live(titles).map((t) => {
      const score = effectiveScore(t);
      return {
        ...refOf(t),
        score: typeof score === 'number' ? Math.round(score * 10) / 10 : null,
        status: t.status,
        fav: Boolean(t.fav),
        tags: t.tags || [],
        poster: t.poster || ''
      };
    })
  };
}

export const isCard = (d) => Boolean(d && d.app === 'rewinder' && d.kind === 'card' && Array.isArray(d.titles));

export function normalizeCard(d) {
  const at = typeof d.at === 'string' && !Number.isNaN(Date.parse(d.at)) ? new Date(d.at).toISOString() : new Date().toISOString();
  return {
    id: typeof d.id === 'string' && /^[\w-]{6,64}$/.test(d.id) ? d.id : 'card-' + uid(),
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
