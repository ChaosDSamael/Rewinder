// Rewinder — storage. Everything lives in this browser's IndexedDB; nothing is sent anywhere.
import { DEFAULT_SETTINGS, normalizeTitle } from './model.js';

const DB_NAME = 'rewinder';
const DB_VERSION = 1;
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('titles')) db.createObjectStore('titles', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('history')) {
        const history = db.createObjectStore('history', { keyPath: 'seq', autoIncrement: true });
        history.createIndex('byTitle', 'titleId');
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Rewinder is open in another tab with an older version. Close it and reload.'));
  });
  return dbPromise;
}

const result = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

// A write started while the page closes gets cancelled unless the browser is told to commit
// at once; with this, a note typed just before closing the app still lands.
const commitNow = (transaction) => {
  try { if (transaction.commit) transaction.commit(); } catch { /* older browsers commit on their own */ }
};

const finished = (transaction) => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error);
  transaction.onabort = () => reject(transaction.error || new Error('Storage write was cancelled.'));
});

export async function loadAll() {
  const db = await open();
  const tx = db.transaction(['titles', 'meta'], 'readonly');
  const titlesReq = tx.objectStore('titles').getAll();
  const settingsReq = tx.objectStore('meta').get('settings');
  const [titles, settings] = await Promise.all([result(titlesReq), result(settingsReq)]);
  return { titles: titles || [], settings: { ...DEFAULT_SETTINGS, ...(settings || {}) } };
}

export async function getTitle(id) {
  const db = await open();
  return result(db.transaction('titles', 'readonly').objectStore('titles').get(id));
}

export async function getSettings() {
  const db = await open();
  const saved = await result(db.transaction('meta', 'readonly').objectStore('meta').get('settings'));
  return { ...DEFAULT_SETTINGS, ...(saved || {}) };
}

export async function putTitle(title) {
  const db = await open();
  const tx = db.transaction('titles', 'readwrite');
  tx.objectStore('titles').put(title);
  commitNow(tx);
  return finished(tx);
}

export async function deleteTitle(id) {
  const db = await open();
  const tx = db.transaction(['titles', 'history'], 'readwrite');
  tx.objectStore('titles').delete(id);
  const index = tx.objectStore('history').index('byTitle');
  const keysReq = index.getAllKeys(id);
  keysReq.onsuccess = () => {
    for (const key of keysReq.result) tx.objectStore('history').delete(key);
  };
  return finished(tx);
}

// Other things worth keeping, like the backup folder you picked.
export async function getMeta(key) {
  const db = await open();
  return result(db.transaction('meta', 'readonly').objectStore('meta').get(key));
}

export async function putMeta(key, value) {
  const db = await open();
  const tx = db.transaction('meta', 'readwrite');
  if (value === undefined || value === null) tx.objectStore('meta').delete(key);
  else tx.objectStore('meta').put(value, key);
  commitNow(tx);
  return finished(tx);
}

export async function putSettings(settings) {
  const db = await open();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put({ ...settings }, 'settings');
  commitNow(tx);
  return finished(tx);
}

export async function addHistory(titleId, text) {
  const db = await open();
  const tx = db.transaction('history', 'readwrite');
  const entry = { titleId, at: new Date().toISOString(), text: String(text).slice(0, 300) };
  const keyReq = tx.objectStore('history').add(entry);
  const seq = await result(keyReq);
  await finished(tx);
  return { ...entry, seq };
}

// Rewrites one history line in place (a burst of small score changes stays a single line).
export async function updateHistory(seq, text) {
  const db = await open();
  const tx = db.transaction('history', 'readwrite');
  const historyStore = tx.objectStore('history');
  const entry = await result(historyStore.get(seq));
  if (entry) historyStore.put({ ...entry, at: new Date().toISOString(), text: String(text).slice(0, 300) });
  await finished(tx);
  return entry ? { ...entry, text } : null;
}

export async function historyFor(titleId, limit = 15) {
  const db = await open();
  const tx = db.transaction('history', 'readonly');
  const all = await result(tx.objectStore('history').index('byTitle').getAll(titleId));
  return all.sort((a, b) => b.seq - a.seq).slice(0, limit);
}

// The backup leaves the API keys out: a backup file can travel, a key should not.
export async function exportAll() {
  const db = await open();
  const tx = db.transaction(['titles', 'history', 'meta'], 'readonly');
  const [titles, history, settings] = await Promise.all([
    result(tx.objectStore('titles').getAll()),
    result(tx.objectStore('history').getAll()),
    result(tx.objectStore('meta').get('settings'))
  ]);
  const safe = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  delete safe.tmdbKey;
  delete safe.rawgKey;
  return { app: 'rewinder', format: 1, exportedAt: new Date().toISOString(), titles, history, settings: safe };
}

export function isBackup(data) {
  // A friend's card also lists titles: it must never pass for a backup and replace your list.
  return Boolean(data && data.app === 'rewinder' && data.kind !== 'card' && Array.isArray(data.titles));
}

export async function importAll(data) {
  if (!isBackup(data)) throw new Error('This file is not a Rewinder backup.');
  const titles = data.titles.map(normalizeTitle);
  const history = Array.isArray(data.history) ? data.history : [];
  const db = await open();
  const tx = db.transaction(['titles', 'history'], 'readwrite');
  const titleStore = tx.objectStore('titles');
  const historyStore = tx.objectStore('history');
  titleStore.clear();
  historyStore.clear();
  for (const t of titles) titleStore.put(t);
  for (const h of history) {
    if (h && typeof h.titleId === 'string' && h.text) {
      historyStore.add({ titleId: h.titleId, at: String(h.at || new Date().toISOString()), text: String(h.text).slice(0, 300) });
    }
  }
  await finished(tx);
  return titles.length;
}

export async function persist() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch (err) {
    console.warn('Persistent storage not granted', err);
  }
  return false;
}
