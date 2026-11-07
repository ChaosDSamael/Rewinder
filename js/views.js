// Rewinder — screens. Each function returns HTML; every piece of user text goes through esc().
import * as M from './model.js';
import { esc, icon, rater, miniStars, corners, visor, poster, statusDot } from './ui.js';

const tHref = (t) => `#/title/${encodeURIComponent(t.id)}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const SORTS = [['recent', 'Recent activity'], ['title', 'Title A–Z'], ['score', 'Best score'], ['year', 'Newest']];
const sortOptions = (cur) => SORTS.map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${l}</option>`).join('');
const A_KIND = { movie: 'a movie', tv: 'a TV show', anime: 'an anime', game: 'a game' };
const KIND_PLURAL = { movie: 'movies', tv: 'TV shows', anime: 'anime', game: 'games' };
const byActivity = (a, b) => M.activity(b).localeCompare(M.activity(a));
const options = (list) => list.map((v) => `<option value="${esc(v)}"></option>`).join('');

/* ---------- frame ---------- */

export function header(state) {
  const r = state.route;
  const cur = r.name === 'browse' ? r.kind : r.name === 'title' && state.current ? state.current.kind : null;
  const nav = (href, label, on) => `<a class="nav-link" href="${href}"${on ? ' aria-current="page"' : ''}>${label}</a>`;
  const spoiler = state.settings.spoiler;
  return `<header class="top">
<a class="brand" href="#/" aria-label="Rewinder, home"><img src="icons/logo-64.png" alt="" width="36" height="36"><span>REWINDER</span></a>
<nav class="nav" aria-label="Sections">${nav('#/', 'Home', r.name === 'home')}${nav('#/list', 'Full List', r.name === 'list')}<span class="nav-sep" aria-hidden="true"></span>${M.KINDS.map((k) => nav('#/' + M.KIND_PATH[k], M.KIND_TAB[k], cur === k)).join('')}</nav>
<div class="tools">
${r.name === 'list' ? '' : `<div class="search">${icon.search}<label class="sr" for="q-head">Search your list</label><input id="q-head" type="search" placeholder="Titles, actors, genres, tags" autocomplete="off" spellcheck="false"></div>`}
${state.canInstall ? `<button type="button" class="btn btn-ghost" data-action="install">${icon.install}Install</button>` : ''}
<button type="button" class="icon-btn" data-action="spoiler" aria-pressed="${spoiler}" aria-label="Spoiler mode" title="${spoiler ? 'Spoiler mode is on: your notes are blurred' : 'Spoiler mode: blur your notes'}">${icon.eyeOff}</button>
<a class="icon-btn icon-settings" href="#/settings" aria-label="${needsBackup(state) ? 'Settings, a backup is due' : 'Settings'}" title="${needsBackup(state) ? 'Settings · time for a backup' : 'Settings'}"${r.name === 'settings' ? ' aria-current="page"' : ''}>${icon.sliders}${needsBackup(state) ? '<span class="ping" aria-hidden="true"></span>' : ''}</a>
<button type="button" class="btn btn-primary btn-scan" data-action="add">${icon.radar}<span>Scan</span><span class="sweep" aria-hidden="true"></span></button>
</div>
</header>`;
}

export const footer = () => `<footer class="foot"><span>Rewinder · v${M.APP_VERSION} · Your list stays on this device</span><span>Data: <a href="https://www.themoviedb.org" target="_blank" rel="noopener">TMDB</a> · <a href="https://rawg.io" target="_blank" rel="noopener">RAWG</a> · Where to watch: JustWatch</span></footer>`;

/* ---------- cards and tables ---------- */

function cardMeta(t) {
  if (M.hasEpisodes(t) && t.status === 'progress') {
    const nx = M.nextEpisode(t);
    if (nx) {
      const code = M.epCode(nx.season.n, nx.ep.n);
      if (M.isAired(nx.ep)) return `Next ${code}`;
      return nx.ep.tba ? `${code} · date TBA` : `${code} · ${M.fmtDate(nx.ep.aired)}`;
    }
  }
  const score = M.effectiveScore(t);
  const bits = [];
  const marked = t.kind === 'game' && (t.game.story || t.game.full);
  if (marked) bits.push(t.game.full ? '100%' : 'Story done');
  else if (t.year) bits.push(String(t.year));
  if (score !== null) bits.push(`★ ${score.toFixed(1)}`);
  else if (!marked && t.status !== 'progress') bits.push(M.STATUS_LABEL[t.status]);
  return bits.join(' · ');
}

export function card(t) {
  const p = M.progress(t);
  const bar = M.hasEpisodes(t) && t.status === 'progress' && p.total > 0;
  const meta = cardMeta(t);
  const extra = t.newSeason !== null ? `<span class="badge-new">S${t.newSeason} NEW</span>` : '';
  return `<a class="card" data-key="c-${esc(t.id)}" href="${tHref(t)}" aria-label="${esc(`${t.title}, ${M.KIND_LABEL[t.kind]}${meta ? ', ' + meta : ''}`)}">${poster(t, { extra })}
${bar ? `<span class="bar" aria-hidden="true"><span style="width:${Math.round((p.watched / p.total) * 100)}%"></span></span>` : ''}${t.poster ? `<span class="card-title">${esc(t.title)}</span>` : ''}<span class="card-meta">${esc(meta)}</span></a>`;
}

export function titleTable(rows, { emptyText = '', showKind = true } = {}) {
  return `<div class="table-wrap"><div class="table${showKind ? '' : ' no-kind'}">
<div class="tr th" aria-hidden="true"><span>Title</span>${showKind ? '<span>Type</span>' : ''}<span>Status</span><span>Score</span><span>Progress</span><span>Last</span><span>Via</span></div>
${rows.length ? `<ol class="tbody">${rows.map((t) => tableRow(t, showKind)).join('')}</ol>` : `<p class="empty">${esc(emptyText)}</p>`}
</div></div>`;
}

function tableRow(t, showKind) {
  const score = M.effectiveScore(t);
  const sub = [t.titleQc, t.year, t.genres.slice(0, 2).join(', ')].filter(Boolean).join(' · ');
  return `<li class="tr" data-key="r-${esc(t.id)}">
<a class="cell-title" href="${tHref(t)}"><span class="thumb" style="background:${M.artFor(t)}" aria-hidden="true">${t.poster ? `<img src="${esc(t.poster)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</span><span class="tt"><span class="tt-main">${esc(t.title)}${t.fav ? `<span class="fav-mark" title="Favorite">${icon.heartOn}</span>` : ''}</span>${sub ? `<span class="tt-sub">${esc(sub)}</span>` : ''}</span></a>
${showKind ? `<span class="c-kind">${M.KIND_SHORT[t.kind]}</span>` : ''}
<span class="c-status">${statusDot(t.status)}${M.STATUS_LABEL[t.status]}</span>
<span class="c-score">${miniStars(score)}<span>${M.fmtScore(score)}</span></span>
<span class="c-prog">${esc(M.progressLabel(t))}</span>
<span class="c-last">${esc(M.fmtDate(M.activity(t)))}</span>
<span class="c-via">${esc(t.via)}</span>
</li>`;
}

/* ---------- home ---------- */

function segments(t, nx) {
  const list = M.episodes(t);
  if (list.length > 48) {
    const p = M.progress(t);
    return `<span class="bar-lg" aria-hidden="true"><span style="width:${Math.round((p.watched / p.total) * 100)}%"></span></span>`;
  }
  return `<div class="segs" aria-hidden="true" style="--n:${list.length}">${list.map((x) => `<span class="${x.ep.watched ? 'w' : nx && x.ep === nx.ep ? 'nx' : M.isAired(x.ep) ? '' : 'f'}"></span>`).join('')}</div>`;
}

function heroNav(t, heroes) {
  if (heroes.length < 2) return '';
  const at = heroes.indexOf(t);
  const prev = heroes[(at - 1 + heroes.length) % heroes.length];
  const next = heroes[(at + 1) % heroes.length];
  return `<div class="hero-nav" role="group" aria-label="Series in progress">
<button type="button" class="icon-btn hero-arrow" id="hero-prev" data-action="hero-go" data-id="${esc(prev.id)}" aria-label="Previous: ${esc(prev.title)}" title="${esc(prev.title)}">${icon.chevLeft}</button>
<span class="hero-count" aria-live="polite">${M.pad2(at + 1)} / ${M.pad2(heroes.length)}</span>
<button type="button" class="icon-btn hero-arrow" id="hero-next" data-action="hero-go" data-id="${esc(next.id)}" aria-label="Next: ${esc(next.title)}" title="${esc(next.title)}">${icon.chevRight}</button>
</div>`;
}

function heroContinue(t, state, heroes = [t]) {
  const nx = M.nextEpisode(t);
  const p = M.progress(t);
  const score = M.effectiveScore(t);
  const code = M.epCode(nx.season.n, nx.ep.n);
  const pending = state.ui.homeScore[t.id];
  const meta = [t.year, ...t.genres.slice(0, 2), t.seasons.length ? plural(t.seasons.length, 'season') : ''].filter(Boolean).join(' · ');
  return `<section class="hero" data-key="hero-${esc(t.id)}" aria-labelledby="hero-title" style="--art:${M.heroArt(t)}">
${t.backdrop ? `<img class="hero-img" src="${esc(t.backdrop)}" alt="" referrerpolicy="no-referrer">` : ''}<div class="hero-shade" aria-hidden="true"></div><div class="scanlines" aria-hidden="true"></div>${visor}${corners}
<div class="hero-body">
<div class="eyebrow-row"><span class="eyebrow">// Continue</span><span class="pill">${M.KIND_LABEL[t.kind]}</span></div>
<div class="titles"><h1 class="display" id="hero-title"><a href="${tHref(t)}">${esc(t.title)}</a></h1>${t.titleQc ? `<p class="qc">${esc(t.titleQc)}</p>` : ''}</div>
<div class="hero-meta">${meta ? `<span>${esc(meta)}</span>` : ''}${score !== null ? `<span class="avg-chip">${icon.star}${score.toFixed(1)}${typeof t.score === 'number' ? '' : ' avg'}</span>` : ''}</div>
<div class="hero-progress">
<div class="hp-line"><span>Next <b class="acc">${code}</b>${nx.ep.title ? ' ' + esc(nx.ep.title) : ''}</span><span class="muted">${p.watched} of ${p.total} watched</span></div>
${segments(t, nx)}
</div>
<div class="hero-rate"><span class="label">Rate ${code}</span>${rater({ key: 'next:' + t.id, value: typeof pending === 'number' ? pending : null, label: `Your score for ${code}` })}</div>
<div class="actions"><button type="button" class="btn btn-primary" data-action="watch-next" data-id="${esc(t.id)}">${icon.check}Watched</button><a class="btn btn-ghost" href="${tHref(t)}">Open</a></div>
</div>
${heroNav(t, heroes)}
</section>`;
}

function heroWelcome() {
  return `<section class="hero hero-welcome" data-key="hero-welcome" aria-labelledby="hero-title" style="--art:${M.heroArt({ title: '' }, 196)}">
<div class="hero-shade" aria-hidden="true"></div><div class="scanlines" aria-hidden="true"></div>${visor}${corners}
<div class="hero-body">
<span class="eyebrow">// Welcome</span>
<h1 class="display" id="hero-title">Start your list</h1>
<p class="lead">Movies, TV shows, anime and games. Rate them, track every episode, and never forget what you watched.</p>
<div class="actions"><button type="button" class="btn btn-primary" data-action="add">${icon.plus}Add a title</button><button type="button" class="btn btn-ghost" data-action="import">${icon.upload}Restore a backup</button></div>
</div>
</section>`;
}

// No backup yet: remind once the list is worth something. Otherwise: once a week, if something changed.
export function needsBackup(state) {
  const s = state.settings;
  const changes = s.changesSinceBackup || 0;
  const now = Date.now();
  const last = s.lastBackupAt ? Date.parse(s.lastBackupAt) : 0;
  if (!M.live(state.titles).length) return false;
  if (s.backupSnoozeUntil && Date.parse(s.backupSnoozeUntil) > now) return false;
  if (!last) return changes >= 15;
  return changes >= 5 && now - last >= 7 * 864e5;
}

function rowSection(row) {
  const attrs = row.see ? Object.entries(row.see).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ') : '';
  return `<section class="row-sec" data-key="row-${esc(row.id)}" aria-labelledby="row-${esc(row.id)}">
<div class="row-head"><h2 class="h2" id="row-${esc(row.id)}"><span class="sq" aria-hidden="true"></span>${esc(row.title)}<span class="count">${row.items.length}</span></h2>${row.see ? `<button type="button" class="link-btn" data-action="see-all" ${attrs}>See all</button>` : ''}</div>
<div class="row">${row.items.slice(0, 20).map(card).join('')}</div>
</section>`;
}

// Series in progress with an episode out to watch, most recent first.
export function heroList(titles) {
  return M.live(titles).filter((t) => {
    if (!M.hasEpisodes(t) || t.status !== 'progress') return false;
    const nx = M.nextEpisode(t);
    return Boolean(nx && M.isAired(nx.ep));
  }).sort(byActivity);
}

export function homeView(state) {
  const all = M.live(state.titles);
  const heroes = heroList(state.titles);
  const hero = heroes.find((t) => t.id === state.ui.heroId) || heroes[0] || null;
  const rows = [
    { id: 'continue', title: 'Continue', items: all.filter((t) => t.status === 'progress' && t !== hero).sort(byActivity), see: { status: 'progress' } },
    { id: 'new', title: 'New Seasons', items: all.filter((t) => t.newSeason !== null).sort(byActivity) },
    { id: 'watchlist', title: 'Watchlist', items: all.filter((t) => t.status === 'watchlist').sort(byActivity), see: { status: 'watchlist' } },
    { id: 'favorites', title: 'Favorites', items: all.filter((t) => t.fav).sort(byActivity), see: { fav: '1' } },
    { id: 'recent', title: 'Recently Added', items: [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }
  ];
  for (const g of M.topGenres(all)) rows.push({ id: 'g-' + g.toLowerCase().replace(/[^a-z0-9]+/g, '-'), title: g, items: all.filter((t) => t.genres.includes(g)).sort(byActivity), see: { q: g } });
  return `<div class="page page-home">
${hero ? heroContinue(hero, state, heroes) : all.length ? '' : heroWelcome()}
${rows.filter((r) => r.items.length).map(rowSection).join('')}
</div>`;
}

/* ---------- full list and category pages ---------- */

export function listView(state) {
  const f = state.ui.list;
  const all = M.live(state.titles);
  const counts = { all: all.length };
  for (const k of M.KINDS) counts[k] = all.filter((t) => t.kind === k).length;
  const platforms = [...new Set([...all.flatMap(M.platformsOf), ...(f.platform ? [f.platform] : [])])].sort((a, b) => a.localeCompare(b));
  const rows = M.sortTitles(all.filter((t) => (f.cat === 'all' || t.kind === f.cat)
    && (!f.platform || M.platformsOf(t).includes(f.platform))
    && (!f.status || t.status === f.status)
    && (!f.fav || t.fav)
    && M.matches(t, f.q)), f.sort);
  const cats = [['all', 'All'], ...M.KINDS.map((k) => [k, M.KIND_TAB[k]])];
  const active = [];
  if (f.status) active.push(`<button type="button" class="chip chip-sm chip-on" data-action="list-clear" data-key="status">Status: ${M.STATUS_LABEL[f.status]}${icon.x}</button>`);
  if (f.fav) active.push(`<button type="button" class="chip chip-sm chip-on" data-action="list-clear" data-key="fav">Favorites only${icon.x}</button>`);
  return `<div class="page page-list">
<div class="page-head"><div class="titles"><span class="eyebrow">// Everything you logged</span><h1 class="display display-md">Full List</h1></div><span class="head-count">${rows.length === all.length ? plural(all.length, 'title') : `${rows.length} of ${all.length}`}</span></div>
<div class="filters">
<div class="chips" role="group" aria-label="Category">${cats.map(([k, label]) => `<button type="button" class="chip" data-action="list-cat" data-cat="${k}" aria-pressed="${f.cat === k}">${label}<span class="chip-count">${counts[k]}</span></button>`).join('')}</div>
<div class="filter-tools">
<div class="search">${icon.search}<label class="sr" for="q-list">Filter the list</label><input id="q-list" type="search" placeholder="Title, actor, genre, tag or friend" value="${esc(f.q)}" data-filter="q" autocomplete="off" spellcheck="false"></div>
<label class="sr" for="plat-list">Platform</label><select id="plat-list" class="select" data-filter="platform"><option value="">All platforms</option>${platforms.map((p) => `<option value="${esc(p)}"${p === f.platform ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select>
<label class="sr" for="sort-list">Sort by</label><select id="sort-list" class="select" data-filter="sort">${sortOptions(f.sort)}</select>
</div>
</div>
${active.length ? `<div class="chips">${active.join('')}</div>` : ''}
${titleTable(rows, { emptyText: all.length ? 'No titles match. Try another category or clear the filter.' : 'Your list is empty. Use Scan to add your first title.' })}
</div>`;
}

export function browseView(state, kind) {
  const all = M.live(state.titles).filter((t) => t.kind === kind);
  const view = state.settings.browseView === 'list' ? 'list' : 'wall';
  const list = M.sortTitles(all, state.ui.browseSort);
  const body = !all.length
    ? `<div class="empty-box"><p class="lead">No ${KIND_PLURAL[kind]} yet.</p><button type="button" class="btn btn-primary" data-action="add" data-kind="${kind}">${icon.plus}Add ${A_KIND[kind]}</button></div>`
    : view === 'wall' ? `<div class="wall">${list.map(card).join('')}</div>` : titleTable(list, { showKind: false });
  return `<div class="page page-list">
<div class="page-head"><div class="titles"><span class="eyebrow">// ${plural(all.length, 'title')}</span><h1 class="display display-md">${M.KIND_TAB[kind]}</h1></div>
<div class="filter-tools">
<label class="sr" for="sort-browse">Sort by</label><select id="sort-browse" class="select" data-filter="browseSort">${sortOptions(state.ui.browseSort)}</select>
<div class="seg-btns" role="group" aria-label="View"><button type="button" class="icon-btn" data-action="browse-view" data-view="wall" aria-pressed="${view === 'wall'}" aria-label="Poster wall" title="Poster wall">${icon.grid}</button><button type="button" class="icon-btn" data-action="browse-view" data-view="list" aria-pressed="${view === 'list'}" aria-label="List" title="List">${icon.rows}</button></div>
<button type="button" class="btn btn-ghost" data-action="add" data-kind="${kind}">${icon.plus}Add</button>
</div>
</div>
${body}
</div>`;
}

/* ---------- title page ---------- */

function scoreNote(t, auto, own, score) {
  if (!M.hasEpisodes(t)) return score === null ? 'Not rated yet · drag the stars or type a score' : 'Your score';
  const src = auto.from === 'seasons' ? plural(auto.count, 'season score') : plural(auto.count, 'rated episode');
  if (own) return auto.value === null ? 'Your score · no episode rated yet' : `Your score · the average of ${src} is ${auto.value.toFixed(1)}`;
  if (auto.value === null) return 'Rate episodes and the average shows up here, or set your own score';
  return `Auto · average of ${src}`;
}

function watchAction(t) {
  const n = t.views.length;
  if (t.kind === 'game') return '';
  if (n) return `<span class="chip-static">Seen ×${n}</span>`;
  if (t.kind === 'movie') return `<button type="button" class="btn btn-primary" data-action="view-add">${icon.check}Watched</button>`;
  return '';
}

function episodeDetails(s, e) {
  const k = `${s.n}:${e.n}`;
  const id = `${s.n}-${e.n}`;
  return `<div class="ep-details">
<div class="ep-rate"><span class="label">Your score</span>${rater({ key: 'ep:' + k, value: e.score, label: `Score for ${M.epCode(s.n, e.n)}`, size: 'sm' })}</div>
<div class="ep-fields">
<label class="field"><span class="label">Title</span><input id="ep-title-${id}" class="input input-sm" data-ep-field="title" data-ep="${k}" value="${esc(e.title)}" placeholder="Episode ${e.n}" maxlength="300" autocomplete="off"></label>
<label class="field"><span class="label">Aired</span><input id="ep-aired-${id}" type="date" class="input input-sm" data-ep-field="aired" data-ep="${k}" value="${esc(e.aired)}"></label>
${e.watched ? `<label class="field"><span class="label">Watched on</span><input id="ep-watched-${id}" type="date" class="input input-sm" data-ep-field="watched" data-ep="${k}" value="${esc(e.watched)}" required></label>` : ''}
</div>
<label class="field"><span class="label">Note</span><textarea id="note-ep-${id}" class="textarea note-field" rows="2" data-ep-note="${k}" placeholder="What did you think of this one?">${esc(e.note)}</textarea></label>
<div class="ep-foot"><button type="button" class="btn btn-ghost btn-sm btn-danger" data-action="ep-remove" data-ep="${k}">${icon.trash}Remove episode</button></div>
</div>`;
}

function episodeRow(t, s, e, nx, openEp) {
  const k = `${s.n}:${e.n}`;
  const id = `${s.n}-${e.n}`;
  const open = openEp === `${t.id}:${k}`;
  const code = M.epCode(s.n, e.n);
  const isNext = Boolean(nx && nx.ep === e);
  const air = M.airLabel(e);
  return `<li class="ep${e.watched ? ' watched' : ''}${open ? ' open' : ''}${isNext ? ' next' : ''}${M.isAired(e) ? '' : ' upcoming'}" data-key="e-${id}">
<div class="ep-row">
<input type="checkbox" id="chk-${id}" data-ep-check="${k}"${e.watched ? ' checked' : ''} aria-label="Watched ${code}">
<button type="button" class="ep-main" id="ep-${id}" data-action="ep-toggle" data-ep="${k}" aria-expanded="${open}" title="Rate, add a note, edit">
<span class="ep-code">E${M.pad2(e.n)}</span><span class="ep-title" data-ep-label="${k}">${esc(e.title || `Episode ${e.n}`)}</span>${e.note ? `<span class="ep-note-mark" title="Has a note">${icon.note}</span>` : ''}${air ? `<span class="ep-aired">${esc(air)}</span>` : ''}
</button>
${isNext ? '<span class="tag-acc">NEXT</span>' : ''}
<span class="ep-date">${e.watched ? `${icon.checkSm}${esc(M.fmtDate(e.watched))}` : ''}</span>
<span class="ep-score">${typeof e.score === 'number' ? e.score.toFixed(1) : ''}</span>
</div>
${open ? episodeDetails(s, e) : ''}
</li>`;
}

function seasonBody(t, s, nx, openEp) {
  const total = s.episodes.length;
  const allWatched = total > 0 && s.episodes.every((e) => e.watched);
  const avg = M.seasonAverage(s);
  const own = typeof s.score === 'number';
  const rated = s.episodes.filter((e) => e.watched && typeof e.score === 'number').length;
  const note = own
    ? (avg === null ? 'Your score for the season' : `Your score · episode average ${avg.toFixed(1)}`)
    : (avg === null ? 'Rate episodes, or give the whole season a score' : `Auto · average of ${plural(rated, 'rated episode')}`);
  return `<div class="season-body" id="sb-${s.n}">
<div class="season-tools">
<div class="season-rate">${rater({ key: 'season:' + s.n, value: M.seasonScore(s), label: `${M.seasonName(s.n)} score`, size: 'sm' })}${own ? `<button type="button" class="btn btn-dashed btn-sm" data-action="season-score-reset" data-n="${s.n}">Back to average</button>` : ''}<span class="note-line">${esc(note)}</span></div>
<div class="season-actions">
${total ? `<button type="button" class="btn btn-ghost btn-sm" data-action="season-all" data-n="${s.n}"${allWatched ? ' disabled' : ''}>${icon.check}All watched</button>` : ''}
<button type="button" class="btn btn-ghost btn-sm" data-action="ep-add" data-n="${s.n}">${icon.plus}Episode</button>
<button type="button" class="btn btn-ghost btn-sm btn-danger" data-action="season-remove" data-n="${s.n}" title="Remove ${M.seasonName(s.n)}">${icon.trash}<span class="sr">Remove ${M.seasonName(s.n)}</span></button>
</div>
</div>
<label class="sr" for="note-season-${s.n}">Notes on ${M.seasonName(s.n)}</label>
<textarea id="note-season-${s.n}" class="textarea note-field season-note" rows="2" data-season-note="${s.n}" placeholder="Notes on this season">${esc(s.notes)}</textarea>
${total ? `<ol class="eps">${s.episodes.map((e) => episodeRow(t, s, e, nx, openEp)).join('')}</ol>` : '<p class="empty-line">No episodes yet. Use + Episode.</p>'}
</div>`;
}

function seasonBlock(t, s, state, nx) {
  const open = state.ui.openSeasons.has(`${t.id}:${s.n}`);
  const watched = s.episodes.filter((e) => e.watched).length;
  const total = s.episodes.length;
  const sc = M.seasonScore(s);
  const year = M.seasonYear(s);
  return `<div class="season${open ? ' open' : ''}" data-key="s-${s.n}">
<button type="button" class="season-head" id="sh-${s.n}" data-action="season-toggle" data-n="${s.n}" aria-expanded="${open}">
<span class="season-name">${M.seasonName(s.n)}</span>${year ? `<span class="season-year">${esc(year)}</span>` : ''}${t.newSeason === s.n ? '<span class="tag-acc">NEW</span>' : ''}
<span class="season-stats">${sc !== null ? `<span class="season-avg">${icon.star}${sc.toFixed(1)}${typeof s.score === 'number' ? '' : ' avg'}</span>` : ''}<span>${watched}/${total}</span>${icon.chevron}</span>
</button>
${open ? seasonBody(t, s, nx, state.ui.openEp) : ''}
</div>`;
}

function seasonsSection(t, state) {
  const p = M.progress(t);
  const nx = M.nextEpisode(t);
  const last = t.seasons[t.seasons.length - 1];
  const nextN = last ? last.n + 1 : 1;
  const count = last && last.episodes.length ? last.episodes.length : 10;
  const formOpen = state.ui.addSeasonOpen || !t.seasons.length;
  const form = formOpen
    ? `<form class="add-season" data-form="add-season" data-key="add-season-form" autocomplete="off">
<span class="label">New season</span>
<label class="mini-field">Season <input id="season-n" name="n" type="number" class="input input-xs" min="0" max="999" value="${nextN}" data-keep></label>
<label class="mini-field">Episodes <input id="season-count" name="count" type="number" class="input input-xs" min="0" max="500" value="${count}" data-keep></label>
<button type="submit" class="btn btn-primary btn-sm">${icon.plus}Add season</button>
${t.seasons.length ? '<button type="button" class="btn btn-ghost btn-sm" data-action="season-form" data-open="0">Cancel</button>' : ''}
</form>`
    : `<button type="button" class="btn btn-dashed add-line" data-action="season-form" data-open="1" data-key="add-season-btn">${icon.plus}Season</button>`;
  return `<section class="sec" aria-labelledby="h-seasons">
<div class="sec-head"><h2 class="h2" id="h-seasons"><span class="sq" aria-hidden="true"></span>Seasons</h2><span class="head-count">${p.total ? `${p.watched} of ${plural(p.total, 'episode')} watched` : ''}</span></div>
${t.seasons.length ? `<div class="seasons">${t.seasons.map((s) => seasonBlock(t, s, state, nx)).join('')}</div>` : '<p class="empty-line">No seasons yet. Add them by hand; the web scan will fill them in for you in the next update.</p>'}
${form}
</section>`;
}

function gameSection(t) {
  const plats = [...new Set([...(t.available.length ? t.available : M.GAME_PLATFORMS), ...t.platforms])];
  const mark = (key, label) => {
    const on = t.game[key];
    return `<button type="button" class="mark${on ? ' on' : ''}" data-action="game-mark" data-mark="${key}" aria-pressed="${Boolean(on)}">${icon.check}<span class="mark-text"><b>${label}</b><small>${on ? 'Done ' + esc(M.fmtDate(on, true)) : 'Not yet'}</small></span></button>`;
  };
  return `<section class="sec" aria-labelledby="h-progress">
<div class="sec-head"><h2 class="h2" id="h-progress"><span class="sq" aria-hidden="true"></span>Progress</h2></div>
<div class="marks">${mark('story', 'Story')}${mark('full', '100%')}</div>
<div class="field"><span class="label" id="lbl-played">Played on</span>
<div class="chips" role="group" aria-labelledby="lbl-played">${plats.map((p) => `<button type="button" class="chip chip-sm" data-action="game-platform" data-p="${esc(p)}" aria-pressed="${t.platforms.includes(p)}">${esc(p)}</button>`).join('')}</div>
<form class="inline-form inline-narrow" data-form="game-plat-add" autocomplete="off"><label class="sr" for="plat-other">Other platform</label><input id="plat-other" name="name" class="input input-sm" placeholder="Other platform" maxlength="40" data-keep><button type="submit" class="btn btn-dashed btn-sm">${icon.plus}Add</button></form>
</div>
</section>`;
}

function castSection(t) {
  if (!t.cast.length) return '';
  return `<section class="sec" aria-labelledby="h-cast">
<div class="sec-head"><h2 class="h2" id="h-cast"><span class="sq" aria-hidden="true"></span>Cast</h2></div>
<div class="row">${t.cast.map((c) => `<button type="button" class="cast-card" data-action="search-for" data-q="${esc(c.name)}" title="Find ${esc(c.name)} in your list"><span class="avatar" style="background:${M.artFor({ title: c.name })}" aria-hidden="true">${esc(M.initials(c.name))}</span><span class="cast-name">${esc(c.name)}</span>${c.role ? `<span class="cast-role">${esc(c.role)}</span>` : ''}</button>`).join('')}</div>
</section>`;
}

function notesSection(t, state) {
  const on = state.settings.spoiler;
  return `<section class="sec" aria-labelledby="h-notes">
<div class="sec-head"><h2 class="h2" id="h-notes"><span class="sq" aria-hidden="true"></span>Your notes</h2><button type="button" class="btn btn-ghost btn-sm" data-action="spoiler" aria-pressed="${on}">${icon.eyeOff}${on ? 'Spoilers hidden' : 'Hide spoilers'}</button></div>
<div class="notes-box"><label class="sr" for="note-title">Your notes</label><textarea id="note-title" class="textarea note-field note-main" rows="5" data-field="notes" placeholder="What did you think? Favorite moments, theories, quotes…">${esc(t.notes)}</textarea>${on && t.notes ? '<span class="spoiler-tag" aria-hidden="true">Click to reveal</span>' : ''}</div>
</section>`;
}

function providersPanel(t, state) {
  const game = t.kind === 'game';
  const seen = M.live(state.titles).filter((x) => (x.kind === 'game') === game).flatMap((x) => x.providers.map((p) => p.name));
  const known = [...new Set([...(game ? M.STORES : M.STREAMING), ...seen])];
  return `<section class="panel" aria-labelledby="h-watch">
<div class="panel-head"><h2 class="panel-title" id="h-watch">${game ? 'Where to buy' : 'Where to watch'}</h2><span class="panel-sub">Canada</span></div>
${t.providers.length ? `<div class="chips">${t.providers.map((p) => `<span class="chip-x">${p.url ? `<a class="chip-x-label chip-x-link" href="${esc(p.url)}" target="_blank" rel="noopener" title="Open ${esc(p.name)}">${esc(p.name)} ↗</a>` : `<span class="chip-x-label">${esc(p.name)}</span>`}<button type="button" class="x-btn" data-action="prov-remove" data-name="${esc(p.name)}" aria-label="Remove ${esc(p.name)}">${icon.x}</button></span>`).join('')}</div>` : ''}
<form class="inline-form" data-form="prov-add" autocomplete="off"><label class="sr" for="prov-input">Add a platform</label><input id="prov-input" name="name" class="input input-sm" list="prov-list" placeholder="${game ? 'Steam, PS Store…' : 'Netflix, Crave…'}" maxlength="60" data-keep><button type="submit" class="btn btn-dashed btn-sm">${icon.plus}Add</button></form>
<datalist id="prov-list">${options(known)}</datalist>
${t.rawgId ? `<p class="credit">Game data: <a class="watch-link" href="https://rawg.io/games/${esc(t.rawgSlug || String(t.rawgId))}" target="_blank" rel="noopener">RAWG ↗</a></p>` : ''}
${t.providers.some((p) => p.source === 'tmdb') || t.watchLink ? `<p class="credit">Streaming data: JustWatch${t.watchLink ? ` · <a class="watch-link" href="${esc(t.watchLink)}" target="_blank" rel="noopener">See offers ↗</a>` : ''}</p>` : ''}
</section>`;
}

function viaPanel(t, state) {
  const names = [...new Set(M.live(state.titles).map((x) => x.via).filter(Boolean))];
  return `<section class="panel" aria-labelledby="h-rec">
<h2 class="panel-title" id="h-rec">Recommended by</h2>
<div class="via">${t.via ? `<span class="avatar avatar-sm" aria-hidden="true">${esc(M.initials(t.via))}</span>` : ''}<label class="sr" for="via-input">Who recommended it</label><input id="via-input" class="input input-sm" data-field="via" value="${esc(t.via)}" placeholder="A friend's name" list="via-list" maxlength="60" autocomplete="off"></div>
<datalist id="via-list">${options(names)}</datalist>
</section>`;
}

function viewsPanel(t) {
  const n = t.views.length;
  const firstEp = M.hasEpisodes(t) ? M.episodes(t).map((x) => x.ep.watched).filter(Boolean).sort()[0] : null;
  const sub = n ? `Last ${M.fmtDate(t.views[n - 1].date, true)}` : firstEp ? `Started ${M.fmtDate(firstEp, true)}` : 'Not seen yet';
  return `<section class="panel" aria-labelledby="h-views">
<h2 class="panel-title" id="h-views">Watch count</h2>
<div class="count-row"><span class="big-count">×${n}</span><span class="panel-sub">${esc(sub)}</span></div>
${n ? `<ol class="views">${t.views.map((v, i) => `<li><span>${esc(M.fmtDate(v.date, true))}</span><button type="button" class="x-btn" data-action="view-remove" data-i="${i}" aria-label="Remove the viewing of ${esc(M.fmtDate(v.date, true))}">${icon.x}</button></li>`).join('')}</ol>` : ''}
<button type="button" class="btn btn-ghost btn-sm" data-action="view-add">${icon.plus}${n ? 'Seen again' : 'Seen it'}</button>
</section>`;
}

function tagsPanel(t, state) {
  const known = [...new Set(M.live(state.titles).flatMap((x) => x.tags))].filter((x) => !t.tags.includes(x));
  return `<section class="panel" aria-labelledby="h-tags">
<h2 class="panel-title" id="h-tags">Tags</h2>
${t.tags.length ? `<div class="chips">${t.tags.map((tag) => `<span class="chip-x"><button type="button" class="chip-link" data-action="search-for" data-q="${esc(tag)}">#${esc(tag)}</button><button type="button" class="x-btn" data-action="tag-remove" data-tag="${esc(tag)}" aria-label="Remove the tag ${esc(tag)}">${icon.x}</button></span>`).join('')}</div>` : ''}
<form class="inline-form" data-form="tag-add" autocomplete="off"><label class="sr" for="tag-input">Add tags, separated by commas</label><input id="tag-input" name="tags" class="input input-sm" list="tag-list" placeholder="${t.tags.length ? 'Add a tag' : 'comfort, slow-burn'}" maxlength="120" data-keep><button type="submit" class="btn btn-dashed btn-sm">${icon.plus}Tag</button></form>
<datalist id="tag-list">${options(known)}</datalist>
</section>`;
}

export function historyPanel(entries) {
  const body = !entries
    ? '<p class="panel-sub">Loading…</p>'
    : !entries.length ? '<p class="panel-sub">Nothing yet.</p>'
      : `<ol class="timeline">${entries.map((h) => `<li data-key="h-${h.seq}"><span class="when">${esc(M.fmtDate(h.at))}</span><span>${esc(h.text)}</span></li>`).join('')}</ol>`;
  return `<section class="panel" id="history-panel" aria-labelledby="h-history"><h2 class="panel-title" id="h-history">History</h2>${body}</section>`;
}

function scanButton(t, state) {
  if (state.ui.rescanning === t.id) return `<button type="button" class="btn btn-line" disabled>${icon.radar}Scanning…</button>`;
  const linked = t.kind === 'game' ? t.rawgId : t.tmdbId;
  const source = t.kind === 'game' ? 'RAWG' : 'TMDB';
  return `<button type="button" class="btn btn-line" data-action="rescan" title="${linked ? `Refresh from ${source}` : `Find it on ${source} and fill in the rest`}">${icon.radar}${linked ? 'Rescan' : 'Scan'}</button>`;
}

export function titleView(state, t) {
  const series = M.hasEpisodes(t);
  const p = M.progress(t);
  const score = M.effectiveScore(t);
  const auto = series ? M.autoScore(t) : null;
  const own = series && typeof t.score === 'number';
  const meta = [M.KIND_LABEL[t.kind], t.year, series && t.seasons.length ? plural(t.seasons.length, 'season') : '', series && p.total ? plural(p.total, 'episode') : ''].filter(Boolean).join(' · ');
  return `<div class="title-page" data-key="tp-${esc(t.id)}">
<div class="backdrop" style="--art:${M.heroArt(t)}" aria-hidden="true">${t.backdrop ? `<img src="${esc(t.backdrop)}" alt="" referrerpolicy="no-referrer">` : ''}<span class="backdrop-shade"></span><span class="scanlines"></span><span class="scanbeam"></span></div>
<nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="#/">Home</a></li><li aria-hidden="true">/</li><li><a href="#/${M.KIND_PATH[t.kind]}">${M.KIND_TAB[t.kind]}</a></li><li aria-hidden="true">/</li><li aria-current="page">${esc(t.title)}</li></ol></nav>
<div class="page title-main">
<section class="t-head" aria-labelledby="t-title">
<div class="t-poster">${poster(t, { big: true })}<span class="corner c-bl" aria-hidden="true"></span><span class="corner c-tr" aria-hidden="true"></span></div>
<div class="t-info">
<p class="t-meta">${esc(meta)}</p>
<div class="titles"><h1 class="display" id="t-title">${esc(t.title)}</h1>${t.titleQc ? `<p class="qc">${esc(t.titleQc)}</p>` : ''}</div>
${t.genres.length ? `<div class="chips">${t.genres.map((g) => `<button type="button" class="chip chip-sm" data-action="search-for" data-q="${esc(g)}">${esc(g)}</button>`).join('')}</div>` : ''}
${t.overview ? `<p class="overview">${esc(t.overview)}</p>` : ''}
<div class="rating">
<div class="rating-row">${rater({ key: 'title', value: score, label: series ? 'Series score' : 'Your score' })}${own ? '<button type="button" class="btn btn-dashed" data-action="score-reset">Back to average</button>' : ''}</div>
<p class="note-line">${esc(scoreNote(t, auto, own, score))}</p>
</div>
<div class="actions">
<label class="sr" for="status-sel">Status</label>
<select id="status-sel" class="select" data-field="status">${M.STATUSES.map((s) => `<option value="${s}"${s === t.status ? ' selected' : ''}>${M.STATUS_LABEL[s]}</option>`).join('')}</select>
${watchAction(t)}
<button type="button" class="icon-btn fav-btn" data-action="fav" aria-pressed="${t.fav}" aria-label="Favorite" title="${t.fav ? 'In your favorites' : 'Add to favorites'}">${t.fav ? icon.heartOn : icon.heart}</button>
<button type="button" class="btn btn-ghost" data-action="edit">${icon.edit}Edit</button>
${scanButton(t, state)}
</div>
</div>
</section>
<div class="cols">
<div class="col-main">
${series ? seasonsSection(t, state) : ''}${t.kind === 'game' ? gameSection(t) : ''}${castSection(t)}${notesSection(t, state)}
</div>
<aside class="col-aside" aria-label="Details">
${providersPanel(t, state)}${viaPanel(t, state)}${t.kind === 'game' ? '' : viewsPanel(t)}${tagsPanel(t, state)}${historyPanel(state.history[t.id])}
<div class="aside-foot"><span>Added ${esc(M.fmtDate(t.createdAt, true))}${t.scannedAt ? ` · scanned ${esc(M.fmtDate(t.scannedAt))}` : ''}</span><button type="button" class="btn btn-ghost btn-sm btn-danger" data-action="trash">${icon.trash}Move to trash</button></div>
</aside>
</div>
</div>
</div>`;
}

/* ---------- settings ---------- */

function keyField(name, label, hint, link, value) {
  const id = 'set-' + name;
  return `<div class="key-field"><label class="label" for="${id}">${label}</label>
<div class="key-row"><input id="${id}" class="input secret" data-setting="${name}" value="${esc(value)}" placeholder="${hint}" autocomplete="off" spellcheck="false" autocapitalize="off"><button type="button" class="btn btn-ghost btn-sm" data-action="reveal" data-for="${id}">Show</button></div>
<a class="small-link" href="${link}" target="_blank" rel="noopener">Where to get it ↗</a></div>`;
}

function installBlock(state) {
  if (state.standalone) return '<p class="set-text">Rewinder is installed on this computer. Open it from the Start menu or the taskbar.</p>';
  if (state.canInstall) return `<p class="set-text">Install Rewinder to open it like any other app, in its own window.</p><div class="actions"><button type="button" class="btn btn-primary" data-action="install">${icon.install}Install Rewinder</button></div>`;
  return '<p class="set-text">To install Rewinder as an app, open your browser menu and choose <b>Install Rewinder</b> (Chrome, Edge, Brave). In Chrome you can also click the install icon at the right end of the address bar.</p>';
}

export function settingsView(state) {
  const s = state.settings;
  const trashed = state.titles.filter((t) => t.deletedAt).sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  const isPreset = M.PRESETS.some((p) => p.color.toLowerCase() === String(s.accent).toLowerCase());
  const daysLeft = (t) => Math.max(0, M.TRASH_DAYS - Math.floor((Date.now() - Date.parse(t.deletedAt)) / 864e5));
  return `<div class="page page-settings">
<div class="page-head"><div class="titles"><span class="eyebrow">// Your setup</span><h1 class="display display-md">Settings</h1></div></div>
<div class="settings">

<section class="set-sec" aria-labelledby="set-look"><h2 class="h2" id="set-look"><span class="sq" aria-hidden="true"></span>Look</h2>
<div class="set-row"><span class="label" id="lbl-accent">Color</span>
<div class="swatches" role="group" aria-labelledby="lbl-accent">${M.PRESETS.map((p) => `<button type="button" class="swatch" data-action="accent" data-color="${p.color}" aria-pressed="${p.color.toLowerCase() === String(s.accent).toLowerCase()}" style="--sw:${p.color}"><span class="sw-dot" aria-hidden="true"></span>${p.name}</button>`).join('')}<label class="swatch swatch-custom${isPreset ? '' : ' on'}" style="--sw:${isPreset ? '#5A6360' : esc(s.accent)}"><span class="sw-dot" aria-hidden="true"></span>Custom<input type="color" id="accent-custom" value="${esc(s.accent)}" data-setting="accent" aria-label="Custom color"></label></div>
</div>
<div class="set-row"><label class="switch"><input type="checkbox" role="switch" id="set-scan" data-setting="scanlines"${s.scanlines ? ' checked' : ''}><span class="switch-ui" aria-hidden="true"></span>Scanlines</label><span class="panel-sub">The faint screen lines on banners.</span></div>
</section>

<section class="set-sec" aria-labelledby="set-keys"><h2 class="h2" id="set-keys"><span class="sq" aria-hidden="true"></span>Web search keys</h2>
<p class="set-text">The Scan uses free keys from TMDB (movies, TV shows, anime) and RAWG (games). Each person uses their own. Keys stay in this browser and never go into backups. Without keys, everything still works by hand.</p>
<p class="set-text dim">If rawg.io or themoviedb.org is down, the Scan says so: try again later, or add by hand.</p>
${keyField('tmdbKey', 'TMDB key', 'API key or API read access token', 'https://www.themoviedb.org/settings/api', s.tmdbKey)}
${keyField('rawgKey', 'RAWG key', 'API key', 'https://rawg.io/apidocs', s.rawgKey)}
</section>

<section class="set-sec" aria-labelledby="set-backup"><h2 class="h2" id="set-backup"><span class="sq" aria-hidden="true"></span>Backup</h2>
<p class="set-text">Your list lives only in this browser. Download a backup now and then, and keep it somewhere safe, like a cloud folder. A backup also moves your list to another computer.</p>
${needsBackup(state) ? `<p class="reminder">${icon.download}<span>${s.lastBackupAt ? `Last backup ${esc(M.fmtDate(s.lastBackupAt, true))} · ${plural(s.changesSinceBackup || 0, 'change')} since.` : 'No backup yet.'} Time for one.</span><button type="button" class="link-btn" data-action="backup-later">Later</button></p>` : `<p class="panel-sub">${s.lastBackupAt ? `Last backup ${esc(M.fmtDate(s.lastBackupAt, true))} · ${plural(s.changesSinceBackup || 0, 'change')} since` : 'No backup yet'}</p>`}
<div class="actions"><button type="button" class="btn btn-primary" data-action="export">${icon.download}Download backup</button><button type="button" class="btn btn-ghost" data-action="import">${icon.upload}Restore a backup</button></div>
</section>

<section class="set-sec" aria-labelledby="set-trash"><h2 class="h2" id="set-trash"><span class="sq" aria-hidden="true"></span>Trash<span class="count">${trashed.length}</span></h2>
<p class="set-text">Deleted titles wait here for ${M.TRASH_DAYS} days, then they're gone for good.</p>
${trashed.length ? `<ul class="trash">${trashed.map((t) => `<li data-key="tr-${esc(t.id)}"><span class="tt"><span class="tt-main">${esc(t.title)}</span><span class="tt-sub">${M.KIND_LABEL[t.kind]} · deleted ${esc(M.fmtDate(t.deletedAt))} · ${plural(daysLeft(t), 'day')} left</span></span><span class="actions"><button type="button" class="btn btn-ghost btn-sm" data-action="restore" data-id="${esc(t.id)}">Restore</button><button type="button" class="btn btn-ghost btn-sm btn-danger" data-action="purge" data-id="${esc(t.id)}">Delete forever</button></span></li>`).join('')}</ul>` : '<p class="panel-sub">Empty.</p>'}
</section>

<section class="set-sec" aria-labelledby="set-app"><h2 class="h2" id="set-app"><span class="sq" aria-hidden="true"></span>App</h2>
${installBlock(state)}
<p class="panel-sub">${state.persisted ? 'Storage: protected, the browser will not clear your list on its own.' : 'Storage: standard. Install the app and keep backups to be safe.'}</p>
</section>

<section class="set-sec" aria-labelledby="set-credits"><h2 class="h2" id="set-credits"><span class="sq" aria-hidden="true"></span>Credits</h2>
<ul class="credits">
<li>This product uses the TMDB API but is not endorsed or certified by TMDB. <a href="https://www.themoviedb.org" target="_blank" rel="noopener">themoviedb.org</a></li>
<li>Game data comes from <a href="https://rawg.io" target="_blank" rel="noopener">RAWG</a>.</li>
<li>Anime genres come from <a href="https://anilist.co" target="_blank" rel="noopener">AniList</a>.</li>
<li>Where to watch: data by JustWatch, through TMDB.</li>
<li>Fonts: Chakra Petch, Inter and JetBrains Mono, under the SIL Open Font License.</li>
</ul>
<p class="panel-sub">Rewinder v${M.APP_VERSION}</p>
</section>

</div>
</div>`;
}

/* ---------- other screens and dialogs ---------- */

export const notFoundView = () => `<div class="page"><div class="empty-box"><span class="eyebrow">// Signal lost</span><h1 class="display display-md">Not found</h1><p class="lead">This title isn't in your list anymore.</p><a class="btn btn-primary" href="#/">Back home</a></div></div>`;

export const errorView = (message) => `<div class="page"><div class="empty-box"><span class="eyebrow">// Storage offline</span><h1 class="display display-md">Can't open your list</h1><p class="lead">${esc(message)}</p><p class="set-text">If this is a private or incognito window, open Rewinder in a normal window.</p></div></div>`;

const kindPicker = (selected) => `<fieldset class="seg"><legend class="label">Category</legend><div class="seg-opts">${M.KINDS.map((k) => `<label class="seg-opt"><input type="radio" name="kind" value="${k}"${k === selected ? ' checked' : ''}><span>${M.KIND_LABEL[k]}</span></label>`).join('')}</div></fieldset>`;

export function addDialog(kind, { title = '', noKey = false } = {}) {
  const note = noKey && kind !== 'game'
    ? 'Tip: add your TMDB key in Settings and the Scan fills in posters, episodes and cast for you.'
    : kind === 'game' && noKey
      ? 'Tip: add your RAWG key in Settings and the Scan fills in games for you.'
      : 'Add it by hand. Later, Scan on its page can fill in the rest.';
  return `<form class="dlg-form" data-form="add" novalidate autocomplete="off">
<div class="dlg-head"><span class="eyebrow">// Manual add</span><h2 class="dlg-title" id="dlg-title">Add a title</h2></div>
<p class="dlg-note">${esc(note)}</p>
${kindPicker(M.KINDS.includes(kind) ? kind : 'movie')}
<label class="field"><span class="label">Title</span><input id="add-title" class="input" name="title" maxlength="300" value="${esc(title)}" required></label>
<p class="dup" id="add-dup" hidden></p>
<div class="field-row">
<label class="field"><span class="label">Year <span class="opt">optional</span></span><input class="input" name="year" type="number" min="1870" max="2100" placeholder="2024"></label>
<label class="field"><span class="label">Status</span><select class="select" name="status">${M.STATUSES.map((s) => `<option value="${s}"${s === 'watchlist' ? ' selected' : ''}>${M.STATUS_LABEL[s]}</option>`).join('')}</select></label>
</div>
<div class="field-row only-series">
<label class="field"><span class="label">Seasons</span><input class="input" name="seasons" type="number" min="0" max="60" value="1"></label>
<label class="field"><span class="label">Episodes per season</span><input class="input" name="eps" type="number" min="0" max="500" value="12"></label>
</div>
<label class="field"><span class="label">Québec title <span class="opt">optional</span></span><input class="input" name="titleQc" maxlength="300"></label>
<p class="dlg-error" id="add-error" role="alert" hidden></p>
<div class="dlg-actions"><button type="button" class="btn btn-ghost" data-action="dlg-close">Cancel</button><button type="submit" class="btn btn-primary">${icon.plus}Add</button></div>
</form>`;
}

export function editDialog(t) {
  return `<form class="dlg-form" data-form="edit" novalidate autocomplete="off">
<div class="dlg-head"><span class="eyebrow">// Edit info</span><h2 class="dlg-title" id="dlg-title">${esc(t.title)}</h2></div>
${kindPicker(t.kind)}
<label class="field"><span class="label">Title</span><input id="edit-title" class="input" name="title" value="${esc(t.title)}" maxlength="300" required></label>
<label class="field"><span class="label">Québec title <span class="opt">optional</span></span><input class="input" name="titleQc" value="${esc(t.titleQc)}" maxlength="300"></label>
<div class="field-row">
<label class="field field-narrow"><span class="label">Year</span><input class="input" name="year" type="number" min="1870" max="2100" value="${t.year ?? ''}"></label>
<label class="field"><span class="label">Genres <span class="opt">separated by commas</span></span><input class="input" name="genres" value="${esc(t.genres.join(', '))}" placeholder="Drama, Sci-Fi"></label>
</div>
<label class="field"><span class="label">Cast <span class="opt">separated by commas</span></span><input class="input" name="cast" value="${esc(t.cast.map((c) => c.name).join(', '))}" placeholder="Actor names"></label>
<label class="field"><span class="label">Summary <span class="opt">optional</span></span><textarea class="textarea" name="overview" rows="3">${esc(t.overview)}</textarea></label>
<p class="dlg-error" id="edit-error" role="alert" hidden></p>
<div class="dlg-actions"><button type="button" class="btn btn-ghost" data-action="dlg-close">Cancel</button><button type="submit" class="btn btn-primary">${icon.check}Save</button></div>
</form>`;
}

export function confirmDialog({ title, body, yes = 'Confirm', danger = false }) {
  return `<div class="dlg-form">
<div class="dlg-head"><h2 class="dlg-title" id="dlg-title">${esc(title)}</h2></div>
<p class="dlg-text">${esc(body)}</p>
<div class="dlg-actions"><button type="button" class="btn btn-ghost" data-action="confirm-no">Cancel</button><button type="button" class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'}" data-action="confirm-yes">${esc(yes)}</button></div>
</div>`;
}

/* ---------- scan ---------- */

export function scanResults(scan, titles) {
  if (scan.busy) return `<div class="scan-wait"><span class="scan-line" aria-hidden="true"></span>${icon.radar}<span>${esc(scan.busy)}</span></div>`;
  if (scan.error) return `<p class="dlg-error scan-msg">${esc(scan.error)}</p>`;
  const notes = (scan.notes || []).map((n) => `<p class="scan-note">${esc(n)}</p>`).join('');
  if (scan.loading) return '<p class="scan-hint">Searching…</p>';
  if (scan.query.trim().length < 2) return `<p class="scan-hint">Type a title. Results come from ${scan.sources.map((x) => x.toUpperCase()).join(' and ')}.</p>`;
  if (!scan.results.length) return `${notes}<p class="scan-hint">Nothing found.${scan.mode === 'link' ? ' Try another spelling.' : ' Try another spelling, or add it by hand.'}</p>`;
  return `${notes}<ul class="scan-list">${scan.results.map((r) => {
    const mine = titles.find((t) => !t.deletedAt && t.id !== scan.linkId && (r.type === 'game' ? t.rawgId === r.id : t.tmdbId === r.id && t.tmdbType === r.type));
    const sub = [M.KIND_LABEL[r.kind], r.year, r.original].filter(Boolean).join(' · ');
    return `<li><button type="button" class="scan-item" data-action="scan-pick" data-type="${r.type}" data-id="${r.id}"${mine ? ` data-open="${esc(mine.id)}"` : ''}>
<span class="scan-thumb" style="background:${M.artFor({ title: r.title })}" aria-hidden="true">${r.poster ? `<img src="${esc(r.poster)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</span>
<span class="scan-info"><span class="scan-title">${esc(r.title)}</span><span class="scan-sub">${esc(sub)}</span></span>${mine ? '<span class="tag-soft">In your list</span>' : ''}
</button></li>`;
  }).join('')}</ul>`;
}

export function scanDialog(scan, titles) {
  const link = scan.mode === 'link';
  return `<div class="dlg-form scan" data-scan>
<div class="dlg-head"><span class="eyebrow">// Scan</span><h2 class="dlg-title" id="dlg-title">${link ? `Find ${esc(scan.linkTitle)}` : 'Add a title'}</h2></div>
${link ? '<p class="dlg-note">Pick the right one: posters, episodes, dates and cast fill in. Your checks, scores and notes stay.</p>' : ''}
<form class="scan-bar" data-form="scan-search" role="search" autocomplete="off">
<div class="search scan-search">${icon.search}<label class="sr" for="scan-q">Search</label><input id="scan-q" type="search" name="q" value="${esc(scan.query)}" placeholder="${scan.sources.includes('tmdb') && scan.sources.includes('rawg') ? 'Movie, TV show, anime or game' : scan.sources.includes('rawg') ? 'Game' : 'Movie, TV show or anime'}" spellcheck="false"></div>
${link ? '' : `<label class="sr" for="scan-status">Status</label><select id="scan-status" class="select" name="status">${M.STATUSES.map((s) => `<option value="${s}"${s === scan.status ? ' selected' : ''}>${M.STATUS_LABEL[s]}</option>`).join('')}</select>`}
</form>
<div class="scan-results" id="scan-results" aria-live="polite">${scanResults(scan, titles)}</div>
<div class="dlg-actions scan-foot"><span class="scan-credit">Search by ${scan.sources.map((x) => x === 'tmdb' ? '<a href="https://www.themoviedb.org" target="_blank" rel="noopener">TMDB</a>' : '<a href="https://rawg.io" target="_blank" rel="noopener">RAWG</a>').join(' · ')}</span><span class="actions">${link ? '' : '<button type="button" class="btn btn-dashed" data-action="scan-manual">Add it by hand</button>'}<button type="button" class="btn btn-ghost" data-action="dlg-close">Close</button></span></div>
</div>`;
}
