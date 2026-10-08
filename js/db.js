// IndexedDB storage: transactions + receipt photos (as Blobs, keyed by transaction id).

const DB_NAME = 'finanzapp';
const DB_VERSION = 1;
let dbPromise;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const store = db.createObjectStore('transactions', { keyPath: 'id' });
      store.createIndex('date', 'date');
      db.createObjectStore('photos');
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
    const stores = names.map((n) => tx.objectStore(n));
    let result;
    const done = fn(...stores);
    if (done instanceof IDBRequest) done.onsuccess = () => (result = done.result);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function getAllTransactions() {
  return withStores(['transactions'], 'readonly', (s) => s.getAll());
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

/** Upserts many transactions and photos ({ [id]: Blob }) in one go. */
export function importData(transactions, photos = {}) {
  return withStores(['transactions', 'photos'], 'readwrite', (txs, ph) => {
    for (const t of transactions) txs.put(t);
    for (const [id, blob] of Object.entries(photos)) ph.put(blob, id);
  });
}

export function clearAll() {
  return withStores(['transactions', 'photos'], 'readwrite', (txs, photos) => {
    txs.clear();
    photos.clear();
  });
}
