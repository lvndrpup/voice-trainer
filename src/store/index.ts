// IndexedDB. All persisted types carry schemaVersion. See CLAUDE.md.
//
// Stores extracted features per session, not raw audio (CLAUDE.md,
// non-negotiable). Two object stores: "sessions" (metadata, one record
// per session) and "frames" (one record per logged FeatureFrame,
// indexed by sessionId) — kept separate so appending a frame is a
// cheap add() rather than a read-modify-write of a growing array. See
// docs/session-store.md for the schema and
// docs/adr/0003-session-persistence-schema.md for why.

export const SESSION_SCHEMA_VERSION = 1;

export interface Session {
  schemaVersion: number;
  id: string;
  deviceId: string | null;
  startedAt: number;
  endedAt: number | null;
}

export interface FeatureFrame {
  schemaVersion: number;
  sessionId: string;
  timestamp: number;
  f0Hz: number | null;
  peakDb: number;
}

export interface SessionWithFrames extends Session {
  frames: FeatureFrame[];
}

export class SessionStoreError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

const DATABASE_NAME = "resonance-scope";
const DATABASE_VERSION = 1;
const SESSIONS_STORE = "sessions";
const FRAMES_STORE = "frames";
const FRAMES_SESSION_ID_INDEX = "sessionId";

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(
        new SessionStoreError("IndexedDB request failed.", {
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
function getRecord<T>(store: IDBObjectStore, key: IDBValidKey): Promise<T | undefined> {
  return requestToPromise(store.get(key) as IDBRequest<T | undefined>);
}

function getAllRecords<T>(source: IDBObjectStore | IDBIndex, query?: IDBValidKey): Promise<T[]> {
  return requestToPromise(source.getAll(query) as IDBRequest<T[]>);
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
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
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(
        new SessionStoreError("Could not open the IndexedDB database.", {
          cause: request.error ?? undefined,
        }),
      );
    };
    request.onblocked = () => {
      reject(
        new SessionStoreError(
          "IndexedDB open blocked — likely another tab holding an older connection open.",
        ),
      );
    };
  });
}

export class SessionStore {
  #dbPromise: Promise<IDBDatabase> | null = null;

  #db(): Promise<IDBDatabase> {
    this.#dbPromise ??= openDatabase();
    return this.#dbPromise;
  }

  async startSession(deviceId: string | null): Promise<Session> {
    const session: Session = {
      schemaVersion: SESSION_SCHEMA_VERSION,
      id: crypto.randomUUID(),
      deviceId,
      startedAt: Date.now(),
      endedAt: null,
    };
    const db = await this.#db();
    const store = db.transaction(SESSIONS_STORE, "readwrite").objectStore(SESSIONS_STORE);
    await requestToPromise(store.add(session));
    return session;
  }

  async appendFrame(sessionId: string, frame: Omit<FeatureFrame, "schemaVersion" | "sessionId">): Promise<void> {
    const db = await this.#db();
    const store = db.transaction(FRAMES_STORE, "readwrite").objectStore(FRAMES_STORE);
    const record: FeatureFrame = { ...frame, schemaVersion: SESSION_SCHEMA_VERSION, sessionId };
    await requestToPromise(store.add(record));
  }

  async endSession(sessionId: string): Promise<void> {
    const db = await this.#db();
    const store = db.transaction(SESSIONS_STORE, "readwrite").objectStore(SESSIONS_STORE);
    const session = await getRecord<Session>(store, sessionId);
    if (!session) {
      throw new SessionStoreError(`No session with id "${sessionId}".`);
    }
    session.endedAt = Date.now();
    await requestToPromise(store.put(session));
  }

  /** Session metadata only, sorted oldest-first — no frames, cheap to list. */
  async listSessions(): Promise<Session[]> {
    const db = await this.#db();
    const store = db.transaction(SESSIONS_STORE, "readonly").objectStore(SESSIONS_STORE);
    const sessions = await getAllRecords<Session>(store);
    return sessions.sort((a, b) => a.startedAt - b.startedAt);
  }

  async getSessionWithFrames(sessionId: string): Promise<SessionWithFrames | null> {
    const db = await this.#db();
    const tx = db.transaction([SESSIONS_STORE, FRAMES_STORE], "readonly");
    const session = await getRecord<Session>(tx.objectStore(SESSIONS_STORE), sessionId);
    if (!session) {
      return null;
    }
    const frames = await getAllRecords<FeatureFrame>(
      tx.objectStore(FRAMES_STORE).index(FRAMES_SESSION_ID_INDEX),
      sessionId,
    );
    frames.sort((a, b) => a.timestamp - b.timestamp);
    return { ...session, frames };
  }

  async getAllSessionsWithFrames(): Promise<SessionWithFrames[]> {
    const sessions = await this.listSessions();
    const withFrames = await Promise.all(
      sessions.map((session) => this.getSessionWithFrames(session.id)),
    );
    return withFrames.filter((session) => session !== null);
  }

  async deleteAll(): Promise<void> {
    const db = await this.#db();
    const tx = db.transaction([SESSIONS_STORE, FRAMES_STORE], "readwrite");
    await Promise.all([
      requestToPromise(tx.objectStore(SESSIONS_STORE).clear()),
      requestToPromise(tx.objectStore(FRAMES_STORE).clear()),
    ]);
  }
}

/** Pure — testable headlessly, unlike the IndexedDB-touching class above. */
export function sessionsToExportJson(sessions: SessionWithFrames[]): string {
  return JSON.stringify(sessions, null, 2);
}
