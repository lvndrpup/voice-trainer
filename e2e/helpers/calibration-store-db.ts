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

/** Unlike session-store-db.ts's readDatabase(), this does NOT assume
 * the database already exists — a cancelled-before-saving wizard run
 * (see calibration-wizard.spec.ts's cancel test) never calls the
 * app's own openDatabase(), so in a fresh browser context these two
 * object stores may genuinely not exist yet. Opening with no version
 * against a nonexistent database creates one at version 1 with no
 * stores at all, and reading a store that was never created throws
 * synchronously inside the transaction() call, before onerror could
 * ever fire — that surfaced as a hung page.evaluate() (a real CI
 * failure, not a hypothetical) rather than a clean rejection. Create
 * the stores here if missing, mirroring src/store/idb.ts's real
 * schema, so a read against an empty, freshly-created database
 * resolves to empty arrays instead of hanging. */
export async function readCalibrationDatabase(page: Page): Promise<RawCalibrationDb> {
  return page.evaluate((dbName: string): Promise<RawCalibrationDb> => {
    return new Promise<RawCalibrationDb>((resolve, reject) => {
      const openRequest = indexedDB.open(dbName);
      openRequest.onupgradeneeded = () => {
        const db = openRequest.result;
        if (!db.objectStoreNames.contains("calibrations")) {
          db.createObjectStore("calibrations", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("calibrationFrames")) {
          const frames = db.createObjectStore("calibrationFrames", {
            keyPath: "frameId",
            autoIncrement: true,
          });
          frames.createIndex("calibrationId", "calibrationId");
        }
      };
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
