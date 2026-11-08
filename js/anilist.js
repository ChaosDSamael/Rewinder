// Rewinder — anime genres from AniList (no key needed). TMDB only says "Animation"; AniList says what kind.
import { timed } from './tmdb.js';

const API = 'https://graphql.anilist.co';
const QUERY = `query ($search: String) {
  Page(perPage: 6) {
    media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
      id
      genres
      format
      startDate { year }
    }
  }
}`;
const SERIES = ['TV', 'TV_SHORT', 'ONA', 'OVA'];

// Tries the Japanese title first, then the English one; the start year must match within a year.
// AniList allows about 90 requests a minute: requests wait their turn, a bit apart.
let nextSlot = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function turn() {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + 750;
  if (at > now) await sleep(at - now);
}

// The answer, read; null when AniList says no or is busy twice. Fifteen seconds at most per try: past that, it throws.
async function ask(search) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await turn();
    const clock = timed(null, 15000);
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: QUERY, variables: { search } }),
        signal: clock.signal
      });
      if (res.status === 429) {
        const wait = Math.min(65, Number(res.headers.get('Retry-After')) || 30);
        nextSlot = Date.now() + wait * 1000;
        continue;
      }
      return res.ok ? await res.json() : null;
    } finally {
      clock.done();
    }
  }
  return null;
}

export async function animeGenres(titles, year) {
  for (const search of titles.filter(Boolean)) {
    let data;
    try {
      data = await ask(search);
    } catch {
      return null;
    }
    if (!data) return null;
    const list = (data && data.data && data.data.Page && data.data.Page.media) || [];
    const fits = (m) => !year || !m.startDate || !m.startDate.year || Math.abs(m.startDate.year - year) <= 1;
    const pick = list.find((m) => fits(m) && SERIES.includes(m.format)) || list.find(fits);
    if (pick && Array.isArray(pick.genres) && pick.genres.length) return pick.genres.map(String).slice(0, 6);
  }
  return null;
}
