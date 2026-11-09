// Rewinder — screens. Each function returns HTML; every piece of user text goes through esc().
import * as M from './model.js';
import * as L from './importer.js';
import { esc, icon, rater, miniStars, corners, visor, poster, statusDot } from './ui.js';

const tHref = (t) => `#/title/${encodeURIComponent(t.id)}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const SORTS = [['recent', 'Recent activity'], ['title', 'Title A–Z'], ['score', 'Best score'], ['year', 'Newest']];
const sortOptions = (cur) => SORTS.map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${l}</option>`).join('');
const A_KIND = { movie: 'a movie', tv: 'a TV show', anime: 'an anime', game: 'a game' };
const KIND_PLURAL = { movie: 'movies', tv: 'TV shows', anime: 'anime', game: 'games' };
const KIND_ONE = { movie: 'movie', tv: 'TV show', anime: 'anime', game: 'game' };
const byActivity = (a, b) => M.activity(b).localeCompare(M.activity(a));
const options = (list) => list.map((v) => `<option value="${esc(v)}"></option>`).join('');

/* ---------- frame ---------- */

const friendCount = (n) => `${n} card${n === 1 ? '' : 's'}`;

function nick(name, size = '') {
  return `<span class="nick${size ? ' nick-' + size : ''}" style="background:${M.artFor({ title: name })}" aria-hidden="true">${esc(M.initials(name))}</span>`;
}

// A small segmented ring for a percentage (36 segments around, like the big one).
function ring(pct, r, width) {
  const c = 2 * Math.PI * r;
  const unit = c / 36;
  const seg = unit * 0.8;
  const lit = Math.round((pct / 100) * 36);
  const parts = [];
  for (let i = 0; i < lit; i++) parts.push(seg.toFixed(2), i === lit - 1 ? c.toFixed(0) : (unit - seg).toFixed(2));
  const box = (r + width) * 2;
  return `<svg class="ring" aria-hidden="true" focusable="false" width="${box}" height="${box}" viewBox="0 0 ${box} ${box}"><circle cx="${box / 2}" cy="${box / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,.13)" stroke-width="${width}" stroke-dasharray="${seg.toFixed(2)} ${(unit - seg).toFixed(2)}"/>${lit ? `<circle cx="${box / 2}" cy="${box / 2}" r="${r}" fill="none" style="stroke:var(--accent)" stroke-width="${width}" stroke-dasharray="${parts.join(' ')}"/>` : ''}</svg>`;
}

const asks = (state) => (state.live ? state.live.incoming.length : 0);
const asksLabel = (state) => (asks(state) ? `, ${asks(state)} friend request${asks(state) === 1 ? '' : 's'}` : '');

function friendsButton(state) {
  const n = state.friends.length;
  const open = state.ui.friendsOpen;
  const dot = state.ui.cardStale || asks(state);
  return `<div class="friends-wrap">
<button type="button" class="icon-btn friends-btn" id="friends-btn" data-action="friends-toggle" aria-expanded="${open}" aria-controls="friends-pop" aria-label="Friends${n ? ', ' + friendCount(n) : ''}${asksLabel(state)}${state.ui.cardStale ? ', your card changed since you shared it' : ''}" title="${asks(state) ? 'Friends · someone wants to be friends' : state.ui.cardStale ? 'Friends · your card changed, share it again' : 'Friends'}">${icon.bust}${n ? `<span class="count-badge" aria-hidden="true">${n}</span>` : ''}${dot ? '<span class="ping ping-card" aria-hidden="true"></span>' : ''}</button>
${open ? `<div class="sheet-scrim" data-action="friends-toggle" aria-hidden="true"></div>${friendsPanel(state)}` : ''}
</div>`;
}

// Phones: the sections live under the thumb.
export function tabbar(state) {
  const r = state.route;
  const n = state.friends.length;
  const on = (yes) => (yes ? ' aria-current="page"' : '');
  return `<nav class="tabbar" aria-label="Sections">
<a class="tab" href="#/"${on(r.name === 'home')}>${icon.home}<span>Home</span></a>
<a class="tab" href="#/all"${on(r.name === 'browse')}>${icon.grid}<span>All</span></a>
<button type="button" class="tab tab-scan" data-action="add">${icon.radar}<span>Scan</span></button>
<a class="tab" href="#/list"${on(r.name === 'list')}>${icon.rows}<span>List</span></a>
<button type="button" class="tab" data-action="friends-toggle" aria-expanded="${state.ui.friendsOpen}" aria-label="Friends${n ? ', ' + friendCount(n) : ''}${asksLabel(state)}${state.ui.cardStale ? ', your card changed since you shared it' : ''}"${on(r.name === 'friend')}>${icon.bust}<span>Friends</span>${n ? `<span class="count-badge" aria-hidden="true">${n}</span>` : ''}${state.ui.cardStale || asks(state) ? '<span class="ping ping-card" aria-hidden="true"></span>' : ''}</button>
</nav>`;
}

const liveReady = (state) => Boolean(state.settings.liveName && state.settings.liveSecret && state.settings.liveHost && state.settings.liveHost === state.liveServer);
const ago = (iso) => {
  const t = Date.parse(iso || '');
  if (!t) return '';
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 2) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return M.fmtDate(iso);
};

function friendsPanel(state) {
  const name = state.settings.cardName || '';
  const mine = M.live(state.titles).length;
  const live = liveReady(state);
  const L = state.live || { incoming: [], outgoing: [], error: '' };
  const rows = state.friends.map((f) => {
    const c = M.compareCard(state.titles, f);
    const pct = c.agreement;
    const when = f.live ? `<span class="fp-live">live</span> · updated ${esc(ago(f.at))}` : `card from ${esc(M.fmtDate(f.at))}`;
    return `<li><a class="fp-row" href="#/friend/${encodeURIComponent(f.id)}" aria-label="${esc(`${f.name}, ${pct === null ? 'no shared scores yet' : pct + '% agreement'}, compare`)}">${nick(f.name)}<span class="fp-who"><span class="fp-name">${esc(f.name)}</span><span class="fp-meta">${f.alias ? esc(f.alias) + ' · ' : ''}${f.titles.length} titles · ${when}</span></span><span class="fp-pct" aria-hidden="true">${ring(pct || 0, 14, 3)}<span>${pct === null ? '—' : pct + '%'}</span></span></a></li>`;
  }).join('');
  const sent = state.settings.liveAt ? `Your card is up to date for your friends (${esc(ago(state.settings.liveAt))}).` : 'Your card goes to your friends in a moment.';
  const mineBlock = live
    ? `<div class="fp-mine">
<div class="fp-me">${nick(name || state.settings.liveName)}<span class="fp-who"><span class="fp-me-title">${esc(state.settings.liveName)}</span><span class="fp-meta">${esc(name || state.settings.liveName)} · ${mine} titles</span></span></div>
<p class="fp-note">${sent} Your scores, statuses, favorites and tags. Never your notes.</p>
${L.error ? `<p class="fp-stale">${esc(L.error)}${L.out ? ' <button type="button" class="inline-link" data-action="live-settings">Settings</button>' : ''}</p>` : ''}
<form class="fp-add" data-form="live-add" autocomplete="off"><label class="label" for="live-who">Add a friend by name</label><div class="fp-add-row"><input id="live-who" name="who" class="input input-sm" maxlength="24" placeholder="Their Rewinder name" autocomplete="off" spellcheck="false" autocapitalize="off" enterkeyhint="send"><button type="submit" class="btn btn-primary btn-sm">Ask</button></div></form>
</div>`
    : `<div class="fp-mine">
<div class="fp-me">${nick(name || '?')}<span class="fp-who"><span class="fp-me-title">Your card</span><span class="fp-meta">${esc(name || 'Your name')} · ${mine} titles</span></span></div>
<label class="field"><span class="label">Your name on the card</span><input id="card-name" class="input input-sm" data-setting="cardName" value="${esc(name)}" maxlength="40" placeholder="Your first name" autocomplete="off" data-keep></label>
<p class="fp-note">Your scores, statuses, favorites and tags. Never your notes.</p>
${state.ui.cardStale ? '<p class="fp-stale"><span class="ping-inline" aria-hidden="true"></span>Your list changed since you shared your card.</p>' : ''}
<button type="button" class="btn btn-primary" data-action="card-share">${icon.upload}Share my card</button>
${state.liveServer ? '<p class="fp-note">Add friends by their name, and your cards stay up to date by themselves: <button type="button" class="inline-link" data-action="live-settings">create your Rewinder name</button>.</p>' : ''}
</div>`;
  const asked = L.incoming.length ? `<ul class="fp-asks" aria-label="Friend requests">${L.incoming.map((n) => `<li class="fp-ask" data-key="ask-${esc(n)}">${nick(n)}<span class="fp-who"><span class="fp-name">${esc(n)}</span><span class="fp-meta">wants to be friends</span></span><span class="fp-ask-btns"><button type="button" class="btn btn-primary btn-sm" data-action="live-accept" data-name="${esc(n)}">Accept</button><button type="button" class="btn btn-ghost btn-sm" data-action="live-decline" data-name="${esc(n)}">Decline</button></span></li>`).join('')}</ul>` : '';
  const waiting = L.outgoing.length ? `<ul class="fp-asks fp-sent" aria-label="Requests you sent">${L.outgoing.map((n) => `<li class="fp-ask" data-key="sent-${esc(n)}">${nick(n)}<span class="fp-who"><span class="fp-name">${esc(n)}</span><span class="fp-meta">hasn't answered yet</span></span><span class="fp-ask-btns"><button type="button" class="btn btn-ghost btn-sm" data-action="live-cancel" data-name="${esc(n)}">Cancel</button></span></li>`).join('')}</ul>` : '';
  return `<section class="friends-pop" id="friends-pop" data-key="friends-pop" aria-labelledby="fp-title">
<span class="corner c-tl" aria-hidden="true"></span><span class="corner c-tr" aria-hidden="true"></span><span class="corner c-bl" aria-hidden="true"></span><span class="corner c-br" aria-hidden="true"></span>
<div class="fp-head"><h2 class="fp-title" id="fp-title">Friends</h2><span class="fp-count">${friendCount(state.friends.length)}</span></div>
${mineBlock}
${asked}${waiting}
${rows ? `<ul class="fp-list" aria-label="Your friends">${rows}</ul>` : `<p class="fp-note">${live ? 'No friend yet. Ask a friend by their Rewinder name.' : 'No friend yet. Ask a friend for their card, then add it here.'}</p>`}
${live ? `<div class="fp-files"><button type="button" class="btn btn-ghost btn-sm" data-action="card-share">${icon.upload}Send my card as a file</button><button type="button" class="btn btn-ghost btn-sm" data-action="card-pick">${icon.plus}Add a card file</button></div>` : `<button type="button" class="btn btn-dashed" data-action="card-pick">${icon.plus}Add a friend's card</button>
<p class="fp-foot">Or drop the file anywhere in Rewinder. Cards stay on this device.</p>`}
</section>`;
}

// Your name, on another of your devices: one line to copy there. It works once.
export function moveCodeDialog(code, name) {
  return `<div class="dlg-form">
<div class="dlg-head"><h2 class="dlg-title" id="dlg-move">Add another device</h2></div>
<p class="dlg-text">On your other device: Settings → Friends → <strong>Add this device</strong>, then paste this code. It becomes ${esc(name)} too, with the same list. This device stays ${esc(name)}.</p>
<label class="sr" for="move-code">Your code</label><textarea id="move-code" class="input move-code" rows="3" readonly spellcheck="false">${esc(code)}</textarea>
<p class="dlg-note">It works once, for 15 minutes, and it opens your whole list. Send it only to yourself, never to someone who asks for it, even a friend.</p>
<div class="dlg-actions"><button type="button" class="btn btn-ghost" data-action="dlg-close">Close</button><button type="button" class="btn btn-primary" data-action="live-copy">Copy the code</button></div>
</div>`;
}

export function header(state) {
  const r = state.route;
  const cur = r.name === 'browse' ? r.kind : r.name === 'title' && state.current ? state.current.kind : null;
  const nav = (href, label, on) => `<a class="nav-link" href="${href}"${on ? ' aria-current="page"' : ''}>${label}</a>`;
  const spoiler = state.settings.spoiler;
  return `<header class="top${state.settings.tvButton ? ' has-tv' : ''}">
<a class="brand" href="#/" aria-label="Rewinder, home"><img src="icons/logo-64.png" alt="" width="36" height="36"><span>REWINDER</span></a>
<nav class="nav" aria-label="Sections">${nav('#/', 'Home', r.name === 'home')}${nav('#/list', 'Full List', r.name === 'list')}<span class="nav-sep" aria-hidden="true"></span>${nav('#/all', 'All', cur === 'all')}${M.KINDS.map((k) => nav('#/' + M.KIND_PATH[k], M.KIND_TAB[k], cur === k)).join('')}</nav>
<div class="tools">
${friendsButton(state)}
${r.name === 'list' ? '' : `<div class="search">${icon.search}<label class="sr" for="q-head">Search your list</label><input id="q-head" type="search" placeholder="Titles, actors, directors, tags" autocomplete="off" spellcheck="false"></div>`}
<button type="button" class="icon-btn only-phone search-icon" data-action="search-open" aria-label="Search your list" title="Search your list">${icon.search}</button>
${state.canInstall ? `<button type="button" class="btn btn-ghost" data-action="install">${icon.install}Install</button>` : ''}
${state.settings.tvButton ? `<button type="button" class="icon-btn tv-btn" data-action="tv-enter" aria-label="TV mode" title="TV mode">${icon.tv}</button>` : ''}
<button type="button" class="icon-btn" data-action="spoiler" aria-pressed="${spoiler}" aria-label="Spoiler mode" title="${spoiler ? 'Spoiler mode is on: your notes are blurred' : 'Spoiler mode: blur your notes'}">${icon.eyeOff}</button>
<a class="icon-btn icon-settings" href="#/settings" aria-label="${syncTrouble(state) ? "Settings, your list isn't syncing" : needsBackup(state) ? 'Settings, a backup is due' : 'Settings'}" title="${syncTrouble(state) ? "Settings · your list isn't syncing" : needsBackup(state) ? 'Settings · time for a backup' : 'Settings'}"${r.name === 'settings' ? ' aria-current="page"' : ''}>${icon.sliders}${needsBackup(state) || syncTrouble(state) ? '<span class="ping" aria-hidden="true"></span>' : ''}</a>
<button type="button" class="btn btn-primary btn-scan" data-action="add">${icon.radar}<span>Scan</span><span class="sweep" aria-hidden="true"></span></button>
</div>
</header>`;
}

export const footer = () => `<footer class="foot"><span>Rewinder · v${M.APP_VERSION} · Your list stays yours · <a href="#/guides">Guides</a> · <a href="#/tv-mode/top" data-action="tv-enter">TV mode</a></span><span>Data: <a href="https://www.themoviedb.org" target="_blank" rel="noopener">TMDB</a> · <a href="https://rawg.io" target="_blank" rel="noopener">RAWG</a> · Where to watch: JustWatch</span></footer>`;

/* ---------- cards and tables ---------- */

// rank: a place in a wall sorted by best score; the score then comes first, whatever the status.
function cardMeta(t, rank) {
  if (rank) {
    const score = M.effectiveScore(t);
    return [`#${rank}`, score !== null ? `★ ${score.toFixed(1)}` : '', t.year].filter(Boolean).join(' · ');
  }
  if (t.newSeason !== null) {
    const s = M.findSeason(t, t.newSeason);
    const first = s && s.episodes[0];
    if (!first || M.isAired(first)) return `Season ${t.newSeason} is out`;
    return first.tba ? `Season ${t.newSeason} · date TBA` : `Season ${t.newSeason} · ${M.fmtDate(first.aired)}`;
  }
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

export function card(t, opts) {
  const kind = !(opts && opts.kind === false);
  const rank = opts && opts.rank ? opts.rank : 0;
  const p = M.progress(t);
  const bar = M.hasEpisodes(t) && t.status === 'progress' && p.total > 0;
  const meta = cardMeta(t, rank);
  const extra = t.newSeason !== null ? `<span class="badge-new">S${t.newSeason} NEW</span>` : '';
  return `<a class="card" data-key="c-${esc(t.id)}" href="${tHref(t)}" aria-label="${esc(`${t.title}, ${M.KIND_LABEL[t.kind]}${meta ? ', ' + meta : ''}`)}">${poster(t, { extra, kind })}
${bar ? `<span class="bar" aria-hidden="true"><span style="width:${Math.round((p.watched / p.total) * 100)}%"></span></span>` : ''}${t.poster ? `<span class="card-title">${esc(t.title)}</span>` : ''}<span class="card-meta">${esc(meta)}</span></a>`;
}

// The Via column shows up once someone in the list was recommended by a friend.
export function titleTable(rows, { emptyText = '', showKind = true, q = '' } = {}) {
  const showVia = rows.some((t) => t.via);
  const query = String(q || '').trim().toLowerCase();
  return `<div class="table-wrap"><div class="table${showKind ? '' : ' no-kind'}${showVia ? '' : ' no-via'}">
<div class="tr th" aria-hidden="true"><span>Title</span>${showKind ? '<span>Type</span>' : ''}<span>Status</span><span>Score</span><span>Progress</span><span>Last</span>${showVia ? '<span>Via</span>' : ''}</div>
${rows.length ? `<ol class="tbody">${rows.map((t) => tableRow(t, showKind, showVia, query)).join('')}</ol>` : `<p class="empty">${esc(emptyText)}</p>`}
</div></div>`;
}

function tableRow(t, showKind, showVia, q) {
  const score = M.effectiveScore(t);
  const maker = q && q.length > 2 ? (t.makers || []).find((x) => x.name.toLowerCase().includes(q)) : null;
  const sub = maker ? [t.year, `${M.MAKER_LABEL[maker.role]} ${maker.name}`].filter(Boolean).join(' · ') : [t.titleQc, t.year, t.genres.slice(0, 2).join(', ')].filter(Boolean).join(' · ');
  return `<li class="tr" data-key="r-${esc(t.id)}">
<a class="cell-title" href="${tHref(t)}"><span class="thumb" style="background:${M.artFor(t)}" aria-hidden="true">${t.poster ? `<img src="${esc(t.poster)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</span><span class="tt"><span class="tt-main">${esc(t.title)}${t.fav ? `<span class="fav-mark" title="Favorite">${icon.heartOn}</span>` : ''}</span>${sub ? `<span class="tt-sub">${esc(sub)}</span>` : ''}</span></a>
${showKind ? `<span class="c-kind">${M.KIND_SHORT[t.kind]}</span>` : ''}
<span class="c-status">${statusDot(t.status)}${M.STATUS_LABEL[t.status]}</span>
<span class="c-score">${miniStars(score)}<span>${M.fmtScore(score)}</span></span>
<span class="c-prog">${esc(M.progressLabel(t))}</span>
<span class="c-last">${esc(M.fmtDate(M.activity(t)))}</span>
${showVia ? `<span class="c-via">${esc(t.via)}</span>` : ''}
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
<button type="button" class="icon-btn hero-arrow" id="hero-prev" data-action="hero-go" data-dir="prev" data-id="${esc(prev.id)}" aria-label="Previous: ${esc(prev.title)}" title="${esc(prev.title)}">${icon.chevLeft}</button>
<span class="hero-count" aria-live="polite">${M.pad2(at + 1)} / ${M.pad2(heroes.length)}</span>
<button type="button" class="icon-btn hero-arrow" id="hero-next" data-action="hero-go" data-dir="next" data-id="${esc(next.id)}" aria-label="Next: ${esc(next.title)}" title="${esc(next.title)}">${icon.chevRight}</button>
</div>`;
}

function sideArrow(dir, t) {
  return `<button type="button" class="hero-side hero-side-${dir}" id="hero-side-${dir}" data-action="hero-go" data-dir="${dir}" data-id="${esc(t.id)}" aria-label="${dir === 'prev' ? 'Previous' : 'Next'}: ${esc(t.title)}" title="${esc(t.title)}">${dir === 'prev' ? icon.sideLeft : icon.sideRight}</button>`;
}

function heroBlock(t, state, heroes) {
  const n = heroes.length;
  const at = heroes.indexOf(t);
  return `<div class="hero-wrap" data-key="hero-wrap">
${n > 1 ? sideArrow('prev', heroes[(at - 1 + n) % n]) : ''}${heroContinue(t, state, heroes)}${n > 1 ? sideArrow('next', heroes[(at + 1) % n]) : ''}
</div>`;
}

function heroContinue(t, state, heroes = [t]) {
  const nx = M.nextEpisode(t);
  const p = M.progress(t);
  const score = M.effectiveScore(t);
  const code = M.epCode(nx.season.n, nx.ep.n);
  const pending = state.ui.homeScore[t.id];
  const meta = [t.year, ...t.genres.slice(0, 2), t.seasons.length ? plural(t.seasons.length, 'season') : ''].filter(Boolean).join(' · ');
  const slide = state.ui.heroDir ? ` slide-${state.ui.heroDir}` : '';
  return `<section class="hero${slide}" data-key="hero-${esc(t.id)}" aria-labelledby="hero-title" style="--art:${M.heroArt(t)}">
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
<div class="actions"><button type="button" class="btn btn-primary" data-action="add">${icon.plus}Add a title</button><a class="btn btn-ghost" href="#/import">${icon.rows}Import a list</a><button type="button" class="btn btn-ghost" data-action="import">${icon.upload}Restore a backup</button></div>
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
  for (const g of M.topGenres(all)) rows.push({ id: 'g-' + g.toLowerCase().replace(/[^a-z0-9]+/g, '-'), title: g, items: all.filter((t) => t.genres.includes(g)).sort(byActivity), see: { genre: g } });
  return `<div class="page page-home">
${hero ? heroBlock(hero, state, heroes) : all.length ? '' : heroWelcome()}
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
  if (f.fav) active.push(`<button type="button" class="chip chip-sm chip-on" data-action="list-clear" data-key="fav">Favorites only${icon.x}</button>`);
  return `<div class="page page-list">
<div class="page-head"><div class="titles"><span class="eyebrow">// Everything you logged</span><h1 class="display display-md">Full List</h1></div><span class="head-count">${rows.length === all.length ? plural(all.length, 'title') : `${rows.length} of ${all.length}`}</span></div>
<div class="filters">
<div class="chips" role="group" aria-label="Category">${cats.map(([k, label]) => `<button type="button" class="chip" data-action="list-cat" data-cat="${k}" aria-pressed="${f.cat === k}">${label}<span class="chip-count">${counts[k]}</span></button>`).join('')}</div>
<div class="filter-tools">
<div class="search">${icon.search}<label class="sr" for="q-list">Filter the list</label><input id="q-list" type="search" placeholder="Title, actor, director, genre, tag or friend" value="${esc(f.q)}" data-filter="q" autocomplete="off" spellcheck="false"></div>
<label class="sr" for="plat-list">Platform</label><select id="plat-list" class="select" data-filter="platform"><option value="">All platforms</option>${platforms.map((p) => `<option value="${esc(p)}"${p === f.platform ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select>
<label class="sr" for="status-list">Status</label><select id="status-list" class="select" data-filter="status"><option value="">All statuses</option>${M.STATUSES.map((x) => `<option value="${x}"${x === f.status ? ' selected' : ''}>${M.STATUS_LABEL[x]}</option>`).join('')}</select>
<label class="sr" for="sort-list">Sort by</label><select id="sort-list" class="select" data-filter="sort">${sortOptions(f.sort)}</select>
</div>
</div>
${active.length ? `<div class="chips">${active.join('')}</div>` : ''}
${titleTable(rows, { q: f.q, emptyText: all.length ? 'No titles match. Try another category or clear the filter.' : 'Your list is empty. Use Scan to add your first title.' })}
</div>`;
}

// One kind, or "all": every poster in one wall (the Full List is the table of everything).
// Filters (status, genre, favorites) and a view by groups: franchise, director, studio or your keywords.
// The groups sit side by side like box sets on a shelf; a big one takes the whole line.
const GROUP_WORD = { franchise: 'franchise', director: 'director', studio: 'studio', keyword: 'keyword' };
export const groupBy = (state) => (GROUP_WORD[state.ui.group] ? state.ui.group : 'franchise');

function keywordBar(state, list) {
  const saved = M.savedKeywords(state.settings);
  const draft = state.ui.kwDraft || '';
  const typed = M.cleanKeyword(draft);
  const ideas = M.suggestKeywords(list, draft, saved, typed ? 10 : 12);
  const idea = (x) => `<button type="button" class="chip chip-sm kw-idea" data-action="kw-add" data-kw="${esc(x.word)}">${icon.plus}${esc(x.word)}<span class="chip-count">${x.count}</span></button>`;
  const hint = typed && !ideas.length
    ? `<p class="kw-hint">No keyword starts like “${esc(typed)}” here. Keywords are in English: vampire, gladiator, heist. Press Enter to keep it anyway.</p>`
    : !typed && !saved.length
      ? `<p class="kw-hint">${ideas.length ? 'Type a word, or start with one of these:' : 'Type a word: vampire, gladiator, heist… Every title that has it lands in one group.'}</p>`
      : '';
  return `<div class="kw-bar">
<div class="kw-row">
${saved.length ? `<div class="kw-saved" role="group" aria-label="Your keywords">${saved.map((k) => `<span class="chip-x kw-chip"><span class="chip-x-label">${esc(k)}</span><button type="button" class="x-btn" data-action="kw-remove" data-kw="${esc(k)}" aria-label="Remove the keyword ${esc(k)}">${icon.x}</button></span>`).join('')}</div>` : ''}
<form class="kw-form" data-form="kw-add" autocomplete="off"><label class="sr" for="kw-input">Add a keyword</label><div class="search kw-search">${icon.plus}<input id="kw-input" name="kw" type="search" maxlength="60" placeholder="Add a keyword: vampire, heist, time loop…" value="${esc(draft)}" autocomplete="off" spellcheck="false" enterkeyhint="done"></div></form>
</div>
${hint}
${ideas.length ? `<div class="kw-ideas" role="group" aria-label="${typed ? 'Keywords that match' : 'Ideas from your list'}">${ideas.map(idea).join('')}</div>` : ''}
</div>`;
}

function groupBody(state, list, every) {
  const by = groupBy(state);
  const saved = M.savedKeywords(state.settings);
  const groups = M.groupTitles(list, by, state.ui.groupSort, saved);
  const fill = state.ui.groupFill;
  const waiting = M.live(state.titles).filter((t) => t.tmdbId && t.tmdbType && (!t.groupsAt || !t.keywordsAt)).length;
  const note = fill
    ? `<p class="grp-note"><span class="ping-inline" aria-hidden="true"></span>Looking up franchises, studios and keywords… ${fill.done} of ${fill.total}</p>`
    : waiting && !state.settings.tmdbKey ? '<p class="grp-note">Add your TMDB key in Settings: franchises, directors, studios and keywords come from TMDB.</p>' : '';
  const bar = by === 'keyword' ? keywordBar(state, list) : '';
  if (!groups.length) {
    if (by === 'keyword') return `${note}${bar}`;
    const empty = {
      franchise: ['No franchise here yet.', 'Franchises come from TMDB and cover movies: Alien, Scream, Jurassic Park…'],
      director: ['No director with two titles here yet.', 'Directors come from TMDB: who directed a movie, who created a show.'],
      studio: ['No studio with two titles here yet.', 'Studios come from TMDB, and from RAWG for games.']
    }[by];
    return `${note}<div class="empty-box"><p class="lead">${empty[0]}</p><p class="set-text dim">${empty[1]}</p></div>`;
  }
  const alsoLabel = by === 'director' ? 'With' : 'Also credited:';
  const inGroups = new Set(groups.flatMap((g) => g.items.map((t) => t.id)));
  const loose = by === 'keyword' ? 0 : list.filter((t) => !inGroups.has(t.id)).length;
  const looseText = { franchise: 'not part of a franchise', director: 'not from a director with two titles', studio: 'not from a studio with two titles' }[by];
  // Every label has the same lines, so the posters of groups side by side start at the same height.
  const anyAlso = groups.some((g) => g.also.length);
  const also = (g) => (g.also.length ? `<p class="grp-also" title="${esc(`${alsoLabel} ${g.also.join(', ')}`)}">${alsoLabel} ${esc(g.also.join(', '))}</p>` : anyAlso ? '<p class="grp-also" aria-hidden="true"></p>' : '');
  return `${note}${bar}<div class="grp-list">${groups.map((g) => `<section class="grp${g.items.length ? '' : ' grp-empty'}" data-key="grp-${esc(by)}-${esc(g.name)}" aria-label="${esc(g.name)}">
<div class="grp-head"><h2 class="h2 grp-name" title="${esc(g.name)}"><span class="sq" aria-hidden="true"></span><span class="grp-label">${esc(g.name)}</span></h2>${also(g)}<span class="grp-meta">${esc(plural(g.items.length, 'title'))}${g.avg !== null ? ` · <span class="grp-avg">★ ${g.avg.toFixed(1)}</span> average` : g.items.length ? ' · not rated yet' : ''}</span></div>
${g.items.length ? `<div class="wall wall-sm">${g.items.map((t, i) => card(t, { kind: every, rank: by === 'franchise' ? i + 1 : 0 })).join('')}</div>` : '<p class="grp-none">Nothing here has this keyword yet.</p>'}
</section>`).join('')}</div>
${loose ? `<p class="grp-note dim">${esc(plural(loose, 'title'))} here ${loose === 1 ? 'is' : 'are'} ${looseText}.</p>` : ''}`;
}

export function browseView(state, kind) {
  const every = kind === 'all';
  const all = M.live(state.titles).filter((t) => every || t.kind === kind);
  const f = state.ui.browse;
  const group = state.ui.group ? groupBy(state) : '';
  const view = state.settings.browseView === 'list' ? 'list' : 'wall';
  const size = state.settings.wallSize === 'large' || state.settings.wallSize === 'small' ? state.settings.wallSize : state.ui.narrow ? 'large' : 'small';
  const shown = all.filter((t) => (!f.status || t.status === f.status) && (!f.genre || t.genres.includes(f.genre)) && (!f.fav || t.fav));
  const list = M.sortTitles(shown, state.ui.browseSort);
  const filtered = Boolean(f.status || f.genre || f.fav);
  const genres = M.genreCounts(all);
  if (f.genre && !genres.some(([g]) => g === f.genre)) genres.push([f.genre, 0]);
  const empty = !all.length
    ? `<div class="empty-box"><p class="lead">${every ? 'Nothing here yet.' : `No ${KIND_PLURAL[kind]} yet.`}</p><button type="button" class="btn btn-primary" data-action="add"${every ? '' : ` data-kind="${kind}"`}>${icon.plus}${every ? 'Add a title' : `Add ${A_KIND[kind]}`}</button></div>`
    : !list.length ? '<div class="empty-box"><p class="lead">Nothing matches these filters.</p><button type="button" class="btn btn-ghost" data-action="browse-clear">Clear the filters</button></div>' : '';
  const body = empty || (group ? groupBody(state, list, every)
    : view === 'wall' ? `<div class="wall wall-${size === 'large' ? 'lg' : 'sm'}">${list.map((t, i) => card(t, { kind: every, rank: state.ui.browseSort === 'score' && M.effectiveScore(t) !== null ? i + 1 : 0 })).join('')}</div>` : titleTable(list, { showKind: every }));
  const pick = (v, label, ico, on) => `<button type="button" class="icon-btn" data-action="browse-view" data-view="${v}" aria-pressed="${on}" aria-label="${label}" title="${label}">${ico}</button>`;
  const chip = (href, label, current) => `<a class="kind-chip" href="${href}"${current ? ' aria-current="page"' : ''}>${label}</a>`;
  const tab = (g, label) => `<button type="button" class="grp-tab" data-action="browse-group" data-group="${g}" aria-pressed="${group === g}">${label}</button>`;
  const sortSelect = group
    ? `<label class="sr" for="sort-group">Order the groups</label><select id="sort-group" class="select" data-filter="groupSort">${[['score', 'Best average'], ['count', 'Most titles'], ['name', 'A–Z']].map(([v, l]) => `<option value="${v}"${state.ui.groupSort === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`
    : `<label class="sr" for="sort-browse">Sort by</label><select id="sort-browse" class="select" data-filter="browseSort">${sortOptions(state.ui.browseSort)}</select>`;
  return `<div class="page page-list${group || view === 'wall' ? ' page-wall' : ''}">
<nav class="kind-chips" aria-label="Kinds">${chip('#/all', 'All', every)}${M.KINDS.map((k) => chip('#/' + M.KIND_PATH[k], M.KIND_TAB[k], kind === k)).join('')}</nav>
<div class="page-head"><div class="titles"><span class="eyebrow">// ${filtered ? `${list.length} of ${plural(all.length, 'title')}` : plural(all.length, 'title')}</span><h1 class="display display-md">${every ? 'All' : M.KIND_TAB[kind]}</h1></div>
<div class="filter-tools">
${sortSelect}
<div class="seg-btns" role="group" aria-label="View">${pick('small', 'Small posters', icon.gridSm, !group && view === 'wall' && size === 'small')}${pick('large', 'Large posters', icon.grid, !group && view === 'wall' && size === 'large')}${pick('list', 'List', icon.rows, !group && view === 'list')}<button type="button" class="icon-btn" data-action="browse-group" data-group="${group || state.ui.lastGroup || 'franchise'}" aria-pressed="${Boolean(group)}" aria-label="Groups" title="Groups: franchises, directors, studios, keywords">${icon.layers}</button></div>
<button type="button" class="btn btn-ghost" data-action="add"${every ? '' : ` data-kind="${kind}"`}>${icon.plus}Add</button>
</div>
</div>
${all.length ? `<div class="browse-filters">
<div class="bf-picks" role="group" aria-label="Show">
<label class="sr" for="bf-status">Status</label><select id="bf-status" class="select select-sm${f.status ? ' is-on' : ''}" data-filter="browseStatus"><option value="">All statuses</option>${M.STATUSES.map((x) => `<option value="${x}"${x === f.status ? ' selected' : ''}>${M.STATUS_LABEL[x]}</option>`).join('')}</select>
<label class="sr" for="bf-genre">Genre</label><select id="bf-genre" class="select select-sm${f.genre ? ' is-on' : ''}" data-filter="browseGenre"><option value="">All genres</option>${genres.map(([g, n]) => `<option value="${esc(g)}"${g === f.genre ? ' selected' : ''}>${esc(g)} · ${n}</option>`).join('')}</select>
<button type="button" class="chip chip-sm bf-fav" data-action="browse-fav" aria-pressed="${f.fav}">${icon.heart}Favorites</button>
${filtered ? `<button type="button" class="link-btn" data-action="browse-clear">Clear</button>` : ''}
</div>
${group ? `<div class="grp-tabs" role="group" aria-label="Group by">${tab('franchise', 'Franchises')}${tab('director', 'Directors')}${tab('studio', 'Studios')}${tab('keyword', 'Keywords')}</div>` : ''}
</div>` : ''}
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
${e.watched ? `<div class="field"><label class="label" for="ep-watched-${id}">Watched on</label><span class="ep-when"><input id="ep-watched-${id}" type="date" class="input input-sm" data-ep-field="watched" data-ep="${k}" value="${e.watched === 'unknown' ? '' : esc(e.watched)}" max="${M.today()}">${e.watched === 'unknown' ? '<span class="ep-when-note">date unknown</span>' : `<button type="button" class="btn btn-ghost btn-sm" data-action="ep-unknown" data-ep="${k}">Unknown</button>`}</span></div>` : ''}
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

// The date shared by a season's watched episodes: one date, 'unknown', 'mixed', or '' when none is watched.
function seasonWatchedDate(s) {
  const dates = [...new Set(s.episodes.filter((e) => e.watched).map((e) => e.watched))];
  if (!dates.length) return '';
  return dates.length === 1 ? dates[0] : 'mixed';
}

function seasonBody(t, s, nx, openEp, editing) {
  const total = s.episodes.length;
  const seenOn = seasonWatchedDate(s);
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
${seenOn ? `<span class="season-date"><span class="label">Watched</span>${dateField(`season-${s.n}`, seenOn, editing === `season-${s.n}`, `Watched date for ${M.seasonName(s.n)}`)}</span>` : ''}
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
${open ? seasonBody(t, s, nx, state.ui.openEp, state.ui.dateEdit) : ''}
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

function gameSection(t, editing) {
  const plats = [...new Set([...(t.available.length ? t.available : M.GAME_PLATFORMS), ...t.platforms])];
  const mark = (key, label) => {
    const on = t.game[key];
    return `<button type="button" class="mark${on ? ' on' : ''}" data-action="game-mark" data-mark="${key}" aria-pressed="${Boolean(on)}">${icon.check}<span class="mark-text"><b>${label}</b><small>${on ? 'Done' : 'Not yet'}</small></span></button>`;
  };
  const dates = [['story', 'Story'], ['full', '100%']].filter(([key]) => t.game[key])
    .map(([key, label]) => `<span class="mark-date"><span class="label">${label}</span>${dateField(`game-${key}`, t.game[key], editing === `game-${key}`, `${label} date`)}</span>`).join('');
  return `<section class="sec" aria-labelledby="h-progress">
<div class="sec-head"><h2 class="h2" id="h-progress"><span class="sq" aria-hidden="true"></span>Progress</h2></div>
<div class="marks">${mark('story', 'Story')}${mark('full', '100%')}</div>
${dates ? `<div class="mark-dates">${dates}</div>` : ''}
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

// A date shown as a small button; a click opens a date field with "Unknown" and "OK".
function dateField(key, value, editing, label) {
  const shown = value === 'mixed' ? 'various dates' : M.shownDate(value, true);
  if (editing) {
    return `<span class="date-edit"><label class="sr" for="de-${key}">${esc(label)}</label><input id="de-${key}" type="date" class="input input-sm" data-date-edit="${key}" value="${value === 'unknown' || value === 'mixed' ? '' : esc(value)}" max="${M.today()}"><button type="button" class="btn btn-ghost btn-sm" data-action="date-unknown" data-key="${key}">Unknown</button><button type="button" class="btn btn-primary btn-sm" data-action="date-close">OK</button></span>`;
  }
  return `<button type="button" class="date-btn" data-action="date-edit" data-key="${key}" aria-label="${esc(label)}: ${esc(shown)}. Change it">${esc(shown)}${icon.edit}</button>`;
}

function viewsPanel(t, editing) {
  const n = t.views.length;
  const firstEp = M.hasEpisodes(t) ? M.episodes(t).map((x) => x.ep.watched).filter((d) => /^\d/.test(d || '')).sort()[0] : null;
  const sub = n ? `Last ${M.shownDate(t.views[n - 1].date, true)}` : firstEp ? `Started ${M.fmtDate(firstEp, true)}` : 'Not seen yet';
  return `<section class="panel" aria-labelledby="h-views">
<h2 class="panel-title" id="h-views">Watch count</h2>
<div class="count-row"><span class="big-count">×${n}</span><span class="panel-sub">${esc(sub)}</span></div>
${n ? `<ol class="views">${t.views.map((v, i) => `<li${editing === `view-${i}` ? ' class="editing"' : ''}>${dateField(`view-${i}`, v.date, editing === `view-${i}`, `Viewing ${i + 1}`)}<button type="button" class="x-btn" data-action="view-remove" data-i="${i}" aria-label="Remove the viewing of ${esc(M.shownDate(v.date, true))}">${icon.x}</button></li>`).join('')}</ol>` : ''}
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

// "Directed by Quentin Tarantino": a click shows everything of theirs in the Full List.
function makersLine(t) {
  if (!t.makers || !t.makers.length) return '';
  const roles = [...new Set(t.makers.map((x) => x.role))];
  return `<div class="makers">${roles.map((role) => {
    const list = t.makers.filter((x) => x.role === role);
    const label = role === 'Studio' && list.length > 1 ? 'Studios' : M.MAKER_LABEL[role];
    return `<span class="makers-label">${label}</span>${list.map((x) => `<button type="button" class="maker" data-action="search-for" data-q="${esc(x.name)}" title="Find ${esc(x.name)} in your list"><span class="maker-ini" aria-hidden="true">${esc(M.initials(x.name))}</span>${esc(x.name)}${icon.search}</button>`).join('')}`;
  }).join('')}</div>`;
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
${makersLine(t)}
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
${series ? seasonsSection(t, state) : ''}${t.kind === 'game' ? gameSection(t, state.ui.dateEdit) : ''}${castSection(t)}${notesSection(t, state)}
</div>
<aside class="col-aside" aria-label="Details">
${providersPanel(t, state)}${viaPanel(t, state)}${t.kind === 'game' ? '' : viewsPanel(t, state.ui.dateEdit)}${tagsPanel(t, state)}${historyPanel(state.history[t.id])}
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

function folderBlock(state) {
  const f = state.folder;
  if (!f.supported) {
    return '<p class="set-text dim folder-note">Automatic backups to a folder work in Chrome and Edge. Brave keeps them off: search “File System Access” in brave://flags to turn them on, then restart Brave. Until then, Download backup does the job.</p>';
  }
  if (!f.name) {
    return `<div class="folder-row"><p class="set-text">Back up automatically to a folder, once a day. The 10 latest copies are kept.</p><button type="button" class="btn btn-ghost" data-action="folder-pick">${icon.download}Choose a folder</button></div>`;
  }
  const last = state.settings.folderBackupAt ? ` · last copy ${esc(M.fmtDate(state.settings.folderBackupAt, true))}` : '';
  return `<div class="folder-row"><p class="set-text">Automatic backup to <b>${esc(f.name)}</b>${last}</p>
<span class="actions">${f.granted ? '<button type="button" class="btn btn-ghost btn-sm" data-action="folder-now">Back up now</button>' : '<button type="button" class="btn btn-primary btn-sm" data-action="folder-allow">Allow access</button>'}<button type="button" class="btn btn-ghost btn-sm" data-action="folder-pick">Change</button><button type="button" class="btn btn-ghost btn-sm btn-danger" data-action="folder-stop">Stop</button></span></div>
${f.granted ? '' : '<p class="set-text dim">Your browser wants your OK again before Rewinder writes in that folder.</p>'}`;
}

function installBlock(state) {
  if (state.standalone) return '<p class="set-text">Rewinder is installed on this computer. Open it from the Start menu or the taskbar.</p>';
  if (state.canInstall) return `<p class="set-text">Install Rewinder to open it like any other app, in its own window.</p><div class="actions"><button type="button" class="btn btn-primary" data-action="install">${icon.install}Install Rewinder</button></div>`;
  return '<p class="set-text">To install Rewinder as an app, open your browser menu and choose <b>Install Rewinder</b> (Chrome, Edge, Brave). In Chrome you can also click the install icon at the right end of the address bar.</p>';
}

// Your list stopped syncing: it can't open (another key), or it has failed for 5 minutes.
const syncTrouble = (state) => Boolean(state.sync && liveReady(state) && ((state.live && state.live.out) || state.sync.blocked || (state.sync.error && state.sync.failSince && Date.now() - state.sync.failSince > 5 * 60e3)));

// Your list on all your devices: how it's going.
function syncLine(state) {
  const y = state.sync || {};
  if (y.blocked) return '<p class="set-text">This device can\'t open your list: your other devices lock it with another key. Remove this device below, then add it again with a code from one of them.</p>';
  if (y.busy && !y.at) return '<p class="panel-sub">Syncing your list…</p>';
  if (y.error) return `<p class="panel-sub">Your list didn't sync: ${esc(y.error)}</p>`;
  const big = y.tooBig ? ` · ${y.tooBig === 1 ? 'one title is' : `${y.tooBig} titles are`} too big to sync and stay${y.tooBig === 1 ? 's' : ''} on this device` : '';
  if (y.at) return `<p class="panel-sub">Your list is the same on all your devices · synced ${esc(ago(y.at))}${big}</p>`;
  return '<p class="panel-sub">Your list syncs between your devices.</p>';
}

// Your devices: each one, when it was added and last seen; remove any of them (never the last one).
function devicesList(state) {
  const list = state.live.devices;
  if (!list || !list.length) return '';
  return `<ul class="trash devices" aria-label="Your devices">${list.map((d) => `<li data-key="dev-${esc(d.id)}"><span class="tt"><span class="tt-main">${esc(d.label || 'Device')}${d.me ? ' <span class="dev-me">· this device</span>' : ''}</span><span class="tt-sub">added ${esc(M.fmtDate(d.at))}${!d.me && d.seen ? ' · seen ' + esc(ago(d.seen)) : ''}</span></span>${list.length > 1 ? `<span class="actions"><button type="button" class="btn btn-ghost btn-sm btn-danger" data-action="device-remove" data-id="${esc(d.id)}">${d.me ? 'Remove this device' : 'Remove'}</button></span>` : ''}</li>`).join('')}</ul>`;
}

const ADD_HERE = `<details class="set-more"><summary>Add this device</summary><form class="live-here" data-form="live-here" autocomplete="off"><label class="field"><span class="label">Code from your other device</span><input id="live-code" name="movecode" class="input" placeholder="RW3.…" autocomplete="off" spellcheck="false" autocapitalize="off"></label><div class="actions"><button type="submit" class="btn btn-ghost">Add this device</button></div></form><span class="panel-sub">On your other device: Settings → Friends → Add another device. Both keep your name, with the same list.</span></details>`;

// Settings → Friends: your Rewinder name (made, on your devices, removed) and the server it lives on.
function liveSettings(state) {
  const s = state.settings;
  // With Sonny's server built in, there is no address to change (or to be talked into changing).
  const server = state.liveServerFixed ? '' : `<details class="set-more"><summary>Server address</summary><label class="field"><span class="label">Rewinder server</span><input id="set-server" class="input" data-setting="server" value="${esc(s.server || state.liveServer || '')}" placeholder="https://…workers.dev" autocomplete="off" spellcheck="false" autocapitalize="off" inputmode="url"></label><span class="panel-sub">Leave it as it is unless Sonny gives you another one.</span></details>`;
  if (!state.liveServer) {
    return `<p class="set-text">Your card goes to your friends by hand: Friends → Share my card. On a phone, that opens the share menu (Messenger, Discord, texts).</p>
<p class="set-text dim">To add friends by their name instead, Rewinder needs its server address.</p>${server}`;
  }
  if (s.liveName && s.liveSecret && s.liveHost && s.liveHost !== state.liveServer) {
    return `<p class="set-text">Your name <strong>${esc(s.liveName)}</strong> belongs to another server (${esc(s.liveHost)}). Rewinder never sends it anywhere else: set that address back to use it.</p>${server}`;
  }
  // The server doesn't know this device right now: nothing was forgotten, and forgetting is a choice.
  if (liveReady(state) && state.live.out) {
    const old = state.live.out === 'old';
    return `<p class="set-text">${old ? `The Rewinder server needs its update. Nothing is lost: this device picks up again as <strong>${esc(s.liveName)}</strong> once it's done.` : `The server doesn't know this device as <strong>${esc(s.liveName)}</strong> right now. It was removed from your devices, or your name was, or the server is in trouble.`}</p>
<p class="panel-sub">Your list and the key that opens it stay here. Rewinder checks again every 10 minutes.</p>
<div class="actions"><button type="button" class="btn btn-ghost" data-action="live-retry">Try again</button><button type="button" class="btn btn-ghost btn-danger" data-action="live-forget">Forget ${esc(s.liveName)} here</button></div>
${old ? '' : ADD_HERE}
${server}`;
  }
  if (liveReady(state)) {
    return `<p class="set-text">You are <strong>${esc(s.liveName)}</strong> on Rewinder. Friends add you by that name; once you both say yes, your cards stay up to date by themselves.</p>
${syncLine(state)}
${state.sync && state.sync.blocked ? ADD_HERE : ''}
${devicesList(state)}
<div class="actions"><button type="button" class="btn btn-ghost" data-action="live-move">${icon.upload}Add another device</button><button type="button" class="btn btn-ghost btn-danger" data-action="live-leave">Remove my name and card</button></div>
<p class="panel-sub">On the server: your card for your friends (titles, scores, statuses, favorites, tags; Sonny, who runs the server, can see it), and your whole list for your devices, locked with a key that stays on them: the server only sees scrambled data. Never your API keys. A device unused for 5 months leaves your name; a name with no device left is erased, with its card and its list.</p>
${server}`;
  }
  return `<p class="set-text">Add friends by their name, and your cards stay up to date by themselves. Pick your Rewinder name once, with the invite code Sonny gave you.</p>
<form class="live-claim" data-form="live-claim" autocomplete="off">
<label class="field"><span class="label">Your Rewinder name</span><input id="live-name" name="livename" class="input" maxlength="24" placeholder="ChaosDSamael" autocomplete="off" spellcheck="false" autocapitalize="off"></label>
<label class="field"><span class="label">Invite code</span><input id="live-invite" name="invite" class="input" maxlength="80" autocomplete="off" spellcheck="false" autocapitalize="off"></label>
<div class="actions"><button type="submit" class="btn btn-primary">Create my name</button></div>
</form>
<p class="panel-sub">3 to 24 letters or numbers (. _ - inside). On the server: your card for your friends (titles, scores, statuses, favorites, tags; Sonny, who runs the server, can see it), and your whole list for your devices, locked with a key that stays on them. Never your API keys.</p>
${ADD_HERE}
${server}`;
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
<div class="swatches" role="group" aria-labelledby="lbl-accent">${M.PRESETS.map((p) => `<button type="button" class="swatch" data-action="accent" data-color="${p.color}" aria-pressed="${p.color.toLowerCase() === String(s.accent).toLowerCase()}" style="--sw:${p.color}"><span class="sw-dot" aria-hidden="true"></span>${p.name}</button>`).join('')}<label class="swatch swatch-custom${isPreset ? '' : ' on'}" style="--sw:${isPreset || !M.isHexColor(s.accent) ? '#5A6360' : s.accent}"><span class="sw-dot" aria-hidden="true"></span>Custom<input type="color" id="accent-custom" value="${esc(s.accent)}" data-setting="accent" aria-label="Custom color"></label></div>
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
<p class="set-text">${liveReady(state) && s.syncKey ? 'Your list is on your devices, and locked on the server. A backup is your own copy, outside all that: download one now and then, and keep it somewhere safe.' : 'Your list lives only in this browser. Download a backup now and then, and keep it somewhere safe, like a cloud folder. A backup also moves your list to another computer.'}</p>
${needsBackup(state) ? `<p class="reminder">${icon.download}<span>${s.lastBackupAt ? `Last backup ${esc(M.fmtDate(s.lastBackupAt, true))} · ${plural(s.changesSinceBackup || 0, 'change')} since.` : 'No backup yet.'} Time for one.</span><button type="button" class="link-btn" data-action="backup-later">Later</button></p>` : `<p class="panel-sub">${s.lastBackupAt ? `Last backup ${esc(M.fmtDate(s.lastBackupAt, true))} · ${plural(s.changesSinceBackup || 0, 'change')} since` : 'No backup yet'}</p>`}
<div class="actions"><button type="button" class="btn btn-primary" data-action="export">${icon.download}Download backup</button><button type="button" class="btn btn-ghost" data-action="import">${icon.upload}Restore a backup</button><a class="btn btn-ghost" href="#/import">${icon.rows}Import a list</a></div>
${folderBlock(state)}
</section>

<section class="set-sec" aria-labelledby="set-friends"><h2 class="h2" id="set-friends"><span class="sq" aria-hidden="true"></span>Friends</h2>
${liveSettings(state)}
<div class="set-row"><label class="switch"><input type="checkbox" role="switch" id="set-remind" data-setting="shareRemind"${s.shareRemind ? ' checked' : ''}><span class="switch-ui" aria-hidden="true"></span>Remind me to share my card</label><span class="panel-sub">For cards sent as a file. Once you've shared one: a dot on Friends when your list changes, and a reminder once a day.</span></div>
</section>

<section class="set-sec" aria-labelledby="set-tv"><h2 class="h2" id="set-tv"><span class="sq" aria-hidden="true"></span>TV</h2>
<p class="set-text">Big posters for the couch: your top, Home in big, and a pick for tonight. Show your screen on the TV first: the guides say how.</p>
<div class="set-row"><label class="switch"><input type="checkbox" role="switch" id="set-tvbtn" data-setting="tvButton"${s.tvButton ? ' checked' : ''}><span class="switch-ui" aria-hidden="true"></span>Show the TV button at the top</label><span class="panel-sub">One tap to TV mode, from any page.</span></div>
<div class="actions"><button type="button" class="btn btn-ghost" data-action="tv-enter">${icon.tv}TV mode</button><button type="button" class="btn btn-ghost" data-action="guides-open" data-tab="tv">${icon.book}TV guide</button></div>
</section>

<section class="set-sec" aria-labelledby="set-trash"><h2 class="h2" id="set-trash"><span class="sq" aria-hidden="true"></span>Trash<span class="count">${trashed.length}</span></h2>
<p class="set-text">Deleted titles wait here for ${M.TRASH_DAYS} days, then they're gone for good.</p>
${trashed.length ? `<ul class="trash">${trashed.map((t) => `<li data-key="tr-${esc(t.id)}"><span class="tt"><span class="tt-main">${esc(t.title)}</span><span class="tt-sub">${M.KIND_LABEL[t.kind]} · deleted ${esc(M.fmtDate(t.deletedAt))} · ${plural(daysLeft(t), 'day')} left</span></span><span class="actions"><button type="button" class="btn btn-ghost btn-sm" data-action="restore" data-id="${esc(t.id)}">Restore</button><button type="button" class="btn btn-ghost btn-sm btn-danger" data-action="purge" data-id="${esc(t.id)}">Delete forever</button></span></li>`).join('')}</ul>` : '<p class="panel-sub">Empty.</p>'}
</section>

<section class="set-sec" aria-labelledby="set-app"><h2 class="h2" id="set-app"><span class="sq" aria-hidden="true"></span>App</h2>
${installBlock(state)}
<div class="actions"><button type="button" class="btn btn-ghost" data-action="guide-open">Open the start guide</button><a class="btn btn-ghost" href="#/guides">${icon.book}Guides: computer, phone, TV</a></div>
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
<p class="panel-sub copyright">© 2026 Sonny Lavallée · Myckealson. All rights reserved.</p>
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
<label class="field"><span class="label">${t.kind === 'game' ? 'Studio' : t.kind === 'movie' ? 'Directed by' : 'Created by'} <span class="opt">separated by commas</span></span><input class="input" name="makers" value="${esc((t.makers || []).map((x) => x.name).join(', '))}" placeholder="${t.kind === 'game' ? 'Studio names' : 'Names'}"></label>
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

export function choiceDialog({ title, body, choices, date }) {
  return `<div class="dlg-form">
<div class="dlg-head"><h2 class="dlg-title" id="dlg-title">${esc(title)}</h2></div>
<p class="dlg-text">${esc(body)}</p>
${date ? `<label class="field choice-date"><span class="label">${esc(date.label)}</span><input id="choice-date" type="date" class="input" value="${esc(date.value)}" max="${esc(date.max)}" data-choice-date></label>` : ''}
<div class="dlg-actions">${choices.map((c) => `<button type="button" class="btn ${c.primary ? 'btn-primary' : 'btn-ghost'}" data-action="choice" data-value="${esc(c.value)}">${esc(c.label)}</button>`).join('')}</div>
</div>`;
}

export function acquiredDialog(f, c, replaced) {
  return `<div class="acq"><div class="acq-in">
<span class="acq-glow" aria-hidden="true"></span>
${nick(f.name, 'lg')}
<div class="acq-head"><span class="eyebrow">// ${replaced ? 'Card updated' : 'New card'}</span><h2 class="acq-title" id="dlg-title">${esc(f.name)}'s card acquired</h2></div>
<div class="acq-stats">
<div class="acq-stat"><b>${f.titles.length}</b><span>Titles</span></div>
<div class="acq-stat"><b>${c.common.length}</b><span>In common</span></div>
<div class="acq-stat acq-hot"><b>${c.agreement === null ? '—' : c.agreement + '%'}</b><span>Agreement</span></div>
</div>
<p class="dlg-text">Card from ${esc(M.fmtDate(f.at, true))}. When ${esc(f.name)} sends a newer one, add it the same way: it replaces this one.</p>
<div class="acq-actions"><button type="button" class="btn btn-ghost" data-action="choice" data-value="later">Later</button><button type="button" class="btn btn-primary" data-action="choice" data-value="compare">Compare</button></div>
</div></div>`;
}

function duelRow(c, name) {
  const t = c.mine;
  const x = c.theirs;
  const art = t.poster || x.poster;
  const far = c.gap !== null && c.gap >= 2;
  const gapLabel = c.gap === null ? 'not both rated' : c.gap < 0.05 ? 'Same' : `${c.gap.toFixed(1)} apart`;
  return `<li class="fr-row">
<a class="fr-what" href="${tHref(t)}"><span class="thumb" style="background:${M.artFor(t)}" aria-hidden="true">${art ? `<img src="${esc(art)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</span><span class="tt"><span class="tt-main">${esc(t.title)}</span><span class="tt-sub">${esc([M.KIND_LABEL[t.kind], t.year].filter(Boolean).join(' · '))}</span></span></a>
<span class="fr-scores">
<span class="fr-score"><span class="who">You</span><b class="you">${c.you === null ? '—' : M.fmtScore(c.you)}</b></span>
<span class="fr-score"><span class="who">${esc(name)}</span><b class="them">${c.them === null ? '—' : M.fmtScore(c.them)}</b></span>
<span class="fr-gap"><span class="gap-bar" aria-hidden="true"><span style="width:${c.gap === null ? 0 : Math.min(100, Math.round((c.gap / 5) * 100))}%"${far ? ' class="far"' : ''}></span></span><span class="gap-tag${far ? ' far' : ''}">${gapLabel}</span></span>
</span>
</li>`;
}

function pickRow(p, i, name) {
  const x = p.theirs;
  const sub = [M.KIND_LABEL[x.kind], x.year, x.fav ? `one of ${name}'s favorites` : ''].filter(Boolean).join(' · ');
  const action = p.mine
    ? `<a class="fr-have" href="${tHref(p.mine)}">${icon.check}In your ${p.mine.status === 'watchlist' ? 'watchlist' : 'list'}</a>`
    : `<button type="button" class="btn btn-dashed btn-sm" data-action="friend-add" data-i="${i}">${icon.plus}Watchlist</button>`;
  return `<li class="fr-row">
<span class="fr-what"><span class="thumb" style="background:${M.artFor({ title: x.title })}" aria-hidden="true">${x.poster ? `<img src="${esc(x.poster)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</span><span class="tt"><span class="tt-main">${esc(x.title)}</span><span class="tt-sub">${esc(sub)}</span></span></span>
<span class="fr-scores">
<span class="fr-score"><span class="who">${esc(name)}</span><b class="them">${x.score === null ? '—' : M.fmtScore(x.score)}</b></span>
<span class="fr-status">${esc(M.STATUS_LABEL[x.status])}</span>
${action}
</span>
</li>`;
}

export function friendView(state, f) {
  if (!f) {
    return `<div class="page"><div class="empty-box"><p class="lead">This card is not here anymore.</p><a class="btn btn-primary" href="#/">Back home</a></div></div>`;
  }
  const c = M.compareCard(state.titles, f);
  const tab = ['common', 'picks', 'gaps'].includes(state.ui.friendTab) ? state.ui.friendTab : 'common';
  const kinds = M.KINDS.map((k) => [k, f.titles.filter((x) => x.kind === k).length]).filter(([, n]) => n)
    .map(([k, n]) => `${n} ${n === 1 ? KIND_ONE[k] : KIND_PLURAL[k]}`);
  const tabs = [
    ['common', 'In common', c.common.length],
    ['picks', `${f.name} has seen`, c.picks.length],
    ['gaps', 'Disagreements', c.gaps.length]
  ];
  const lists = { common: c.common, picks: c.picks, gaps: c.gaps };
  const list = lists[tab];
  const limit = state.ui.friendAll ? list.length : 30;
  const shown = list.slice(0, limit);
  const heads = {
    common: ['In common', 'Both scores side by side, your shared favorites first.', `Titles you have both seen show up here.`],
    picks: [`${f.name} has seen, not you`, `Best first. Add one to your watchlist: it comes with “Recommended by ${f.name}”.`, `You have seen everything ${f.name} has. Impressive.`],
    gaps: ['Disagreements', 'Two points apart or more, biggest first.', 'No big disagreement. You two are in sync.']
  };
  const [title, hint, empty] = heads[tab];
  const pct = c.agreement;
  const readouts = [
    ['In common', c.common.length, ''],
    ['Within 1 point', c.scored ? `${c.within}/${c.scored}` : '—', ''],
    ['Your average', c.myAvg === null ? '—' : c.myAvg.toFixed(1), 'you'],
    [`${f.name} average`, c.theirAvg === null ? '—' : c.theirAvg.toFixed(1), 'them'],
    ['Both favorites', c.bothFav, '']
  ];
  return `<div class="page page-friend">
<nav class="crumbs crumbs-static" aria-label="Breadcrumb"><ol><li><a href="#/">Home</a></li><li aria-hidden="true">/</li><li><button type="button" class="link-btn crumb-btn" data-action="friends-toggle">Friends</button></li><li aria-hidden="true">/</li><li aria-current="page">${esc(f.name)}</li></ol></nav>
<div class="fr-head">
<div class="fr-id">${nick(f.name, 'xl')}<div class="titles"><span class="eyebrow">// Friend · card from ${esc(M.fmtDate(f.at, true))}</span><h1 class="display display-md">${esc(f.name)}</h1><span class="fr-kinds">${esc([`${f.titles.length} titles`, ...kinds].join(' · '))}</span></div></div>
<div class="actions"><button type="button" class="btn btn-ghost" data-action="card-pick">${icon.upload}Load a newer card</button><button type="button" class="btn btn-ghost btn-danger" data-action="friend-remove" data-id="${esc(f.id)}">Remove</button></div>
</div>
<section class="fr-board" aria-label="Overview">
<span class="corner c-tl" aria-hidden="true"></span><span class="corner c-tr" aria-hidden="true"></span><span class="corner c-bl" aria-hidden="true"></span><span class="corner c-br" aria-hidden="true"></span>
<div class="fr-tabs" role="tablist" aria-label="Compare with ${esc(f.name)}">${tabs.map(([id, label, n]) => `<button type="button" role="tab" class="fr-tab" id="tab-${id}" data-action="friend-tab" data-tab="${id}" aria-selected="${tab === id}" aria-controls="fr-panel"><span>${esc(label)}</span><span class="fr-tab-n">${n}</span></button>`).join('')}</div>
<div class="fr-ring">${ring(pct || 0, 135, 22)}<div class="fr-ring-in"><span class="fr-pct">${pct === null ? '—' : pct + '%'}</span><span class="fr-ring-label">Agreement</span><span class="fr-ring-sub">${c.scored ? `${c.within} of ${c.scored} within 1 point` : 'Rate titles you both saw'}</span></div></div>
<dl class="fr-read">${readouts.map(([label, value, cls]) => `<div><dt>${esc(label)}</dt><span class="dots" aria-hidden="true"></span><dd${cls ? ` class="${cls}"` : ''}>${esc(value)}</dd></div>`).join('')}</dl>
</section>
<section class="fr-panel" id="fr-panel" role="tabpanel" aria-labelledby="tab-${tab}">
<div class="sec-head"><h2 class="h2"><span class="sq" aria-hidden="true"></span>${esc(title)}<span class="head-count">${list.length}</span></h2><span class="fr-hint">${esc(hint)}</span></div>
${shown.length ? `<ol class="fr-list">${shown.map((x, i) => (tab === 'picks' ? pickRow(x, i, f.name) : duelRow(x, f.name))).join('')}</ol>` : `<p class="empty-line">${esc(empty)}</p>`}
${list.length > shown.length ? `<button type="button" class="link-btn fr-more" data-action="friend-all">Show all ${list.length}</button>` : ''}
</section>
</div>`;
}

/* ---------- TV mode ---------- */

function tvMeta(t) {
  const score = M.effectiveScore(t);
  return [score !== null ? `★ ${score.toFixed(1)}` : '', M.KIND_LABEL[t.kind], t.year].filter(Boolean).join(' · ');
}

function tvCard(t, rank = 0) {
  return `<button type="button" class="tv-card" data-action="tv-open" data-id="${esc(t.id)}" data-tv data-key="tv-${esc(t.id)}" aria-label="${esc([rank ? `Number ${rank}` : '', t.title, tvMeta(t)].filter(Boolean).join(', '))}">
<span class="tv-poster" style="background:${M.artFor(t)}">${t.poster ? `<img src="${esc(t.poster)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="tv-poster-title">${esc(t.title)}</span>`}${rank ? `<span class="tv-rank" aria-hidden="true">${rank}</span>` : ''}</span>
<span class="tv-card-title">${esc(t.title)}</span>
<span class="tv-card-meta">${esc(tvMeta(t))}</span>
</button>`;
}

function tvDetail(t) {
  const score = M.effectiveScore(t);
  const p = M.progress(t);
  const facts = [M.KIND_LABEL[t.kind], t.year, M.hasEpisodes(t) && t.seasons.length ? `${t.seasons.length} season${t.seasons.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
  const who = (t.makers || []).length ? `${M.MAKER_LABEL[t.makers[0].role] || "By"} ${t.makers.map((m) => m.name).join(", ")}` : "";
  const where = (t.providers || []).map((x) => x.name).join(', ');
  return `<section class="tv-detail" role="dialog" aria-modal="true" aria-labelledby="tvd-title" data-key="tvd-${esc(t.id)}">
<div class="tv-detail-in">
<span class="tv-poster tv-poster-lg" style="background:${M.artFor(t)}" aria-hidden="true">${t.poster ? `<img src="${esc(t.poster)}" alt="" referrerpolicy="no-referrer">` : `<span class="tv-poster-title">${esc(t.title)}</span>`}</span>
<div class="tv-detail-text">
<span class="tv-eyebrow">// ${esc(facts)}</span>
<h2 class="tv-detail-title" id="tvd-title">${esc(t.title)}</h2>
${t.titleQc && t.titleQc !== t.title ? `<p class="tv-detail-qc">${esc(t.titleQc)}</p>` : ''}
<p class="tv-detail-score">${score !== null ? `<b>★ ${score.toFixed(1)}</b>` : ''}<span>${esc(M.STATUS_LABEL[t.status])}${M.hasEpisodes(t) && p.total ? ` · ${p.watched}/${p.total} episodes` : ''}</span></p>
${t.genres.length ? `<p class="tv-detail-genres">${t.genres.map((g) => `<span>${esc(g)}</span>`).join('')}</p>` : ''}
${who ? `<p class="tv-detail-line">${esc(who)}</p>` : ''}
${where ? `<p class="tv-detail-line">Where to watch: ${esc(where)}</p>` : ''}
${t.overview ? `<p class="tv-detail-overview">${esc(t.overview)}</p>` : ''}
<button type="button" class="tv-btn" data-action="tv-close" data-tv id="tv-back">Back</button>
</div>
</div>
</section>`;
}

export function tvView(state) {
  const section = ['top', 'home', 'tonight'].includes(state.route.section) ? state.route.section : 'top';
  const all = M.live(state.titles);
  const tabs = [['top', 'Top'], ['home', 'Home'], ['tonight', 'Tonight']];
  let body = '';
  if (section === 'top') {
    const rated = M.sortTitles(all.filter((t) => M.effectiveScore(t) !== null), 'score');
    body = rated.length
      ? `<h1 class="tv-h1">Your top <span>${rated.length}</span></h1><div class="tv-grid">${rated.map((t, i) => tvCard(t, i + 1)).join('')}</div>`
      : '<p class="tv-empty">Rate a few titles to see your top here.</p>';
  } else if (section === 'home') {
    const rows = [
      ['Continue', M.sortTitles(all.filter((t) => t.status === 'progress'), 'recent')],
      ['New Seasons', all.filter((t) => t.newSeason !== null)],
      ['Watchlist', M.sortTitles(all.filter((t) => t.status === 'watchlist'), 'recent')]
    ].filter(([, list]) => list.length);
    body = rows.length
      ? rows.map(([title, list]) => `<section class="tv-row" aria-label="${title}"><h2 class="tv-h2">${title} <span>${list.length}</span></h2><div class="tv-strip">${list.map((t) => tvCard(t)).join('')}</div></section>`).join('')
      : '<p class="tv-empty">Nothing to show yet.</p>';
  } else {
    const pool = all.filter((t) => t.status === 'watchlist');
    const kinds = M.KINDS.filter((k) => pool.some((t) => t.kind === k));
    const filter = kinds.includes(state.ui.tvKind) ? state.ui.tvKind : 'all';
    const pick = state.ui.tvShow ? all.find((t) => t.id === state.ui.tvShow) : null;
    const chips = [['all', 'Everything'], ...kinds.map((k) => [k, M.KIND_TAB[k]])];
    body = !pool.length
      ? '<h1 class="tv-h1">Tonight</h1><p class="tv-empty">Your watchlist is empty. Add a few titles to it, then come back to pick one.</p>'
      : `<h1 class="tv-h1">Tonight</h1>
<p class="tv-sub">Rewinder picks from your watchlist.</p>
<div class="tv-chips" role="group" aria-label="Pick among">${chips.map(([k, label]) => `<button type="button" class="tv-chip" data-action="tv-kind" data-kind="${k}" data-tv aria-pressed="${filter === k}">${label}</button>`).join('')}</div>
<div class="tv-pick${state.ui.tvSpin ? ' spinning' : ''}">
${pick ? `<span class="tv-poster tv-poster-xl" style="background:${M.artFor(pick)}" aria-hidden="true">${pick.poster ? `<img src="${esc(pick.poster)}" alt="" referrerpolicy="no-referrer">` : `<span class="tv-poster-title">${esc(pick.title)}</span>`}</span>
<div class="tv-pick-text" aria-live="polite">${state.ui.tvSpin ? '<span class="tv-eyebrow">// Picking…</span>' : `<span class="tv-eyebrow">// Tonight</span><h2 class="tv-detail-title">${esc(pick.title)}</h2><p class="tv-detail-line">${esc(tvMeta(pick))}</p>${pick.genres.length ? `<p class="tv-detail-genres">${pick.genres.map((g) => `<span>${esc(g)}</span>`).join('')}</p>` : ''}${(pick.providers || []).length ? `<p class="tv-detail-line">Where to watch: ${esc(pick.providers.map((x) => x.name).join(', '))}</p>` : ''}`}
<div class="tv-actions"><button type="button" class="tv-btn tv-btn-main" id="tv-pick" data-action="tv-pick" data-tv${state.ui.tvSpin ? ' disabled' : ''}>${icon.dice}Pick again</button>${state.ui.tvSpin ? '' : `<button type="button" class="tv-btn" data-action="tv-open" data-id="${esc(pick.id)}" data-tv>More about it</button>`}</div>
</div>` : `<button type="button" class="tv-btn tv-btn-main tv-btn-big" id="tv-pick" data-action="tv-pick" data-tv>${icon.dice}Pick for me</button>`}
</div>`;
  }
  const detail = state.ui.tvDetail ? all.find((t) => t.id === state.ui.tvDetail) : null;
  return `<div class="tv${detail ? ' has-detail' : ''}">
<header class="tv-top">
<span class="tv-brand"><img src="icons/logo-64.png" alt="" width="40" height="40"><span>REWINDER</span></span>
<nav class="tv-tabs" aria-label="TV sections">${tabs.map(([id, label]) => `<a class="tv-tab" href="#/tv-mode/${id}" data-tv${section === id ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
<button type="button" class="tv-exit" data-action="tv-exit" data-tv>Exit TV mode</button>
</header>
<div class="tv-body">${body}</div>
<p class="tv-hint" aria-hidden="true">Arrows to move · Enter to open · Back to leave</p>
${detail ? tvDetail(detail) : ''}
</div>`;
}

/* ---------- guides ---------- */

const step = (title, text, extra = '') => `<li class="gd-step"><h3>${title}</h3><p>${text}</p>${extra}</li>`;

export function guidesView(state) {
  const tab = ['pc', 'phone', 'tv'].includes(state.ui.guideTab) ? state.ui.guideTab : 'pc';
  const tabs = [['pc', 'Computer'], ['phone', 'Phone & tablet'], ['tv', 'TV']];
  const panes = {
    pc: [
      step('Install it', 'In Chrome, Edge or Brave, click the install icon at the right end of the address bar, or open the browser menu and choose <b>Install</b>. Rewinder then opens in its own window and works without internet.', state.canInstall ? `<button type="button" class="btn btn-primary" data-action="install">${icon.install}Install now</button>` : ''),
      step('Your keys', 'Scan needs your free TMDB key, and a RAWG key for games. The start guide walks you through it.', '<button type="button" class="btn btn-ghost" data-action="guide-open">Open the start guide</button>'),
      step('Keep a copy', '<b>Settings → Download backup</b> saves your whole list in one file. In Chrome and Edge, Rewinder can also save a copy in a folder of yours, once a day.'),
      step('On the TV', 'See the <b>TV</b> tab: an HDMI cable, or Chrome’s <b>Cast</b> to a Chromecast. No sign-up needed.')
    ],
    phone: [
      step('Android', 'Open the link in Chrome, then <b>⋮ → Install app</b> (or <b>Add to Home screen</b>). Rewinder gets its own icon.'),
      step('iPhone and iPad', 'Open the link in Safari, then <b>Share → Add to Home Screen</b>. Do it first, then always open Rewinder from that icon: it keeps its own list, apart from Safari, and Safari can erase a website’s data after 7 days without a visit.'),
      step('Your list from the computer', 'Each device keeps its own list. On the computer: <b>Settings → Download backup</b>. Send the file to yourself (email, Discord, Drive). On the phone: <b>Settings → Restore a backup</b>. Your keys are never in a backup: paste them again in Settings.'),
      step('Find your way', 'The bar at the bottom: <b>Home</b>, <b>All</b>, <b>Scan</b>, <b>List</b> and <b>Friends</b>. Search and Settings are at the top.'),
      step('Friends', '<b>Friends → Share my card</b> opens the share menu: Messenger, Discord, texts. A card you receive: save the file, then <b>Friends → Add a friend’s card</b>.')
    ],
    tv: [
      step('Android phone or tablet + Chromecast or Google TV', 'In the Google Home app, pick your TV, then <b>Cast my screen</b>. Turn the phone sideways.'),
      step('iPhone or iPad + Apple TV or an AirPlay TV', 'Open Control Center, then <b>Screen Mirroring</b> and pick your TV. Turn the device sideways.'),
      step('Computer + Chromecast or Google TV', 'In Chrome: <b>⋮ → Cast, save and share → Cast…</b> and pick your TV. Or plug the computer into the TV with an HDMI cable.'),
      step('Then: TV mode', 'Big posters for the couch: your <b>Top</b>, <b>Home</b> in big, and <b>Tonight</b>, which picks something from your watchlist. Arrows (or the remote) move, Enter opens, Back or Escape leaves. For a TV button at the top of every page: <b>Settings → TV</b>.', `<button type="button" class="btn btn-primary" data-action="tv-enter">${icon.tv}Open TV mode</button>`)
    ]
  };
  return `<div class="page page-guides">
<div class="page-head"><div class="titles"><span class="eyebrow">// Help</span><h1 class="display display-md">Guides</h1></div></div>
<div class="gd-tabs" role="tablist" aria-label="Guides">${tabs.map(([id, label]) => `<button type="button" role="tab" class="gd-tab" id="gd-${id}" data-action="guide-tab" data-tab="${id}" aria-selected="${tab === id}" aria-controls="gd-pane">${label}</button>`).join('')}</div>
<section class="gd-pane" id="gd-pane" role="tabpanel" aria-labelledby="gd-${tab}">
${tab === 'tv' ? '<p class="gd-lead">No sign-up, nothing to install on the TV: show your screen on it, then open TV mode.</p>' : ''}
<ol class="gd-steps">${panes[tab].join('')}</ol>
</section>
</div>`;
}

/* ---------- add several: the page to rate them ---------- */

function batchRow(state, j) {
  if (j.state === 'run' || j.state === 'wait') {
    return `<li class="bat-row bat-wait" data-key="bj-${esc(j.key)}"><span class="bat-thumb" aria-hidden="true"></span><span class="bat-main"><span class="bat-title">${esc(j.title)}</span><span class="bat-sub">Adding…</span></span></li>`;
  }
  if (j.state === 'fail') {
    return `<li class="bat-row bat-fail" data-key="bj-${esc(j.key)}"><span class="bat-thumb" aria-hidden="true"></span><span class="bat-main"><span class="bat-title">${esc(j.title)}</span><span class="bat-sub">Not added · ${esc(j.error)}</span></span><span class="bat-tools"><button type="button" class="btn btn-ghost btn-sm" data-action="batch-retry" data-key="${esc(j.key)}">Try again</button></span></li>`;
  }
  const t = state.titles.find((x) => x.id === j.titleId);
  if (!t || t.deletedAt) return '';
  const dup = j.state === 'dup';
  const id = esc(t.id);
  return `<li class="bat-row" data-key="bt-${id}">
<a class="bat-thumb" href="${tHref(t)}" style="background:${M.artFor(t)}" tabindex="-1" aria-hidden="true">${t.poster ? `<img src="${esc(t.poster)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</a>
<span class="bat-main"><a class="bat-title" href="${tHref(t)}">${esc(t.title)}</a><span class="bat-sub">${esc([M.KIND_LABEL[t.kind], t.year].filter(Boolean).join(' · '))}${dup ? ' · was already in your list' : ''}</span></span>
<span class="bat-status"><label class="sr" for="bs-${id}">Status for ${esc(t.title)}</label><select id="bs-${id}" class="select select-sm" data-batch-status="${id}">${M.STATUSES.map((x) => `<option value="${x}"${x === t.status ? ' selected' : ''}>${M.STATUS_LABEL[x]}</option>`).join('')}</select></span>
<span class="bat-rate">${rater({ key: 'row:' + t.id, value: M.effectiveScore(t), label: `Score for ${t.title}`, size: 'sm' })}</span>
<span class="bat-tools">${dup ? '' : `<button type="button" class="icon-btn" data-action="batch-remove" data-id="${id}" aria-label="Remove ${esc(t.title)}" title="Remove">${icon.trash}</button>`}</span>
</li>`;
}

export function addedView(state) {
  const jobs = state.batch.queue;
  const head = '<div class="page-head"><div class="titles"><span class="eyebrow">// Add several</span><h1 class="display display-md">Just added</h1></div>';
  if (!jobs.length) {
    return `<div class="page page-added">${head}</div>
<div class="empty-box"><p class="lead">Nothing waiting to be rated.</p><p class="set-text dim">In Scan, turn on Add several: every title you pick lands here.</p><button type="button" class="btn btn-primary" data-action="batch-more">${icon.radar}Scan</button></div>
</div>`;
  }
  const live = jobs.filter((j) => j.state === 'ok' || j.state === 'dup').map((j) => state.titles.find((x) => x.id === j.titleId)).filter((t) => t && !t.deletedAt);
  const rated = live.filter((t) => M.effectiveScore(t) !== null).length;
  const adding = jobs.filter((j) => j.state === 'run' || j.state === 'wait').length;
  const summary = [plural(live.length, 'title'), `${rated} rated`, adding ? `${adding} adding` : ''].filter(Boolean).join(' · ');
  return `<div class="page page-added">${head}<span class="head-count">${esc(summary)}</span></div>
<p class="set-text dim">Score them, fix a status, remove a wrong one: everything saves as you go. Completed counts as seen, date unknown; change it on the title's page.</p>
<ol class="bat-list">${jobs.map((j) => batchRow(state, j)).join('')}</ol>
<div class="actions"><button type="button" class="btn btn-primary" data-action="batch-done">Done</button><button type="button" class="btn btn-ghost" data-action="batch-more">${icon.radar}Add more</button></div>
</div>`;
}

/* ---------- scan ---------- */

export function scanResults(scan, titles) {
  if (scan.busy) return `<div class="scan-wait"><span class="scan-line" aria-hidden="true"></span>${icon.radar}<span>${esc(scan.busy)}</span></div>`;
  if (scan.error) return `<p class="dlg-error scan-msg">${esc(scan.error)}</p>`;
  const notes = (scan.notes || []).map((n) => `<p class="scan-note">${esc(n)}</p>`).join('');
  if (scan.loading) return '<p class="scan-hint">Searching…</p>';
  if (scan.query.trim().length < 2) return `${notes}<p class="scan-hint">Type a title. Results come from ${scan.sources.map((x) => x.toUpperCase()).join(' and ')}.</p>`;
  if (!scan.results.length) return `${notes}<p class="scan-hint">Nothing found.${scan.mode === 'link' ? ' Try another spelling.' : ' Try another spelling, or add it by hand.'}</p>`;
  return `${notes}<ul class="scan-list">${scan.results.map((r) => {
    const mine = titles.find((t) => !t.deletedAt && t.id !== scan.linkId && (r.type === 'game' ? t.rawgId === r.id : t.tmdbId === r.id && t.tmdbType === r.type));
    const sub = [M.KIND_LABEL[r.kind], r.year, r.original].filter(Boolean).join(' · ');
    return `<li><button type="button" class="scan-item" data-action="scan-pick" data-type="${esc(r.type)}" data-id="${Number(r.id) || 0}"${mine ? ` data-open="${esc(mine.id)}"` : ''}>
<span class="scan-thumb" style="background:${M.artFor({ title: r.title })}" aria-hidden="true">${r.poster ? `<img src="${esc(r.poster)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</span>
<span class="scan-info"><span class="scan-title">${esc(r.title)}</span><span class="scan-sub">${esc(sub)}</span></span>${mine ? '<span class="tag-soft">In your list</span>' : ''}
</button></li>`;
  }).join('')}</ul>`;
}

// Add several: what was added from this Scan, newest first.
export function scanTally(batch) {
  const jobs = batch ? batch.queue : [];
  const ok = jobs.filter((j) => j.state === 'ok').length;
  const shown = jobs.slice(-8).reverse();
  const mark = { ok: '✓', run: '', wait: '', fail: '!', dup: '' };
  const why = (j) => (j.state === 'fail' ? `${j.title}: not added. ${j.error}` : j.state === 'dup' ? `${j.title} is already in your list` : j.state === 'ok' ? `${j.title} added` : `Adding ${j.title}`);
  if (!jobs.length) return batch && batch.on ? '<p class="tally-hint">Each title you pick is added right away. Keep going, then Done.</p>' : '';
  return `<div class="tally-head"><span class="eyebrow">// Added</span><span class="tally-count">${ok}</span></div>
<ul class="tally">${shown.map((j) => `<li class="tally-chip is-${j.state === 'wait' ? 'run' : j.state}" title="${esc(why(j))}"><span class="tally-mark" aria-hidden="true">${mark[j.state] || ''}</span><span class="tally-name">${esc(j.title)}</span>${j.state === 'dup' ? '<span class="tally-tag" aria-hidden="true">in your list</span>' : ''}<span class="sr">: ${esc(j.state === 'ok' ? 'added' : j.state === 'fail' ? `not added, ${j.error}` : j.state === 'dup' ? 'already in your list' : 'adding')}</span></li>`).join('')}${jobs.length > shown.length ? `<li class="tally-more">+${jobs.length - shown.length}</li>` : ''}</ul>`;
}

export function scanFootButtons(scan, batch) {
  const link = scan.mode === 'link';
  const n = batch ? batch.queue.filter((j) => j.state !== 'fail').length : 0;
  return `${link ? '' : '<button type="button" class="btn btn-dashed" data-action="scan-manual">Add it by hand</button>'}${!link && n ? `<button type="button" class="btn btn-primary" data-action="scan-done" id="scan-done">Done · review ${n}</button>` : ''}<button type="button" class="btn btn-ghost" data-action="dlg-close">Close</button>`;
}

export function scanDialog(scan, titles, batch) {
  const link = scan.mode === 'link';
  return `<div class="dlg-form scan" data-scan>
<div class="dlg-head"><span class="eyebrow">// Scan</span><h2 class="dlg-title" id="dlg-title">${link ? `Find ${esc(scan.linkTitle)}` : 'Add a title'}</h2></div>
${link ? '<p class="dlg-note">Pick the right one: posters, episodes, dates and cast fill in. Your checks, scores and notes stay.</p>' : ''}
<form class="scan-bar" data-form="scan-search" role="search" autocomplete="off">
<div class="search scan-search">${icon.search}<label class="sr" for="scan-q">Search</label><input id="scan-q" type="search" name="q" value="${esc(scan.query)}" placeholder="${scan.sources.includes('tmdb') && scan.sources.includes('rawg') ? 'Movie, TV show, anime or game' : scan.sources.includes('rawg') ? 'Game' : 'Movie, TV show or anime'}" spellcheck="false"></div>
${link ? '' : `<label class="sr" for="scan-status">Status</label><select id="scan-status" class="select" name="status">${M.STATUSES.map((s) => `<option value="${s}"${s === scan.status ? ' selected' : ''}>${M.STATUS_LABEL[s]}</option>`).join('')}</select>`}
</form>
${link ? '' : `<div class="scan-multi"><label class="switch switch-sm"><input type="checkbox" role="switch" id="scan-multi"${batch && batch.on ? ' checked' : ''}><span class="switch-ui" aria-hidden="true"></span>Add several</label><span class="scan-multi-note">Stay here and keep adding, rate them all after.</span></div>`}
<div class="scan-results" id="scan-results" aria-live="polite">${scanResults(scan, titles)}</div>
${link ? '' : `<div class="scan-tally" id="scan-tally" aria-live="polite">${scanTally(batch)}</div>`}
<div class="dlg-actions scan-foot"><span class="scan-credit">Search by ${scan.sources.map((x) => x === 'tmdb' ? '<a href="https://www.themoviedb.org" target="_blank" rel="noopener">TMDB</a>' : '<a href="https://rawg.io" target="_blank" rel="noopener">RAWG</a>').join(' · ')}</span><span class="actions" id="scan-foot-btns">${scanFootButtons(scan, batch)}</span></div>
</div>`;
}

/* ---------- import a list ---------- */

const IMPORT_HINT = `Shonen:
One Piece : 9.8/10
Frieren : S1 9.2/10 — S2
Death Note`;

function importPaste(state) {
  const imp = state.imp;
  const needKey = imp.kind && !(imp.kind === 'game' ? state.settings.rawgKey : state.settings.tmdbKey);
  return `<section class="set-sec imp-paste" aria-labelledby="imp-h">
<h2 class="sr" id="imp-h">Paste your list</h2>
<div class="field"><span class="label" id="imp-kind-lbl">What's in this list?</span>
<div class="chips" role="group" aria-labelledby="imp-kind-lbl">${M.KINDS.map((k) => `<button type="button" class="chip" data-action="imp-kind" data-kind="${k}" aria-pressed="${imp.kind === k}">${M.KIND_TAB[k]}</button>`).join('')}</div></div>
<div class="field"><label class="label" for="imp-text">Your list</label>
<textarea id="imp-text" class="textarea imp-text" rows="14" spellcheck="false" placeholder="${esc(IMPORT_HINT)}">${esc(imp.text)}</textarea></div>
<p class="set-text dim">One title per line. Scores like 8.5 or 8.5/10, seasons like S1 7.9 — S2 7.7. A line alone above a group is the group's name. Nothing is added before you check.</p>
${needKey ? `<p class="scan-note">No ${imp.kind === 'game' ? 'RAWG' : 'TMDB'} key in Settings: the titles will come in by hand, without posters or episodes.</p>` : ''}
<div class="actions imp-actions">
<button type="button" class="btn btn-ghost" data-action="imp-file">${icon.upload}Open a .txt file</button>
<label class="switch"><input type="checkbox" id="imp-tags" data-imp="useTags"${imp.useTags ? ' checked' : ''}><span class="switch-ui" aria-hidden="true"></span>Group names become tags</label>
<button type="button" class="btn btn-primary" data-action="imp-read"${imp.kind && imp.text.trim() ? '' : ' disabled'}>Read the list</button>
</div>
</section>`;
}

function importMatchCell(it, state) {
  const existing = it.existingId ? state.titles.find((t) => t.id === it.existingId) : null;
  if (existing) return `<span class="imp-thumb" style="background:${M.artFor(existing)}">${existing.poster ? `<img src="${esc(existing.poster)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</span><span class="imp-m"><span class="imp-m-title">${esc(existing.title)}</span><span class="imp-m-sub">In your list · scores and tags get added</span></span>`;
  if (!it.searched && !state.imp.noKey) return '<span class="imp-m-sub imp-wait">Searching…</span>';
  if (it.quality === 'error') return `<span class="tag-warn">Error</span><span class="imp-m-sub">${esc(it.error || 'Search failed')} · added by hand</span>`;
  if (!it.match) return `${state.imp.noKey ? '' : '<span class="tag-warn">Not found</span>'}<span class="imp-m-sub">Added by hand</span>`;
  const r = it.match;
  const listKind = state.imp.kind;
  // Only say the kind when it differs from the list's (a show in the movie list, a movie in the anime list).
  const odd = (listKind === 'movie' && r.type === 'tv') || ((listKind === 'tv' || listKind === 'anime') && r.type === 'movie');
  const sub = [odd ? M.KIND_LABEL[r.kind] : '', r.year, r.original].filter(Boolean).join(' · ');
  return `<span class="imp-thumb" style="background:${M.artFor({ title: r.title })}">${r.poster ? `<img src="${esc(r.poster)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</span><span class="imp-m"><span class="imp-m-title">${esc(r.title)}</span><span class="imp-m-sub">${esc(sub)}</span></span>${it.quality === 'check' ? '<span class="tag-warn">Check</span>' : ''}`;
}

function importChange(it, state) {
  const imp = state.imp;
  const list = imp.changeResults || it.candidates || [];
  return `<div class="imp-change">
<div class="search">${icon.search}<label class="sr" for="imp-q">Search for ${esc(it.title)}</label><input id="imp-q" type="search" value="${esc(imp.changeQuery)}" data-imp-q="${it.id}" autocomplete="off" spellcheck="false"></div>
${imp.changeLoading ? '<p class="scan-hint">Searching…</p>' : list.length ? `<ul class="scan-list">${list.map((r) => `<li><button type="button" class="scan-item" data-action="imp-pick" data-id="${it.id}" data-type="${esc(r.type)}" data-rid="${Number(r.id) || 0}"><span class="scan-thumb" style="background:${M.artFor({ title: r.title })}" aria-hidden="true">${r.poster ? `<img src="${esc(r.poster)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</span><span class="scan-info"><span class="scan-title">${esc(r.title)}</span><span class="scan-sub">${esc([M.KIND_LABEL[r.kind], r.year, r.original].filter(Boolean).join(' · '))}</span></span></button></li>`).join('')}</ul>` : '<p class="scan-hint">Nothing found. Try another spelling.</p>'}
<div class="actions"><button type="button" class="btn btn-ghost btn-sm" data-action="imp-nomatch" data-id="${it.id}">No match: add it by hand</button><button type="button" class="btn btn-ghost btn-sm" data-action="imp-change" data-id="${it.id}">Done</button></div>
</div>`;
}

function importRow(it, state) {
  const imp = state.imp;
  if (it.heading) {
    return `<li class="imp-group" data-key="ig-${it.id}"><span class="imp-group-name">// ${esc(it.title)}</span><button type="button" class="link-btn" data-action="imp-heading" data-id="${it.id}">It's a title</button></li>`;
  }
  const rated = it.score !== null || it.seasons.length > 0;
  const tags = L.tagsFor(it, imp.useTags);
  const warn = !it.existingId && it.searched && (it.quality === 'check' || !it.match) && !imp.noKey;
  return `<li class="imp-row${it.include ? '' : ' off'}${warn ? ' warn' : ''}" data-key="ir-${it.id}">
<input type="checkbox" id="imp-in-${it.id}" data-imp-include="${it.id}"${it.include ? ' checked' : ''} aria-label="Import ${esc(it.title)}">
<span class="imp-line"><span class="imp-title">${esc(it.title)}</span><span class="imp-score">${esc(L.scoreSummary(it) || 'no score')}</span></span>
<span class="imp-match">${importMatchCell(it, state)}</span>
<span class="imp-status"><label class="sr" for="imp-st-${it.id}">Status for ${esc(it.title)}</label><select id="imp-st-${it.id}" class="select select-sm" data-imp-status="${it.id}"${it.existingId ? ' disabled title="Your status stays"' : ''}>${M.STATUSES.map((s) => `<option value="${s}"${s === it.status ? ' selected' : ''}>${M.STATUS_LABEL[s]}</option>`).join('')}</select></span>
<span class="imp-tags">${tags.map((x) => `<span>#${esc(x)}</span>`).join('')}</span>
<span class="imp-tools">${it.existingId || imp.noKey ? '' : `<button type="button" class="btn btn-ghost btn-sm" data-action="imp-change" data-id="${it.id}">Change</button>`}${rated ? '' : `<button type="button" class="link-btn" data-action="imp-heading" data-id="${it.id}" title="This line is a group name">Group</button>`}</span>
${imp.changeId === it.id ? importChange(it, state) : ''}
</li>`;
}

function importReview(state) {
  const imp = state.imp;
  const titles = imp.items.filter((it) => !it.heading);
  const groups = imp.items.length - titles.length;
  const chosen = titles.filter((it) => it.include);
  const toCheck = titles.filter((it) => it.include && !it.existingId && it.searched && (it.quality === 'check' || !it.match)).length;
  const inList = titles.filter((it) => it.include && it.existingId).length;
  const searched = titles.filter((it) => it.searched).length;
  const status = imp.matching
    ? `Matching with ${imp.kind === 'game' ? 'RAWG' : 'TMDB'}… ${searched} of ${titles.length}`
    : [plural(titles.length, 'title'), groups ? plural(groups, 'group') : '', toCheck ? `${toCheck} to check` : '', inList ? `${inList} already in your list` : ''].filter(Boolean).join(' · ');
  return `<div class="imp-bar"><span class="imp-summary">${esc(status)}</span><span class="actions"><button type="button" class="btn btn-ghost" data-action="imp-back">Back</button><button type="button" class="btn btn-primary" data-action="imp-run"${imp.matching || !chosen.length ? ' disabled' : ''}>Import ${chosen.length}</button></span></div>
${toCheck ? '<p class="set-text dim">The lines marked Check or Not found: open Change to pick the right one, or leave them as they are.</p>' : ''}
<ol class="imp-list">${imp.items.map((it) => importRow(it, state)).join('')}</ol>`;
}

function importRunning(state) {
  const imp = state.imp;
  const pct = imp.total ? Math.round((imp.done / imp.total) * 100) : 0;
  return `<section class="set-sec imp-run" aria-live="polite">
<span class="eyebrow">// Importing</span>
<p class="imp-count">${imp.done} / ${imp.total}</p>
<span class="bar-lg" aria-hidden="true"><span style="width:${pct}%"></span></span>
<p class="panel-sub">${esc(imp.current ? `Now: ${imp.current}` : '')}</p>
<p class="set-text dim">Keep Rewinder open. Anime genres come from AniList a few at a time, so a long list takes a minute or two.</p>
</section>`;
}

function importDone(state) {
  const r = state.imp.results || { added: 0, updated: 0, manual: 0, failed: [] };
  const parts = [r.added ? `${r.added} added with the Scan` : '', r.manual ? `${r.manual} added by hand` : '', r.updated ? `${r.updated} updated` : ''].filter(Boolean);
  return `<section class="set-sec imp-run">
<span class="eyebrow">// Done</span>
<p class="imp-count">${r.added + r.manual + r.updated}</p>
<p class="set-text">${esc(parts.join(' · ') || 'Nothing imported.')}</p>
${r.failed.length ? `<p class="dlg-error">Could not import: ${esc(r.failed.join(', '))}. Try them again with Scan.</p>` : ''}
<div class="actions"><a class="btn btn-primary" href="#/list">See the Full List</a><button type="button" class="btn btn-ghost" data-action="imp-again">Import another list</button></div>
</section>`;
}

export function importView(state) {
  const imp = state.imp;
  const body = imp.step === 'review' ? importReview(state) : imp.step === 'running' ? importRunning(state) : imp.step === 'done' ? importDone(state) : importPaste(state);
  const sub = imp.step === 'review' && imp.kind ? `// Review · ${M.KIND_TAB[imp.kind]}` : '// Bring your list';
  return `<div class="page page-import">
<div class="page-head"><div class="titles"><span class="eyebrow">${esc(sub)}</span><h1 class="display display-md">Import</h1></div></div>
${body}
</div>`;
}

/* ---------- start guide ---------- */

const GUIDE_STEPS = 5;

function keyBox(which, state) {
  const g = state.guide[which];
  const id = `g-${which}`;
  const name = which === 'tmdb' ? 'TMDB' : 'RAWG';
  const msg = g.state === 'checking' ? 'Checking…' : g.state === 'ok' ? `✓ The ${name} key works.` : g.state === 'bad' ? g.msg : '';
  return `<div class="guide-key"><label class="sr" for="${id}">${name} key</label><input id="${id}" class="input key-plain" data-guide-key="${which}" value="${esc(state.settings[which === 'tmdb' ? 'tmdbKey' : 'rawgKey'])}" placeholder="Paste your ${name} key" autocomplete="off" spellcheck="false" autocapitalize="off"><button type="button" class="btn btn-primary" data-action="guide-check" data-which="${which}"${g.state === 'checking' ? ' disabled' : ''}>Check</button></div>
<p class="guide-msg ${g.state}" role="status">${esc(msg)}</p>`;
}

function guideNav(state, nextLabel) {
  return `<div class="guide-nav"><button type="button" class="btn btn-ghost" data-action="guide-back">Back</button><button type="button" class="btn btn-primary" id="guide-next" data-action="guide-next">${esc(nextLabel)}</button></div>`;
}

function guideStep(state) {
  const at = state.guide.step;
  const appUrl = `${location.origin}${location.pathname}`;
  if (at === 0) {
    return `<div class="guide-hero">
<div class="guide-logo">${visor}<img src="icons/icon-512.png" alt="Rewinder logo" width="168" height="168"></div>
<div class="guide-text">
<span class="eyebrow">// Welcome</span>
<h1 class="display">Rewinder</h1>
<p class="lead">Movies, TV shows, anime and games. Rate them, track every episode, never forget what you watched.</p>
<p class="set-text dim">Four quick steps. Each one can be skipped.</p>
<div class="actions"><button type="button" class="btn btn-primary" id="guide-next" data-action="guide-next">Start</button></div>
</div>
</div>`;
  }
  if (at === 1) {
    const isPreset = M.PRESETS.some((p) => p.color.toLowerCase() === String(state.settings.accent).toLowerCase());
    return `<span class="eyebrow">// 1 · Your color</span>
<h1 class="display display-md">Pick your color</h1>
<p class="lead">It paints the whole app. You can change it anytime in Settings.</p>
<div class="guide-swatches" role="group" aria-label="Color">${M.PRESETS.map((p) => `<button type="button" class="g-swatch" data-action="accent" data-color="${p.color}" aria-pressed="${p.color.toLowerCase() === String(state.settings.accent).toLowerCase()}" style="--sw:${p.color}"><span class="g-sw-dot" aria-hidden="true"></span>${p.name}</button>`).join('')}<label class="g-swatch swatch-custom${isPreset ? '' : ' on'}" style="--sw:${isPreset || !M.isHexColor(state.settings.accent) ? '#5A6360' : state.settings.accent}"><span class="g-sw-dot" aria-hidden="true"></span>Custom<input type="color" id="g-accent" value="${esc(state.settings.accent)}" data-setting="accent" aria-label="Custom color"></label></div>
${guideNav(state, 'Next')}`;
  }
  if (at === 2) {
    const ok = state.guide.tmdb.state === 'ok' || state.settings.tmdbKey;
    return `<span class="eyebrow">// 2 · The Scan</span>
<h1 class="display display-md">Turn on the Scan</h1>
<p class="lead">The Scan fills in posters, episodes, cast and where to watch. It needs a free key from TMDB, the movie database. A few minutes, once.</p>
<ol class="guide-steps">
<li><span><b>Create a free account.</b></span><a class="btn btn-ghost btn-sm" href="https://www.themoviedb.org/signup" target="_blank" rel="noopener">Open TMDB ↗</a></li>
<li><span><b>Confirm the email</b> TMDB sends you.</span></li>
<li><span><b>Request a key</b> on the API page of your account settings. If asked, pick Developer. Type of use: Desktop Application. Name: Rewinder. URL: <code>${esc(appUrl)}</code>. Summary: “My personal watch list.” The form also asks for your address and phone number.</span><a class="btn btn-ghost btn-sm" href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener">Open the API page ↗</a></li>
<li><span><b>Copy the API Key</b> (the short one) and paste it here.</span></li>
</ol>
${keyBox('tmdb', state)}
${guideNav(state, ok ? 'Next' : 'Skip for now')}`;
  }
  if (at === 3) {
    const ok = state.guide.rawg.state === 'ok' || state.settings.rawgKey;
    return `<span class="eyebrow">// 3 · Games</span>
<h1 class="display display-md">Games too?</h1>
<p class="lead">Optional. Games come from RAWG, with its own free key.</p>
<ol class="guide-steps">
<li><span><b>Create an account</b> on RAWG.</span><a class="btn btn-ghost btn-sm" href="https://rawg.io/signup" target="_blank" rel="noopener">Open RAWG ↗</a></li>
<li><span><b>Get your key</b> on the API page.</span><a class="btn btn-ghost btn-sm" href="https://rawg.io/apidocs" target="_blank" rel="noopener">Open the API page ↗</a></li>
<li><span><b>Paste it here.</b></span></li>
</ol>
${keyBox('rawg', state)}
<p class="set-text dim">rawg.io is sometimes down. No stress: you can add this key later in Settings.</p>
${guideNav(state, ok ? 'Next' : 'Skip for now')}`;
  }
  return `<span class="eyebrow">// 4 · Ready</span>
<h1 class="display display-md">You're set</h1>
<div class="guide-choices">
<button type="button" class="g-choice" data-action="guide-to" data-to="#/import">${icon.rows}<b>Import a list</b><small>Got a list in Notepad? Bring it in.</small></button>
<button type="button" class="g-choice" data-action="guide-add">${icon.radar}<b>Add a title</b><small>Find it with the Scan, or add it by hand.</small></button>
${state.canInstall ? `<button type="button" class="g-choice" data-action="install">${icon.install}<b>Install Rewinder</b><small>Open it like any app, from the Start menu.</small></button>` : ''}
<button type="button" class="g-choice" data-action="guide-restore">${icon.upload}<b>Restore a backup</b><small>Moving from another computer?</small></button>
<button type="button" class="g-choice" data-action="guide-to" data-to="#/guides">${icon.book}<b>Phone, tablet, TV</b><small>How to get Rewinder there</small></button>
</div>
<p class="set-text dim">Your list stays on this computer. Settings → Backup keeps a copy safe.</p>
<div class="guide-nav"><button type="button" class="btn btn-ghost" data-action="guide-back">Back</button><button type="button" class="btn btn-primary" id="guide-next" data-action="guide-to" data-to="#/">Go to Home</button></div>`;
}

export function guideView(state) {
  const at = state.guide.step;
  return `<div class="guide">
<div class="guide-top"><span class="guide-brand"><img src="icons/logo-64.png" alt="" width="28" height="28">REWINDER</span><span class="guide-count">${M.pad2(at + 1)} / ${M.pad2(GUIDE_STEPS)}</span><button type="button" class="link-btn" data-action="guide-to" data-to="#/">Skip the guide</button></div>
<div class="segs guide-segs" aria-hidden="true" style="--n:${GUIDE_STEPS}">${Array.from({ length: GUIDE_STEPS }, (_, i) => `<span class="${i < at ? 'w' : i === at ? 'nx' : ''}"></span>`).join('')}</div>
<section class="guide-card${at === 0 ? ' guide-card-hero' : ''}" data-key="guide-${at}" aria-live="polite"><div class="scanlines" aria-hidden="true"></div>${corners}<div class="guide-body">${guideStep(state)}</div></section>
</div>`;
}
