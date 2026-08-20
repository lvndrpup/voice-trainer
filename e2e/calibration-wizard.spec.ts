// Drives a full 8-step calibration attempt end-to-end against a real
// headless Chromium with a fake audio input device — same approach as
// session-lifecycle.spec.ts. The 8 engine steps' real durations sum to
// ~29s (3+5+5+2+2+2+2+8), so this test needs a longer-than-default
// timeout; it does not assert specific frequency values recovered from
// the synthetic fake mic, per testing.md's documented limitation of
// that device (real speech, not a clean synthetic signal).
import { expect, test } from "@playwright/test";
import { readCalibrationDatabase } from "./helpers/calibration-store-db.ts";

test("a full calibration attempt saves a Calibration record with frames for every step", async ({
  page,
}) => {
  test.setTimeout(90_000);

  await page.goto("/");
  await page.locator("#wizard-start").click();
  // Mutual exclusion claims immediately on click, not after the mic
  // resolves — see the dedicated regression test below for why that
  // distinction matters.
  await expect(page.locator("#mic-toggle")).toBeDisabled();

  const next = page.locator("#wizard-next");
  // 8 engine steps (STEP_ORDER) — click Next after each one's timed
  // collection window ends and the validity result appears. Playwright's
  // click() auto-waits for the button to become visible/enabled, which
  // only happens once that step's collection loop finishes.
  for (let i = 0; i < 8; i++) {
    await expect(next).toBeVisible({ timeout: 15_000 });
    await next.click();
  }

  await expect(page.locator("#wizard-status")).not.toHaveText("", { timeout: 5_000 });
  await expect(page.locator("#wizard-panel")).toBeHidden();
  await expect(page.locator("#wizard-start")).toBeVisible();

  const { calibrations, calibrationFrames } = await readCalibrationDatabase(page);

  expect(calibrations).toHaveLength(1);
  const [calibration] = calibrations;
  expect(calibration.schemaVersion).toBe(2);
  expect(calibration.deviceId).not.toBeNull();
  expect(calibration.timestamp).toBeGreaterThan(0);
  expect(calibration.validity.checks.length).toBeGreaterThan(0);

  // Step durations sum to 29000ms at a 100ms reading interval, so
  // ~290 readings is the naive expectation — asserting a generous
  // range rather than an exact count, since setInterval/setTimeout
  // timing isn't guaranteed precise and the very first tick of each
  // step can land before capture.info is populated. This is a real
  // regression check (a broken collection loop producing near-zero or
  // wildly excessive frames would fail it), not a precise timing
  // assertion.
  expect(calibrationFrames.length).toBeGreaterThan(100);
  expect(calibrationFrames.length).toBeLessThan(400);

  for (const frame of calibrationFrames) {
    expect(frame.schemaVersion).toBe(2);
    expect(frame.calibrationId).toBe(calibration.id);
    // f0Hz/formants split matches the step family that produced the
    // frame — enforced by the caller (src/wizard.ts) passing the right
    // reading shape per step, not by the store itself.
    if (typeof frame.stepId === "string") {
      expect(frame.f0Hz).toBeNull();
      expect(
        frame.formants === null ||
          (Number.isFinite(frame.formants.f1Hz) && Number.isFinite(frame.formants.f2Hz)),
      ).toBe(true);
    } else {
      expect(frame.formants).toBeNull();
      expect(frame.f0Hz === null || Number.isFinite(frame.f0Hz)).toBe(true);
    }
  }
});

test("cancelling mid-wizard discards state and re-enables the instrument", async ({ page }) => {
  await page.goto("/");
  await page.locator("#wizard-start").click();
  await expect(page.locator("#wizard-panel")).toBeVisible();
  await expect(page.locator("#mic-toggle")).toBeDisabled();

  await page.locator("#wizard-cancel").click();

  await expect(page.locator("#wizard-panel")).toBeHidden();
  await expect(page.locator("#wizard-start")).toBeVisible();
  await expect(page.locator("#wizard-start")).toBeEnabled();
  await expect(page.locator("#mic-toggle")).toBeEnabled();

  const { calibrations } = await readCalibrationDatabase(page);
  expect(calibrations).toHaveLength(0);
});

test("starting the instrument disables the wizard's start button immediately, not after the mic resolves", async ({
  page,
}) => {
  // Regression test for a wizard-review correctness finding: the
  // mutual-exclusion claim used to happen only after capture.start()
  // resolved, leaving a window (bounded by however long the native
  // permission prompt stays open) where both flows could start
  // concurrently. Asserting the disabled state right after click,
  // without waiting for "Capturing" first, actually exercises that —
  // the earlier version of this test only checked post-resolution
  // state and wouldn't have caught the bug it was meant to guard.
  await page.goto("/");

  await page.locator("#mic-toggle").click();
  await expect(page.locator("#wizard-start")).toBeDisabled();
  await expect(page.locator("#mic-status")).toHaveText(/^Capturing/, { timeout: 10_000 });
  await expect(page.locator("#wizard-start")).toBeDisabled();

  await page.locator("#mic-toggle").click();
  await expect(page.locator("#mic-status")).toHaveText("Stopped");
  await expect(page.locator("#wizard-start")).toBeEnabled();
});
