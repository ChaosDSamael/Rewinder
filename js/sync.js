// Rewinder — your list on all your devices. Each title travels through your Rewinder server locked with a key
// that stays on your devices (AES-GCM, 256 bits): the server only ever holds scrambled bytes, a title id and
// when it changed. The key goes from one of your devices to another inside the one-time code, never to the server.
import { normalizeTitle, MAX_TIME } from './model.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

// A small item every device pushes once: a device that can't open it has the wrong key.
export const KEY_ITEM = '__key';
export const KEY_CHECK = 'rewinder-list-key-1';
// The ids the server takes; any other title stays on this device only.
export const syncable = (id) => typeof id === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(id) && id !== KEY_ITEM;
export const isKey = (k) => typeof k === 'string' && /^[A-Za-z0-9_-]{43}$/.test(k);

export const b64url = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export const fromB64url = (text) => {
  const s = String(text).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
};

export const newKey = () => b64url(crypto.getRandomValues(new Uint8Array(32)));

const cryptoKeys = new Map();
function cryptoKey(text) {
  if (!cryptoKeys.has(text)) cryptoKeys.set(text, crypto.subtle.importKey('raw', fromB64url(text), 'AES-GCM', false, ['encrypt', 'decrypt']));
  return cryptoKeys.get(text);
}

// Squeezed before locking when the browser can (a list of episodes shrinks a lot): z = gzip, j = plain JSON.
const canSqueeze = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
async function squeeze(text) {
  const bytes = enc.encode(text);
  if (!canSqueeze) return concat(enc.encode('j'), bytes);
  const out = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  return concat(enc.encode('z'), out);
}
async function unsqueeze(bytes) {
  const kind = String.fromCharCode(bytes[0]);
  const rest = bytes.subarray(1);
  if (kind === 'j') return dec.decode(rest);
  if (kind !== 'z' || !canSqueeze) throw new Error('This browser cannot read that.');
  return dec.decode(await new Response(new Blob([rest]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
}
function concat(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

// Locked to its id too: the server can't hand one title's box out as another's.
const ad = (id) => enc.encode('rewinder:' + id);

export async function seal(keyText, id, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = await squeeze(JSON.stringify(value));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: ad(id) }, await cryptoKey(keyText), plain));
  return b64url(concat(iv, sealed));
}

export async function unseal(keyText, id, text) {
  const bytes = fromB64url(text);
  if (bytes.length < 30) throw new Error('Too short.');
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12), additionalData: ad(id) }, await cryptoKey(keyText), bytes.subarray(12)));
  return JSON.parse(await unsqueeze(plain));
}

// What a sealed title holds once opened: the title (checked like a backup), its recent history, and when it
// changed, from inside the box (the server's own copy of that time is only used to order the boxes).
export function readBox(id, data) {
  if (!data || typeof data !== 'object' || !Number.isSafeInteger(data.u) || data.u <= 0 || data.u > MAX_TIME) return null;
  if (data.gone === true) return { gone: true, u: data.u };
  if (!data.t || typeof data.t !== 'object') return null;
  const t = normalizeTitle(data.t);
  t.id = id;
  t.updatedAt = new Date(data.u).toISOString();
  const history = (Array.isArray(data.h) ? data.h : [])
    .filter((h) => h && typeof h.text === 'string' && h.text && typeof h.at === 'string' && !Number.isNaN(Date.parse(h.at)))
    .slice(0, 30)
    .map((h) => ({ at: new Date(h.at).toISOString(), text: h.text.slice(0, 300) }));
  return { gone: false, u: data.u, t, history };
}
