# Resonance Scope Constitution

Resonance Scope is a browser-based voice analysis and training tool for
vocal feminization. Instrument first, with the memory, personal
calibration, and progressive coaching that comparable tools lack.

This constitution is the gate that `/speckit-plan` checks every plan
against, and that `/speckit-analyze` treats as non-negotiable. It states
the rules a *plan or spec* can violate. See **Governance** for how it
divides responsibility with `CLAUDE.md`.

## Core Principles

### I. Client-Side Only (NON-NEGOTIABLE)

100% client-side. No backend, no accounts, no network calls carrying user
data. Audio never leaves the browser.

A plan violates this if it introduces a server, an API client, telemetry,
analytics, error reporting, remote config, or a CDN fetch that carries or
could carry user audio, features, or usage data. Loading a static asset the
app already ships is not a violation; transmitting anything derived from a
user's voice is.

See [ADR 0001](../../docs/adr/0001-client-side-only.md).

### II. Raw Capture (NON-NEGOTIABLE)

`getUserMedia` MUST set `echoCancellation`, `noiseSuppression`, and
`autoGainControl` to `false`.

AGC invalidates every intensity and spectral measure the app produces — a
gain-normalized signal cannot support honest loudness, strain, or spectral
comparison across sessions. A plan violates this if it relaxes any of the
three constraints, or adds a capture path that does not set them.

See [ADR 0002](../../docs/adr/0002-agc-off-raw-constraints.md).

### III. No Hardcoded Targets (NON-NEGOTIABLE)

No hardcoded frequency or formant targets anywhere in `src/`. Every target
derives from the user's own calibration.

There is no correct pitch. A plan violates this if it introduces a
gendered frequency band, a "target" F0 or formant constant, a reference
range borrowed from literature, or any default the user did not produce by
calibrating. Analysis-window bounds and display axis limits are not
targets; a value the UI presents as something to reach is.

**Layer gate:** targets (L3) and feedback (L4) are not built until
calibration (L2) exists. A plan that needs L3/L4 before L2 would have to
fall back on hardcoded numbers, which this principle forbids.

### IV. Describes, Never Grades (NON-NEGOTIABLE)

The app describes; it does not grade. No scores or verdicts on a user's
voice.

Explicitly forbidden: performance streaks, leaderboards, personal-best
pitch. Adherence streaks are permitted, in the post-session report only,
and must survive off-day flags.

A plan violates this if it ranks, scores, congratulates, or compares the
user against anyone — including their own past self in a
better/worse framing. Showing a trend is description; calling the trend
progress or regression is grading.

### V. Module Boundaries

Vite + TypeScript. No UI framework. Canvas 2D.

- `src/audio/` — Web Audio API. The ONLY place that touches it.
- `src/dsp/` — pure functions over `Float32Array`. No DOM, no Web Audio.
  Must run headlessly in Node.
- `src/render/` — Canvas drawing. No audio imports.
- `src/store/` — IndexedDB. All persisted types carry `schemaVersion`.
- `src/calibration/` — pure step-sequencing/validity logic. No DOM, no Web
  Audio, no Canvas. Must run headlessly in Node.

These are machine-enforced by `no-restricted-imports` in
`eslint.config.mjs`, which carries the boundary matrix. A plan that places
a component in the wrong layer, or needs a new cross-layer import, must
either be redesigned or justified in the plan's Complexity Tracking table.

See [ADR 0004](../../docs/adr/0004-calibration-module-boundary.md).

### VI. No New Dependencies Without Asking

Do not add dependencies. Do not add a framework. A plan that needs a new
runtime or dev dependency must say so explicitly and stop for approval —
not assume availability, and not vendor the code to route around the rule.

This is a real constraint on DSP work in particular: the codebase computes
autocorrelation directly in the time domain and has no FFT, so any plan
needing one is proposing either a from-scratch implementation or a
dependency conversation.

### VII. Docs Are Part of Done

Every PR-sized change updates docs in the same commit. A plan whose task
list has no documentation task is incomplete.

- Diátaxis: tutorial / how-to / reference / explanation. One mode per page.
- Mermaid for anything structural — architecture, data flow, state
  machines, sequences. Prose where a diagram would not clarify.
- Architectural choices become numbered ADRs in `docs/adr/` (MADR format).
  **ADRs are immutable** — supersede, never edit.
- Cite external claims with real links that were actually opened. Never
  invent a reference. Unsourced claims are tagged `[likely]` or
  `[speculative]`.
- Relative Markdown links only. No wikilinks.

See [docs/documentation-standards.md](../../docs/documentation-standards.md).

### VIII. Features, Not Raw Audio

Store extracted features, not raw audio. Raw retention is opt-in.

All persisted types carry `schemaVersion`. A plan that adds or changes a
stored shape must state the schema version and the migration path for
existing records.

See [ADR 0003](../../docs/adr/0003-session-persistence-schema.md).

## Quality Gates

A plan is not complete unless it accounts for:

- **Tests.** Pure logic in `src/dsp/` and `src/calibration/` is unit-tested
  headlessly under `node --test`. Behaviour that only exists in a real
  browser belongs in the Playwright e2e suite. See
  [docs/testing.md](../../docs/testing.md).
- **Honest verification.** Anything that cannot be verified in the current
  environment — no browser, no real microphone — is stated as unverified
  rather than assumed to pass.
- **Failure modes.** Edge cases and error handling are named, not deferred.
  Skipped error handling is called out explicitly, never left implied.

## Governance

**This constitution governs plans and specs.** It is the authority for
anything checkable against a `spec.md`, `plan.md`, or `tasks.md`, and
`/speckit-plan` records its Constitution Check against these principles.

**`CLAUDE.md` governs sessions and process** — git conventions, branch
naming, the GitHub Project board's WIP and Ready limits, PR template
rules, review workflow, and working style. `CLAUDE.md` is loaded
automatically into every session; this file is read only when a
`/speckit-*` skill consults it.

Where both mention a rule, this file carries the plan-checkable statement
of it and `CLAUDE.md` carries the operational one. Neither silently
overrides the other: a conflict is a bug in one of them and gets fixed,
not reinterpreted at plan time.

**Amendments** require an ADR in `docs/adr/` recording the change and its
rationale, plus a version bump below. A principle is never diluted or
reinterpreted inside `/speckit-analyze` or `/speckit-plan` to make a plan
pass — the plan changes, or the constitution is amended on purpose.

The four principles marked NON-NEGOTIABLE are product identity, not
engineering preference. A plan that violates one is rejected outright; it
does not go in the Complexity Tracking table as a justified trade-off.

**Version**: 1.0.0 | **Ratified**: 2026-08-28 | **Last Amended**: 2026-08-28
