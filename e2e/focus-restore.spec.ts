// Closes issue #63: disabling a button that was just keyboard-activated
// drops focus to <body> with no automatic re-target, stranding a
// keyboard/screen-reader user. Playwright's .click() performs a real
// mouse click, which focuses the element first (same as it would for a
// keyboard Enter/Space activation) — so asserting document.activeElement
// after each action actually exercises the same disable/re-enable path a
// keyboard user hits.
import { expect, test } from "@playwright/test";

async function activeElementId(page: import("@playwright/test").Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.id ?? null);
}

test("starting capture restores focus to #mic-toggle once it's re-enabled", async ({ page }) => {
  await page.goto("/");
  await page.locator("#mic-toggle").click();
  await expect(page.locator("#mic-status")).toHaveText(/^Capturing/, { timeout: 10_000 });
  expect(await activeElementId(page)).toBe("mic-toggle");
});

test("export restores focus to #export-json once it's re-enabled", async ({ page }) => {
  await page.goto("/");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export-json").click();
  await downloadPromise;
  expect(await activeElementId(page)).toBe("export-json");
});

test("delete-all restores focus to #delete-all once it's re-enabled", async ({ page }) => {
  await page.goto("/");
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  await page.locator("#delete-all").click();
  await expect(page.locator("#mic-status")).toHaveText("All sessions deleted.");
  expect(await activeElementId(page)).toBe("delete-all");
});

test("cancelling the delete-all confirm dialog also restores focus", async ({ page }) => {
  await page.goto("/");
  page.once("dialog", (dialog) => {
    void dialog.dismiss();
  });
  await page.locator("#delete-all").click();
  // No disable/re-enable ever happens on this path (handleDeleteAll
  // returns before touching deleteAllButton.disabled) — focus was never
  // lost to begin with, so it's still on the button from the click itself.
  expect(await activeElementId(page)).toBe("delete-all");
});
