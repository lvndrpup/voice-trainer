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
  cornerVowels: CornerVowelFormants | null;  // null until step 3 lands
  validity: ValidityReport;            // imported from src/calibration
}
```

Two deliberate deviations from calibration.md's documented interface:

- **`deviceId: string | null`, not `string`.** `MicrophoneCaptureInfo.
  deviceId` (`src/audio`) is itself nullable — not every browser
  exposes one — so requiring a non-null string here would mean either
  inventing a placeholder value or blocking calibration on a piece of
  data capture can't always provide. Matches `Session.deviceId`'s
  nullability in `src/store/index.ts`.
- **`id: string` added.** calibration.md's interface doesn't include a
  primary key — IndexedDB needs a `keyPath` to store records at all, so
  one was added, mirroring `Session.id`.

`cornerVowels` is `null` in every record this store can currently
produce — nothing in `src/` yet extracts corner-vowel formants (step 3
needs LPC, deferred to a follow-up PR with its own golden-file
fixtures). The field exists now so the schema doesn't need a version
bump when step 3 lands; only its nullability goes away.

One IndexedDB object store, `calibrations` (keyPath `id`), in the same
`resonance-scope` database `SessionStore` uses — see
[session-store.md](./session-store.md) for the shared `src/store/idb.ts`
helpers both stores are built on.

## API

| Method | Returns | Notes |
|---|---|---|
| `saveCalibration(data)` | `Promise<Calibration>` | Takes everything except `schemaVersion`/`id`/`timestamp`, which the store stamps itself — same pattern as `SessionStore.startSession`. |
| `listCalibrations()` | `Promise<Calibration[]>` | Oldest-first. |
| `getLatestCalibration()` | `Promise<Calibration \| null>` | Most recent by `timestamp`. No device filtering yet — re-calibration-on-device-change (calibration.md's triggers list) is a future PR's concern, not this store's. |
| `deleteAll()` | `Promise<void>` | Clears the `calibrations` store only — leaves `sessions`/`frames` untouched. |

## Known gaps

- Same as `SessionStore`: no Node-level unit tests, since there's no
  Node `indexedDB` global — needs a real browser (Playwright), which
  this store doesn't get until a UI exists to drive it through (see
  ADR 0004).
- No storage-quota handling, same caveat as session-store.md.
- No migration path — `CALIBRATION_SCHEMA_VERSION` exists and is
  stamped, but nothing reads it yet.
