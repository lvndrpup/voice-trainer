// Closes the gap flagged in PR #11: "the first PR that actually
// exercises SessionStore end-to-end — worth a real smoke test." Runs
// against a real (headless) Chromium with a fake audio input device,
// so getUserMedia, the AudioContext, and IndexedDB are all real — only
// the microphone hardware and the human speaking into it are faked.
import { expect, test } from "@playwright/test";
import { readDatabase } from "./helpers/session-store-db.ts";

test("start logs a session with frames; stop closes it out", async ({ page }) => {
  await page.goto("/");

  const micToggle = page.locator("#mic-toggle");
  await micToggle.click();
  await expect(page.locator("#mic-status")).toHaveText(/^Capturing/, { timeout: 10_000 });

  // FRAME_LOG_INTERVAL_MS is 100 in main.ts; this leaves plenty of
  // margin for a handful of logged frames without being slow.
  await page.waitForTimeout(1_500);

  await micToggle.click();
  await expect(page.locator("#mic-status")).toHaveText("Stopped");

  const { sessions, frames } = await readDatabase(page);

  expect(sessions).toHaveLength(1);
  const [session] = sessions;
  expect(session.schemaVersion).toBe(1);
  expect(session.deviceId).not.toBeNull();
  expect(session.startedAt).toBeGreaterThan(0);
  expect(session.endedAt).not.toBeNull();
  expect(session.endedAt ?? 0).toBeGreaterThanOrEqual(session.startedAt);

  expect(frames.length).toBeGreaterThanOrEqual(3);
  for (const frame of frames) {
    expect(frame.sessionId).toBe(session.id);
    expect(frame.schemaVersion).toBe(1);
    expect(frame.f0Hz === null || Number.isFinite(frame.f0Hz)).toBe(true);
    // peakDb() in main.ts starts at -Infinity and only rises if a
    // spectrum bin has energy, so a silent frame legitimately stores
    // -Infinity — this is real observed behavior against a real
    // AnalyserNode, not a fixture gap. See docs/decisions.md for the
    // export-fidelity issue this surfaces (JSON.stringify turns it
    // into `null`, silently violating the `number` field type).
    expect(frame.peakDb === -Infinity || Number.isFinite(frame.peakDb)).toBe(true);
  }
});
