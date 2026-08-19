// Shared low-level IndexedDB helpers for src/store/*. Split out of
// index.ts once a second store (calibration.ts) needed the same
// open/request-wrapping logic — see docs/session-store.md.
//
// IndexedDB requires every schema change for a given database version to
// happen inside one `onupgradeneeded` callback, so this is also the one
// place that knows the full set of object stores across the app (sessions,
// frames, calibrations) — the individual store modules import the name
// constants below rather than each running their own open()/upgrade.

export const DATABASE_NAME = "resonance-scope";
const DATABASE_VERSION = 2;

export const SESSIONS_STORE = "sessions";
export const FRAMES_STORE = "frames";
export const FRAMES_SESSION_ID_INDEX = "sessionId";
export const CALIBRATIONS_STORE = "calibrations";

export class StoreError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(
        new StoreError("IndexedDB request failed.", {
          cause: request.error ?? undefined,
        }),
      );
    };
  });
}

// IDBObjectStore.get()/.getAll() are typed as returning IDBRequest<any> in
// lib.dom.d.ts — IndexedDB has no way to know a store's record shape at the
// type level. These two helpers are the only places that cast that `any`
// to our own types, rather than letting it flow silently through every
// call site.
export function getRecord<T>(store: IDBObjectStore, key: IDBValidKey): Promise<T | undefined> {
  return requestToPromise(store.get(key) as IDBRequest<T | undefined>);
}

export function getAllRecords<T>(
  source: IDBObjectStore | IDBIndex,
  query?: IDBValidKey,
): Promise<T[]> {
  return requestToPromise(source.getAll(query) as IDBRequest<T[]>);
}

let dbPromise: Promise<IDBDatabase> | null = null;

/** Lazily opens the one shared `resonance-scope` database. Every store
 * module calls this rather than opening its own connection — a second
 * connection to the same database would block the first's future
 * version upgrades. */
export function openDatabase(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        db.createObjectStore(SESSIONS_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(FRAMES_STORE)) {
        const frames = db.createObjectStore(FRAMES_STORE, {
          keyPath: "frameId",
          autoIncrement: true,
        });
        frames.createIndex(FRAMES_SESSION_ID_INDEX, "sessionId");
      }
      if (!db.objectStoreNames.contains(CALIBRATIONS_STORE)) {
        db.createObjectStore(CALIBRATIONS_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(
        new StoreError("Could not open the IndexedDB database.", {
          cause: request.error ?? undefined,
        }),
      );
    };
    request.onblocked = () => {
      reject(
        new StoreError(
          "IndexedDB open blocked — likely another tab holding an older connection open.",
        ),
      );
    };
  });
  return dbPromise;
}
