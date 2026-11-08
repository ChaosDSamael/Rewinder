// Rewinder — reads a list typed in Notepad and turns each line into a title.
//   Shonen:                                   a line alone above a group → group name (can become a tag)
//   One Piece : 9.8/10                        title, then a score (8.5 or 8.5/10)
//   To Your Eternity : S1 7.9/10 — S2 7.7/10 — S3   scores per season; a season with no score: not seen yet
//   The Eminence in Shadow : 1-2 7.4/10       seasons 1 and 2 share a score
//   MOT (FR) 7.8/10 (FromMemory) ?? To note.  (FM) and "To note" become the tags "from memory" and "to rate"
import { findSeason, hasEpisodes, isAired, clampScore } from './model.js';

const BULLET = /^(?:[-*•·>]+|\d{1,3}[.)])\s+/;
const MEMORY = /\((?:from\s*memory|fm)\)/gi;
const TO_RATE = /\bto\s*(?:note|rate|re-?rate)\b\.?/gi;
const LANG = /\((?:fr|vf|vo|en|vostfr|vf\/vo|qc|ang)\)/gi;
const YEAR = /\((\d{4})\)/;
const SCORE = /^(\d{1,2}(?:[.,]\d{1,2})?)(?:\s*\/\s*10)?$/;

// Same key for "Mr.Nobody" and "Mr. Nobody", "Déja Vu" and "Déjà Vu", "The Lord of Mysteries" and "Lord of Mysteries".
export function keyOf(text) {
  return String(text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^the /, '')
    .replace(/ /g, '');
}

const scoreOf = (word) => {
  const m = SCORE.exec(word);
  if (!m) return null;
  const v = Number(m[1].replace(',', '.'));
  return v <= 10 ? clampScore(v) : null;
};

function expand(spec) {
  const nums = spec.split('-').map((x) => parseInt(x, 10)).filter((n) => Number.isInteger(n) && n >= 0 && n < 100);
  if (nums.length === 2 && nums[1] > nums[0] + 1) {
    const out = [];
    for (let n = nums[0]; n <= nums[1]; n++) out.push(n);
    return out;
  }
  return nums;
}

// What comes after the title: "S1 7.9/10 | S2 7.7/10 | S3", "1-2 7.4/10", "Z 6.7/10", "9.2".
function readRest(rest) {
  const tokens = String(rest || '').match(/S(?:eason)?\s*\d{1,2}(?:\s*-\s*\d{1,2})*|\d{1,2}(?:\s*-\s*\d{1,2})+(?=\s|$)|\d{1,2}(?:[.,]\d{1,2})?(?:\s*\/\s*10)?|\||[^\s|]+/gi) || [];
  const seasons = new Map();
  let score = null;
  let pending = null;
  let extra = '';
  let seen = false;
  const flush = () => {
    if (pending) for (const n of pending) if (!seasons.has(n)) seasons.set(n, null);
    pending = null;
  };
  for (const raw of tokens) {
    const tok = raw.replace(/\s+/g, '');
    let m;
    if ((m = /^S(?:eason)?(\d{1,2}(?:-\d{1,2})*)$/i.exec(tok)) || (m = /^(\d{1,2}(?:-\d{1,2})+)$/.exec(tok))) {
      flush();
      pending = expand(m[1]);
      seen = true;
    } else if (tok === '|') {
      flush();
    } else if (scoreOf(tok) !== null) {
      const v = scoreOf(tok);
      if (pending) {
        for (const n of pending) seasons.set(n, v);
        pending = null;
      } else if (score === null) {
        score = v;
      }
      seen = true;
    } else if (tok === '/10') {
      // a score written "7.9 /10"
    } else if (!seen) {
      extra += (extra ? ' ' : '') + raw;
    }
  }
  flush();
  return { score, seasons: [...seasons.entries()].sort((a, b) => a[0] - b[0]), extra };
}

export function parseLine(raw) {
  let s = String(raw || '').replace(BULLET, '').trim();
  const fromMemory = new RegExp(MEMORY.source, 'i').test(s);
  const toRate = new RegExp(TO_RATE.source, 'i').test(s);
  s = s.replace(MEMORY, ' ').replace(TO_RATE, ' ').replace(/\?{2,}/g, ' ').replace(LANG, ' ');
  let year = null;
  const y = YEAR.exec(s);
  if (y && Number(y[1]) > 1870 && Number(y[1]) < 2100) {
    year = Number(y[1]);
    s = s.replace(YEAR, ' ');
  }
  s = s.replace(/[—–]/g, ' | ').replace(/\s+/g, ' ').trim().replace(/\.+$/, '').trim();
  let title = s;
  let rest = '';
  const cut = Math.max(s.lastIndexOf(':'), s.lastIndexOf(';'));
  if (cut >= 0) {
    const after = s.slice(cut + 1).trim();
    // "Mission: Impossible" keeps its colon; "Frieren : S1 9.2/10" splits there.
    if (!after || /(^|\s)S(?:eason)?\s*\d/i.test(after) || after.split(/\s+/).some((w) => scoreOf(w) !== null)) {
      title = s.slice(0, cut);
      rest = after;
    }
  } else {
    const m = /^(.*?)\s+(\d{1,2}(?:[.,]\d{1,2})?\s*\/\s*10|\d{1,2}[.,]\d{1,2})$/.exec(s);
    if (m) {
      title = m[1];
      rest = m[2];
    }
  }
  const r = readRest(rest);
  title = `${title} ${r.extra}`.replace(/\s+/g, ' ').replace(/[\s:;|,-]+$/, '').trim();
  return { title, year, score: r.score, seasons: r.seasons, fromMemory, toRate, semicolon: /;\s*$/.test(String(raw).trim()) };
}

export function parseList(text) {
  const out = [];
  let blockStart = true;
  String(text || '').split(/\r?\n/).forEach((raw, i) => {
    // A real line is short; a giant one could make the patterns below crawl.
    const line = raw.slice(0, 400).trim();
    if (!line) {
      blockStart = true;
      return;
    }
    const p = parseLine(line);
    if (!p.title) return;
    const rated = p.score !== null || p.seasons.length > 0;
    out.push({ id: i, line, ...p, heading: !rated && !p.year && (p.semicolon || blockStart) });
    blockStart = false;
  });
  // A group name only counts when a title follows it (a list of single titles between blank lines stays titles).
  for (let i = 0; i < out.length; i++) {
    if (out[i].heading && (!out[i + 1] || out[i + 1].heading)) out[i].heading = false;
  }
  return regroup(out);
}

export function regroup(items) {
  let group = '';
  for (const it of items) {
    if (it.heading) group = it.title;
    else it.group = group;
  }
  return items;
}

export function defaultStatus(it) {
  const rated = it.score !== null || it.seasons.some(([, v]) => v !== null);
  if (!rated) return 'watchlist';
  if (it.seasons.some(([, v]) => v === null)) return 'progress';
  return 'completed';
}

// How sure a search result is the line you wrote.
export function matchQuality(query, r) {
  const q = keyOf(query);
  if (!q) return 'check';
  const names = [r.title, r.original].filter(Boolean).map(keyOf);
  if (names.includes(q)) return 'sure';
  if (q.length >= 4 && names.some((n) => n.startsWith(q))) return 'likely';
  return 'check';
}

export function scoreSummary(it) {
  if (it.seasons.length) return it.seasons.map(([n, v]) => `S${n} ${v === null ? '—' : v.toFixed(1)}`).join(' · ');
  return it.score === null ? '' : it.score.toFixed(1);
}

export function tagsFor(it, useGroups) {
  const tags = [];
  if (useGroups && it.group) tags.push(it.group);
  if (it.fromMemory) tags.push('from memory');
  if (it.toRate) tags.push('to rate');
  return tags;
}

// Puts what the line says into a title: tags, scores, what you saw (date unknown), status.
// On a title already in your list, only empty scores get filled and your status stays.
export function applyLine(t, it, { useGroups = true, status = null } = {}) {
  for (const tag of tagsFor(it, useGroups)) {
    if (!t.tags.some((x) => x.toLowerCase() === tag.toLowerCase())) t.tags.push(tag);
  }
  if (hasEpisodes(t)) {
    if (it.seasons.length) {
      for (const [n, v] of it.seasons) {
        let s = findSeason(t, n);
        if (!s && v !== null) {
          s = { n, year: '', score: null, notes: '', episodes: [] };
          t.seasons.push(s);
        }
        if (!s || v === null) continue;
        if (s.score === null) s.score = v;
        for (const e of s.episodes) if (!e.watched && isAired(e)) e.watched = 'unknown';
      }
      t.seasons.sort((a, b) => a.n - b.n);
    } else if (it.score !== null) {
      if (t.score === null) t.score = it.score;
      for (const s of t.seasons) for (const e of s.episodes) if (!e.watched && isAired(e)) e.watched = 'unknown';
    }
  } else if (it.score !== null) {
    if (t.score === null) t.score = it.score;
    if (t.kind === 'movie' && !t.views.length) t.views.push({ date: 'unknown' });
    if (t.kind === 'game' && !t.game.story) t.game.story = 'unknown';
  }
  if (status) t.status = status;
  return t;
}
