# Session store

Reference doc for `src/store/index.ts`. For why the schema is shaped
this way, see
[ADR 0003](./adr/0003-session-persistence-schema.md).

## Schema

```typescript
interface Session {
  schemaVersion: number;
  id: string;              // crypto.randomUUID()
  deviceId: string | null; // from MicrophoneCaptureInfo.deviceId
  startedAt: number;       // ms since epoch
  endedAt: number | null;  // null while the session is in progress
}

interface FeatureFrame {
  schemaVersion: number;
  sessionId: string;
  timestamp: number;       // ms since epoch
  f0Hz: number | null;     // from dsp.detectPitch — null means unvoiced/silent, not 0
  peakDb: number;
}
```

Two IndexedDB object stores — `sessions` (keyPath `id`) and `frames`
(autoincrement key, indexed by `sessionId`) — not one nested store. See
the ADR for why.

## API

| Method | Returns | Notes |
|---|---|---|
| `startSession(deviceId)` | `Promise<Session>` | Creates and persists a new session record. |
| `appendFrame(sessionId, frame)` | `Promise<void>` | Adds one `frames` record. Throttle the caller's rate — see below. |
| `endSession(sessionId)` | `Promise<void>` | Sets `endedAt`. Throws `SessionStoreError` if the session doesn't exist. |
| `listSessions()` | `Promise<Session[]>` | Metadata only, oldest-first — no frames pulled. |
| `getSessionWithFrames(id)` | `Promise<SessionWithFrames \| null>` | One session plus all its frames, timestamp-sorted. |
| `getAllSessionsWithFrames()` | `Promise<SessionWithFrames[]>` | Every session with its frames — what `sessionsToExportJson` consumes. |
| `deleteAll()` | `Promise<void>` | Clears both object stores. |

`sessionsToExportJson(sessions: SessionWithFrames[]): string` is a
plain pure function (`JSON.stringify` with 2-space indent) — the only
part of this module with automated tests, since the rest needs a
browser's `indexedDB` global.

## Feature-frame logging rate

Callers should throttle `appendFrame()` to roughly 10Hz, not the
~60Hz `requestAnimationFrame` rate the instrument display runs at —
session review doesn't need frame-accurate history, and logging every
animation frame would multiply storage for no benefit. This is an
implementation parameter the caller controls, not something enforced
inside the store itself.

## Known gaps

- **No automated tests for the IndexedDB-touching methods.** Node has
  no built-in `indexedDB` global (confirmed by testing this directly —
  `typeof indexedDB` is `"undefined"` under Node 24). Only
  `sessionsToExportJson()` is unit tested. The rest needs manual
  verification in a real browser. A polyfill (`fake-indexeddb`) would
  close this gap but is a new dependency, not added without asking —
  same treatment as the untestable parts of `src/audio`.
- **No storage-quota handling.** A `QuotaExceededError` from IndexedDB
  would propagate as an unhandled `SessionStoreError` (not silently
  swallowed — consistent with this project's error-handling stance —
  but there's no graceful degradation, e.g. warning the user before
  they hit the limit).
- **No migration path yet.** `SESSION_SCHEMA_VERSION` exists and is
  stamped on every record, but nothing reads it to migrate old records
  forward — there's only ever been one schema version so far.
