// Rewinder — anime genres from AniList (no key needed). TMDB only says "Animation"; AniList says what kind.

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
export async function animeGenres(titles, year) {
  for (const search of titles.filter(Boolean)) {
    let res;
    try {
      res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: QUERY, variables: { search } })
      });
    } catch {
      return null;
    }
    if (!res.ok) return null;
    let data;
    try {
      data = await res.json();
    } catch {
      return null;
    }
    const list = (data && data.data && data.data.Page && data.data.Page.media) || [];
    const fits = (m) => !year || !m.startDate || !m.startDate.year || Math.abs(m.startDate.year - year) <= 1;
    const pick = list.find((m) => fits(m) && SERIES.includes(m.format)) || list.find(fits);
    if (pick && Array.isArray(pick.genres) && pick.genres.length) return pick.genres.map(String).slice(0, 6);
  }
  return null;
}
