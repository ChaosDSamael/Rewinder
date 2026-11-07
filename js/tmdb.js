// Rewinder — the Scan. Talks to TMDB straight from your browser, with your own key.

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

async function get(path, params, key, signal) {
  const k = String(key || '').trim();
  if (!k) throw new ScanError('Add your TMDB key in Settings first.', 'nokey');
  const url = new URL(API + path);
  for (const [name, value] of Object.entries(params || {})) url.searchParams.set(name, value);
  const headers = { accept: 'application/json' };
  if (isToken(k)) headers.Authorization = `Bearer ${k}`;
  else url.searchParams.set('api_key', k);
  let res;
  try {
    res = await fetch(url, { headers, signal });
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    throw new ScanError("Can't reach TMDB. Check your internet connection.", 'network');
  }
  if (res.status === 401) throw new ScanError('TMDB refused your key. Check it in Settings.', 'auth');
  if (res.status === 404) throw new ScanError('TMDB could not find that title.', 'notfound');
  if (res.status === 429) throw new ScanError('TMDB is busy. Try again in a few seconds.', 'busy');
  if (!res.ok) throw new ScanError(`TMDB answered with an error (${res.status}).`, 'http');
  return res.json();
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

// "Paramount Plus" and "Paramount+ Amazon Channel" are the same subscription: one name per service.
export function cleanProvider(name) {
  let n = String(name || '').trim()
    .replace(/\s+(Basic|Standard)?\s*with Ads$/i, '')
    .replace(/\s+(Amazon|Apple TV|Roku Premium)\s+Channel$/i, '')
    .replace(/ Plus$/, '+')
    .trim();
  if (/^Amazon Prime Video/i.test(n)) n = 'Prime Video';
  if (/^Netflix/i.test(n)) n = 'Netflix';
  return n;
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

function seasonFrom(s) {
  return {
    n: s.season_number,
    year: String(s.air_date || '').slice(0, 4),
    episodes: (s.episodes || [])
      .filter((e) => e && Number.isInteger(e.episode_number))
      .map((e) => ({ n: e.episode_number, title: String(e.name || '').trim(), aired: day(e.air_date), tba: !day(e.air_date) }))
  };
}

export async function search(query, key, signal) {
  const data = await get('/search/multi', { query, include_adult: 'false', language: 'en-US', page: '1' }, key, signal);
  return (data.results || [])
    .filter((r) => r && (r.media_type === 'movie' || r.media_type === 'tv'))
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
  const data = await get(movie ? '/search/movie' : '/search/tv', params, key, signal);
  const type = movie ? 'movie' : 'tv';
  return (data.results || []).filter(Boolean).slice(0, 8).map((r) => {
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

// Everything about one title. Seasons come 20 at a time, the most TMDB allows per request.
export async function fetchTitle(type, id, key, onStep) {
  if (type === 'movie') {
    const d = await get(`/movie/${id}`, { language: 'en-US', append_to_response: 'credits,translations,watch/providers' }, key);
    const title = mainTitle(d, 'movie');
    const watch = watchCA(d['watch/providers']);
    return {
      source: 'tmdb',
      tmdbId: d.id,
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
      providers: watch.names.map((name) => ({ name, url: '' })),
      watchLink: watch.link,
      available: [],
      seasons: null
    };
  }
  const d = await get(`/tv/${id}`, { language: 'en-US', append_to_response: 'aggregate_credits,translations,watch/providers' }, key);
  // Season 0 holds the specials: left out, like most trackers do. Add it by hand with + Season if you want it.
  const numbers = (d.seasons || []).map((s) => s && s.season_number).filter((n) => Number.isInteger(n) && n > 0);
  const seasons = [];
  for (let i = 0; i < numbers.length; i += 20) {
    const batch = numbers.slice(i, i + 20);
    if (onStep) onStep(numbers.length > 1 ? `Reading seasons ${batch[0]} to ${batch[batch.length - 1]}…` : 'Reading the episodes…');
    const part = await get(`/tv/${id}`, { language: 'en-US', append_to_response: batch.map((n) => `season/${n}`).join(',') }, key);
    for (const n of batch) {
      const s = part[`season/${n}`] || await get(`/tv/${id}/season/${n}`, { language: 'en-US' }, key).catch(() => null);
      if (s) seasons.push(seasonFrom(s));
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
    tmdbId: d.id,
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
    providers: watch.names.map((name) => ({ name, url: '' })),
    watchLink: watch.link,
    available: [],
    seasons
  };
}
