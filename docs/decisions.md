# Decisions

A running ledger, grouped under Decided / Corrected / Open / Deferred.

Every entry here is untested belief until real signal arrives. This
document existed before any code did, and the first hour of looking at
actual spectra will invalidate some of it. Treat "Decided" as "decided
for now," not "settled forever."

## Decided — product

- Instrument first, coach second. Reference apps (Overtone Analyzer,
  VoceVista Video Pro, Voice Tools) are all instruments with no memory
  and no opinion. The differentiator is memory, personal calibration,
  and progressive coaching.
- Built for public use, not just the author.
- Coaching is mostly post-session, not live. Rationale: motor-learning
  guidance hypothesis — continuous real-time feedback improves
  in-session performance and degrades retention. Live cues are sparse
  and non-scoring; substantive feedback comes in the session review.
  The guidance hypothesis itself is well established for limb motor
  learning: [Winstein & Schmidt (1990), "Reduced frequency of
  knowledge of results enhances motor skill learning," *Journal of
  Experimental Psychology: Learning, Memory, and Cognition*, 16(4)](https://www.krigolsonteaching.com/uploads/4/3/8/4/43848243/reduced_frequency_of_kr_1990_winstein_schmidt.pdf).
  It also has early, voice-specific support: [Van Stan et al. (2017),
  "Ambulatory Voice Biofeedback: Relative Frequency and Summary
  Feedback Effects on Performance and Retention of Reduced Vocal
  Intensity...," *Journal of Speech, Language, and Hearing Research*,
  60(4)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5548081/) found
  reduced/summary feedback produced significantly better short- and
  long-term retention than continuous feedback for a trained vocal
  behavior. The companion paper, [Van Stan et al. (2017), "Integration
  of Motor Learning Principles Into Real-Time Ambulatory Voice
  Biofeedback...," *American Journal of Speech-Language Pathology*,
  26(1)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5533549/), cautions
  that the voice-therapy evidence base was still thin as of 2017 —
  most supporting work is still limb-movement research applied by
  analogy. [likely, with real support — still worth an SLP sanity
  check, not "unverified"] TODO: revisit with SLP.
- Progressive disclosure of coaching solves the cold-start problem:
  session 1 = instrument plus one guided calibration, no targets;
  sessions 1-5 = own trends only, app says "still learning your voice";
  session 5+ = targets appear, derived from the user's calibration.
- Adherence streaks allowed (post-session report only, must survive
  off-day flags). Performance streaks forbidden — they create pressure
  to push through discomfort.
- Off-day flag required: one tap to mark sick/tired/post-op/etc,
  excludes the session from trends and suppresses targets. Without it,
  the strain label set gets poisoned and trend graphs lie.

## Decided — architecture

- 100% client-side, no backend, no accounts. This is both the privacy
  property and the reason 80% of infra surface disappears. See
  [ADR 0001](./adr/0001-client-side-only.md).
- Vite + TypeScript, no UI framework, Canvas 2D.
- Module boundaries: `src/audio` (Web Audio only), `src/dsp` (pure
  functions, headless-testable), `src/render` (canvas only), `src/store`
  (IndexedDB, everything carries `schemaVersion`).
- v1 DSP uses AnalyserNode. Custom FFT/LPC deferred until golden-file
  fixtures exist.
- Store extracted features, not raw audio. Raw retention is opt-in per
  session. A device compromise should leak numbers, not recordings of
  someone's voice.
- Session persistence (v0.2) uses two IndexedDB object stores —
  `sessions` and `frames`, the latter indexed by `sessionId` — rather
  than nesting a frames array inside each session record, so appending
  a frame is O(1) instead of a read-modify-write of a growing array.
  Feature-frame logging is throttled to ~10Hz by the caller, not the
  ~60Hz animation-frame rate the instrument display runs at. See
  [ADR 0003](./adr/0003-session-persistence-schema.md) and
  [session-store.md](./session-store.md). Persistence failures degrade
  gracefully — a broken IndexedDB doesn't block the instrument, it
  just stops saving and says so. v0.2 is now complete per
  [roadmap.md](./roadmap.md)'s criterion (sessions persist and export
  as JSON).
- getUserMedia must disable echoCancellation, noiseSuppression, and
  autoGainControl. AGC alone invalidates every intensity and spectral-
  tilt measure.
- Mic frequency response is uncalibrated and device-specific. Store
  deviceId with calibration; invalidate calibration on device change.
- No population priors are obtainable without a backend, so they must
  come from published literature or an explicit opt-in export. Do not
  quietly abandon the no-backend rule to solve this.
- TypeScript is pinned to the 6.x line (`^6.0.3`), not the native 7.x
  compiler the scaffold happened to install. `typescript-eslint` cannot
  run against TS7 at all yet — confirmed by testing, not assumed, and
  corroborated by a typescript-eslint maintainer: there is no stable
  JS-consumable API for TS7/`tsgo` for tools to hook into (see
  [typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)).
  Verified TS6 and TS7 generate identical `lib.dom.d.ts` typings for the
  spots `src/audio/index.ts` depends on, so the downgrade is behaviorally
  inert beyond unlocking lint. Revisit once that issue closes — TS7's
  native compiler is faster and the only reason to stay on 6.x is this
  tooling gap, not a preference.
- ESLint (flat config) + `typescript-eslint`'s `strictTypeChecked` and
  `stylisticTypeChecked` rule sets, no Prettier. Prettier was
  considered and skipped for now: it's a second dependency purely for
  formatting on a solo project with no style disputes to arbitrate, and
  `stylisticTypeChecked` already covers TS-idiomatic pattern rules
  (though not whitespace/wrapping). Revisit if a second contributor
  joins or manual formatting drift becomes annoying enough to matter.
- Module boundaries (`src/audio`/`dsp`/`render` above) are enforced by
  `no-restricted-imports` rules in `eslint.config.mjs`, scoped to only
  the restrictions CLAUDE.md actually states — `src/store` has no
  stated import restriction, so none is enforced for it.
- v0.3's first PR adds a fourth pure module, `src/calibration/` — the
  step-sequencing/validity engine for the 6-step calibration protocol.
  Same testability charter as `src/dsp` (headless, no DOM/Web Audio/
  Canvas) but for a multi-step state machine rather than stateless
  signal processing, so it's its own module rather than folded into
  `dsp`. May import `dsp`; may not import `audio`/`render`/`store`
  (enforced the same way as the existing boundaries). One deliberate
  exception to the "calibration touches nothing else" rule:
  `src/store/calibration.ts` imports the `ValidityReport` type *from*
  `src/calibration`, since that module is what actually produces one —
  allowed because `src/store` has no import restriction of its own.
  See [ADR 0004](./adr/0004-calibration-module-boundary.md) and
  [calibration-store.md](./calibration-store.md).
- `src/store/index.ts`'s `openDatabase()`/`requestToPromise()`/
  `getRecord()`/`getAllRecords()` helpers moved to `src/store/idb.ts`
  once `CalibrationStore` needed the same open()/request-wrapping
  logic against the same physical `resonance-scope` database.
  `SessionStore`'s public behavior is unchanged. `idb.ts` is also now
  the one place that knows every object store name across the app,
  since IndexedDB requires all of one version's schema changes to
  happen inside a single `onupgradeneeded` callback — `DATABASE_VERSION`
  bumped 1 → 3 across this PR (2 added `calibrations`, 3 added
  `calibrationFrames` — see next entry), each additively (existing
  data untouched).
- `Calibration` (`src/store/calibration.ts`) deviates from
  calibration.md's documented interface in two small schema-shape
  ways: `deviceId` is `string | null` rather than `string`, matching
  what `MicrophoneCaptureInfo.deviceId` (`src/audio`) can actually
  provide rather than inventing a placeholder; and an `id: string`
  primary key was added, since IndexedDB needs a `keyPath` and the
  documented interface didn't specify one. A third, functional gap —
  calibration.md also asks to store raw feature frames, not just the
  summary, "so old calibrations can be recomputed when the formant
  code changes" — was initially missed entirely (not even listed as a
  deviation) and caught by `/wizard-review`'s correctness pass on the
  PR before merge, not by the author. Closed in the same PR: a second
  object store, `calibrationFrames`, persists each step's raw
  `StepReading`s alongside the summary. See
  [calibration-store.md](./calibration-store.md).
- `/wizard-review` on that same PR also caught a second real issue:
  the PR's own commit had added a `## Tracking` section to CLAUDE.md
  (GitHub Project board workflow) — content unrelated to "calibration
  data layer," which had ended up in the working tree uncommitted
  before the PR branch was even created and rode along into the
  commit untouched, since the edit that added the actual
  calibration-related bullet only touched its own hunk. Pulled back
  out and re-landed as its own `chore:` PR instead. Lesson: a
  file-level diff review (not just "does my intended hunk look right")
  would have caught this before the review round did.
- Calibration's wizard UI (`index.html`/`main.ts` wiring) is
  deliberately not part of v0.3's first PR — see calibration.md's
  6 steps, of which only 0/1/2/4/5 have a producer so far (step 3
  needs LPC formants, a separate PR). CLAUDE.md: "No half-finished
  implementations either" — a wizard button a user could open but
  never complete would be exactly that, so the whole wizard ships in
  one PR once step 3 exists, atomically.

## Decided — process

- GitHub Actions CI runs lint, typecheck (`tsc -b`), unit tests
  (`node --test`), and build on every PR and push to `main`, plus a
  separate `e2e` job running Playwright against a real headless
  Chromium. This reverses part of the GitHub Actions deferral below —
  Terraform, Ansible + Molecule, Vault, and Artifactory remain
  deferred.
- Playwright (real headless Chromium, Chromium's
  `--use-fake-device-for-media-stream` flag for a synthetic mic) over
  a `fake-indexeddb` polyfill for the parts of the app that touch
  IndexedDB and `getUserMedia`. `fake-indexeddb` would only ever prove
  `SessionStore` matches its own idea of IndexedDB's behavior; a real
  browser proves the actual app (button clicks, `main.ts`'s wiring,
  the real `indexedDB` global) does. See [testing.md](./testing.md).
- Documentation is part of the definition of done and goes in the same
  commit as the code.
- SSH auth (ed25519, passphrase, shared agent socket). Account
  `lvndrpup`, noreply commit email.
- Private repo until v0.1, then public.
- Conventional Commits, branch per issue, squash merge, even solo.
- Personal hardware only. Never work hardware.

## Corrected

- Golden-file test harness was originally scheduled first, then
  deferred, and is now scheduled to land immediately before any custom
  DSP. Rationale: AnalyserNode's FFT is not code we wrote, so there was
  nothing to verify in v0.1. The oracle requirement returns the moment
  we write our own estimators. Landed alongside `computeLogFrequencyBins`
  (the first custom DSP function) using Node's built-in `node --test`
  runner rather than a new test-framework dependency — see
  [spectrogram.md](./spectrogram.md#testing) for what's actually
  covered. This is a lighter bar than a true oracle-comparison harness
  (no external reference implementation involved yet); revisit if a
  DSP estimator's correctness becomes hard to eyeball from synthetic
  cases alone.
- Log-axis bin remapping (the "first real coding problem" Open item)
  landed as `computeLogFrequencyBins` — linear interpolation between
  the two nearest linear FFT bins, log2-spaced across
  `[minFrequencyHz, nyquist]`. See [spectrogram.md](./spectrogram.md).
- Live F0 readout landed as `detectPitch` — normalized autocorrelation
  (NSDF, McLeod Pitch Method), first-local-maximum peak selection
  rather than global-maximum, to avoid octave errors. The project's own
  sine-wave unit tests caught two real bugs before ship: a whole-window
  energy normalization that penalized larger lags, and a global-max
  search that locked onto half the true frequency. See
  [pitch-detection.md](./pitch-detection.md). v0.1 is now complete per
  [roadmap.md](./roadmap.md)'s criterion (mic capture, spectrogram, and
  F0 readout all run; nothing is stored).
- Streak ban was initially blanket. Narrowed: adherence streaks are
  fine and probably good (practice frequency is the real predictor);
  performance streaks remain forbidden.
- Strain risk was initially over-weighted relative to the risk of never
  shipping. Voice Tools ships pitch games and a streak counter, is
  widely used in the trans community, and there is no visible epidemic
  of harm. Caution was directionally right and quantitatively
  overtuned.

## Open

- How `dsp.estimateComfortableF0Range` combines calibration.md's steps
  4 (greeting-register top) and 5 (hum slide) into one range isn't
  specified by that doc — only what each step individually produces.
  Current implementation: floor = the hum slide's own low end,
  ceiling = the higher of the greeting-register top and the hum
  slide's own top. [likely] — a reasonable reading of the two step
  descriptions, not a specified formula; revisit if it produces
  obviously-wrong ranges once there's real calibration data to look at.
- `FeatureFrame.peakDb` can legitimately be `-Infinity` (a silent
  frame — `peakDb()` in `main.ts` starts there and only rises if a
  spectrum bin has energy), but `sessionsToExportJson()` uses
  `JSON.stringify`, which serializes `-Infinity` as `null` — silently
  violating the field's `number` (non-nullable) type in the exported
  file. Found by `e2e/session-lifecycle.spec.ts` against a real
  `AnalyserNode`, not fixed here — fixing it means deciding whether
  `peakDb` becomes `number | null` (a schema version bump, mirroring
  how `f0Hz` already handles "no signal") or `main.ts` clamps before
  storing, and that's a product call, not a testing-PR call.
- Whether H1-H2 survives mic-response confounds well enough to justify
  the formant-correction work.
- Where exercise content comes from — needs a real SLP source.
- iOS Safari: does it honour the getUserMedia constraints, and does it
  force a sample rate?
- User-facing app name. TODO: ADR. "Resonance Scope" is a working name
  only. Constraint: the name appears in browser history, on a phone
  home screen, and in a PWA install prompt, and some users are in
  living situations where an explicit name is a problem. Resolve by
  splitting — neutral product name, explicit README and repo
  description for discoverability.
- License choice: GPL-3.0 (forks stay open) vs MIT (closed forks
  permitted).
- No-framework decision: fine for one canvas screen, revisit at
  roughly five screens.

## Deferred

- Golden-file fixtures until custom DSP.
- Terraform, Ansible + Molecule, Vault, Artifactory. RHEL practice will
  come via podman + Molecule containers, not from the dev shell.
  (GitHub Actions itself is no longer deferred — see Decided — process.)

## Known biases in this plan

- Planning-over-shipping: this document existed before any code.
- Scope creep arrived via good questions — each added subsystem was
  individually justified and cumulatively specced a clinical
  instrument.
- The reference set was three instrument apps; actual coaching programs
  (e.g. structured SLP curricula) were never examined, despite coaching
  being the differentiator.
- The design was developed with an LLM that is not a speech scientist.
  Reasoning about H1-H2, CPPS sign, and strain proxies is plausible and
  internally consistent, which is what wrong-but-confident looks like.
  ACTION: one voice SLP, ideally one working with trans clients, should
  review the coaching design before v1.0.
