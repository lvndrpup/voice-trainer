// IndexedDB. All persisted types carry schemaVersion. See CLAUDE.md.
//
// Stores extracted features per session, not raw audio (CLAUDE.md,
// non-negotiable). Two object stores: "sessions" (metadata, one record
// per session) and "frames" (one record per logged FeatureFrame,
// indexed by sessionId) — kept separate so appending a frame is a
// cheap add() rather than a read-modify-write of a growing array. See
// docs/session-store.md for the schema and
// docs/adr/0003-session-persistence-schema.md for why.
//
// Low-level open()/request-wrapping helpers live in ./idb — shared with
// src/store/calibration.ts, since both stores live in the same
// IndexedDB database.

import {
  openDatabase,
  requestToPromise,
  getRecord,
  getAllRecords,
  StoreError,
  SESSIONS_STORE,
  FRAMES_STORE,
  FRAMES_SESSION_ID_INDEX,
} from "./idb.ts";

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

export class SessionStoreError extends StoreError {}

export class SessionStore {
  async startSession(deviceId: string | null): Promise<Session> {
    const session: Session = {
      schemaVersion: SESSION_SCHEMA_VERSION,
      id: crypto.randomUUID(),
      deviceId,
      startedAt: Date.now(),
      endedAt: null,
    };
    const db = await openDatabase();
    const store = db.transaction(SESSIONS_STORE, "readwrite").objectStore(SESSIONS_STORE);
    await requestToPromise(store.add(session));
    return session;
  }

  async appendFrame(sessionId: string, frame: Omit<FeatureFrame, "schemaVersion" | "sessionId">): Promise<void> {
    const db = await openDatabase();
    const store = db.transaction(FRAMES_STORE, "readwrite").objectStore(FRAMES_STORE);
    const record: FeatureFrame = { ...frame, schemaVersion: SESSION_SCHEMA_VERSION, sessionId };
    await requestToPromise(store.add(record));
  }

  async endSession(sessionId: string): Promise<void> {
    const db = await openDatabase();
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
    const db = await openDatabase();
    const store = db.transaction(SESSIONS_STORE, "readonly").objectStore(SESSIONS_STORE);
    const sessions = await getAllRecords<Session>(store);
    return sessions.sort((a, b) => a.startedAt - b.startedAt);
  }

  async getSessionWithFrames(sessionId: string): Promise<SessionWithFrames | null> {
    const db = await openDatabase();
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
    const db = await openDatabase();
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
