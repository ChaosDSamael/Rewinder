// Rewinder friends server: a Cloudflare Worker with one D1 database (binding DB) and one secret (INVITE).
// It keeps names, friend requests, friendships and each person's card. A card is what the app sends:
// titles, scores, statuses, favorites and tags. Never API keys, notes or dates.
//
// Why D1 (SQL) and not KV: every change here is one transaction. Two people become friends in the same
// instant on both sides, or not at all; a removed friend can never slip back in from a stale copy.
//
// Who sees what: a card goes only to people both sides accepted.
// Who gets in: creating a name takes the group's invite code (16 characters or more, or the server stays shut).
// Each device proves its name with a secret it made itself; the server only keeps a fingerprint (SHA-256).
// Moving a name to another device takes a one-time code that expires in 15 minutes; it never carries the secret.
// Wrong codes are counted per address: 10 an hour, then that address waits.

const ORIGINS = new Set(['https://chaosdsamael.github.io']);
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;
const NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{1,22})[A-Za-z0-9]$/;
const SECRET = /^[A-Za-z0-9_-]{32,128}$/;
const HOUR = 3600e3;
const DAY = 24 * HOUR;
// A card nobody refreshes for 5 months is erased: TMDB asks that nothing from it be kept past 6 months.
const CARD_TTL = 150 * DAY;
const MAX_CARD = 1000000;
const MAX_SMALL = 4000;
const MAX_FRIENDS = 200;
const MIN_INVITE = 16;
const TICKET_TTL = 15 * 60e3;
// A removed name stays blocked a week, so nobody grabs it right away and collects requests meant for someone else.
const NAME_HOLD = 7 * DAY;
// One card update every 10 seconds per name at most.
const CARD_GAP = 10000;

const keyOf = (name) => String(name).toLowerCase();

function cors(request, env) {
  const origin = request.headers.get('Origin') || '';
  const ok = ORIGINS.has(origin) || (env.DEV === '1' && LOCAL.test(origin));
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'https://chaosdsamael.github.io',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-None-Match, X-Rewinder-Name',
    'Access-Control-Expose-Headers': 'ETag',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

class Refusal extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const newCode = () => b64url(crypto.getRandomValues(new Uint8Array(32)));

async function fingerprint(text) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Every character looked at: how long the comparison takes says nothing about the answer.
function equal(a, b) {
  const x = String(a);
  const y = String(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
}

// The body, read only once its announced size is known to be fine: an endless upload is refused before reading.
async function body(request, limit) {
  const length = Number(request.headers.get('Content-Length'));
  if (!request.headers.get('Content-Length') || !Number.isFinite(length)) throw new Refusal(411, 'no-length', 'The request has no size.');
  if (length > limit) throw new Refusal(413, 'too-big', 'That is too big.');
  const text = await request.text();
  if (text.length > limit) throw new Refusal(413, 'too-big', 'That is too big.');
  return text;
}

async function readJson(request) {
  try {
    return JSON.parse(await body(request, MAX_SMALL));
  } catch (err) {
    if (err instanceof Refusal) throw err;
    throw new Refusal(400, 'bad-json', 'The server could not read that.');
  }
}

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS users (k TEXT PRIMARY KEY, name TEXT NOT NULL, hash TEXT, at TEXT NOT NULL, gone INTEGER)',
  'CREATE TABLE IF NOT EXISTS friends (a TEXT NOT NULL, b TEXT NOT NULL, PRIMARY KEY (a, b))',
  'CREATE TABLE IF NOT EXISTS asks (src TEXT NOT NULL, dst TEXT NOT NULL, t INTEGER NOT NULL, PRIMARY KEY (src, dst))',
  'CREATE INDEX IF NOT EXISTS asks_dst ON asks (dst)',
  'CREATE TABLE IF NOT EXISTS cards (k TEXT PRIMARY KEY, body TEXT NOT NULL, at TEXT NOT NULL, t INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS cards_t ON cards (t)',
  'CREATE TABLE IF NOT EXISTS tickets (h TEXT PRIMARY KEY, k TEXT NOT NULL, until INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS limits (k TEXT PRIMARY KEY, n INTEGER NOT NULL, until INTEGER NOT NULL)'
];
let schemaReady = null;
const ready = (env) => (schemaReady ||= env.DB.batch(SCHEMA.map((sql) => env.DB.prepare(sql))).catch((err) => { schemaReady = null; throw err; }));

// Counts something per key in a time window; false once it went past `max`.
async function within(env, key, max, windowMs, now) {
  const [, got] = await env.DB.batch([
    env.DB.prepare(`INSERT INTO limits (k, n, until) VALUES (?1, 1, ?2)
      ON CONFLICT (k) DO UPDATE SET n = CASE WHEN until < ?3 THEN 1 ELSE n + 1 END, until = CASE WHEN until < ?3 THEN ?2 ELSE until END`)
      .bind(key, now + windowMs, now),
    env.DB.prepare('SELECT n FROM limits WHERE k = ?1').bind(key)
  ]);
  return got.results[0].n <= max;
}
const peek = async (env, key, now) => {
  const row = await env.DB.prepare('SELECT n FROM limits WHERE k = ?1 AND until >= ?2').bind(key, now).first();
  return row ? row.n : 0;
};

const ipOf = (request) => request.headers.get('CF-Connecting-IP') || 'local';
const BAD = (request) => 'bad:' + ipOf(request);

// Too many wrong codes from one address: it waits an hour, right or wrong.
async function guard(request, env, now) {
  if ((await peek(env, BAD(request), now)) >= 10) throw new Refusal(429, 'wait', 'Too many wrong codes. Try again in an hour.');
}
const wrong = (request, env, now) => within(env, BAD(request), 10, HOUR, now);

async function signedIn(request, env) {
  const name = request.headers.get('X-Rewinder-Name') || '';
  const auth = request.headers.get('Authorization') || '';
  const secret = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const out = new Refusal(401, 'signed-out', 'Your Rewinder name is not on this device.');
  if (!NAME.test(name) || !SECRET.test(secret)) throw out;
  const user = await env.DB.prepare('SELECT k, name, hash FROM users WHERE k = ?1 AND hash IS NOT NULL').bind(keyOf(name)).first();
  if (!user || !equal(user.hash, await fingerprint(secret))) throw out;
  return user;
}

// Changes cost writes (100,000 a day for everyone on the free plan): 600 a day per name is plenty for a person.
async function spend(env, me, now) {
  if (!(await within(env, 'w:' + me.k, 600, DAY, now))) throw new Refusal(429, 'busy-day', 'That is a lot of changes for one day. Try again tomorrow.');
}

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });

const isFriend = (env, a, b) => env.DB.prepare('SELECT 1 AS ok FROM friends WHERE a = ?1 AND b = ?2').bind(a, b).first();

async function route(request, env, url, now) {
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method;

  if (path === '/v1/claim' && method === 'POST') {
    await guard(request, env, now);
    const { name, invite, secret } = await readJson(request);
    if (!env.INVITE || String(env.INVITE).length < MIN_INVITE) throw new Refusal(503, 'no-invite', 'The server needs an invite code of 16 characters or more.');
    if (!equal(String(invite || '').trim(), env.INVITE)) {
      await wrong(request, env, now);
      throw new Refusal(403, 'bad-invite', 'That invite code is not right.');
    }
    if (typeof name !== 'string' || !NAME.test(name)) throw new Refusal(400, 'bad-name', 'A name is 3 to 24 letters or numbers (. _ - inside).');
    if (typeof secret !== 'string' || !SECRET.test(secret)) throw new Refusal(400, 'bad-secret', 'The app sent a bad secret.');
    if (!(await within(env, 'claim:' + ipOf(request), 5, DAY, now))) throw new Refusal(429, 'wait', 'Too many new names from here today.');
    // One statement: two people asking for the same name at once can't both get it.
    const made = await env.DB.prepare(`INSERT INTO users (k, name, hash, at, gone) VALUES (?1, ?2, ?3, ?4, NULL)
      ON CONFLICT (k) DO UPDATE SET name = excluded.name, hash = excluded.hash, at = excluded.at, gone = NULL
      WHERE users.hash IS NULL AND users.gone < ?5`).bind(keyOf(name), name, await fingerprint(secret), new Date(now).toISOString(), now - NAME_HOLD).run();
    if (!made.meta.changes) throw new Refusal(409, 'taken', `${name} is already taken.`);
    return json({ name }, 201);
  }

  // Arriving on a new device: the one-time code from the old one, and this device's own new secret.
  if (path === '/v1/move' && method === 'POST') {
    await guard(request, env, now);
    const { code, secret } = await readJson(request);
    if (typeof code !== 'string' || !SECRET.test(code)) throw new Refusal(400, 'bad-code', 'That code is not right, or it expired.');
    if (typeof secret !== 'string' || !SECRET.test(secret)) throw new Refusal(400, 'bad-secret', 'The app sent a bad secret.');
    const h = await fingerprint(code);
    // The new secret is written only if the code still exists; the code goes in the same transaction: it works once.
    const [moved] = await env.DB.batch([
      env.DB.prepare(`UPDATE users SET hash = ?1 WHERE hash IS NOT NULL AND k = (SELECT k FROM tickets WHERE h = ?2 AND until > ?3)`).bind(await fingerprint(secret), h, now),
      env.DB.prepare('DELETE FROM tickets WHERE h = ?1').bind(h)
    ]);
    if (!moved.meta.changes) {
      await wrong(request, env, now);
      throw new Refusal(404, 'bad-code', 'That code is not right, or it expired.');
    }
    const who = await env.DB.prepare('SELECT u.name FROM users u WHERE u.hash = ?1').bind(await fingerprint(secret)).first();
    return json({ name: who ? who.name : '' });
  }

  const me = await signedIn(request, env);

  if (path === '/v1/me' && method === 'GET') {
    const [friends, incoming, outgoing] = await env.DB.batch([
      env.DB.prepare(`SELECT u.name AS name, c.at AS at FROM friends f JOIN users u ON u.k = f.b AND u.hash IS NOT NULL
        LEFT JOIN cards c ON c.k = f.b AND c.t > ?2 WHERE f.a = ?1 ORDER BY u.k`).bind(me.k, now - CARD_TTL),
      env.DB.prepare('SELECT u.name AS name FROM asks q JOIN users u ON u.k = q.src AND u.hash IS NOT NULL WHERE q.dst = ?1 ORDER BY q.t').bind(me.k),
      env.DB.prepare('SELECT u.name AS name FROM asks q JOIN users u ON u.k = q.dst AND u.hash IS NOT NULL WHERE q.src = ?1 ORDER BY q.t').bind(me.k)
    ]);
    return json({ name: me.name, friends: friends.results.map((r) => ({ name: r.name, at: r.at || null })), incoming: incoming.results.map((r) => r.name), outgoing: outgoing.results.map((r) => r.name) });
  }

  if (path === '/v1/me' && method === 'DELETE') {
    // Everything at once. The name itself stays blocked a week.
    await env.DB.batch([
      env.DB.prepare('DELETE FROM friends WHERE a = ?1 OR b = ?1').bind(me.k),
      env.DB.prepare('DELETE FROM asks WHERE src = ?1 OR dst = ?1').bind(me.k),
      env.DB.prepare('DELETE FROM cards WHERE k = ?1').bind(me.k),
      env.DB.prepare('DELETE FROM tickets WHERE k = ?1').bind(me.k),
      env.DB.prepare('UPDATE users SET hash = NULL, gone = ?2 WHERE k = ?1').bind(me.k, now)
    ]);
    return json({ gone: true });
  }

  // Leaving for another device: a code that works once, for 15 minutes. A new one replaces the old one.
  if (path === '/v1/transfer' && method === 'POST') {
    if (!(await within(env, 't:' + me.k, 10, DAY, now))) throw new Refusal(429, 'busy-day', 'That is a lot of codes for one day. Try again tomorrow.');
    const code = newCode();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM tickets WHERE k = ?1 OR until < ?2').bind(me.k, now),
      env.DB.prepare('INSERT INTO tickets (h, k, until) VALUES (?1, ?2, ?3)').bind(await fingerprint(code), me.k, now + TICKET_TTL)
    ]);
    return json({ code, expires: new Date(now + TICKET_TTL).toISOString() });
  }

  if (path === '/v1/card' && method === 'PUT') {
    const text = await body(request, MAX_CARD);
    let card;
    try { card = JSON.parse(text); } catch { throw new Refusal(400, 'bad-json', 'The server could not read your card.'); }
    if (!card || card.app !== 'rewinder' || card.kind !== 'card' || !Array.isArray(card.titles)) throw new Refusal(400, 'not-card', 'That is not a Rewinder card.');
    const last = await env.DB.prepare('SELECT t FROM cards WHERE k = ?1').bind(me.k).first();
    if (last && now - last.t < CARD_GAP) throw new Refusal(429, 'slow-down', 'Your card was just sent. It goes again in a few seconds.');
    await spend(env, me, now);
    const at = new Date(now).toISOString();
    card.at = at;
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO cards (k, body, at, t) VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT (k) DO UPDATE SET body = excluded.body, at = excluded.at, t = excluded.t`).bind(me.k, JSON.stringify(card), at, now),
      env.DB.prepare('DELETE FROM cards WHERE t < ?1').bind(now - CARD_TTL)
    ]);
    return json({ at });
  }

  const cardPath = path.match(/^\/v1\/card\/([^/]+)$/);
  if (cardPath && method === 'GET') {
    let name;
    try { name = decodeURIComponent(cardPath[1]); } catch { throw new Refusal(400, 'bad-name', 'That is not a Rewinder name.'); }
    if (!NAME.test(name)) throw new Refusal(400, 'bad-name', 'That is not a Rewinder name.');
    const k = keyOf(name);
    // Both sides, in the same read: friendships are only ever written or removed in pairs.
    const row = await env.DB.prepare(`SELECT (SELECT COUNT(*) FROM friends WHERE (a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1)) AS ties,
      c.body AS body, c.at AS at FROM (SELECT 1) LEFT JOIN cards c ON c.k = ?2 AND c.t > ?3`).bind(me.k, k, now - CARD_TTL).first();
    if (!row || row.ties !== 2) throw new Refusal(403, 'not-friends', `${name} is not one of your friends.`);
    if (!row.body) throw new Refusal(404, 'no-card', `${name} has no card on the server yet.`);
    const tag = `"${row.at}"`;
    if (request.headers.get('If-None-Match') === tag) return new Response(null, { status: 304, headers: { ETag: tag } });
    return new Response(row.body, { status: 200, headers: { 'Content-Type': 'application/json', ETag: tag } });
  }

  if (method === 'POST' && ['/v1/request', '/v1/accept', '/v1/decline', '/v1/cancel', '/v1/unfriend'].includes(path)) {
    const { name: raw } = await readJson(request);
    const other = String(raw || '').trim();
    if (!NAME.test(other)) throw new Refusal(400, 'bad-name', 'That is not a Rewinder name.');
    const k = keyOf(other);
    if (k === me.k) throw new Refusal(400, 'self', 'That is your own name.');
    const them = await env.DB.prepare('SELECT k, name FROM users WHERE k = ?1 AND hash IS NOT NULL').bind(k).first();
    if (!them) throw new Refusal(404, 'no-such-name', `Nobody is called ${other} on Rewinder.`);
    const friends = Boolean(await isFriend(env, me.k, k)) && Boolean(await isFriend(env, k, me.k));

    if (path === '/v1/request') {
      if (friends) return json({ name: them.name, state: 'friends' });
      await spend(env, me, now);
      // They asked first: that's a yes on both sides. Written only if their request still exists.
      const [joined] = await env.DB.batch([
        env.DB.prepare('INSERT OR IGNORE INTO friends (a, b) SELECT ?1, ?2 WHERE EXISTS (SELECT 1 FROM asks WHERE src = ?2 AND dst = ?1)').bind(me.k, k),
        env.DB.prepare('INSERT OR IGNORE INTO friends (a, b) SELECT ?2, ?1 WHERE EXISTS (SELECT 1 FROM asks WHERE src = ?2 AND dst = ?1)').bind(me.k, k),
        env.DB.prepare('DELETE FROM asks WHERE src = ?2 AND dst = ?1 AND EXISTS (SELECT 1 FROM friends WHERE a = ?1 AND b = ?2)').bind(me.k, k)
      ]);
      if (joined.meta.changes) return json({ name: them.name, state: 'friends' });
      const counts = await env.DB.prepare(`SELECT (SELECT COUNT(*) FROM asks WHERE src = ?1) + (SELECT COUNT(*) FROM friends WHERE a = ?1) AS mine,
        (SELECT COUNT(*) FROM asks WHERE dst = ?2) AS theirs`).bind(me.k, k).first();
      if (counts.mine >= MAX_FRIENDS) throw new Refusal(400, 'too-many', 'That is a lot of friends already.');
      if (counts.theirs >= MAX_FRIENDS) throw new Refusal(400, 'too-many', `${them.name} has too many requests waiting.`);
      await env.DB.prepare('INSERT OR IGNORE INTO asks (src, dst, t) VALUES (?1, ?2, ?3)').bind(me.k, k, now).run();
      return json({ name: them.name, state: 'sent' });
    }

    if (path === '/v1/accept') {
      if (friends) return json({ name: them.name, state: 'friends' });
      await spend(env, me, now);
      // Only their request, as it stands right now, makes the friendship.
      const [joined] = await env.DB.batch([
        env.DB.prepare('INSERT OR IGNORE INTO friends (a, b) SELECT ?1, ?2 WHERE EXISTS (SELECT 1 FROM asks WHERE src = ?2 AND dst = ?1)').bind(me.k, k),
        env.DB.prepare('INSERT OR IGNORE INTO friends (a, b) SELECT ?2, ?1 WHERE EXISTS (SELECT 1 FROM asks WHERE src = ?2 AND dst = ?1)').bind(me.k, k),
        env.DB.prepare('DELETE FROM asks WHERE ((src = ?2 AND dst = ?1) OR (src = ?1 AND dst = ?2)) AND EXISTS (SELECT 1 FROM friends WHERE a = ?1 AND b = ?2)').bind(me.k, k)
      ]);
      if (!joined.meta.changes) throw new Refusal(404, 'no-request', `${them.name} did not ask to be friends.`);
      return json({ name: them.name, state: 'friends' });
    }

    // Decline, cancel or unfriend: whatever ties the two names, gone on both sides at once.
    await env.DB.batch([
      env.DB.prepare('DELETE FROM friends WHERE (a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1)').bind(me.k, k),
      env.DB.prepare('DELETE FROM asks WHERE (src = ?1 AND dst = ?2) OR (src = ?2 AND dst = ?1)').bind(me.k, k)
    ]);
    return json({ name: them.name, state: 'none' });
  }

  throw new Refusal(404, 'no-route', 'Nothing here.');
}

export default {
  async fetch(request, env) {
    const head = cors(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: head });
    const url = new URL(request.url);
    // Tests can set the clock; the real server can't (a Cloudflare setting is text, never a function).
    const now = typeof env.NOW === 'function' ? env.NOW() : Date.now();
    try {
      await ready(env);
      const res = await route(request, env, url, now);
      const out = new Response(res.body, res);
      for (const [k, v] of Object.entries(head)) out.headers.set(k, v);
      out.headers.set('Cache-Control', 'no-store');
      return out;
    } catch (err) {
      if (err instanceof Refusal) return json({ error: err.code, message: err.message }, err.status, { ...head, 'Cache-Control': 'no-store' });
      return json({ error: 'server', message: 'The Rewinder server had a problem. Try again later.' }, 500, { ...head, 'Cache-Control': 'no-store' });
    }
  }
};
