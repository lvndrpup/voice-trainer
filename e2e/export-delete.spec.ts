// Closes the gap flagged in PR #12: "worth a real smoke test alongside
// #11's [...] run a session or two, hit Export and confirm the
// downloaded JSON has the sessions with their frames, then hit Delete
// all and confirm [...] IndexedDB [...] is empty afterward."
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { SessionWithFrames } from "../src/store/index.ts";
import { readDatabase } from "./helpers/session-store-db.ts";

async function runShortSession(page: Page): Promise<void> {
  const micToggle = page.locator("#mic-toggle");
  await micToggle.click();
  await expect(page.locator("#mic-status")).toHaveText(/^Capturing/, { timeout: 10_000 });
  await page.waitForTimeout(400);
  await micToggle.click();
  await expect(page.locator("#mic-status")).toHaveText("Stopped");
}

test.describe("export and delete-all", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await runShortSession(page);
    await runShortSession(page);
  });

  test("export downloads JSON with every session and its frames", async ({ page }) => {
    const { sessions: storedSessions, frames: storedFrames } = await readDatabase(page);
    expect(storedSessions).toHaveLength(2);

    const downloadPromise = page.waitForEvent("download");
    await page.locator("#export-json").click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^resonance-scope-sessions-\d+\.json$/);

    const path = await download.path();
    if (!path) {
      throw new Error("Download did not save to a local path.");
    }
    const exported = JSON.parse(readFileSync(path, "utf-8")) as SessionWithFrames[];

    expect(exported.map((s) => s.id).sort()).toEqual(storedSessions.map((s) => s.id).sort());
    for (const exportedSession of exported) {
      const matchingFrames = storedFrames.filter((f) => f.sessionId === exportedSession.id);
      expect(matchingFrames.length).toBeGreaterThan(0);
      expect(exportedSession.frames).toHaveLength(matchingFrames.length);
    }
  });

  test("delete-all clears both object stores after confirming", async ({ page }) => {
    page.once("dialog", (dialog) => {
      void dialog.accept();
    });
    await page.locator("#delete-all").click();
    await expect(page.locator("#mic-status")).toHaveText("All sessions deleted.");

    const { sessions, frames } = await readDatabase(page);
    expect(sessions).toHaveLength(0);
    expect(frames).toHaveLength(0);
  });

  test("cancelling the confirm dialog leaves sessions intact", async ({ page }) => {
    page.once("dialog", (dialog) => {
      void dialog.dismiss();
    });
    await page.locator("#delete-all").click();

    const { sessions } = await readDatabase(page);
    expect(sessions).toHaveLength(2);
  });
});
