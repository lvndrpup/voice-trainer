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

import { openDatabase, requestToPromise, getAllRecords, CALIBRATIONS_STORE } from "./idb.ts";
import type { ValidityReport } from "../calibration/index.ts";

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

export class CalibrationStore {
  async saveCalibration(
    data: Omit<Calibration, "schemaVersion" | "id" | "timestamp">,
  ): Promise<Calibration> {
    const calibration: Calibration = {
      ...data,
      schemaVersion: CALIBRATION_SCHEMA_VERSION,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    const db = await openDatabase();
    const store = db.transaction(CALIBRATIONS_STORE, "readwrite").objectStore(CALIBRATIONS_STORE);
    await requestToPromise(store.add(calibration));
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

  async deleteAll(): Promise<void> {
    const db = await openDatabase();
    const store = db.transaction(CALIBRATIONS_STORE, "readwrite").objectStore(CALIBRATIONS_STORE);
    await requestToPromise(store.clear());
  }
}
