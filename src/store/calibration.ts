// IndexedDB. All persisted types carry schemaVersion. See CLAUDE.md.
//
// Stores the summary Calibration produced by the 6-step protocol in
// docs/calibration.md. Shares the "resonance-scope" database with
// src/store/index.ts's SessionStore — see ./idb for the shared
// open()/request-wrapping helpers. See docs/calibration-store.md.
//
// Imports ValidityReport from ../calibration rather than redefining
// it — src/calibration owns the concept (it's what computes one),
// src/store just persists it. Allowed one-way: src/calibration may not
// import ../store (enforced by eslint.config.mjs), but src/store has
// no stated import restriction, same as it has none on src/dsp.
//
// `cornerVowels` (step 3, corner-vowel formants) has no producer yet —
// LPC-based formant extraction lands in a follow-up PR alongside
// golden-file fixtures, per decisions.md's "Corrected" ledger entry on
// custom DSP needing an oracle. Nothing in src/ constructs a full
// Calibration until that lands; this module only stores/retrieves one.
//
// calibration.md also asks to "store the raw feature frames from
// calibration too, not just the summary, so old calibrations can be
// recomputed when the formant code changes" — saveCalibration() takes
// them alongside the summary and persists both in one transaction, in
// `calibrationFrames` (mirrors SessionStore's `sessions`/`frames`
// split and ADR 0003's reasoning: frames aren't nested in the summary
// record). Same throttling caveat as `SessionStore.appendFrame`
// (docs/session-store.md): this store doesn't throttle writes, the
// caller must (a calibration step already collects readings at
// whatever rate main.ts's tick() logs them at, ~10Hz).

import {
  openDatabase,
  requestToPromise,
  getAllRecords,
  CALIBRATIONS_STORE,
  CALIBRATION_FRAMES_STORE,
  CALIBRATION_FRAMES_CALIBRATION_ID_INDEX,
} from "./idb.ts";
import type { ValidityReport, NonFormantStepId, StepReading } from "../calibration/index.ts";

export const CALIBRATION_SCHEMA_VERSION = 1;

export interface Formants {
  f1Hz: number;
  f2Hz: number;
}

export interface CornerVowelFormants {
  i: Formants;
  a: Formants;
  u: Formants;
}

export interface Calibration {
  schemaVersion: number;
  id: string;
  timestamp: number;
  /** MicrophoneCaptureInfo.deviceId can itself be null (not every
   * browser exposes one) — calibration.md documents this field as a
   * plain `string`, but that's stricter than what capture can actually
   * provide, so it's nullable here. See decisions.md. */
  deviceId: string | null;
  noiseFloorDb: number | null;
  levelReferenceDb: number | null;
  habitualF0Hz: number | null;
  comfortableF0Range: [number, number] | null;
  /** Null until formant extraction lands — see the module header. */
  cornerVowels: CornerVowelFormants | null;
  validity: ValidityReport;
}

/** One raw StepReading, persisted alongside the Calibration it fed
 * into. No per-reading timestamp — CalibrationEngine's StepReading
 * doesn't carry one — so ordering within a step relies on the
 * autoIncrement `frameId` key, which IndexedDB assigns in insertion
 * order; `getCalibrationFrames` returns them in that order. */
export interface CalibrationStepFrame {
  schemaVersion: number;
  calibrationId: string;
  stepId: NonFormantStepId;
  levelDb: number;
  f0Hz: number | null;
}

export class CalibrationStore {
  /** `rawReadingsByStep` is typically built from
   * `CalibrationEngine.getStepReadings()` for each submitted step —
   * see the module header for why this store persists them at all. */
  async saveCalibration(
    data: Omit<Calibration, "schemaVersion" | "id" | "timestamp">,
    rawReadingsByStep: ReadonlyMap<NonFormantStepId, readonly StepReading[]>,
  ): Promise<Calibration> {
    const calibration: Calibration = {
      ...data,
      schemaVersion: CALIBRATION_SCHEMA_VERSION,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    const db = await openDatabase();
    const tx = db.transaction([CALIBRATIONS_STORE, CALIBRATION_FRAMES_STORE], "readwrite");
    const writes: Promise<unknown>[] = [
      requestToPromise(tx.objectStore(CALIBRATIONS_STORE).add(calibration)),
    ];
    const framesStore = tx.objectStore(CALIBRATION_FRAMES_STORE);
    for (const [stepId, readings] of rawReadingsByStep) {
      for (const reading of readings) {
        const frame: CalibrationStepFrame = {
          schemaVersion: CALIBRATION_SCHEMA_VERSION,
          calibrationId: calibration.id,
          stepId,
          levelDb: reading.levelDb,
          f0Hz: reading.f0Hz,
        };
        writes.push(requestToPromise(framesStore.add(frame)));
      }
    }
    await Promise.all(writes);
    return calibration;
  }

  /** Sorted oldest-first, same convention as SessionStore.listSessions. */
  async listCalibrations(): Promise<Calibration[]> {
    const db = await openDatabase();
    const store = db.transaction(CALIBRATIONS_STORE, "readonly").objectStore(CALIBRATIONS_STORE);
    const calibrations = await getAllRecords<Calibration>(store);
    return calibrations.sort((a, b) => a.timestamp - b.timestamp);
  }

  async getLatestCalibration(): Promise<Calibration | null> {
    const calibrations = await this.listCalibrations();
    return calibrations.length === 0 ? null : calibrations[calibrations.length - 1];
  }

  /** Raw readings for one calibration, in insertion (submission) order
   * — see calibration.md's recompute-from-raw-data rationale. */
  async getCalibrationFrames(calibrationId: string): Promise<CalibrationStepFrame[]> {
    const db = await openDatabase();
    const store = db
      .transaction(CALIBRATION_FRAMES_STORE, "readonly")
      .objectStore(CALIBRATION_FRAMES_STORE);
    return getAllRecords<CalibrationStepFrame>(
      store.index(CALIBRATION_FRAMES_CALIBRATION_ID_INDEX),
      calibrationId,
    );
  }

  async deleteAll(): Promise<void> {
    const db = await openDatabase();
    const tx = db.transaction([CALIBRATIONS_STORE, CALIBRATION_FRAMES_STORE], "readwrite");
    await Promise.all([
      requestToPromise(tx.objectStore(CALIBRATIONS_STORE).clear()),
      requestToPromise(tx.objectStore(CALIBRATION_FRAMES_STORE).clear()),
    ]);
  }
}
