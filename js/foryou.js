// Rewinder — For you: what to add next, picked from what you love. Plain arithmetic on your list and on what TMDB
// and RAWG answered; app.js does the asking, at most once a day, with your own keys.
import { live, effectiveScore, keysOf, refOf, isSeen, KINDS } from './model.js';

export const FY_TTL = 864e5; // a day between two looks
export const FY_KEEP = 80; // suggestions kept between two looks
export const FY_ROW = 12; // on Home

// How much you love a title, from -1 to 1. A score says it best (5 is neutral); a heart is love; finished without a
// score leans yes, dropped leans no. Still in the watchlist, or on hold: no opinion yet.
export function liking(t) {
  const s = effectiveScore(t);
  let v = typeof s === 'number' ? (s - 5) / 5
    : t.status === 'completed' ? 0.2
      : t.status === 'progress' ? 0.15
        : t.status === 'dropped' ? -0.6
          : null;
  if (t.fav) v = Math.max(v === null ? 0 : v, 0.9);
  return v;
}

// Words that say nothing about your taste: where a story comes from, or how a game is played with others.
const NOT_TASTES = new Set([
  'based on novel or book', 'based on comic', 'based on manga', 'based on video game', 'based on true story', 'based on short story',
  'based on play or musical', 'based on young adult novel', 'sequel', 'prequel', 'remake', 'reboot', 'woman director', 'anime',
  'live action', 'live action remake', 'female protagonist', 'male protagonist', 'duringcreditsstinger', 'aftercreditsstinger',
  'singleplayer', 'multiplayer', 'atmospheric', 'great soundtrack', 'co-op', 'online co-op', 'online multiplayer', 'local multiplayer',
  'local co-op', 'split screen', 'first-person', 'third person', '3d', '2d', 'story rich', 'controller', 'cooperative', 'pvp', 'pve',
  'free to play', 'early access', 'replay value', 'classic', 'masterpiece'
]);

// The groups a title belongs to: its franchise, the people (or the studio) who made it, its themes.
function groupsOf(t) {
  const out = [];
  const game = t.kind === 'game';
  const side = game ? 'g' : 's';
  if (t.kind === 'movie' && t.franchise && t.franchise.name) out.push({ key: 'f:' + t.franchise.id, type: 'franchise', label: t.franchise.name, ref: t.franchise.id });
  for (const m of t.makers || []) {
    if (m && m.name) out.push({ key: `m:${side}:${m.name.toLowerCase()}`, type: game ? 'studio' : 'maker', label: m.name });
  }
  for (const k of t.keywords || []) {
    if (k && !NOT_TASTES.has(k)) out.push({ key: `k:${side}:${k}`, type: 'theme', label: k, game });
  }
  return out;
}

// What you love, strongest first. A franchise, a director, a studio or a theme counts once you have two titles in
// it, or one with a heart. Few titles, or lukewarm ones, weigh less; so does a theme on much of your list, and one on
// more than half of it is a habit of the database, not a taste.
export function tastes(titles) {
  const mine = live(titles);
  const groups = new Map();
  const carried = new Map();
  for (const t of mine) {
    const gs = groupsOf(t);
    for (const g of gs) carried.set(g.key, (carried.get(g.key) || 0) + 1);
    const v = liking(t);
    if (v === null) continue;
    for (const g of gs) {
      let e = groups.get(g.key);
      if (!e) groups.set(g.key, (e = { ...g, n: 0, sum: 0, favs: 0, titles: [] }));
      e.n++;
      e.sum += v;
      if (t.fav) e.favs++;
      e.titles.push({ id: t.id, title: t.title, kind: t.kind, v, tmdbType: t.tmdbType, tmdbId: t.tmdbId, rawgId: t.rawgId });
    }
  }
  const out = [];
  for (const e of groups.values()) {
    if (e.n < 2 && !e.favs) continue;
    const mean = e.sum / (e.n + 1);
    if (mean <= 0.15) continue;
    let strength = mean * (1 + 0.5 * Math.log(e.n));
    if (e.type === 'theme') {
      const share = mine.length >= 10 ? (carried.get(e.key) || 0) / mine.length : 0;
      if (share > 0.6) continue;
      strength *= 0.8 * (1 - share);
    }
    e.titles.sort((a, b) => b.v - a.v);
    out.push({ ...e, strength: Math.round(strength * 1000) / 1000 });
  }
  return out.sort((a, b) => b.strength - a.strength || a.label.localeCompare(b.label));
}

// What to ask TMDB and RAWG about: a few of your strongest tastes of each kind, and the games you love most
// (for their series).
export function plan(ts, titles) {
  const top = (n, pred) => ts.filter(pred).slice(0, n);
  const majority = (g) => {
    const n = { movie: 0, tv: 0, anime: 0 };
    for (const t of g.titles) if (Object.hasOwn(n, t.kind)) n[t.kind]++;
    return Object.keys(n).sort((a, b) => n[b] - n[a])[0];
  };
  return {
    franchises: top(5, (g) => g.type === 'franchise'),
    makers: top(6, (g) => g.type === 'maker'),
    themes: top(4, (g) => g.type === 'theme' && !g.game).map((g) => ({ ...g, aim: majority(g) })),
    studios: top(3, (g) => g.type === 'studio'),
    gameThemes: top(3, (g) => g.type === 'theme' && g.game),
    games: live(titles).filter((t) => t.kind === 'game' && t.rawgId && (t.fav || (liking(t) ?? 0) >= 0.6))
      .sort((a, b) => liking(b) - liking(a)).slice(0, 5)
      .map((t) => ({ id: t.id, rawgId: t.rawgId, title: t.title, fav: t.fav, v: liking(t) }))
  };
}

export const fyKey = (c) => (c.src === 'rawg' ? 'rawg:' + c.id : c.src === 'tmdb' ? `tmdb:${c.type}:${c.id}` : c.key);

// What is already yours: in your list, or in the trash (thrown away is not a suggestion). By TMDB or RAWG number;
// by name and year; by name alone only for a title of yours that has no year.
export function haveIndex(titles) {
  const ids = new Set();
  const named = new Set();
  const bare = new Set();
  for (const t of titles) {
    const r = refOf(t);
    if (r.tmdb) ids.add('tmdb:' + r.tmdb);
    if (r.rawg) ids.add('rawg:' + r.rawg);
    const names = keysOf(r).filter((k) => k.startsWith('name:'));
    if (names.length) (r.year ? named : bare).add(names[0]);
  }
  return (c) => {
    const r = { kind: c.kind, title: c.title, year: c.year || null, tmdb: c.src === 'tmdb' ? `${c.type}:${c.id}` : null, rawg: c.src === 'rawg' ? c.id : null };
    const keys = keysOf(r);
    if (keys.some((k) => ids.has(k))) return true;
    const names = keys.filter((k) => k.startsWith('name:'));
    return names.some((k) => named.has(k) || bare.has(k));
  };
}

// Fit to show: out already, known to enough people, not the news, a talk show or reality TV.
const NOT_SHOWS = new Set([10763, 10764, 10767]);
export function usable(c, today) {
  if (!c || !c.id || !c.title || !c.date || c.date > today) return false;
  if (c.type === 'tv' && (c.genres || []).some((g) => NOT_SHOWS.has(g))) return false;
  return (c.votes || 0) >= (c.src === 'rawg' ? 5 : 20);
}

// TMDB's and RAWG's ratings (out of 10), made fair: few votes lean toward the middle.
export function quality(c) {
  if (typeof c.rating !== 'number' || !c.votes) return 0.35;
  const m = c.src === 'rawg' ? 40 : 150;
  const r = (c.votes * c.rating + m * 6.5) / (c.votes + m);
  return Math.max(0.05, Math.min(1, (r - 4.5) / 4.5));
}

const WEIGHT = { franchise: 1.2, series: 1.2, maker: 1, studio: 1, theme: 0.7, friend: 0.9 };
const SECTION = { franchise: 'franchise', series: 'franchise', maker: 'people', studio: 'people', theme: 'theme', friend: 'friend' };
export const sectionOf = (item) => SECTION[item.why[0].type] || 'theme';

// found: [{ c: candidate, why: { type, key, label, strength, examples, seen, friend, score } }].
// One entry per title: its reasons added up (two themes at most), times how good the title is.
export function rank(found, have, skip, today) {
  const by = new Map();
  for (const { c, why } of found) {
    if (!usable(c, today)) continue;
    const key = fyKey(c);
    if (skip.has(key) || have(c)) continue;
    let e = by.get(key);
    if (!e) by.set(key, (e = { c, why: [] }));
    if (!e.c.overview && c.overview) e.c = { ...e.c, overview: c.overview };
    if (!e.why.some((w) => w.key === why.key)) e.why.push({ ...why, part: Math.round(WEIGHT[why.type] * why.strength * 1000) / 1000 });
  }
  const out = [];
  for (const [key, e] of by) {
    e.why.sort((a, b) => b.part - a.part);
    let themes = 0;
    const sum = e.why.reduce((n, w) => n + (w.type === 'theme' && ++themes > 2 ? 0 : w.part), 0);
    const { c } = e;
    out.push({
      key, src: c.src, type: c.type, id: c.id, slug: c.slug || '', kind: c.kind, title: c.title, year: c.year, date: c.date,
      poster: c.poster || '', overview: c.overview || '', rating: c.rating, votes: c.votes,
      score: Math.round(Math.min(sum, 3) * (0.4 + quality(c)) * 1000) / 1000,
      why: e.why.slice(0, 3).map(({ part, ...w }) => w)
    });
  }
  out.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return spread(out, 4).slice(0, FY_KEEP);
}

// No more than `most` in a row from the same reason: the rest wait at the end.
function spread(list, most) {
  const count = new Map();
  const first = [];
  const later = [];
  for (const x of list) {
    const k = x.why[0].key;
    const n = count.get(k) || 0;
    count.set(k, n + 1);
    (n < most ? first : later).push(x);
  }
  return [...first, ...later];
}

// Your friends' best ones you haven't seen: a heart, or 8 and up. Several friends loving it counts more.
export function friendPicks(friends, have, skip) {
  const by = new Map();
  for (const f of friends || []) {
    for (const x of (f && f.titles) || []) {
      if (!x || !x.title || !isSeen(x.status, x.score)) continue;
      const love = x.fav ? Math.max(0.9, typeof x.score === 'number' ? (x.score - 5) / 5 : 0) : typeof x.score === 'number' && x.score >= 8 ? (x.score - 5) / 5 : 0;
      if (!love) continue;
      const [type, id] = typeof x.tmdb === 'string' ? x.tmdb.split(':') : [];
      const c = {
        src: x.rawg ? 'rawg' : type ? 'tmdb' : 'card', type: x.rawg ? 'game' : type || '', id: x.rawg || (type ? Number(id) : null),
        kind: x.kind, title: x.title, year: x.year || null, poster: x.poster || ''
      };
      if (c.src === 'card') c.key = keysOf({ kind: x.kind, title: x.title, year: x.year || null })[0];
      const key = fyKey(c);
      if (!key || skip.has(key) || have(c)) continue;
      let e = by.get(key);
      if (!e) by.set(key, (e = { c, why: [] }));
      e.why.push({ type: 'friend', key: 'friend:' + f.id, label: f.name, friend: f.alias || f.name, via: f.name, fav: Boolean(x.fav), score: typeof x.score === 'number' ? x.score : null, strength: love });
    }
  }
  const out = [];
  for (const [key, e] of by) {
    e.why.sort((a, b) => b.strength - a.strength);
    const sum = e.why.reduce((n, w, i) => n + WEIGHT.friend * w.strength * (i ? 0.5 : 1), 0);
    out.push({ key, ...e.c, slug: '', date: '', overview: '', rating: null, votes: 0, score: Math.round(Math.min(sum, 3) * 0.9 * 1000) / 1000, why: e.why.slice(0, 3) });
  }
  return out;
}

// What For you shows now: what the last look found, with what changed since taken out (added, thrown away, or
// "Not for me"), and your friends' favorites mixed in. Worked out again only when one of those changed.
let memo = { sig: '', list: [] };
export function current(state) {
  const fy = state.foryou;
  const friends = state.friends || [];
  let last = '';
  for (const t of state.titles) if (t.updatedAt > last) last = t.updatedAt;
  const sig = [state.titles.length, last, fy.at, fy.items.length, fy.skip.size, friends.length, friends.map((f) => `${f.id}:${f.at || ''}:${(f.titles || []).length}:${f.alias || ''}`).join(',')].join('|');
  if (memo.sig === sig) return memo.list;
  const have = haveIndex(state.titles);
  const cached = fy.items.filter((x) => !fy.skip.has(x.key) && !have(x));
  const byKey = new Map(cached.map((x) => [x.key, { ...x, why: [...x.why] }]));
  for (const p of friendPicks(friends, have, fy.skip)) {
    const had = byKey.get(p.key);
    if (had) {
      had.why = [...had.why, ...p.why].slice(0, 4);
      had.score = Math.round((had.score + p.score) * 1000) / 1000;
    } else byKey.set(p.key, p);
  }
  const list = spread([...byKey.values()].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)), 4);
  memo = { sig, list };
  return list;
}

// The words under a suggestion: why it is there, then what it is like.
export function why(w) {
  if (w.type === 'friend') return { main: w.fav ? `One of ${w.friend}'s favorites` : `${w.friend} gave it ${w.score}`, detail: '' };
  if (w.type === 'series') return { main: `Same series as ${w.label}`, detail: '' };
  const detail = w.type === 'franchise' && w.seen ? `You've seen ${w.seen}` : (w.examples || []).slice(0, 2).join(', ');
  return { main: `Because you love ${w.label}`, detail: detail && w.type !== 'franchise' ? `Like ${detail}` : detail };
}

// What comes back from storage is checked like anything else from outside: the right types, pictures only from
// TMDB and RAWG, short words.
const IMG = /^https:\/\/(image\.tmdb\.org|media\.rawg\.io)\/[\w./%-]+$/;
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null);
export function cleanItem(x) {
  if (!x || typeof x !== 'object' || typeof x.key !== 'string' || !x.key || x.key.length > 300) return null;
  if (!['tmdb', 'rawg', 'card'].includes(x.src) || !KINDS.includes(x.kind) || typeof x.title !== 'string' || !x.title.trim()) return null;
  if (x.src !== 'card' && !(Number.isInteger(x.id) && x.id > 0)) return null;
  const why = (Array.isArray(x.why) ? x.why : []).filter((w) => w && Object.hasOwn(WEIGHT, w.type) && typeof w.label === 'string' && typeof w.key === 'string').slice(0, 4).map((w) => ({
    type: w.type, key: w.key.slice(0, 300), label: w.label.slice(0, 120), strength: num(w.strength, 0, 5) ?? 0,
    examples: (Array.isArray(w.examples) ? w.examples : []).filter((e) => typeof e === 'string').slice(0, 2).map((e) => e.slice(0, 120)),
    seen: Number.isInteger(w.seen) && w.seen > 0 ? w.seen : 0, friend: str(w.friend, 40), via: str(w.via, 40), fav: w.fav === true, score: num(w.score, 0, 10)
  }));
  if (!why.length) return null;
  return {
    key: x.key, src: x.src, type: ['movie', 'tv', 'game'].includes(x.type) ? x.type : '', id: x.src === 'card' ? null : x.id,
    slug: typeof x.slug === 'string' && /^[a-z0-9-]{1,120}$/.test(x.slug) ? x.slug : '', kind: x.kind, title: x.title.trim().slice(0, 300),
    year: Number.isInteger(x.year) && x.year > 1800 && x.year < 2200 ? x.year : null, date: typeof x.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.date) ? x.date : '',
    poster: typeof x.poster === 'string' && IMG.test(x.poster) ? x.poster : '', overview: str(x.overview, 700),
    rating: num(x.rating, 0, 10), votes: Number.isInteger(x.votes) && x.votes > 0 ? x.votes : 0, score: num(x.score, 0, 10) ?? 0, why
  };
}

// The TMDB and RAWG numbers already found for names (people, themes, studios, tags).
export function cleanIds(v) {
  const out = { people: Object.create(null), words: Object.create(null), studios: Object.create(null), tags: Object.create(null) };
  for (const bag of Object.keys(out)) {
    const src = v && typeof v === 'object' && v[bag] && typeof v[bag] === 'object' ? v[bag] : {};
    for (const [name, id] of Object.entries(src).slice(0, 500)) if (name.length <= 120 && Number.isInteger(id) && id > 0) out[bag][name] = id;
  }
  return out;
}
