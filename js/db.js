// IndexedDB storage: transactions, receipt photos (Blobs keyed by transaction id), recurring rules and savings goals.

const DB_NAME = 'finanzapp';
const DB_VERSION = 2;
let dbPromise;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (e.oldVersion < 1) {
        db.createObjectStore('transactions', { keyPath: 'id' }).createIndex('date', 'date');
        db.createObjectStore('photos');
      }
      if (e.oldVersion < 2) {
        db.createObjectStore('recurring', { keyPath: 'id' });
        db.createObjectStore('goals', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function withStores(names, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, mode);
    let result;
    const req = fn(...names.map((n) => tx.objectStore(n)));
    if (req instanceof IDBRequest) req.onsuccess = () => (result = req.result);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function getAll(store) {
  return withStores([store], 'readonly', (s) => s.getAll());
}

export function put(store, ...values) {
  return withStores([store], 'readwrite', (s) => values.forEach((v) => s.put(v)));
}

export function remove(store, id) {
  return withStores([store], 'readwrite', (s) => s.delete(id));
}

export function getPhoto(id) {
  return withStores(['photos'], 'readonly', (s) => s.get(id));
}

/**
 * @param {object} transaction
 * @param {Blob|null|undefined} photo Blob = set, null = remove, undefined = keep as is
 */
export function saveTransaction(transaction, photo) {
  return withStores(['transactions', 'photos'], 'readwrite', (txs, photos) => {
    if (photo instanceof Blob) photos.put(photo, transaction.id);
    else if (photo === null) photos.delete(transaction.id);
    txs.put(transaction);
  });
}

export function deleteTransaction(id) {
  return withStores(['transactions', 'photos'], 'readwrite', (txs, photos) => {
    txs.delete(id);
    photos.delete(id);
  });
}

export async function getAllPhotos() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const out = {};
    const req = db.transaction('photos').objectStore('photos').openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return resolve(out);
      out[cursor.key] = cursor.value;
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

/** Upserts everything from a backup in one go. */
export function importData({ transactions = [], photos = {}, recurring = [], goals = [] }) {
  return withStores(['transactions', 'photos', 'recurring', 'goals'], 'readwrite', (txs, ph, rec, gl) => {
    transactions.forEach((t) => txs.put(t));
    Object.entries(photos).forEach(([id, blob]) => ph.put(blob, id));
    recurring.forEach((r) => rec.put(r));
    goals.forEach((g) => gl.put(g));
  });
}

export function clearAll() {
  return withStores(['transactions', 'photos', 'recurring', 'goals'], 'readwrite', (...stores) => stores.forEach((s) => s.clear()));
}
