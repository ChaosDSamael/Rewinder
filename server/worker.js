// Rewinder friends server: a Cloudflare Worker with one D1 database (binding DB) and one secret (INVITE).
// It keeps names, friend requests, friendships and each person's card. A card is what the app sends:
// titles, scores, statuses, favorites and tags. Never API keys, notes or dates.
// It also carries each person's list between their own devices, locked: the devices lock it with a key
// that never comes here. This server only ever sees scrambled bytes, a title id and when it changed.
//
// Why D1 (SQL) and not KV: every change here is one transaction. Two people become friends in the same
// instant on both sides, or not at all; a removed friend can never slip back in from a stale copy.
//
// Who sees what: a card goes only to people both sides accepted.
// Who gets in: creating a name takes the group's invite code (16 characters or more, or the server stays shut).
// Each device proves its name with a secret it made itself; the server only keeps a fingerprint (SHA-256).
// Adding a device takes a one-time code made on one of yours; it expires in 15 minutes and never carries a secret.
// Wrong codes are counted per address: 10 an hour, then that address waits. Addresses are kept only as a
// scrambled fingerprint, for a day at most.
// What nobody uses leaves by itself: a device not seen for 5 months is removed, and a name left with no device
// goes with everything it had (card, list, friends), like a removed name.

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
const MAX_DEVICES = 10;
const DEVICE_TTL = 150 * DAY;
// Your list, between your devices: pushes up to 500 KB and 100 titles (the app sends 300 KB at most),
// an item up to 400 KB, 30 MB per name.
const MAX_SYNC = 500000;
const MAX_ITEM = 400000;
const MAX_PUSH = 100;
const USER_BYTES = 30000000;
// The free plan writes 100,000 rows a day for everyone, and a title written costs two (the row and its index):
// 10,000 titles a day per name (two full restores of a big list), 30,000 for all names together.
const ITEMS_DAY = 10000;
const ITEMS_ALL = 30000;
// The latest time a browser can read (year 275760): a later one would break the date on every device.
const MAX_U = 8.64e15;
// Pages stay small: the free plan gives a request 10 ms of computing.
const PAGE = 40;
const PAGE_BYTES = 400000;
// The free plan stops a database at 500 MB: past 400 MB, lists stop growing so names, friends and cards keep working.
const DB_FULL = 400000000;
// Which server this is: the app tells an old server (that answers without it) from a device it doesn't know.
const VERSION = '1.12.0';
const ITEM_ID = /^[A-Za-z0-9_.:-]{1,80}$/;
const B64 = /^[A-Za-z0-9_-]+$/;
const DEVICE_ID = /^[A-Za-z0-9_-]{6,32}$/;
// What this server remembers about its database between requests: tables made, its size, the last tidy-up.
const known = new WeakMap();
const about = (env) => {
  let it = known.get(env.DB);
  if (!it) known.set(env.DB, (it = { ready: null, size: 0, tidied: 0 }));
  return it;
};

const keyOf = (name) => String(name).toLowerCase();

function cors(request, env) {
  const origin = request.headers.get('Origin') || '';
  const ok = ORIGINS.has(origin) || (env.DEV === '1' && LOCAL.test(origin));
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'https://chaosdsamael.github.io',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-None-Match, X-Rewinder-Name',
    'Access-Control-Expose-Headers': 'ETag, X-Rewinder-Server',
    'Access-Control-Max-Age': '86400',
    'X-Rewinder-Server': VERSION,
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
const newId = () => b64url(crypto.getRandomValues(new Uint8Array(9)));
// What a device calls itself ("iPhone", "Windows"): plain words only, short.
const cleanLabel = (v) => String(v || '').replace(/[^A-Za-z0-9 ._()-]/g, '').trim().slice(0, 40);
const iso = (ms) => (Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null);

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
// JSON only, said so: a web page elsewhere can't send that without asking first (and it is told no).
async function body(request, limit) {
  if (!/^application\/json\s*(;|$)/i.test(request.headers.get('Content-Type') || '')) throw new Refusal(415, 'bad-type', 'The server only reads JSON.');
  const length = Number(request.headers.get('Content-Length'));
  if (!request.headers.get('Content-Length') || !Number.isFinite(length)) throw new Refusal(411, 'no-length', 'The request has no size.');
  if (length > limit) throw new Refusal(413, 'too-big', 'That is too big.');
  const text = await request.text();
  if (text.length > limit) throw new Refusal(413, 'too-big', 'That is too big.');
  return text;
}

async function readJson(request, limit = MAX_SMALL) {
  let data;
  try {
    data = JSON.parse(await body(request, limit));
  } catch (err) {
    if (err instanceof Refusal) throw err;
    throw new Refusal(400, 'bad-json', 'The server could not read that.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Refusal(400, 'bad-json', 'The server could not read that.');
  return data;
}

// Names and devices are made in the Rewinder app: a page on another site can't make them, even blindly.
function fromApp(request, env) {
  const origin = request.headers.get('Origin');
  if (origin && !ORIGINS.has(origin) && !(env.DEV === '1' && LOCAL.test(origin))) throw new Refusal(403, 'bad-origin', 'Use the Rewinder app for that.');
}

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS users (k TEXT PRIMARY KEY, name TEXT NOT NULL, hash TEXT, at TEXT NOT NULL, gone INTEGER)',
  'CREATE TABLE IF NOT EXISTS friends (a TEXT NOT NULL, b TEXT NOT NULL, PRIMARY KEY (a, b))',
  'CREATE TABLE IF NOT EXISTS asks (src TEXT NOT NULL, dst TEXT NOT NULL, t INTEGER NOT NULL, PRIMARY KEY (src, dst))',
  'CREATE INDEX IF NOT EXISTS asks_dst ON asks (dst)',
  'CREATE TABLE IF NOT EXISTS cards (k TEXT PRIMARY KEY, body TEXT NOT NULL, at TEXT NOT NULL, t INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS cards_t ON cards (t)',
  'CREATE TABLE IF NOT EXISTS tickets (h TEXT PRIMARY KEY, k TEXT NOT NULL, until INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS limits (k TEXT PRIMARY KEY, n INTEGER NOT NULL, until INTEGER NOT NULL)',
  // One row per device. users.hash: 'on' for a name with devices, a fingerprint for a name made before devices
  // (its one secret becomes its first device the next time it signs in), null for a removed name.
  'CREATE TABLE IF NOT EXISTS devices (h TEXT PRIMARY KEY, id TEXT NOT NULL, k TEXT NOT NULL, label TEXT NOT NULL, at INTEGER NOT NULL, seen INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS devices_k ON devices (k)',
  // One row per title of a list: u = when it changed (the newest wins), v = the order the server got it in.
  'CREATE TABLE IF NOT EXISTS items (k TEXT NOT NULL, id TEXT NOT NULL, u INTEGER NOT NULL, v INTEGER NOT NULL, d TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (k, id))',
  'CREATE INDEX IF NOT EXISTS items_kv ON items (k, v, id)',
  // n never goes back while the name lives: a device's bookmark always means the same place.
  'CREATE TABLE IF NOT EXISTS seqs (k TEXT PRIMARY KEY, n INTEGER NOT NULL, t INTEGER NOT NULL, bytes INTEGER NOT NULL)',
  'DROP INDEX IF EXISTS seqs_t'
];
const ready = (env) => {
  const it = about(env);
  return (it.ready ||= env.DB.batch(SCHEMA.map((sql) => env.DB.prepare(sql))).catch((err) => { it.ready = null; throw err; }));
};

// Counts something per key in a time window (by `add`, one by default); false once it went past `max`.
async function within(env, key, max, windowMs, now, add = 1) {
  const [, got] = await env.DB.batch([
    env.DB.prepare(`INSERT INTO limits (k, n, until) VALUES (?1, ?4, ?2)
      ON CONFLICT (k) DO UPDATE SET n = CASE WHEN until < ?3 THEN ?4 ELSE n + ?4 END, until = CASE WHEN until < ?3 THEN ?2 ELSE until END`)
      .bind(key, now + windowMs, now, add),
    env.DB.prepare('SELECT n FROM limits WHERE k = ?1').bind(key)
  ]);
  return got.results[0].n <= max;
}
const peek = async (env, key, now) => {
  const row = await env.DB.prepare('SELECT n FROM limits WHERE k = ?1 AND until >= ?2').bind(key, now).first();
  return row ? row.n : 0;
};

// An address is only ever kept scrambled with the invite code (which only Sonny's server knows).
const ipOf = async (request, env) => (await fingerprint(`rewinder-address:${env.INVITE || ''}:${request.headers.get('CF-Connecting-IP') || 'local'}`)).slice(0, 24);
const BAD = async (request, env) => 'bad:' + (await ipOf(request, env));

// Too many wrong codes from one address: it waits an hour, right or wrong.
async function guard(request, env, now) {
  if ((await peek(env, await BAD(request, env), now)) >= 10) throw new Refusal(429, 'wait', 'Too many wrong codes. Try again in an hour.');
}
const wrong = async (request, env, now) => within(env, await BAD(request, env), 10, HOUR, now);

const legacy = (hash) => Boolean(hash) && hash !== 'on';
// A name made before devices: its one secret becomes its first device.
const migrate = (env, k, h, id, label, now) => [
  env.DB.prepare('INSERT OR IGNORE INTO devices (h, id, k, label, at, seen) VALUES (?1, ?2, ?3, ?4, ?5, ?5)').bind(h, id, k, label, now),
  env.DB.prepare("UPDATE users SET hash = 'on' WHERE k = ?1 AND hash = ?2").bind(k, h)
];

async function signedIn(request, env, now) {
  const name = request.headers.get('X-Rewinder-Name') || '';
  const auth = request.headers.get('Authorization') || '';
  const secret = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const out = new Refusal(401, 'signed-out', 'Your Rewinder name is not on this device.');
  if (!NAME.test(name) || !SECRET.test(secret)) throw out;
  const h = await fingerprint(secret);
  const row = await env.DB.prepare(`SELECT u.k AS k, u.name AS name, u.hash AS hash, d.id AS device, d.seen AS seen
    FROM users u LEFT JOIN devices d ON d.h = ?1 AND d.k = u.k WHERE u.k = ?2 AND u.hash IS NOT NULL`).bind(h, keyOf(name)).first();
  if (!row) throw out;
  if (row.device) return { k: row.k, name: row.name, device: row.device, seen: row.seen, h };
  if (!legacy(row.hash) || !equal(row.hash, h)) throw out;
  const id = newId();
  await env.DB.batch(migrate(env, row.k, h, id, '', now));
  return { k: row.k, name: row.name, device: id, seen: now, h };
}

// The app says it's there each time it opens: a device is seen at most once an hour.
async function seen(env, me, now) {
  if (!(me.seen > now - HOUR)) await env.DB.prepare('UPDATE devices SET seen = ?2 WHERE h = ?1').bind(me.h, now).run();
}

// Once an hour: what nobody uses any more leaves. A device not seen for 5 months is removed; a name left with no
// device goes with everything it had, like a removed name. Old counters and codes go too.
async function tidy(env, now) {
  const it = about(env);
  if (Math.abs(now - it.tidied) < HOUR) return;
  it.tidied = now;
  const lost = "SELECT u.k FROM users u WHERE u.hash = 'on' AND NOT EXISTS (SELECT 1 FROM devices d WHERE d.k = u.k)";
  try {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM devices WHERE seen < ?1').bind(now - DEVICE_TTL),
      env.DB.prepare(`DELETE FROM friends WHERE a IN (${lost}) OR b IN (${lost})`),
      env.DB.prepare(`DELETE FROM asks WHERE src IN (${lost}) OR dst IN (${lost})`),
      env.DB.prepare(`DELETE FROM cards WHERE k IN (${lost}) OR t < ?1`).bind(now - CARD_TTL),
      env.DB.prepare(`DELETE FROM tickets WHERE k IN (${lost}) OR until < ?1`).bind(now),
      env.DB.prepare(`DELETE FROM items WHERE k IN (${lost})`),
      env.DB.prepare(`DELETE FROM seqs WHERE k IN (${lost})`),
      env.DB.prepare(`UPDATE users SET hash = NULL, gone = ?1 WHERE k IN (${lost})`).bind(now),
      env.DB.prepare('DELETE FROM limits WHERE until < ?1').bind(now)
    ]);
  } catch (err) {
    it.tidied = 0;
    console.warn('tidy', err);
  }
}

// Keeps the database size the last write reported: past DB_FULL, lists stop growing.
const sized = (env, results) => {
  for (const r of [].concat(results)) if (r && r.meta && Number.isFinite(r.meta.size_after)) about(env).size = r.meta.size_after;
  return results;
};

// Changes cost writes (100,000 a day for everyone on the free plan): 600 a day per name is plenty for a person.
async function spend(env, me, now) {
  if (!(await within(env, 'w:' + me.k, 600, DAY, now))) throw new Refusal(429, 'busy-day', 'That is a lot of changes for one day. Try again tomorrow.');
}

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });

const isFriend = (env, a, b) => env.DB.prepare('SELECT 1 AS ok FROM friends WHERE a = ?1 AND b = ?2').bind(a, b).first();

async function route(request, env, url, now) {
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method;

  await tidy(env, now);

  if (path === '/v1/claim' && method === 'POST') {
    await guard(request, env, now);
    fromApp(request, env);
    const { name, invite, secret, label } = await readJson(request);
    if (!env.INVITE || String(env.INVITE).length < MIN_INVITE) throw new Refusal(503, 'no-invite', 'The server needs an invite code of 16 characters or more.');
    if (!equal(String(invite || '').trim(), env.INVITE)) {
      await wrong(request, env, now);
      throw new Refusal(403, 'bad-invite', 'That invite code is not right.');
    }
    if (typeof name !== 'string' || !NAME.test(name)) throw new Refusal(400, 'bad-name', 'A name is 3 to 24 letters or numbers (. _ - inside).');
    if (typeof secret !== 'string' || !SECRET.test(secret)) throw new Refusal(400, 'bad-secret', 'The app sent a bad secret.');
    if (!(await within(env, 'claim:' + (await ipOf(request, env)), 5, DAY, now))) throw new Refusal(429, 'wait', 'Too many new names from here today.');
    const h = await fingerprint(secret);
    // One secret, one device of one name (the app makes a new one every time).
    if (await env.DB.prepare('SELECT 1 AS ok FROM devices WHERE h = ?1').bind(h).first()) throw new Refusal(409, 'secret-used', 'This device already has a Rewinder name.');
    const k = keyOf(name);
    const id = newId();
    // The first statement decides: two people asking for the same name at once can't both get it.
    // The device goes in only if the name is now this secret's, in the same transaction; and a name never stays
    // without its device (it would be taken forever, by nobody): if the device can't go in, the name is let go.
    const [made, added] = sized(env, await env.DB.batch([
      env.DB.prepare(`INSERT INTO users (k, name, hash, at, gone) VALUES (?1, ?2, ?3, ?4, NULL)
        ON CONFLICT (k) DO UPDATE SET name = excluded.name, hash = excluded.hash, at = excluded.at, gone = NULL
        WHERE users.hash IS NULL AND users.gone < ?5`).bind(k, name, h, new Date(now).toISOString(), now - NAME_HOLD),
      env.DB.prepare('INSERT OR IGNORE INTO devices (h, id, k, label, at, seen) SELECT ?1, ?2, ?3, ?4, ?5, ?5 WHERE EXISTS (SELECT 1 FROM users WHERE k = ?3 AND hash = ?1)')
        .bind(h, id, k, cleanLabel(label), now),
      env.DB.prepare("UPDATE users SET hash = 'on' WHERE k = ?1 AND hash = ?2 AND EXISTS (SELECT 1 FROM devices WHERE h = ?2 AND k = ?1)").bind(k, h),
      env.DB.prepare('UPDATE users SET hash = NULL, gone = 0 WHERE k = ?1 AND hash = ?2').bind(k, h)
    ]));
    if (!added.meta.changes) {
      if (made.meta.changes) throw new Refusal(409, 'secret-used', 'This device already has a Rewinder name.');
      throw new Refusal(409, 'taken', `${name} is already taken.`);
    }
    return json({ name, device: id }, 201);
  }

  // A new device for a name: the one-time code made on one of its devices, and this device's own new secret.
  // The other devices keep working.
  if (path === '/v1/move' && method === 'POST') {
    await guard(request, env, now);
    fromApp(request, env);
    const { code, secret, label } = await readJson(request);
    if (typeof code !== 'string' || !SECRET.test(code)) throw new Refusal(400, 'bad-code', 'That code is not right, or it expired.');
    if (typeof secret !== 'string' || !SECRET.test(secret)) throw new Refusal(400, 'bad-secret', 'The app sent a bad secret.');
    const h = await fingerprint(code);
    const ticket = await env.DB.prepare(`SELECT t.k AS k, u.name AS name, u.hash AS hash, (SELECT COUNT(*) FROM devices WHERE k = t.k) AS n
      FROM tickets t JOIN users u ON u.k = t.k AND u.hash IS NOT NULL WHERE t.h = ?1 AND t.until > ?2`).bind(h, now).first();
    if (!ticket) {
      await wrong(request, env, now);
      throw new Refusal(404, 'bad-code', 'That code is not right, or it expired.');
    }
    if (ticket.n >= MAX_DEVICES) throw new Refusal(400, 'too-many-devices', `${ticket.name} is on ${MAX_DEVICES} devices already. Remove one first.`);
    const mine = await fingerprint(secret);
    if (await env.DB.prepare('SELECT 1 AS ok FROM devices WHERE h = ?1').bind(mine).first()) throw new Refusal(409, 'secret-used', 'This device already has a Rewinder name.');
    const id = newId();
    const steps = legacy(ticket.hash) ? migrate(env, ticket.k, ticket.hash, newId(), '', now) : [];
    // The device goes in only if the code is still there; the code goes in the same transaction: it works once.
    steps.push(env.DB.prepare('INSERT OR IGNORE INTO devices (h, id, k, label, at, seen) SELECT ?1, ?2, k, ?3, ?4, ?4 FROM tickets WHERE h = ?5 AND until > ?4')
      .bind(mine, id, cleanLabel(label), now, h));
    steps.push(env.DB.prepare('DELETE FROM tickets WHERE h = ?1 AND EXISTS (SELECT 1 FROM devices WHERE h = ?2)').bind(h, mine));
    const done = sized(env, await env.DB.batch(steps));
    if (!done[done.length - 2].meta.changes) {
      await wrong(request, env, now);
      throw new Refusal(404, 'bad-code', 'That code is not right, or it expired.');
    }
    return json({ name: ticket.name, device: id });
  }

  const me = await signedIn(request, env, now);

  if (path === '/v1/me' && method === 'GET') {
    const [friends, incoming, outgoing] = await env.DB.batch([
      env.DB.prepare(`SELECT u.name AS name, c.at AS at FROM friends f JOIN users u ON u.k = f.b AND u.hash IS NOT NULL
        LEFT JOIN cards c ON c.k = f.b AND c.t > ?2 WHERE f.a = ?1 ORDER BY u.k`).bind(me.k, now - CARD_TTL),
      env.DB.prepare('SELECT u.name AS name FROM asks q JOIN users u ON u.k = q.src AND u.hash IS NOT NULL WHERE q.dst = ?1 ORDER BY q.t').bind(me.k),
      env.DB.prepare('SELECT u.name AS name FROM asks q JOIN users u ON u.k = q.dst AND u.hash IS NOT NULL WHERE q.src = ?1 ORDER BY q.t').bind(me.k)
    ]);
    await seen(env, me, now);
    return json({ name: me.name, device: me.device, friends: friends.results.map((r) => ({ name: r.name, at: r.at || null })), incoming: incoming.results.map((r) => r.name), outgoing: outgoing.results.map((r) => r.name) });
  }

  if (path === '/v1/me' && method === 'DELETE') {
    // Everything at once. The name itself stays blocked a week.
    await env.DB.batch([
      env.DB.prepare('DELETE FROM friends WHERE a = ?1 OR b = ?1').bind(me.k),
      env.DB.prepare('DELETE FROM asks WHERE src = ?1 OR dst = ?1').bind(me.k),
      env.DB.prepare('DELETE FROM cards WHERE k = ?1').bind(me.k),
      env.DB.prepare('DELETE FROM tickets WHERE k = ?1').bind(me.k),
      env.DB.prepare('DELETE FROM devices WHERE k = ?1').bind(me.k),
      env.DB.prepare('DELETE FROM items WHERE k = ?1').bind(me.k),
      env.DB.prepare('DELETE FROM seqs WHERE k = ?1').bind(me.k),
      env.DB.prepare('UPDATE users SET hash = NULL, gone = ?2 WHERE k = ?1').bind(me.k, now)
    ]);
    return json({ gone: true });
  }

  // Adding a device: a code that works once, for 15 minutes. A new one replaces the old one.
  if (path === '/v1/transfer' && method === 'POST') {
    // The device asking may say what it is (a device from before devices has no name yet).
    const label = Number(request.headers.get('Content-Length')) > 0 ? cleanLabel((await readJson(request)).label) : '';
    if (!(await within(env, 't:' + me.k, 10, DAY, now))) throw new Refusal(429, 'busy-day', 'That is a lot of codes for one day. Try again tomorrow.');
    const code = newCode();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM tickets WHERE k = ?1 OR until < ?2').bind(me.k, now),
      env.DB.prepare('INSERT INTO tickets (h, k, until) VALUES (?1, ?2, ?3)').bind(await fingerprint(code), me.k, now + TICKET_TTL),
      env.DB.prepare("UPDATE devices SET label = ?2 WHERE h = ?1 AND label = '' AND ?2 <> ''").bind(me.h, label)
    ]);
    return json({ code, expires: new Date(now + TICKET_TTL).toISOString() });
  }

  if (path === '/v1/devices' && method === 'GET') {
    const rows = await env.DB.prepare('SELECT id, label, at, seen FROM devices WHERE k = ?1 ORDER BY at, id').bind(me.k).all();
    return json({ devices: rows.results.map((r) => ({ id: r.id, label: r.label, at: iso(r.at), seen: iso(r.seen), me: r.id === me.device })) });
  }

  const devicePath = path.match(/^\/v1\/devices\/([^/]+)$/);
  if (devicePath && method === 'DELETE') {
    const id = devicePath[1] === 'self' ? me.device : devicePath[1];
    if (!DEVICE_ID.test(id)) throw new Refusal(400, 'bad-device', 'That is not one of your devices.');
    await spend(env, me, now);
    // Never the last one: a name with no device could never be used again (remove the name instead).
    // The codes waiting go too: a device taken away can't have made itself a way back in.
    const [gone] = await env.DB.batch([
      env.DB.prepare('DELETE FROM devices WHERE k = ?1 AND id = ?2 AND (SELECT COUNT(*) FROM devices WHERE k = ?1) > 1').bind(me.k, id),
      env.DB.prepare('DELETE FROM tickets WHERE k = ?1').bind(me.k)
    ]);
    if (!gone.meta.changes) {
      const there = await env.DB.prepare('SELECT 1 AS ok FROM devices WHERE k = ?1 AND id = ?2').bind(me.k, id).first();
      if (there) throw new Refusal(409, 'last-device', 'That is your only device. To stop, remove your name and card.');
      throw new Refusal(404, 'no-device', 'That device is already gone.');
    }
    return json({ gone: id });
  }

  // Your list, from your other devices: what changed since the last time, in the order the server got it.
  // What this device sent itself comes back without its body: it only moves the bookmark forward.
  if (path === '/v1/items' && method === 'GET') {
    const since = Number(url.searchParams.get('since') || 0);
    const after = url.searchParams.get('after') || '';
    if (!Number.isSafeInteger(since) || since < 0 || (after && !ITEM_ID.test(after))) throw new Refusal(400, 'bad-cursor', 'The app asked for a bad page.');
    const [rows, seq] = await env.DB.batch([
      env.DB.prepare(`SELECT id, u, v, CASE WHEN d = ?2 THEN NULL ELSE body END AS body FROM items
        WHERE k = ?1 AND (v > ?3 OR (v = ?3 AND id > ?4)) ORDER BY v, id LIMIT ${PAGE + 1}`).bind(me.k, me.device, since, after),
      env.DB.prepare('SELECT n FROM seqs WHERE k = ?1').bind(me.k)
    ]);
    const items = [];
    let bytes = 0;
    for (const r of rows.results.slice(0, PAGE)) {
      if (items.length && bytes + (r.body ? r.body.length : 0) > PAGE_BYTES) break;
      bytes += r.body ? r.body.length : 0;
      items.push({ id: r.id, u: r.u, v: r.v, b: r.body });
    }
    await seen(env, me, now);
    // n: where the server's count is. A bookmark past it means the server went back in time (restored from a
    // copy): the app reads everything again and sends its own back.
    return json({ items, more: items.length < rows.results.length, n: seq.results.length ? seq.results[0].n : 0 });
  }

  if (path === '/v1/items' && method === 'POST') {
    const data = await readJson(request, MAX_SYNC);
    const list = data && Array.isArray(data.items) ? data.items : null;
    if (!list || !list.length || list.length > MAX_PUSH) throw new Refusal(400, 'bad-items', 'The app sent a bad list.');
    for (const x of list) {
      if (!x || typeof x.id !== 'string' || !ITEM_ID.test(x.id) || !Number.isSafeInteger(x.u) || x.u <= 0 || x.u > MAX_U
        || typeof x.b !== 'string' || !x.b.length || x.b.length > MAX_ITEM || !B64.test(x.b)) throw new Refusal(400, 'bad-items', 'The app sent a bad list.');
    }
    // Counted in titles, not in requests: what a day of writing costs the server.
    if (!(await within(env, 's:' + me.k, ITEMS_DAY, DAY, now, list.length))) throw new Refusal(429, 'busy-day', 'That is a lot of syncing for one day. Your list syncs again tomorrow.');
    if (!(await within(env, 's:*', ITEMS_ALL, DAY, now, list.length))) throw new Refusal(429, 'busy-day', 'The Rewinder server is busy today. Your list syncs again tomorrow.');
    if (about(env).size > DB_FULL) throw new Refusal(507, 'server-full', 'The Rewinder server is full. Sonny has to make room.');
    const items = list.map((x) => ({ id: x.id, u: x.u, b: x.b }));
    const add = items.reduce((n, x) => n + x.b.length, 0);
    const room = await env.DB.prepare(`SELECT COALESCE((SELECT bytes FROM seqs WHERE k = ?1), 0) AS bytes,
      (SELECT COALESCE(SUM(length(body)), 0) FROM items WHERE k = ?1 AND id IN (SELECT value FROM json_each(?2))) AS old`)
      .bind(me.k, JSON.stringify(items.map((x) => x.id))).first();
    if (room.bytes - room.old + add > USER_BYTES) throw new Refusal(413, 'list-full', 'Your list is too big for the server.');
    // One transaction: the order number, then every title that is newer than the one already here.
    const done = sized(env, await env.DB.batch([
      env.DB.prepare('INSERT INTO seqs (k, n, t, bytes) VALUES (?1, 1, ?2, 0) ON CONFLICT (k) DO UPDATE SET n = n + 1').bind(me.k, now),
      env.DB.prepare(`INSERT INTO items (k, id, u, v, d, body)
        SELECT ?1, json_extract(j.value, '$.id'), json_extract(j.value, '$.u'), (SELECT n FROM seqs WHERE k = ?1), ?3, json_extract(j.value, '$.b')
        FROM json_each(?2) AS j WHERE 1
        ON CONFLICT (k, id) DO UPDATE SET u = excluded.u, v = excluded.v, d = excluded.d, body = excluded.body WHERE excluded.u >= items.u`)
        .bind(me.k, JSON.stringify(items), me.device),
      env.DB.prepare('UPDATE seqs SET bytes = (SELECT COALESCE(SUM(length(body)), 0) FROM items WHERE k = ?1) WHERE k = ?1').bind(me.k)
    ]));
    return json({ stored: done[1].meta.changes });
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
    sized(env, await env.DB.batch([
      env.DB.prepare(`INSERT INTO cards (k, body, at, t) VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT (k) DO UPDATE SET body = excluded.body, at = excluded.at, t = excluded.t`).bind(me.k, JSON.stringify(card), at, now),
      env.DB.prepare('DELETE FROM cards WHERE t < ?1').bind(now - CARD_TTL)
    ]));
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

    // Decline, cancel or unfriend: whatever ties the two names, gone on both sides at once. Not counted: there is
    // only something to remove after a request or a yes, and those are counted (removing nothing writes nothing).
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
