// Rewinder — small UI building blocks: escaping, icons, stars, posters.
import { artFor, KIND_SHORT, fmtScore } from './model.js';

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);

const svg = (body, { size = 20, stroke = 1.8, fill = 'none', cls = '' } = {}) =>
  `<svg aria-hidden="true" focusable="false" class="ico${cls ? ' ' + cls : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const STAR_PATH = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z';
const HEART_PATH = 'M12 20s-7-4.4-9.2-8.6C1.3 8.6 2.9 5 6.4 5c2 0 3.6 1.2 4.6 2.8C12 6.2 13.6 5 15.6 5c3.5 0 5.1 3.6 3.6 6.4C19 15.6 12 20 12 20z';

export const icon = {
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', { size: 18, stroke: 2 }),
  radar: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l6-6"/>', { size: 18, stroke: 2 }),
  sliders: svg('<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>'),
  eyeOff: svg('<path d="M3 3l18 18"/><path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-3.1 3.6"/><path d="M6.5 6.6C4.3 8.1 3 10.2 3 12c0 0 4 6 9 6a9.4 9.4 0 0 0 4.3-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  heart: svg(`<path d="${HEART_PATH}"/>`),
  heartOn: svg(`<path d="${HEART_PATH}"/>`, { fill: 'currentColor' }),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', { size: 18, stroke: 2.4 }),
  checkSm: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', { size: 12, stroke: 3 }),
  chevron: svg('<path d="M6 9l6 6 6-6"/>', { size: 18, stroke: 2, cls: 'chev' }),
  chevLeft: svg('<path d="M15 6l-6 6 6 6"/>', { size: 20, stroke: 2 }),
  chevRight: svg('<path d="M9 6l6 6-6 6"/>', { size: 20, stroke: 2 }),
  sideLeft: '<svg class="side-svg" viewBox="0 0 48 200" aria-hidden="true" focusable="false" fill="none" stroke="currentColor"><path class="sv-echo" d="M47 46 L29 100 L47 154" stroke-width="1.25"/><path class="sv-main" d="M40 6 L12 100 L40 194" stroke-width="3" stroke-linecap="square"/><path class="sv-tick" d="M12 100 H1" stroke-width="2"/></svg>',
  sideRight: '<svg class="side-svg" viewBox="0 0 48 200" aria-hidden="true" focusable="false" fill="none" stroke="currentColor"><path class="sv-echo" d="M1 46 L19 100 L1 154" stroke-width="1.25"/><path class="sv-main" d="M8 6 L36 100 L8 194" stroke-width="3" stroke-linecap="square"/><path class="sv-tick" d="M36 100 H47" stroke-width="2"/></svg>',
  plus: svg('<path d="M12 5v14M5 12h14"/>', { size: 16, stroke: 2.2 }),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>', { size: 14, stroke: 2.2 }),
  edit: svg('<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M13.5 8.5l2 2"/>', { size: 18 }),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', { size: 16 }),
  download: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', { size: 18 }),
  upload: svg('<path d="M12 16V5M7 10l5-5 5 5M5 20h14"/>', { size: 18 }),
  install: svg('<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M12 8v6M9 11l3 3 3-3M8 20h8"/>', { size: 18 }),
  grid: svg('<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>', { size: 18 }),
  rows: svg('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h1M4 12h1M4 18h1"/>', { size: 18, stroke: 2.2 }),
  note: svg('<path d="M5 5h14v10H9l-4 4z"/>', { size: 13, stroke: 2 }),
  star: `<svg aria-hidden="true" focusable="false" class="ico" width="13" height="13" viewBox="0 0 24 24"><path d="${STAR_PATH}" fill="currentColor"/></svg>`
};

const starRow = (n = 5) => Array.from({ length: n }, () => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${STAR_PATH}" fill="currentColor"/></svg>`).join('');
const STARS = starRow();

const keyId = (key) => String(key).replace(/[^a-z0-9]+/gi, '-');

// Drag on the stars (click, hold, slide) or type the number; the stars fill to the tenth.
export function rater({ key, value, label, size = 'lg' }) {
  const v = typeof value === 'number' ? value : null;
  const id = 'r-' + keyId(key);
  return `<div class="rater rater-${size}" data-rater="${esc(key)}">
<div class="stars" title="Drag to rate">
<span class="stars-base" aria-hidden="true">${STARS}</span>
<span class="stars-fill" aria-hidden="true" style="width:${v === null ? 0 : v * 10}%">${STARS}</span>
<input type="range" id="${id}-range" min="0" max="10" step="0.1" value="${v === null ? 0 : v}" data-rate="${esc(key)}" aria-label="${esc(label)}" aria-valuetext="${v === null ? 'Not rated' : fmtScore(v) + ' out of 10'}">
</div>
<label class="sr" for="${id}-num">${esc(label)}, typed</label>
<input class="num" type="number" id="${id}-num" min="0" max="10" step="0.1" inputmode="decimal" placeholder="—" value="${v === null ? '' : fmtScore(v)}" data-rate="${esc(key)}">
<span class="of">/ 10</span>
</div>`;
}

export function miniStars(value) {
  const v = typeof value === 'number' ? value : null;
  return `<span class="mini-stars" aria-hidden="true"><span class="ms-base">${STARS}</span><span class="ms-fill" style="width:${v === null ? 0 : v * 10}%">${STARS}</span></span>`;
}

export const corners = '<span class="corner c-tl" aria-hidden="true"></span><span class="corner c-tr" aria-hidden="true"></span><span class="corner c-bl" aria-hidden="true"></span><span class="corner c-br" aria-hidden="true"></span>';

export const visor = `<svg class="visor" aria-hidden="true" focusable="false" viewBox="0 0 400 400" fill="none" stroke="currentColor">
<circle cx="200" cy="200" r="180" stroke-opacity=".3" stroke-width="1"/>
<circle cx="200" cy="200" r="150" stroke-opacity=".55" stroke-width="1.5" stroke-dasharray="2 9"/>
<path d="M200 20 A180 180 0 0 1 380 200" stroke-width="3" stroke-linecap="round"/>
<path d="M60 310 A180 180 0 0 1 35 260" stroke-width="3" stroke-linecap="round"/>
<g class="visor-spin"><path d="M200 70 A130 130 0 0 1 312 135" stroke-opacity=".8" stroke-width="2"/></g>
<path d="M200 0v34M200 366v34M0 200h34M366 200h34" stroke-opacity=".7" stroke-width="1.5"/>
<circle cx="200" cy="200" r="3" fill="currentColor" stroke="none"/>
</svg>`;

// Poster: the real image when the Scan brought one, otherwise artwork drawn from the title.
export function poster(t, { big = false, extra = '', kind = true } = {}) {
  const img = t.poster ? `<img src="${esc(t.poster)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : '';
  return `<span class="poster${big ? ' poster-lg' : ''}${t.poster ? ' has-img' : ''}" style="background:${artFor(t)}">
${img}${kind ? `<span class="badge">${KIND_SHORT[t.kind]}</span>` : ''}${extra}${t.poster ? '' : `<span class="poster-title">${esc(t.title)}</span>`}
</span>`;
}

export function statusDot(status) {
  return `<span class="dot dot-${esc(status)}" aria-hidden="true"></span>`;
}
