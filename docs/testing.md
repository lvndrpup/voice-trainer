# Testing

How-to doc: running this project's two test suites.

## Unit tests

```
npm run test
```

Runs Node's built-in test runner (`node --test`) directly over
`src/**/*.test.ts` — no framework, no build step, per CLAUDE.md's "do
not add dependencies without asking." Only covers pure functions with
no DOM or Web Audio dependency: `src/dsp` and `sessionsToExportJson()`
in `src/store`. Node has no `indexedDB`, `AudioContext`, or
`getUserMedia`, so `src/audio` and the rest of `src/store` can't run
here — see the e2e suite below.

## End-to-end tests

```
npm run test:e2e
```

Runs [Playwright](https://playwright.dev/) against a real headless
Chromium, driving the actual app UI (button clicks, not calls into
`SessionStore` directly) with a synthetic microphone. This is what
closes the "worth a real smoke test" gaps left open in PR #11 and #12:
session start/stop/frame-logging, export, and delete-all all now run
against a real `indexedDB`, not a polyfill or a mock.

- `e2e/session-lifecycle.spec.ts` — start capture, wait for a few
  frame-log ticks, stop; asserts against the raw IndexedDB record
  shape (via `e2e/helpers/session-store-db.ts`, which reads
  `sessions`/`frames` directly — the same thing devtools' Application
  panel shows).
- `e2e/export-delete.spec.ts` — runs two short sessions, then checks
  the downloaded export JSON matches what's in IndexedDB, that
  delete-all (confirmed) empties both object stores, and that
  cancelling the confirm dialog leaves the data alone.
- `e2e/focus-restore.spec.ts` — asserts `document.activeElement` after
  starting capture, exporting, and deleting-all (confirmed and
  cancelled) — closes issue #63: disabling the just-clicked button
  during each async operation used to drop focus to `<body>` with no
  automatic re-target and nothing restoring it once re-enabled.
  Playwright's `.click()` is a real mouse click, which focuses the
  element first, the same as a keyboard Enter/Space activation would.

### What this doesn't cover

The synthetic mic (Chromium's `--use-fake-device-for-media-stream`)
produces *some* audio signal, not a human voice, so these tests assert
frame **shape** (`f0Hz` is `null` or a finite number, `peakDb` is
finite, `schemaVersion`/`sessionId` are correct) — never a specific
pitch value. Pitch-detection accuracy is `src/dsp`'s own concern and
is unit tested there. A real human voice, real hardware audio devices,
and browsers other than Chromium are still unverified by any automated
test in this repo — that gap is unchanged from before this suite
existed.

### Running locally

First time only:

```
npx playwright install chromium
```

On Debian/Ubuntu, `npx playwright install --with-deps chromium` also
installs the system libraries Chromium needs. On other distros (no
official Playwright support), install them yourself — `ldd` against
the downloaded binary
(`~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome`) lists
exactly what's missing. [likely] the affected set is limited to
sandboxes without a desktop library stack (X11/GTK/NSS) already
installed; a normal desktop Linux dev machine should already have
most of it.

CI runs on `ubuntu-latest`, where `--with-deps` works normally — see
`.github/workflows/ci.yml`.
