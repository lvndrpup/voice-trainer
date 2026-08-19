// Reads the app's IndexedDB directly from inside the page — the same
// thing a human checks via devtools → Application → IndexedDB →
// resonance-scope. Deliberately does not go through src/store's
// SessionStore class: these tests exist to catch a regression in what
// actually lands in the database, not to re-assert what SessionStore
// already asserts about itself.
import type { Page } from "@playwright/test";
import type { FeatureFrame, Session } from "../../src/store/index.ts";

const DATABASE_NAME = "resonance-scope";

export interface RawDb {
  sessions: Session[];
  frames: FeatureFrame[];
}

/**
 * Assumes the database already exists (i.e. the app has started at
 * least one session). Opening a nonexistent database with no version
 * argument would create an empty one with no object stores, which
 * every caller here would rather fail loudly on than silently no-op.
 */
export async function readDatabase(page: Page): Promise<RawDb> {
  return page.evaluate((dbName: string): Promise<RawDb> => {
    return new Promise<RawDb>((resolve, reject) => {
      const openRequest = indexedDB.open(dbName);
      openRequest.onerror = () => {
        reject(new Error(openRequest.error?.message ?? "IndexedDB open failed."));
      };
      openRequest.onsuccess = () => {
        const db = openRequest.result;
        const tx = db.transaction(["sessions", "frames"], "readonly");
        const sessionsRequest = tx.objectStore("sessions").getAll() as IDBRequest<Session[]>;
        const framesRequest = tx.objectStore("frames").getAll() as IDBRequest<FeatureFrame[]>;
        tx.onerror = () => {
          reject(new Error(tx.error?.message ?? "IndexedDB transaction failed."));
        };
        tx.oncomplete = () => {
          db.close();
          resolve({ sessions: sessionsRequest.result, frames: framesRequest.result });
        };
      };
    });
  }, DATABASE_NAME);
}
