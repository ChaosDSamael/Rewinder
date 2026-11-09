// Rewinder — the Scan. Talks to TMDB straight from your browser, with your own key.
import { cleanProvider } from './model.js';

const API = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p/';

export class ScanError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ScanError';
    this.code = code;
  }
}

// The short "API Key" goes in the address; the long "API Read Access Token" goes in a header. Both work.
const isToken = (key) => key.startsWith('eyJ') || key.length > 60;

// A server that never answers would hold up everything waiting behind it (Add several goes one title at a time).
// Past `ms`, the request is dropped: late() says it was the clock, not you, that stopped it.
export function timed(outer, ms) {
  const ctl = new AbortController();
  let late = false;
  const timer = setTimeout(() => { late = true; ctl.abort(); }, ms);
  const pass = () => ctl.abort();
  if (outer) {
    if (outer.aborted) ctl.abort();
    else outer.addEventListener('abort', pass, { once: true });
  }
  return {
    signal: ctl.signal,
    late: () => late,
    done: () => { clearTimeout(timer); if (outer) outer.removeEventListener('abort', pass); }
  };
}

const SEARCH_MS = 10000;
const DETAIL_MS = 20000;

async function get(path, params, key, signal, ms = DETAIL_MS) {
  const k = String(key || '').trim();
  if (!k) throw new ScanError('Add your TMDB key in Settings first.', 'nokey');
  const url = new URL(API + path);
  for (const [name, value] of Object.entries(params || {})) url.searchParams.set(name, value);
  const headers = { accept: 'application/json' };
  if (isToken(k)) headers.Authorization = `Bearer ${k}`;
  else url.searchParams.set('api_key', k);
  const clock = timed(signal, ms);
  const failed = (err) => {
    if (clock.late()) return new ScanError('TMDB took too long to answer. Try again.', 'timeout');
    if (err && err.name === 'AbortError') return err;
    return null;
  };
  try {
    let res;
    try {
      res = await fetch(url, { headers, signal: clock.signal });
    } catch (err) {
      throw failed(err) || new ScanError("Can't reach TMDB. Check your internet connection.", 'network');
    }
    if (res.status === 401) throw new ScanError('TMDB refused your key. Check it in Settings.', 'auth');
    if (res.status === 404) throw new ScanError('TMDB could not find that title.', 'notfound');
    if (res.status === 429) throw new ScanError('TMDB is busy. Try again in a few seconds.', 'busy');
    if (!res.ok) throw new ScanError(`TMDB answered with an error (${res.status}).`, 'http');
    try {
      return await res.json();
    } catch (err) {
      throw failed(err) || new ScanError('TMDB sent an answer Rewinder could not read. Try again.', 'http');
    }
  } finally {
    clock.done();
  }
}

// The start guide's "Check" button.
export async function checkKey(key) {
  await get('/configuration', {}, key);
  return true;
}

const day = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
const yearOf = (v) => (/^\d{4}/.test(v || '') ? Number(String(v).slice(0, 4)) : null);
const image = (path, size) => (typeof path === 'string' && /^\/[\w.-]+$/.test(path) ? IMG + size + path : '');
const genreNames = (list) => (list || []).map((g) => g && g.name).filter(Boolean).slice(0, 6);
const dayOf = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '');
// TMDB names its collections "Alien Collection": the franchise is "Alien".
const franchiseOf = (d) => (d.belongs_to_collection && Number.isInteger(d.belongs_to_collection.id) && d.belongs_to_collection.name
  ? { id: d.belongs_to_collection.id, name: String(d.belongs_to_collection.name).replace(/\s+Collection$/i, '').trim() }
  : null);
const studioNames = (d) => (d.production_companies || []).map((c) => c && c.name).filter(Boolean).slice(0, 8);
// Keywords: TMDB's tags on a title (vampire, heist, time loop…). Movies list them under "keywords", shows under "results".
// The two "stinger" tags only say there's a scene after the credits: left out.
const STINGERS = new Set(['duringcreditsstinger', 'aftercreditsstinger']);
function keywordsOf(d) {
  const k = d.keywords || {};
  const raw = Array.isArray(k.keywords) ? k.keywords : Array.isArray(k.results) ? k.results : [];
  return [...new Set(raw.map((x) => String((x && x.name) || '').toLowerCase().replace(/\s+/g, ' ').trim()).filter((w) => w && !STINGERS.has(w)))].slice(0, 80);
}
const groupsOf = (d, movie) => {
  const at = new Date().toISOString();
  return { franchise: movie ? franchiseOf(d) : null, studios: studioNames(d), released: dayOf(movie ? d.release_date : d.first_air_date), groupsAt: at, keywords: keywordsOf(d), keywordsAt: at };
};

// Original title when it's English or French; otherwise the English one (Attack on Titan, not Shingeki no Kyojin).
function mainTitle(d, type) {
  const original = String((type === 'movie' ? d.original_title : d.original_name) || '').trim();
  const english = String((type === 'movie' ? d.title : d.name) || '').trim() || original;
  return (['en', 'fr'].includes(d.original_language) && original ? original : english) || 'Untitled';
}

export function kindOf(type, genreIds, language, countries) {
  if (type !== 'tv') return 'movie';
  const animated = (genreIds || []).includes(16);
  return animated && (language === 'ja' || (countries || []).includes('JP')) ? 'anime' : 'tv';
}

// The Québec title, only when it differs from the main one.
function quebecTitle(d, type, main) {
  const list = (d.translations && d.translations.translations) || [];
  const qc = list.find((t) => t && t.iso_639_1 === 'fr' && t.iso_3166_1 === 'CA');
  const name = qc && qc.data ? String((type === 'movie' ? qc.data.title : qc.data.name) || '').trim() : '';
  return name && name.toLowerCase() !== main.toLowerCase() ? name : '';
}

// Where to watch in Canada: subscription, free and with-ads services (data by JustWatch).
function watchCA(wp) {
  const ca = wp && wp.results && wp.results.CA;
  if (!ca) return { names: [], link: '' };
  const list = [...(ca.flatrate || []), ...(ca.free || []), ...(ca.ads || [])]
    .sort((a, b) => (a.display_priority ?? 99) - (b.display_priority ?? 99));
  const names = [];
  for (const p of list) {
    const n = cleanProvider(p && p.provider_name);
    if (n && !names.some((x) => x.toLowerCase() === n.toLowerCase())) names.push(n);
  }
  const link = typeof ca.link === 'string' && ca.link.startsWith('https://www.themoviedb.org/') ? ca.link : '';
  return { names: names.slice(0, 12), link };
}

// n: the season number we asked for (already checked), not whatever came back.
function seasonFrom(s, n) {
  return {
    n,
    year: String(s.air_date || '').slice(0, 4),
    episodes: (Array.isArray(s.episodes) ? s.episodes : [])
      .filter((e) => e && Number.isInteger(e.episode_number) && e.episode_number >= 0)
      .slice(0, 5000)
      .map((e) => ({ n: e.episode_number, title: String(e.name || '').trim().slice(0, 300), aired: day(e.air_date), tba: !day(e.air_date) }))
  };
}

// A TMDB id is a whole number above zero; anything else is dropped.
const goodId = (n) => Number.isInteger(n) && n > 0;

export async function search(query, key, signal) {
  const data = await get('/search/multi', { query, include_adult: 'false', language: 'en-US', page: '1' }, key, signal, SEARCH_MS);
  return (data.results || [])
    .filter((r) => r && goodId(r.id) && (r.media_type === 'movie' || r.media_type === 'tv'))
    .slice(0, 12)
    .map((r) => {
      const type = r.media_type;
      const title = mainTitle(r, type);
      const original = String((type === 'movie' ? r.original_title : r.original_name) || '').trim();
      return {
        type,
        id: r.id,
        kind: kindOf(type, r.genre_ids, r.original_language, r.origin_country),
        title,
        original: original && original !== title ? original : '',
        year: yearOf(type === 'movie' ? r.release_date : r.first_air_date),
        poster: image(r.poster_path, 'w154')
      };
    });
}

// For the list import: search only movies, or only shows, with the year when the line has one.
export async function searchKind(query, kind, year, key, signal) {
  const movie = kind === 'movie';
  const params = { query, include_adult: 'false', language: 'en-US', page: '1' };
  if (year) params[movie ? 'year' : 'first_air_date_year'] = String(year);
  const data = await get(movie ? '/search/movie' : '/search/tv', params, key, signal, SEARCH_MS);
  const type = movie ? 'movie' : 'tv';
  return (data.results || []).filter((r) => r && goodId(r.id)).slice(0, 8).map((r) => {
    const title = mainTitle(r, type);
    const original = String((movie ? r.original_title : r.original_name) || '').trim();
    return {
      type,
      id: r.id,
      kind: kindOf(type, r.genre_ids, r.original_language, r.origin_country),
      title,
      original: original && original !== title ? original : '',
      year: yearOf(movie ? r.release_date : r.first_air_date),
      poster: image(r.poster_path, 'w154')
    };
  });
}

// Who made it: a movie's director; a show's creators, or else the director of the most episodes.
const MAKERS = 3;
function movieMakers(credits) {
  const out = [];
  for (const c of (credits && credits.crew) || []) {
    if (c && c.job === 'Director' && c.name && !out.some((m) => m.name === c.name)) out.push({ name: String(c.name), role: 'Director' });
  }
  return out.slice(0, MAKERS);
}

function showMakers(d, aggregate) {
  const made = (d.created_by || []).filter((c) => c && c.name).slice(0, MAKERS).map((c) => ({ name: String(c.name), role: 'Creator' }));
  if (made.length) return made;
  let best = null;
  for (const c of (aggregate && aggregate.crew) || []) {
    const job = (c && c.jobs || []).find((j) => j && j.job === 'Director');
    if (c.name && job && (!best || (job.episode_count || 0) > best.n)) best = { name: String(c.name), n: job.episode_count || 0 };
  }
  return best ? [{ name: best.name, role: 'Director' }] : [];
}

// For titles saved before makers were kept: the lightest calls that answer it.
export async function fetchMakers(type, id, key) {
  if (type === 'movie') return movieMakers(await get(`/movie/${id}/credits`, {}, key));
  const d = await get(`/tv/${id}`, { language: 'en-US' }, key);
  const made = showMakers(d, null);
  if (made.length) return made;
  return showMakers(d, await get(`/tv/${id}/aggregate_credits`, { language: 'en-US' }, key));
}

// For titles saved before 1.8 (franchise, studios, release day) or 1.9 (keywords). One light call.
export async function fetchGroups(type, id, key) {
  const movie = type === 'movie';
  return groupsOf(await get(`/${movie ? 'movie' : 'tv'}/${id}`, { language: 'en-US', append_to_response: 'keywords' }, key), movie);
}

// Everything about one title. Seasons come 20 at a time, the most TMDB allows per request.
export async function fetchTitle(type, id, key, onStep) {
  if (type === 'movie') {
    const d = await get(`/movie/${id}`, { language: 'en-US', append_to_response: 'credits,translations,watch/providers,keywords' }, key);
    const title = mainTitle(d, 'movie');
    const watch = watchCA(d['watch/providers']);
    return {
      source: 'tmdb',
      tmdbId: goodId(d.id) ? d.id : Number(id),
      tmdbType: 'movie',
      kind: 'movie',
      original: String(d.original_title || '').trim(),
      title,
      titleQc: quebecTitle(d, 'movie', title),
      year: yearOf(d.release_date),
      genres: genreNames(d.genres),
      overview: String(d.overview || '').trim(),
      poster: image(d.poster_path, 'w500'),
      backdrop: image(d.backdrop_path, 'w1280'),
      cast: ((d.credits && d.credits.cast) || []).slice(0, 12).map((c) => ({ name: c.name, role: c.character || '' })),
      makers: movieMakers(d.credits),
      ...groupsOf(d, true),
      providers: watch.names.map((name) => ({ name, url: '' })),
      watchLink: watch.link,
      available: [],
      seasons: null
    };
  }
  const d = await get(`/tv/${id}`, { language: 'en-US', append_to_response: 'aggregate_credits,translations,watch/providers,keywords' }, key);
  // Season 0 holds the specials: left out, like most trackers do. Add it by hand with + Season if you want it.
  const numbers = (d.seasons || []).map((s) => s && s.season_number).filter((n) => Number.isInteger(n) && n > 0);
  const seasons = [];
  for (let i = 0; i < numbers.length; i += 20) {
    const batch = numbers.slice(i, i + 20);
    if (onStep) onStep(numbers.length > 1 ? `Reading seasons ${batch[0]} to ${batch[batch.length - 1]}…` : 'Reading the episodes…');
    const part = await get(`/tv/${id}`, { language: 'en-US', append_to_response: batch.map((n) => `season/${n}`).join(',') }, key);
    for (const n of batch) {
      const s = part[`season/${n}`] || await get(`/tv/${id}/season/${n}`, { language: 'en-US' }, key).catch(() => null);
      if (s && typeof s === 'object') seasons.push(seasonFrom(s, n));
    }
  }
  const title = mainTitle(d, 'tv');
  const watch = watchCA(d['watch/providers']);
  const cast = ((d.aggregate_credits && d.aggregate_credits.cast) || [])
    .slice()
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, 12)
    .map((c) => ({ name: c.name, role: (c.roles && c.roles[0] && c.roles[0].character) || '' }));
  return {
    source: 'tmdb',
    tmdbId: goodId(d.id) ? d.id : Number(id),
    tmdbType: 'tv',
    original: String(d.original_name || '').trim(),
    kind: kindOf('tv', (d.genres || []).map((g) => g.id), d.original_language, d.origin_country),
    title,
    titleQc: quebecTitle(d, 'tv', title),
    year: yearOf(d.first_air_date),
    genres: genreNames(d.genres),
    overview: String(d.overview || '').trim(),
    poster: image(d.poster_path, 'w500'),
    backdrop: image(d.backdrop_path, 'w1280'),
    cast,
    makers: showMakers(d, d.aggregate_credits),
    ...groupsOf(d, false),
    providers: watch.names.map((name) => ({ name, url: '' })),
    watchLink: watch.link,
    available: [],
    seasons
  };
}

/* ---------- For you: what TMDB knows around the titles you love ---------- */

// One title from a TMDB list (a franchise, someone's work, a theme), in the shape For you ranks.
function candidateOf(r, type) {
  const t = type || (r && r.media_type);
  if (!r || !goodId(r.id) || r.adult === true || (t !== 'movie' && t !== 'tv')) return null;
  const date = dayOf(t === 'movie' ? r.release_date : r.first_air_date);
  return {
    src: 'tmdb',
    type: t,
    id: r.id,
    kind: kindOf(t, r.genre_ids, r.original_language, r.origin_country),
    title: mainTitle(r, t).slice(0, 300),
    year: yearOf(date),
    date,
    poster: image(r.poster_path, 'w342'),
    overview: String(r.overview || '').trim().slice(0, 700),
    rating: typeof r.vote_average === 'number' && Number.isFinite(r.vote_average) ? Math.max(0, Math.min(10, r.vote_average)) : null,
    votes: Number.isInteger(r.vote_count) && r.vote_count > 0 ? r.vote_count : 0,
    genres: Array.isArray(r.genre_ids) ? r.genre_ids.filter(Number.isInteger).slice(0, 10) : []
  };
}
const candidates = (list, type) => (Array.isArray(list) ? list : []).slice(0, 200).map((r) => candidateOf(r, type)).filter(Boolean);
const sameName = (a, b) => {
  const p = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return p(a) !== '' && p(a) === p(b);
};

// Every movie of a franchise.
export async function franchiseMovies(id, key) {
  return candidates((await get(`/collection/${id}`, { language: 'en-US' }, key)).parts, 'movie');
}

// Someone you love, by name: their TMDB number. From the credits of a title of yours first (two people can share
// a name), else from a search, where the one known for something else than acting wins.
export async function personId(name, ref, key) {
  if (ref && ref.type === 'movie' && goodId(ref.id)) {
    const d = await get(`/movie/${ref.id}/credits`, {}, key);
    const c = (d.crew || []).find((x) => x && x.job === 'Director' && goodId(x.id) && sameName(x.name, name));
    if (c) return c.id;
  } else if (ref && ref.type === 'tv' && goodId(ref.id)) {
    const d = await get(`/tv/${ref.id}`, { language: 'en-US' }, key);
    const c = (d.created_by || []).find((x) => x && goodId(x.id) && sameName(x.name, name));
    if (c) return c.id;
  }
  const s = await get('/search/person', { query: name, include_adult: 'false', language: 'en-US', page: '1' }, key);
  const hits = (s.results || []).filter((p) => p && goodId(p.id) && sameName(p.name, name));
  const pick = hits.find((p) => p.known_for_department && p.known_for_department !== 'Acting') || hits[0];
  return pick ? pick.id : null;
}

// What someone made: the movies they directed, the shows they created (or directed most of).
export async function workOf(id, key) {
  const d = await get(`/person/${id}/combined_credits`, { language: 'en-US' }, key);
  const out = [];
  for (const c of d.crew || []) {
    if (!c) continue;
    const made = c.media_type === 'movie' ? c.job === 'Director'
      : c.media_type === 'tv' && (c.job === 'Creator' || (c.job === 'Director' && (c.episode_count || 0) >= 4));
    const x = made ? candidateOf(c) : null;
    if (x && !out.some((y) => y.type === x.type && y.id === x.id)) out.push(x);
  }
  return out;
}

// A theme (TMDB's keywords) by name: its number.
export async function keywordId(word, key) {
  const d = await get('/search/keyword', { query: word, page: '1' }, key);
  const hit = (d.results || []).find((k) => k && goodId(k.id) && sameName(k.name, word));
  return hit ? hit.id : null;
}

// The best-liked titles with a theme: movies, shows or anime, whichever you watch it in.
export async function themeTop(id, aim, key) {
  const movie = aim === 'movie';
  const params = { with_keywords: String(id), sort_by: 'vote_average.desc', 'vote_count.gte': movie ? '300' : '100', include_adult: 'false', language: 'en-US', page: '1' };
  if (aim === 'anime') Object.assign(params, { with_genres: '16', with_original_language: 'ja' });
  return candidates((await get(movie ? '/discover/movie' : '/discover/tv', params, key)).results, movie ? 'movie' : 'tv');
}
