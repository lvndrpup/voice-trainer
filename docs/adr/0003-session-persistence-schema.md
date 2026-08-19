# 3. Session persistence schema

## Status

Accepted

## Context

v0.2 introduces the first real persistence in the app (`src/store/`,
previously an empty stub). CLAUDE.md requires: store extracted
features, not raw audio; every persisted type carries a
`schemaVersion`. Beyond those two constraints, the actual shape of
"a session" and how often to log features was undecided.

`main.ts` already computes, per animation frame (~60Hz):
`peakDb` and `f0Hz` (or `null`). Logging every frame at 60Hz is far
denser than a session-review use case needs — nobody reviews
pitch history at 60Hz resolution — and multiplies storage and
IndexedDB write volume for no analytical benefit.

## Decision

Two IndexedDB object stores, not one:

- `sessions` — one small record per session: `schemaVersion`, `id`
  (`crypto.randomUUID()`), `deviceId`, `startedAt`, `endedAt`.
- `frames` — one record per logged `FeatureFrame`
  (`schemaVersion`, `sessionId`, `timestamp`, `f0Hz`, `peakDb`),
  autoincrement key, indexed by `sessionId`.

Frames are **not** nested inside their session record. Appending a
frame is then a plain `add()` — O(1) — rather than a
read-modify-write of a growing array, which would make each append
O(n) in the session's frame count and the whole session O(n²).

Feature-frame logging is throttled by the caller (see
`src/main.ts`) to roughly 10Hz, not the ~60Hz animation-frame rate —
an implementation parameter, not a target, in the same category as
`fftSize` or `computeLogFrequencyBins`'s `minFrequencyHz`. Revisit if
session review ever needs finer temporal resolution than that.

IndexedDB's own request API is callback/event-based; a small internal
`requestToPromise()` wrapper promisifies it. This is our own code, not
a dependency — a wrapper library (e.g. `idb`) was considered and
rejected for a store this small (two object stores, half a dozen
methods); the native API's verbosity is a one-time cost, not an
ongoing one.

## Consequences

**Positive**

- Appending a frame is cheap regardless of session length.
- `listSessions()` can return session metadata without pulling every
  frame across every session into memory.
- Schema versioning is in place from the first persisted record, so
  future migrations have something to check against.

**Negative**

- Two object stores instead of one adds a small amount of query
  complexity (`getSessionWithFrames` needs a transaction spanning
  both stores) for what's conceptually one entity.
- IndexedDB's TypeScript types return `IDBRequest<any>` from
  `get()`/`getAll()` — there's no way to know a store's record shape
  at the type level. Two typed helpers (`getRecord`, `getAllRecords`)
  centralize the necessary `any`-to-`T` cast rather than letting it
  leak through every call site.
- `SessionStore`'s IndexedDB-touching methods can't run headlessly —
  Node has no built-in `indexedDB` global (confirmed by testing, not
  assumed). Only the pure `sessionsToExportJson()` function has
  automated tests; the rest needs manual browser verification. Adding
  a polyfill (e.g. `fake-indexeddb`) to close this gap would be a new
  dependency and wasn't added without asking, matching how
  `src/audio` handles the same kind of untestable-without-a-browser
  gap.

## Alternatives considered

- **One `sessions` store with a nested `frames` array.** Rejected —
  the read-modify-write-the-whole-array-every-append cost described
  above.
- **A wrapper library (`idb` or similar).** Rejected for now — the
  store surface here is small enough that native IndexedDB plus one
  small promisifying helper is less overhead than a new dependency.
  Revisit if the store grows more object stores/indexes.
- **Logging every animation frame (~60Hz).** Rejected — no
  session-review use case needs that resolution, and it multiplies
  storage for no benefit.
