// Rewinder — friends by name, through the small Rewinder server (a Cloudflare Worker: server/worker.js).
// What goes there: your Rewinder name and your card (titles, scores, statuses, favorites, tags).
// Never your API keys, notes or dates. Your card reaches only the friends who said yes.
import { timed } from './tmdb.js';

// The address of the server everyone uses. Settings → Friends can hold another one.
export const DEFAULT_SERVER = '';

export class LiveError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = 'LiveError';
    this.code = code;
    this.status = status || 0;
  }
}

// https only (a local test server aside), no path, no trailing slash.
export function cleanBase(v) {
  const s = String(v || '').trim().replace(/\/+$/, '');
  return /^https:\/\/[a-z0-9.-]+(:\d{1,5})?$/i.test(s) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(s) ? s : '';
}

export const NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{1,22})[A-Za-z0-9]$/;

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (text) => {
  const s = text.replace(/-/g, '+').replace(/_/g, '/');
  return new TextDecoder().decode(Uint8Array.from(atob(s + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0)));
};

// Made on this device; the server only keeps a fingerprint of it.
export const newSecret = () => b64url(crypto.getRandomValues(new Uint8Array(32)));

async function call(base, path, { method = 'GET', auth, body, etag, ms = 20000 } = {}) {
  if (!base) throw new LiveError('No Rewinder server is set yet.', 'no-server');
  const headers = { Accept: 'application/json' };
  if (auth) {
    headers['X-Rewinder-Name'] = auth.name;
    headers.Authorization = 'Bearer ' + auth.secret;
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (etag) headers['If-None-Match'] = etag;
  const clock = timed(null, ms);
  const late = () => new LiveError('The Rewinder server took too long to answer. Try again.', 'timeout');
  try {
    let res;
    try {
      res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: clock.signal, cache: 'no-store' });
    } catch {
      throw clock.late() ? late() : new LiveError("Can't reach the Rewinder server. Check your internet connection.", 'network');
    }
    if (res.status === 304) return { unchanged: true, data: null, etag };
    let data = null;
    try {
      data = await res.json();
    } catch {
      if (clock.late()) throw late();
    }
    if (!res.ok) throw new LiveError((data && data.message) || `The Rewinder server answered with an error (${res.status}).`, (data && data.error) || 'http', res.status);
    return { unchanged: false, data, etag: res.headers.get('ETag') || '' };
  } finally {
    clock.done();
  }
}

export const claim = (base, name, invite, secret) => call(base, '/v1/claim', { method: 'POST', body: { name, invite, secret } });
export const whoami = (base, auth) => call(base, '/v1/me', { auth });
export const publish = (base, auth, card) => call(base, '/v1/card', { method: 'PUT', auth, body: card, ms: 30000 });
export const cardOf = (base, auth, name, etag) => call(base, '/v1/card/' + encodeURIComponent(name), { auth, etag, ms: 30000 });
// what: request, accept, decline, cancel or unfriend.
export const tell = (base, auth, what, name) => call(base, '/v1/' + what, { method: 'POST', auth, body: { name } });
export const move = (base, auth, secret) => call(base, '/v1/move', { method: 'POST', auth, body: { secret } });
export const leave = (base, auth) => call(base, '/v1/me', { method: 'DELETE', auth });

// One line that carries your name to your other device. It works once: that device gets a new secret right away.
export const moveCode = (base, auth) => 'RW1.' + b64url(new TextEncoder().encode(JSON.stringify({ v: base, n: auth.name, s: auth.secret })));

export function readMoveCode(text) {
  const m = String(text || '').match(/RW1\.([A-Za-z0-9_-]{20,2000})/);
  if (!m) return null;
  try {
    const o = JSON.parse(fromB64url(m[1]));
    const base = cleanBase(o.v);
    if (!base || typeof o.n !== 'string' || !NAME.test(o.n) || typeof o.s !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(o.s)) return null;
    return { base, name: o.n, secret: o.s };
  } catch {
    return null;
  }
}
