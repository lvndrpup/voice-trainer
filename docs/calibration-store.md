# Calibration store

Reference doc for `src/store/calibration.ts`. For why it's a separate
module from `src/store/index.ts`'s `SessionStore` rather than folded
into it, and for the sibling `src/calibration/` step engine this store
persists the output of, see
[ADR 0004](./adr/0004-calibration-module-boundary.md). For the
protocol itself, see [calibration.md](./calibration.md).

## Schema

```typescript
interface Formants {
  f1Hz: number;
  f2Hz: number;
}

interface CornerVowelFormants {
  i: Formants;
  a: Formants;
  u: Formants;
}

interface Calibration {
  schemaVersion: number;
  id: string;                          // crypto.randomUUID()
  timestamp: number;                   // ms since epoch, stamped at save time
  deviceId: string | null;             // nullable — see below
  noiseFloorDb: number | null;
  levelReferenceDb: number | null;
  habitualF0Hz: number | null;
  comfortableF0Range: [number, number] | null;
  cornerVowels: CornerVowelFormants | null;  // null if any vowel had no confident reading
  validity: ValidityReport;            // imported from src/calibration
}
```

Two deliberate schema-shape deviations from calibration.md's
documented interface (a separate, functional gap — raw frame storage
— used to sit here too; it's closed now, see below):

- **`deviceId: string | null`, not `string`.** `MicrophoneCaptureInfo.
  deviceId` (`src/audio`) is itself nullable — not every browser
  exposes one — so requiring a non-null string here would mean either
  inventing a placeholder value or blocking calibration on a piece of
  data capture can't always provide. Matches `Session.deviceId`'s
  nullability in `src/store/index.ts`.
- **`id: string` added.** calibration.md's interface doesn't include a
  primary key — IndexedDB needs a `keyPath` to store records at all, so
  one was added, mirroring `Session.id`.

`cornerVowels` now has a producer — `CalibrationEngine.buildDraft()`
(`src/calibration`) populates it from the three corner-vowel steps'
formant readings, `null` only if any of the three vowels never
produced a confident formant. Nothing in `src/` calls `buildDraft()`
in production yet, though — the wizard UI wiring (`index.html`/
`main.ts`) that would actually drive a calibration attempt through
this store is a separate, still-pending follow-up (calibration.md's
`decisions.md` entry on step 3).

## Raw frame storage

calibration.md also asks to "store the raw feature frames from
calibration too, not just the summary, so old calibrations can be
recomputed when the formant code changes." A second object store,
`calibrationFrames` (autoIncrement key `frameId`, indexed by
`calibrationId`), holds one `CalibrationStepFrame` per `StepReading`
the engine collected — mirrors `SessionStore`'s `sessions`/`frames`
split (ADR 0003) for the same reason: appending shouldn't be a
read-modify-write of a growing array.

```typescript
interface CalibrationStepFrame {
  schemaVersion: number;
  calibrationId: string;
  stepId: StepId;              // NonFormantStepId | CornerVowelStepId
  levelDb: number;
  f0Hz: number | null;         // steps 0/1/2/4/5 only
  formants: Formants | null;   // corner-i/corner-a/corner-u only
}
```

`stepId` widened from `NonFormantStepId` to `StepId`, and `formants`
was added, when the corner-vowel steps landed —
`CALIBRATION_SCHEMA_VERSION` bumped 1 → 2 (additive; schemaVersion-1
records predate corner-vowel frames entirely, nothing about them
changes retroactively). Exactly one of `f0Hz`/`formants` is non-null
per frame, determined by which step family produced it — not a
discriminated union with an explicit tag, since the discriminant
(`stepId`'s family) is already available on the frame itself.

No per-reading timestamp — `CalibrationEngine`'s `StepReading` doesn't
carry one (see `src/calibration/index.ts`) — so ordering within a step
relies on the autoIncrement `frameId` key, which IndexedDB assigns in
insertion order; `getCalibrationFrames()` returns them in that order
via the `calibrationId` index.

Same throttling caveat as `SessionStore.appendFrame`
([session-store.md](./session-store.md)): this store doesn't throttle
writes itself, the caller must — a calibration step's readings are
already whatever rate `main.ts`'s capture loop logs them at (~10Hz per
that doc), not a raw per-animation-frame burst.

Two IndexedDB object stores, `calibrations` (keyPath `id`) and
`calibrationFrames`, in the same `resonance-scope` database
`SessionStore` uses — see [session-store.md](./session-store.md) for
the shared `src/store/idb.ts` helpers all these stores are built on.

## API

| Method | Returns | Notes |
|---|---|---|
| `saveCalibration(data, rawReadingsByStep)` | `Promise<Calibration>` | `data` is everything except `schemaVersion`/`id`/`timestamp`, which the store stamps itself (same pattern as `SessionStore.startSession`). `rawReadingsByStep` — typically built from `CalibrationEngine.getStepReadings()` per submitted step — is persisted to `calibrationFrames` in the same transaction as the summary record. |
| `listCalibrations()` | `Promise<Calibration[]>` | Oldest-first. |
| `getLatestCalibration()` | `Promise<Calibration \| null>` | Most recent by `timestamp`. No device filtering yet — re-calibration-on-device-change (calibration.md's triggers list) is a future PR's concern, not this store's. |
| `getCalibrationFrames(calibrationId)` | `Promise<CalibrationStepFrame[]>` | Raw readings for one calibration, in submission order — what a future recompute-from-raw-data feature would read. |
| `deleteAll()` | `Promise<void>` | Clears both `calibrations` and `calibrationFrames` — leaves `sessions`/`frames` untouched. |

## Known gaps

- Same as `SessionStore`: no Node-level unit tests, since there's no
  Node `indexedDB` global — needs a real browser (Playwright), which
  this store doesn't get until a UI exists to drive it through (see
  ADR 0004).
- No storage-quota handling, same caveat as session-store.md.
- No migration path — `CALIBRATION_SCHEMA_VERSION` exists and is
  stamped, but nothing reads it yet.
- Nothing yet actually *recomputes* a calibration from
  `calibrationFrames` — this PR only closes the storage half of
  calibration.md's ask (the data exists to do it later), not the
  recompute feature itself.
