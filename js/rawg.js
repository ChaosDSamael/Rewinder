// Rewinder — games, from RAWG. Your own key, straight from your browser.
import { ScanError, timed } from './tmdb.js';
import { storeLink } from './model.js';

const API = 'https://api.rawg.io/api';

// RAWG often answers slowly, or not at all: a request gets 20 seconds (a search, 10), then it's dropped.
async function get(path, params, key, signal, ms = 20000) {
  const k = String(key || '').trim();
  if (!k) throw new ScanError('Add your RAWG key in Settings to search games.', 'nokey');
  const url = new URL(API + path);
  url.searchParams.set('key', k);
  for (const [name, value] of Object.entries(params || {})) url.searchParams.set(name, value);
  const clock = timed(signal, ms);
  const failed = (err) => {
    if (clock.late()) return new ScanError('RAWG took too long to answer. Try again later.', 'timeout');
    if (err && err.name === 'AbortError') return err;
    return null;
  };
  try {
    let res;
    try {
      res = await fetch(url, { headers: { accept: 'application/json' }, signal: clock.signal });
    } catch (err) {
      throw failed(err) || new ScanError("Can't reach RAWG right now. Try again later.", 'network');
    }
    if (res.status === 401 || res.status === 403) throw new ScanError('RAWG refused your key. Check it in Settings.', 'auth');
    if (res.status === 404) throw new ScanError('RAWG could not find that game.', 'notfound');
    if (res.status === 429) throw new ScanError('RAWG is busy. Try again in a moment.', 'busy');
    if (!res.ok) throw new ScanError(`RAWG is down or busy (${res.status}). Try again later.`, 'http');
    try {
      return await res.json();
    } catch (err) {
      throw failed(err) || new ScanError('RAWG sent an answer Rewinder could not read. Try again later.', 'http');
    }
  } finally {
    clock.done();
  }
}

export async function checkKey(key) {
  await get('/games', { page_size: '1' }, key);
  return true;
}

const yearOf = (v) => (/^\d{4}/.test(v || '') ? Number(String(v).slice(0, 4)) : null);
const names = (list, pick) => (list || []).map(pick).filter(Boolean);

// RAWG pictures come in any size: ask for a lighter one.
export function sized(url, width) {
  if (typeof url !== 'string' || !url.startsWith('https://media.rawg.io/media/')) return '';
  if (/\/media\/(resize|crop)\//.test(url)) return url;
  return url.replace('https://media.rawg.io/media/', `https://media.rawg.io/media/resize/${width}/-/`);
}

const PLATFORM = {
  'PlayStation 5': 'PS5', 'PlayStation 4': 'PS4', 'PlayStation 3': 'PS3', 'Xbox Series S/X': 'Xbox Series', 'Xbox One': 'Xbox One',
  'Nintendo Switch': 'Switch', 'Nintendo Switch 2': 'Switch 2', iOS: 'Mobile', Android: 'Mobile', macOS: 'Mac', 'Apple Macintosh': 'Mac'
};
const STORE = { 'Nintendo Store': 'Nintendo eShop', 'Epic Games': 'Epic Games Store', 'Xbox 360 Store': 'Xbox Store' };
const FAMILY = { PlayStation: 'PlayStation', Xbox: 'Xbox', Nintendo: 'Nintendo', PC: 'PC', 'Apple Macintosh': 'Mac', Linux: 'Linux', iOS: 'Mobile', Android: 'Mobile' };

const uniq = (list) => list.filter((v, i) => v && list.indexOf(v) === i);

export async function search(query, key, signal) {
  const data = await get('/games', { search: query, search_precise: 'true', page_size: '8' }, key, signal, 10000);
  return (data.results || []).filter((g) => g && Number.isInteger(g.id) && g.name).map((g) => ({
    type: 'game',
    id: g.id,
    kind: 'game',
    title: String(g.name).trim(),
    original: uniq(names(g.parent_platforms, (p) => p && p.platform && FAMILY[p.platform.name])).slice(0, 3).join(', '),
    year: yearOf(g.released),
    poster: sized(g.background_image, 200)
  }));
}

function cleanText(text) {
  const plain = String(text || '').replace(/\r/g, '').trim();
  // RAWG often appends a Spanish version after the English text.
  const cut = plain.search(/\n\s*Español\b/);
  const english = (cut > 0 ? plain.slice(0, cut) : plain).trim();
  if (english.length <= 1200) return english;
  const short = english.slice(0, 1200);
  const end = short.lastIndexOf('. ');
  return (end > 600 ? short.slice(0, end + 1) : short.trim() + '…');
}

// The studios that made it (RAWG calls them developers).
const studiosOf = (g) => uniq(names(g.developers, (d) => d && d.name)).slice(0, 3).map((name) => ({ name: String(name), role: 'Studio' }));

// Keywords for games: RAWG's English tags, minus the store features (achievements, controller support, cloud saves…).
const STORE_TAG = /^(steam|full controller|partial controller|controller support|tracked controller|in-app|captions|commentary|stats$|includes level editor|valve anti-cheat|remote play|family sharing|cloud|achievements|cross-platform|online pvp$|vr support)/;
const tagsOf = (g) => [...new Set((g.tags || [])
  .filter((x) => x && x.name && (!x.language || x.language === 'eng'))
  .map((x) => String(x.name).toLowerCase().replace(/\s+/g, ' ').trim())
  .filter((w) => w && !STORE_TAG.test(w) && !/[^\x20-\x7e]/.test(w)))].slice(0, 40);

export async function fetchTags(id, key) {
  return { keywords: tagsOf(await get(`/games/${id}`, {}, key)), keywordsAt: new Date().toISOString() };
}

export async function fetchStudios(id, key) {
  return studiosOf(await get(`/games/${id}`, {}, key));
}

export async function fetchGame(id, key) {
  const g = await get(`/games/${id}`, {}, key);
  let links = {};
  try {
    const stores = await get(`/games/${id}/stores`, {}, key);
    for (const s of stores.results || []) {
      const url = storeLink(s && s.url);
      if (url) links[s.store_id] = url;
    }
  } catch {
    links = {};
  }
  const providers = [];
  for (const s of g.stores || []) {
    const store = s && s.store;
    if (!store || !store.name) continue;
    const name = STORE[store.name] || store.name;
    if (providers.some((p) => p.name === name)) continue;
    providers.push({ name, url: links[store.id] || '' });
  }
  const slug = typeof g.slug === 'string' && /^[a-z0-9-]+$/.test(g.slug) ? g.slug : '';
  return {
    source: 'rawg',
    rawgId: Number.isInteger(g.id) && g.id > 0 ? g.id : Number(id),
    rawgSlug: slug,
    kind: 'game',
    title: String(g.name || 'Untitled').trim(),
    titleQc: '',
    year: yearOf(g.released),
    genres: names(g.genres, (x) => x && x.name).slice(0, 6),
    overview: cleanText(g.description_raw),
    poster: sized(g.background_image, 640),
    backdrop: sized(g.background_image_additional || g.background_image, 1280),
    cast: [],
    makers: studiosOf(g),
    keywords: tagsOf(g),
    keywordsAt: new Date().toISOString(),
    providers: providers.slice(0, 10),
    watchLink: '',
    available: uniq(names(g.platforms, (p) => p && p.platform && (PLATFORM[p.platform.name] || p.platform.name))).slice(0, 12),
    seasons: null
  };
}
