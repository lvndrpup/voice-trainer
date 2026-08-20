// Reads the app's IndexedDB directly from inside the page — same
// approach as session-store-db.ts, for the same reason: catch a
// regression in what actually lands in the database, not re-assert
// what CalibrationStore already asserts about itself.
import type { Page } from "@playwright/test";
import type { Calibration, CalibrationStepFrame } from "../../src/store/calibration.ts";

const DATABASE_NAME = "resonance-scope";

export interface RawCalibrationDb {
  calibrations: Calibration[];
  calibrationFrames: CalibrationStepFrame[];
}

/** Assumes the database already exists (i.e. the app has started at
 * least one session or calibration) — same assumption
 * session-store-db.ts's readDatabase() makes, same reason. */
export async function readCalibrationDatabase(page: Page): Promise<RawCalibrationDb> {
  return page.evaluate((dbName: string): Promise<RawCalibrationDb> => {
    return new Promise<RawCalibrationDb>((resolve, reject) => {
      const openRequest = indexedDB.open(dbName);
      openRequest.onerror = () => {
        reject(new Error(openRequest.error?.message ?? "IndexedDB open failed."));
      };
      openRequest.onsuccess = () => {
        const db = openRequest.result;
        const tx = db.transaction(["calibrations", "calibrationFrames"], "readonly");
        const calibrationsRequest = tx
          .objectStore("calibrations")
          .getAll() as IDBRequest<Calibration[]>;
        const framesRequest = tx
          .objectStore("calibrationFrames")
          .getAll() as IDBRequest<CalibrationStepFrame[]>;
        tx.onerror = () => {
          reject(new Error(tx.error?.message ?? "IndexedDB transaction failed."));
        };
        tx.oncomplete = () => {
          db.close();
          resolve({
            calibrations: calibrationsRequest.result,
            calibrationFrames: framesRequest.result,
          });
        };
      };
    });
  }, DATABASE_NAME);
}
