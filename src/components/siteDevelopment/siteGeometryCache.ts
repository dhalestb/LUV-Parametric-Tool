/** Persist the last loaded site GLB/OBJ so Site Development survives tab switches. */

const DB_NAME = "vul-site-geometry";
const STORE = "site";
const KEY = "current";

export type CachedSiteGeometry = {
  filename: string;
  sampleId: string | null;
  format: "glb" | "obj";
  buffer: ArrayBuffer;
  savedAt: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Site geometry DB failed to open."));
  });
}

export async function writeSiteGeometryCache(entry: CachedSiteGeometry): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(entry, KEY);
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error("Site geometry cache write failed."));
    });
  } finally {
    db.close();
  }
}

export async function readSiteGeometryCache(): Promise<CachedSiteGeometry | null> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(KEY);
      tx.oncomplete = () => resolve((request.result as CachedSiteGeometry | undefined) ?? null);
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error("Site geometry cache read failed."));
    });
  } finally {
    db.close();
  }
}
