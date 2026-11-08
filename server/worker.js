// Rewinder friends server: a Cloudflare Worker with one KV namespace (binding CARDS) and one secret (INVITE).
// It keeps three things: names, friend requests, and each person's card. A card is what the app sends:
// titles, scores, statuses, favorites and tags. Never API keys, notes or dates.
//
// Who sees what: your card goes only to the friends who accepted you (or whom you accepted).
// Who gets in: creating a name takes the group's invite code. Each device proves its name with a
// secret it made itself; the server only keeps a fingerprint (SHA-256) of it.

const ORIGINS = new Set(['https://chaosdsamael.github.io']);
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;
const NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{1,22})[A-Za-z0-9]$/;
const SECRET = /^[A-Za-z0-9_-]{32,128}$/;
// A card nobody refreshes for 5 months is erased: TMDB asks that nothing from it be kept past 6 months.
const CARD_TTL = 150 * 24 * 3600;
const MAX_CARD = 1500000;
const MAX_BODY = 1600000;
const MAX_FRIENDS = 200;

const keyOf = (name) => String(name).toLowerCase();
const same = (a, b) => keyOf(a) === keyOf(b);
const without = (list, name) => list.filter((x) => !same(x, name));
const has = (list, name) => list.some((x) => same(x, name));

function cors(request) {
  const origin = request.headers.get('Origin') || '';
  const ok = ORIGINS.has(origin) || LOCAL.test(origin);
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

async function fingerprint(text) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Same length, every character looked at: how long the comparison takes says nothing about the answer.
function equal(a, b) {
  const x = String(a);
  const y = String(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
}

async function readJson(request, limit = 4000) {
  const text = await request.text();
  if (text.length > limit) throw new Refusal(413, 'too-big', 'That is too big.');
  try {
    return JSON.parse(text);
  } catch {
    throw new Refusal(400, 'bad-json', 'The server could not read that.');
  }
}

const userOf = (env, name) => env.CARDS.get('u:' + keyOf(name), 'json');
const relOf = async (env, name) => (await env.CARDS.get('r:' + keyOf(name), 'json')) || { friends: [], incoming: [], outgoing: [] };
const putRel = (env, name, rel) => env.CARDS.put('r:' + keyOf(name), JSON.stringify(rel));

async function signedIn(request, env) {
  const name = request.headers.get('X-Rewinder-Name') || '';
  const auth = request.headers.get('Authorization') || '';
  const secret = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!NAME.test(name) || !SECRET.test(secret)) throw new Refusal(401, 'signed-out', 'Your Rewinder name is not on this device.');
  const user = await userOf(env, name);
  if (!user || !equal(user.hash, await fingerprint(secret))) throw new Refusal(401, 'signed-out', 'Your Rewinder name is not on this device.');
  return user;
}

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });

async function route(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method;

  if (path === '/v1/claim' && method === 'POST') {
    const { name, invite, secret } = await readJson(request);
    if (!env.INVITE) throw new Refusal(503, 'no-invite', 'The server has no invite code yet.');
    if (!equal(String(invite || '').trim(), env.INVITE)) throw new Refusal(403, 'bad-invite', 'That invite code is not right.');
    if (typeof name !== 'string' || !NAME.test(name)) throw new Refusal(400, 'bad-name', 'A name is 3 to 24 letters or numbers (. _ - inside).');
    if (typeof secret !== 'string' || !SECRET.test(secret)) throw new Refusal(400, 'bad-secret', 'The app sent a bad secret.');
    if (await userOf(env, name)) throw new Refusal(409, 'taken', `${name} is already taken.`);
    await env.CARDS.put('u:' + keyOf(name), JSON.stringify({ name, hash: await fingerprint(secret), at: new Date().toISOString() }));
    await putRel(env, name, { friends: [], incoming: [], outgoing: [] });
    return json({ name }, 201);
  }

  const me = await signedIn(request, env);

  if (path === '/v1/me' && method === 'GET') {
    const rel = await relOf(env, me.name);
    const friends = await Promise.all(rel.friends.map(async (name) => {
      const card = await env.CARDS.getWithMetadata('c:' + keyOf(name), 'stream');
      if (card && card.value && card.value.cancel) card.value.cancel();
      return { name, at: (card && card.metadata && card.metadata.at) || null };
    }));
    return json({ name: me.name, friends, incoming: rel.incoming, outgoing: rel.outgoing });
  }

  if (path === '/v1/me' && method === 'DELETE') {
    const rel = await relOf(env, me.name);
    for (const other of new Set([...rel.friends, ...rel.incoming, ...rel.outgoing])) {
      const theirs = await relOf(env, other);
      await putRel(env, other, { friends: without(theirs.friends, me.name), incoming: without(theirs.incoming, me.name), outgoing: without(theirs.outgoing, me.name) });
    }
    await env.CARDS.delete('c:' + keyOf(me.name));
    await env.CARDS.delete('r:' + keyOf(me.name));
    await env.CARDS.delete('u:' + keyOf(me.name));
    return json({ gone: true });
  }

  if (path === '/v1/move' && method === 'POST') {
    const { secret } = await readJson(request);
    if (typeof secret !== 'string' || !SECRET.test(secret)) throw new Refusal(400, 'bad-secret', 'The app sent a bad secret.');
    await env.CARDS.put('u:' + keyOf(me.name), JSON.stringify({ ...me, hash: await fingerprint(secret) }));
    return json({ name: me.name });
  }

  if (path === '/v1/card' && method === 'PUT') {
    const text = await request.text();
    if (text.length > MAX_CARD) throw new Refusal(413, 'too-big', 'Your card is too big for the server.');
    let card;
    try { card = JSON.parse(text); } catch { throw new Refusal(400, 'bad-json', 'The server could not read your card.'); }
    if (!card || card.app !== 'rewinder' || card.kind !== 'card' || !Array.isArray(card.titles)) throw new Refusal(400, 'not-card', 'That is not a Rewinder card.');
    const at = new Date().toISOString();
    card.at = at;
    await env.CARDS.put('c:' + keyOf(me.name), JSON.stringify(card), { expirationTtl: CARD_TTL, metadata: { at } });
    return json({ at });
  }

  const cardPath = path.match(/^\/v1\/card\/([^/]+)$/);
  if (cardPath && method === 'GET') {
    const name = decodeURIComponent(cardPath[1]);
    const rel = await relOf(env, me.name);
    if (!has(rel.friends, name)) throw new Refusal(403, 'not-friends', `${name} is not one of your friends.`);
    const card = await env.CARDS.getWithMetadata('c:' + keyOf(name), 'text');
    if (!card || !card.value) throw new Refusal(404, 'no-card', `${name} has no card on the server yet.`);
    const tag = `"${(card.metadata && card.metadata.at) || ''}"`;
    if (request.headers.get('If-None-Match') === tag) return new Response(null, { status: 304, headers: { ETag: tag } });
    return new Response(card.value, { status: 200, headers: { 'Content-Type': 'application/json', ETag: tag } });
  }

  if (method === 'POST' && ['/v1/request', '/v1/accept', '/v1/decline', '/v1/cancel', '/v1/unfriend'].includes(path)) {
    const body = await readJson(request);
    const other = String(body.name || '').trim();
    if (!NAME.test(other)) throw new Refusal(400, 'bad-name', 'That is not a Rewinder name.');
    if (same(other, me.name)) throw new Refusal(400, 'self', 'That is your own name.');
    const them = await userOf(env, other);
    if (!them) throw new Refusal(404, 'no-such-name', `Nobody is called ${other} on Rewinder.`);
    const mine = await relOf(env, me.name);
    const theirs = await relOf(env, them.name);
    let state;
    if (path === '/v1/request') {
      if (has(mine.friends, them.name)) state = 'friends';
      else if (has(mine.incoming, them.name)) state = 'friends';
      else {
        if (mine.outgoing.length + mine.friends.length >= MAX_FRIENDS) throw new Refusal(400, 'too-many', 'That is a lot of friends already.');
        state = 'sent';
      }
      if (state === 'friends') {
        mine.friends = [...without(mine.friends, them.name), them.name];
        theirs.friends = [...without(theirs.friends, me.name), me.name];
        mine.incoming = without(mine.incoming, them.name);
        theirs.outgoing = without(theirs.outgoing, me.name);
      } else {
        mine.outgoing = [...without(mine.outgoing, them.name), them.name];
        theirs.incoming = [...without(theirs.incoming, me.name), me.name];
      }
    } else if (path === '/v1/accept') {
      if (!has(mine.incoming, them.name) && !has(mine.friends, them.name)) throw new Refusal(404, 'no-request', `${them.name} did not ask to be friends.`);
      mine.incoming = without(mine.incoming, them.name);
      theirs.outgoing = without(theirs.outgoing, me.name);
      mine.friends = [...without(mine.friends, them.name), them.name];
      theirs.friends = [...without(theirs.friends, me.name), me.name];
      state = 'friends';
    } else {
      // Decline, cancel or unfriend: whatever ties the two names, gone on both sides.
      for (const rel of [mine, theirs]) {
        const other2 = rel === mine ? them.name : me.name;
        rel.friends = without(rel.friends, other2);
        rel.incoming = without(rel.incoming, other2);
        rel.outgoing = without(rel.outgoing, other2);
      }
      state = 'none';
    }
    await putRel(env, me.name, mine);
    await putRel(env, them.name, theirs);
    return json({ name: them.name, state });
  }

  throw new Refusal(404, 'no-route', 'Nothing here.');
}

export default {
  async fetch(request, env) {
    const head = cors(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: head });
    const url = new URL(request.url);
    try {
      const length = Number(request.headers.get('Content-Length') || 0);
      if (length > MAX_BODY) throw new Refusal(413, 'too-big', 'That is too big.');
      const res = await route(request, env, url);
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
