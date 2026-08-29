# Decisions

A running log, grouped under Decided / Corrected / Open / Deferred.
(Not to be confused with [ledger.md](./ledger.md), which records what
actually shipped rather than what's currently believed — see that
file, and CLAUDE.md's "Docs vs. specs" rule, for the distinction.)

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
- Step 3 (corner-vowel formants) now has a producer too:
  `CalibrationEngine` (`src/calibration/index.ts`) gained three
  engine steps, `corner-i`/`corner-a`/`corner-u`, one per vowel rather
  than one step with a three-item reading list — chosen so each vowel
  redoes independently (a bad `/i/` shouldn't force redoing `/a/` and
  `/u/`), and because `STEP_PROMPTS`/`STEP_ORDER` was already
  one-prompt-per-id, so this fits that shape without inventing a
  sub-phase concept. `NonFormantStepId` (0|1|2|4|5) keeps its name —
  still accurate, those five steps still don't use formants — but a
  new `StepId = NonFormantStepId | CornerVowelStepId` union now
  covers the full 8-engine-step space; `STEP_PROMPTS`, `STEP_ORDER`,
  `beginStep`/`redoStep`, and (as anticipated) `src/store/
  calibration.ts`'s `CalibrationStepFrame.stepId` all widened to it.
  `CalibrationStepFrame` also gained a `formants` field alongside the
  existing `f0Hz` (each null when not applicable to that step) —
  `CALIBRATION_SCHEMA_VERSION` bumped 1 → 2, additive, existing
  records unaffected. The corner-vowel validity check reuses step 2's
  voiced-ratio shape (did most readings produce *a* formant) rather
  than checking the resulting F1/F2 values against any expected
  per-vowel range — the latter would be a hardcoded formant target,
  which CLAUDE.md forbids outright; `estimateFormants` already bounds
  its own output to a broad plausible range and returns `null` rather
  than an implausible value, so that's where "formants outside
  physiological bounds" (calibration.md's validity-check list) is
  actually enforced. `beginStep()` still doesn't enforce step order —
  confirmed unchanged, not an accidental side effect of adding three
  more valid step ids. Wizard UI wiring remains deferred, per the
  entry above — this PR is the data-layer half only. A
  `wizard-correctness` review before merge caught a real bug in the
  first version: `submitStep` accepted either reading shape for any
  step with no check that it matched the step just begun, and because
  `StepReading`/`FormantStepReading` don't share a field name, a
  wrong-shaped submission didn't fail at the call site — it silently
  reported a false-positive "clear reading," then crashed later, in
  `buildDraft()`, somewhere that wouldn't obviously point back to the
  actual mistake. Fixed: `submitStep` now checks each reading's shape
  against the step's family and throws immediately on a mismatch,
  same "surfaced not swallowed" bar the rest of this module already
  holds to. Not reachable in production today (no caller exists yet),
  but cheap to fix before one does. A related, lower-severity gap
  noted but not fixed here: schemaVersion-1 `CalibrationStepFrame`
  records genuinely lack a `formants` key at all (not `formants:
  null`) — a future reader trusting the type as written would get
  `undefined` from old records, not `null`. Unreachable today (no
  reader exists), worth a guard whenever `getCalibrationFrames` gets
  a consumer, not built speculatively now.
- Calibration's wizard UI landed — `src/wizard.ts`, a sibling module
  to `main.ts` rather than a growth of it (main.ts was already ~200
  lines; this feature roughly doubles that surface). Not under
  `src/calibration/` either, since that module must stay headless.
  Two-way coordination between `main.ts` and `wizard.ts` (each
  disables the other's start control while active, since they need
  exclusive use of the microphone) is two small callbacks rather than
  either module owning the other. Step timing is wall-clock
  (`setInterval`/`setTimeout`), not `requestAnimationFrame`-driven,
  specifically because a backgrounded tab throttles rAF and would
  otherwise silently stretch a step's real duration. Cancellation uses
  a plain `AbortController` rather than a bespoke cancellation flag,
  covering both an in-progress reading-collection window and a
  pending "waiting for Next/Redo" promise with the same mechanism.
  See [calibration-wizard.md](./calibration-wizard.md) for the full
  data flow and design rationale. Deliberately incomplete in one
  documented way: saves every calibration with an empty
  `rawReadingsByStep` map (`calibrationFrames` stays unwritten in
  production) — a dependent follow-up issue closes that gap, tracked
  separately rather than bundled in, since the wizard is a complete,
  working feature without it (CLAUDE.md's "no half-finished
  implementations" is about the user-facing feature, not about every
  possible storage completeness gap being closed atomically with it).
  v0.3 is now complete per [roadmap.md](./roadmap.md)'s criterion
  (calibration produces a stored `Calibration` object) — the raw-frame
  persistence and accessibility follow-ups are real, tracked work, but
  outside that specific "done when" line.
- A `wizard-correctness` review on the wizard's PR caught a real
  concurrency bug: mutual exclusion between the instrument and the
  wizard was UI-only (two callbacks, `setInstrumentActive`/
  `onActiveChange`), and both sides' exclusivity claims fired only
  *after* `capture.start()` resolved — not before. The native
  getUserMedia permission prompt can stay open indefinitely, so a user
  could click both start buttons while a prompt was pending and end up
  with two concurrent `MicrophoneCapture` instances, both becoming
  `"active"`, writing to two different IndexedDB stores at once.
  `MicrophoneCapture#state` is a private per-instance field, not a
  cross-instance registry (`src/audio`), so nothing there would have
  caught it either. **The wizard PR's own description had originally
  claimed `MicrophoneCapture.start()` already prevented this
  cross-instance — that claim was false**, and review is what caught
  it before merge, not after. Fixed by moving both exclusivity claims
  to fire synchronously on click, before the `await` — JS is
  single-threaded, so there's no tick left where both buttons are
  clickable. The regression test added for this only checks the
  disabled state *immediately* after click, not after the mic finishes
  starting — the original test checked only post-resolution state and
  wouldn't have caught the bug it was meant to guard against.
- The raw-frame-persistence gap noted above closed in a follow-up:
  `src/wizard.ts` now builds `rawReadingsByStep` from
  `CalibrationEngine.getStepReadings()` for every step before calling
  `saveCalibration()`, so `calibrationFrames` is populated for real,
  not just proven-correct-but-unused by the store's own tests. See
  [calibration-store.md](./calibration-store.md).

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
- GitHub Project board ("Resonance Scope", project 1) tracks work:
  Backlog → Ready → In Progress → In Review → Done, with a WIP limit
  of 1 in In Progress and a 5-item cap on Ready, so the board can't
  silently fill up with half-groomed intentions. Milestones map to
  roadmap.md versions. See CLAUDE.md's "Tracking" section for the
  full field/rule list. This had already been in informal use for a
  cycle before it was written down here — CLAUDE.md's rule is that
  docs land in the same commit as the code they describe, and process
  conventions are no exception, they'd just been missed once.
- Read-only subagents' "never edit files" claims are now backed by a
  real, if partial, technical control, not prose alone — surfaced by
  `wizard-correctness` independently on three PRs in a row (#37, #39,
  #40), tracked as issue #41. `.claude/hooks/deny-bash-writes.sh` is a
  `PreToolUse` hook denying shell-level write primitives (a mutating
  command like `rm`/`sed -i`/`git commit`, or output redirected
  outside `/tmp`) — wired into `groomer`/`reviewer`/`docs-auditor`/
  `dsp-numerics-auditor` via each agent's own frontmatter `hooks:`
  block (Claude Code scopes a subagent-declared hook to just that
  subagent, removed when it finishes — no global `settings.json`
  change needed, so it can't affect the main session or any other
  agent). Investigated first and rejected: a *global* write-blocking
  hook, since it would also block the main session's own legitimate
  Bash usage (this session commits code, edits files via heredoc,
  etc. constantly) and there's no reliable way to distinguish "which
  subagent, if any, issued this call" from a global hook scope without
  the per-agent frontmatter mechanism.

  Two agents were handled differently, deliberately: `accessibility-
  tester` had `Bash` dropped from its tool grant entirely — nothing in
  its actual instructions (Read/Grep/Glob only) ever needed it, so the
  real fix was narrower tool scoping, not a hook guarding a tool it
  didn't need. `debugger` keeps `Bash` unguarded — its entire job is
  running arbitrary project commands to reproduce a failure (test
  runs, builds, `git bisect`), which a static "no mutating commands"
  rule would have to special-case so heavily (`git stash`, build
  commands that write `dist/`) that it stopped meaningfully
  constraining anything; instead its own instructions were
  strengthened with explicit `git bisect reset` discipline, per a
  wizard-review addendum that specifically flagged bisect's
  stateful-not-just-write risk.

  Explicit limitation, not overclaimed: the hook inspects the literal
  Bash command string, not what a spawned interpreter's own code does
  — `node -e "fs.writeFileSync(...)"` wouldn't read as write-shaped to
  a shell-syntax check, so `dsp-numerics-auditor`'s "import from
  source, don't fabricate results" instruction still matters on its
  own merits, not merely because a hook exists. This is a real,
  meaningful reduction in the class of accidental edits (a stray
  `sed -i`, a habitual `git commit`, an errant redirect into a tracked
  file) — not a sandbox, and not claimed as one.

  **Not fully verified end-to-end.** `deny-bash-writes.sh`'s own
  allow/deny logic was tested standalone (piping representative
  command JSON into it directly) and behaves correctly. But a live
  dogfood run — invoking `docs-auditor` as a real subagent in this
  same session, after its frontmatter had just been edited to add the
  `hooks:` block, and asking it to attempt a write — was **not**
  blocked; the write succeeded (and was reverted by the agent itself,
  not by any enforcement). The most likely explanation: this session
  already had `docs-auditor` registered as a known agent type from
  earlier use, and Claude Code appears to cache an agent's tool/hook
  configuration at first discovery rather than re-reading its `.md`
  file on every invocation within the same session — the same
  mid-session-edit caching behavior already noted when `docs-auditor`
  was first dogfooded (a brand-new agent file needed a fresh session
  to become invocable by name at all). The YAML frontmatter itself
  parses cleanly and matches the documented subagent-hook syntax
  exactly, so this is believed to be a same-session staleness
  artifact, not a syntax error — but "believed" is doing real work in
  that sentence. A genuinely fresh session (this repo's next Claude
  Code session, not a subagent spawned mid-session) is needed to
  confirm the hook actually fires in practice. Until then, treat this
  as implemented-but-unverified, not confirmed-working.

- Spec-driven development is now the default driver for any change
  that adds or alters product capability, via [GitHub Spec
  Kit](https://github.com/github/spec-kit) v1.0.1, pinned. The loop is
  `/speckit-specify` -> `/speckit-plan` -> `/speckit-tasks` ->
  `/speckit-implement`, with per-feature artifacts under `specs/`. What
  it actually buys: the plan and task-decomposition phase, which this
  project had no tooling for at all. What it does not buy, contrary to
  the usual pitch: it is **not** cheaper. Its ten skills total 18,477
  words against 4,701 for all fourteen agent/skill definitions this repo
  already had; `/speckit-checklist` alone (2,993) exceeds the five
  `wizard-*` personas combined (2,000). Adopted for rigor, with the cost
  understood and accepted. See
  [spec-driven-development.md](./spec-driven-development.md) and
  [ADR 0005](./adr/0005-spec-driven-development-with-spec-kit.md).
- Two Spec Kit commands are deliberately fenced off.
  `/speckit-taskstoissues` mass-creates GitHub issues from a task list,
  which drives straight through the board's WIP-limit-1 and Ready-cap-5
  rules — the flow control is the point, so the command stays unused.
  `/speckit-analyze` is permitted but must never be mistaken for code
  review: its own skill definition declares it `STRICTLY READ-ONLY`
  over `spec.md`/`plan.md`/`tasks.md`, and it never opens a source
  file. It checks the plan against itself, not the code against the
  plan. Spec Kit ships no code-review capability whatsoever, which is
  why the `wizard-*` bench and `reviewer` were kept.
- The project constitution (`.specify/memory/constitution.md`) is
  written as a full standalone document rather than a pointer stub back
  to CLAUDE.md. Rationale: it is the gate `/speckit-plan` checks every
  plan against, so anything absent from it is simply not gated — a
  minimal version would let layer-boundary and new-dependency
  violations pass unchecked. The drift risk this creates is managed by
  an explicit ownership rule in its Governance section: the
  constitution owns rules checkable against a plan or spec, CLAUDE.md
  owns session, git, and board process. A conflict between them is a
  bug to fix in one of them, not something to reinterpret at plan time.
- `/wizard-review` now defaults to a single correctness wizard, with
  the four-persona fan-out, the cross-wizard reaction round, and the
  Scrum Master synthesis all behind an explicit `deep` opt-in.
  Rationale: the cost of this skill was never the persona definitions —
  all five `wizard-*` agents together are ~2,000 words — it is the
  fan-out, five or six separate agent runs that each start cold and
  re-read the diff and CLAUDE.md. A routine PR does not need four
  lenses plus a reaction round. Naming specific wizards explicitly
  still wins over the default, so the deep pass stays one word away.
  Two consequences were handled rather than left to rot: the reaction
  round is skipped whenever fewer than two wizards ran (a reaction
  round with one participant has nothing to react to), and
  `/wizard-act` no longer treats a missing Scrum Master comment as
  proof the PR was never reviewed — under a light-mode default that
  inference is simply wrong.
- **This deliberately reversed a previous rule.** CLAUDE.md had stated
  the Scrum Master "always runs last regardless of which reviewers
  ran." That was right when every run was a four-persona fan-out and
  synthesis was the only thing making the output readable; it does not
  survive a one-wizard default, where synthesis re-reads what a single
  agent just said and says it again at the cost of another cold agent
  run. Recorded here rather than silently edited, since the old rule
  was load-bearing for `/wizard-act`'s input assumptions.

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
- "Custom FFT/LPC deferred until golden-file fixtures exist" (Decided —
  architecture, above) is now partly landed: `estimateFormants`
  (`src/dsp/index.ts`) is the first custom LPC code in the project. It
  did **not** wait for a true golden-file/oracle-comparison harness —
  it uses the same lighter synthetic-self-consistency bar the earlier
  "Corrected" entry below already established for
  `computeLogFrequencyBins`/`detectPitch` (synthesize a signal with
  known ground truth, assert recovery within tolerance), not an
  external reference implementation. Decimates by an integer factor
  toward `2 * maxFormantHz` before LPC analysis (so the actual working
  rate varies somewhat by capture rate rather than landing on one fixed
  value) and peak-picks the spectral envelope rather than root-finding
  the LPC denominator (avoids a complex-polynomial-root dependency).
  See [formant-extraction.md](./formant-extraction.md) for the full
  rationale. **Not validated against real voice** — only against a
  crude synthetic source-filter model. An independent numerics audit
  before merge found the first version's own claims understated two
  real issues, both fixed or corrected in the same PR: `lpcOrder`
  had been a hardcoded constant (now scales with the actual post-
  decimation working rate, fixing measurably worse accuracy at capture
  rates below the decimation trigger, e.g. 16kHz); and the doc's
  original "a few percent" bias claim was based on a single low F0
  (150Hz) — audit testing at F0 in the 220-350Hz range (well within
  plausible feminization-training targets) found F1 errors up to and
  beyond 25%, non-monotonic with F0, a real and still-open limitation
  of peak-picked LPC at high F0 relative to formant bandwidth, not
  something a small fix resolves. A second open limitation: formants
  closer than ~150-300Hz apart can resolve as a single peak and return
  `null` rather than a degraded estimate, which the corner-vowel
  calibration step's implementer needs to know about (/u/-like vowels
  are the likeliest to hit this). See formant-extraction.md's "Known
  limitations" section for the full, quantified picture. Real-recording
  validation and both limitations remain open follow-ups. Calibration
  step 3 (wiring this into the calibration engine) is a separate,
  dependent follow-up issue — not part of this landing.
- Streak ban was initially blanket. Narrowed: adherence streaks are
  fine and probably good (practice frequency is the real predictor);
  performance streaks remain forbidden.
- Strain risk was initially over-weighted relative to the risk of never
  shipping. Voice Tools ships pitch games and a streak counter, is
  widely used in the trans community, and there is no visible epidemic
  of harm. Caution was directionally right and quantitatively
  overtuned.

- The `groomer` subagent is retired, deleted in the same change that
  adopted Spec Kit. `/speckit-specify` produces the same artifact —
  acceptance criteria, scope, non-goals — with more structure, so
  keeping both meant two tools competing to write one document. This
  was the only genuine overlap Spec Kit introduced; every other agent
  (`reviewer`, the `wizard-*` personas, `docs-auditor`,
  `accessibility-tester`, `dsp-numerics-auditor`, `debugger`,
  `ledger-scribe`) does something Spec Kit cannot do at all and was
  kept. The board-field hygiene `groomer` also handled — Size, Layer,
  milestone — did not vanish with it; it moved into the documented
  issue-to-`/speckit-specify` handoff step in
  [spec-driven-development.md](./spec-driven-development.md).
  Note that the read-only-subagent hook entry under "Decided — process"
  above still names `groomer` as one of the four agents wired to
  `deny-bash-writes.sh`; that was accurate when written and is left
  as-is per this file's own no-rewriting-history habit. Three agents
  carry that hook now.

## Open

- `deny-bash-writes.sh` (read-only subagent enforcement, issue #41) is
  a denylist over regex-matched command patterns. A `wizard-simplicity`
  review of the fourth round of bypass-patching (command substitution,
  leading whitespace, `tee`, `git` flags — see the "Decided — process"
  entry above) raised a real architectural question: pattern-matching
  a command string is trying to approximate a shell parser, which has
  a structural ceiling as an approach — every fix closes a known
  bypass, not the *class* of bypass, so a fifth one is plausible. The
  alternative it named: an allowlist (only permit the specific `gh`/
  `git log`/`node` invocations each agent's own instructions actually
  call for) rather than trying to deny everything dangerous. Not
  built here — a real redesign, not a small follow-up fix, and this
  entry exists so it isn't lost, not because the denylist approach is
  wrong for now. Revisit if another real bypass surfaces.
- How `dsp.estimateComfortableF0Range` combines calibration.md's steps
  4 (greeting-register top) and 5 (hum slide) into one range isn't
  specified by that doc — only what each step individually produces.
  Current implementation: floor = the hum slide's own low end,
  ceiling = the higher of the greeting-register top and the hum
  slide's own top. [likely] — a reasonable reading of the two step
  descriptions, not a specified formula; revisit if it produces
  obviously-wrong ranges once there's real calibration data to look at.
- Spectrogram log-axis range: the shipped default
  (`computeLogFrequencyBins` in `src/dsp/index.ts`) runs 20Hz to
  Nyquist, with no `maxFrequencyHz` parameter at all. GitHub issue #2's
  acceptance criteria mandate a 60Hz-8kHz axis instead — a real gap
  between spec and shipped code, surfaced during that issue's grooming
  and left unresolved there. Needs a product call: add a max-cap
  parameter and change the defaults, or update the issue to match
  shipped behavior. See [spectrogram.md](./spectrogram.md) and issue #2.
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
