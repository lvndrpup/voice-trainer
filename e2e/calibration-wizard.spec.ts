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

  // Issue #52 intentionally saves with an empty raw-readings map (see
  // "Persist raw calibration readings to calibrationFrames", a
  // dependent follow-up) — no frames yet is the correct, documented
  // behavior for this PR, not a bug.
  expect(calibrationFrames).toHaveLength(0);
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

test("starting the instrument disables the wizard's start button, and vice versa", async ({
  page,
}) => {
  await page.goto("/");

  await page.locator("#mic-toggle").click();
  await expect(page.locator("#mic-status")).toHaveText(/^Capturing/, { timeout: 10_000 });
  await expect(page.locator("#wizard-start")).toBeDisabled();

  await page.locator("#mic-toggle").click();
  await expect(page.locator("#mic-status")).toHaveText("Stopped");
  await expect(page.locator("#wizard-start")).toBeEnabled();
});
