const DB_NAME = 'minddump';
const DB_VERSION = 1;

const META_KEY = 'noteCounter';

/**
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('categories')) {
        db.createObjectStore('categories', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('topics')) {
        const topics = db.createObjectStore('topics', { keyPath: 'id' });
        topics.createIndex('byCategory', 'categoryId', { unique: false });
      }
      if (!db.objectStoreNames.contains('notes')) {
        const notes = db.createObjectStore('notes', { keyPath: 'id' });
        notes.createIndex('byCategory', 'categoryId', { unique: false });
        notes.createIndex('byTopic', 'topicId', { unique: false });
        notes.createIndex('byStatus', 'status', { unique: false });
        notes.createIndex('byUpdated', 'updatedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('actions')) {
        const actions = db.createObjectStore('actions', { keyPath: 'id' });
        actions.createIndex('byNote', 'noteId', { unique: false });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
  });
}

/**
 * @template T
 * @param {IDBTransactionMode} mode
 * @param {(tx: IDBTransaction) => void} fn
 * @returns {Promise<T>}
 */
async function tx(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(
      ['categories', 'topics', 'notes', 'actions', 'meta'],
      mode
    );
    t.oncomplete = () => resolve(undefined);
    t.onerror = () => reject(t.error);
    try {
      fn(t);
    } catch (err) {
      reject(err);
    }
  });
}

async function getMeta(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const r = db.transaction('meta', 'readonly').objectStore('meta').get(key);
    r.onsuccess = () => resolve(r.result?.value ?? null);
    r.onerror = () => reject(r.error);
  });
}

async function setMeta(key, value) {
  await tx('readwrite', (t) => {
    t.objectStore('meta').put({ key, value });
  });
}

async function nextNoteNo() {
  let n = (await getMeta(META_KEY)) ?? 0;
  n += 1;
  await setMeta(META_KEY, n);
  return n;
}

// --- Categories ---

export async function getAllCategories() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const r = db.transaction('categories', 'readonly').objectStore('categories').getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

export async function addCategory({ name, color }) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const row = { id, name, color, createdAt: now };
  await tx('readwrite', (t) => {
    t.objectStore('categories').put(row);
  });
  return row;
}

export async function updateCategory(id, patch) {
  const db = await openDB();
  const existing = await new Promise((resolve, reject) => {
    const r = db.transaction('categories', 'readonly').objectStore('categories').get(id);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  if (!existing) return null;
  const row = { ...existing, ...patch };
  await tx('readwrite', (t) => {
    t.objectStore('categories').put(row);
  });
  return row;
}

export async function deleteCategory(id) {
  const topics = await getTopicsByCategory(id);
  for (const topic of topics) {
    await deleteTopic(topic.id);
  }
  await tx('readwrite', (t) => {
    t.objectStore('categories').delete(id);
  });
}

// --- Topics ---

export async function getTopicsByCategory(categoryId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = db.transaction('topics', 'readonly').objectStore('topics');
    const idx = store.index('byCategory');
    const r = idx.getAll(categoryId);
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

export async function getAllTopics() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const r = db.transaction('topics', 'readonly').objectStore('topics').getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

export async function addTopic({ name, categoryId }) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const row = { id, name, categoryId, createdAt: now };
  await tx('readwrite', (t) => {
    t.objectStore('topics').put(row);
  });
  return row;
}

export async function updateTopic(id, patch) {
  const db = await openDB();
  const existing = await new Promise((resolve, reject) => {
    const r = db.transaction('topics', 'readonly').objectStore('topics').get(id);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  if (!existing) return null;
  const row = { ...existing, ...patch };
  await tx('readwrite', (t) => {
    t.objectStore('topics').put(row);
  });
  return row;
}

export async function deleteTopic(id) {
  const notes = await getNotesByTopic(id);
  for (const note of notes) {
    await deleteNote(note.id);
  }
  await tx('readwrite', (t) => {
    t.objectStore('topics').delete(id);
  });
}

async function getNotesByTopic(topicId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = db.transaction('notes', 'readonly').objectStore('notes');
    const idx = store.index('byTopic');
    const r = idx.getAll(topicId);
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

// --- Notes ---

export async function getAllNotes() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const r = db.transaction('notes', 'readonly').objectStore('notes').getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

export async function getNotesByCategory(categoryId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = db.transaction('notes', 'readonly').objectStore('notes');
    const idx = store.index('byCategory');
    const r = idx.getAll(categoryId);
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

export async function getNote(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const r = db.transaction('notes', 'readonly').objectStore('notes').get(id);
    r.onsuccess = () => resolve(r.result ?? null);
    r.onerror = () => reject(r.error);
  });
}

export async function addNote({ title, topicId, categoryId, status = 'open' }) {
  const no = await nextNoteNo();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const row = {
    id,
    no,
    title: title || '',
    topicId,
    categoryId,
    status,
    createdAt: now,
    updatedAt: now,
  };
  await tx('readwrite', (t) => {
    t.objectStore('notes').put(row);
  });
  return row;
}

export async function updateNote(id, patch) {
  const db = await openDB();
  const existing = await new Promise((resolve, reject) => {
    const r = db.transaction('notes', 'readonly').objectStore('notes').get(id);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  if (!existing) return null;
  const now = new Date().toISOString();
  const row = { ...existing, ...patch, updatedAt: now };
  await tx('readwrite', (t) => {
    t.objectStore('notes').put(row);
  });
  return row;
}

export async function deleteNote(id) {
  const actions = await getActionsByNote(id);
  await tx('readwrite', (t) => {
    const actionStore = t.objectStore('actions');
    for (const a of actions) actionStore.delete(a.id);
    t.objectStore('notes').delete(id);
  });
}

// --- Actions ---

export async function getActionsByNote(noteId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = db.transaction('actions', 'readonly').objectStore('actions');
    const idx = store.index('byNote');
    const r = idx.getAll(noteId);
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

export async function addAction({ noteId, text, done = false }) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const row = { id, noteId, text: text || '', done, createdAt: now };
  await tx('readwrite', (t) => {
    t.objectStore('actions').put(row);
  });
  return row;
}

export async function updateAction(id, patch) {
  const db = await openDB();
  const existing = await new Promise((resolve, reject) => {
    const r = db.transaction('actions', 'readonly').objectStore('actions').get(id);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  if (!existing) return null;
  const row = { ...existing, ...patch };
  await tx('readwrite', (t) => {
    t.objectStore('actions').put(row);
  });
  return row;
}

export async function deleteAction(id) {
  await tx('readwrite', (t) => {
    t.objectStore('actions').delete(id);
  });
}

export async function toggleAction(id) {
  const db = await openDB();
  const existing = await new Promise((resolve, reject) => {
    const r = db.transaction('actions', 'readonly').objectStore('actions').get(id);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  if (!existing) return null;
  const row = { ...existing, done: !existing.done };
  await tx('readwrite', (t) => {
    t.objectStore('actions').put(row);
  });
  return row;
}

// --- Export / import / reset ---

export async function exportData() {
  const [categories, topics, notes, actions, counter] = await Promise.all([
    getAllCategories(),
    getAllTopics(),
    getAllNotes(),
    new Promise((resolve, reject) => {
      openDB().then((db) => {
        const r = db.transaction('actions', 'readonly').objectStore('actions').getAll();
        r.onsuccess = () => resolve(r.result || []);
        r.onerror = () => reject(r.error);
      });
    }),
    getMeta(META_KEY),
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    meta: { noteCounter: counter ?? 0 },
    categories,
    topics,
    notes,
    actions,
  };
}

export async function importData(data) {
  if (!data || typeof data !== 'object') throw new Error('Invalid JSON');
  const categories = data.categories || [];
  const topics = data.topics || [];
  const notes = data.notes || [];
  const actions = data.actions || [];
  const noteCounter =
    data.meta?.noteCounter != null
      ? Number(data.meta.noteCounter)
      : notes.reduce((m, n) => Math.max(m, n.no || 0), 0);

  await tx('readwrite', (t) => {
    const clear = (name) => {
      const s = t.objectStore(name);
      s.clear();
    };
    clear('categories');
    clear('topics');
    clear('notes');
    clear('actions');
    clear('meta');

    for (const c of categories) t.objectStore('categories').put(c);
    for (const tp of topics) t.objectStore('topics').put(tp);
    for (const n of notes) t.objectStore('notes').put(n);
    for (const a of actions) t.objectStore('actions').put(a);
    t.objectStore('meta').put({ key: META_KEY, value: noteCounter });
  });
}

export async function clearAllData() {
  await tx('readwrite', (t) => {
    t.objectStore('categories').clear();
    t.objectStore('topics').clear();
    t.objectStore('notes').clear();
    t.objectStore('actions').clear();
    t.objectStore('meta').clear();
  });
}
