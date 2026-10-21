// IndexedDB storage. Everything stays on this device.
//   sessions: one record per focus session (cover image included)
//   frames:   timelapse frames as JPEG blobs, keyed [sessionId, seq]
//   kv:       profile, settings, categories, friends

const DB_NAME = 'lock-in';
const DB_VERSION = 1;

let opening = null;

function open() {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('sessions', { keyPath: 'id' });
      db.createObjectStore('frames');
      db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Close other Lock In tabs and reload.'));
  });
  return opening;
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

async function store(name, mode = 'readonly') {
  const db = await open();
  return db.transaction(name, mode).objectStore(name);
}

const frameRange = (id) => IDBKeyRange.bound([id, 0], [id, Infinity]);

export const sessions = {
  async all() {
    return wrap((await store('sessions')).getAll());
  },
  // Finished sessions, newest first.
  async done() {
    const all = await this.all();
    return all.filter((s) => s.status === 'done').sort((a, b) => b.startedAt - a.startedAt);
  },
  async get(id) {
    return wrap((await store('sessions')).get(id));
  },
  async put(session) {
    const os = await store('sessions', 'readwrite');
    os.put(session);
    return done(os.transaction);
  },
  async delete(id) {
    const db = await open();
    const tx = db.transaction(['sessions', 'frames'], 'readwrite');
    tx.objectStore('sessions').delete(id);
    tx.objectStore('frames').delete(frameRange(id));
    return done(tx);
  },
};

export const frames = {
  async put(id, seq, blob) {
    const os = await store('frames', 'readwrite');
    os.put(blob, [id, seq]);
    return done(os.transaction);
  },
  async get(id, seq) {
    return wrap((await store('frames')).get([id, seq]));
  },
  async all(id) {
    return wrap((await store('frames')).getAll(frameRange(id)));
  },
  async seqs(id) {
    const keys = await wrap((await store('frames')).getAllKeys(frameRange(id)));
    return keys.map((k) => k[1]);
  },
  async deleteMany(id, seqs) {
    if (!seqs.length) return;
    const os = await store('frames', 'readwrite');
    for (const seq of seqs) os.delete([id, seq]);
    return done(os.transaction);
  },
  async clear(id) {
    const os = await store('frames', 'readwrite');
    os.delete(frameRange(id));
    return done(os.transaction);
  },
  async bytes(id) {
    const blobs = await this.all(id);
    return blobs.reduce((sum, b) => sum + b.size, 0);
  },
};

export const kv = {
  async get(key) {
    return wrap((await store('kv')).get(key));
  },
  async set(key, value) {
    const os = await store('kv', 'readwrite');
    os.put(value, key);
    return done(os.transaction);
  },
};
