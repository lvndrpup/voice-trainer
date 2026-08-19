# 4. Calibration module boundary

## Status

Accepted

## Context

v0.3 (docs/roadmap.md) needs the 6-step calibration protocol
(docs/calibration.md): a sequenced set of prompts, each collecting
readings and producing one field of a `Calibration` record, with a
running validity report ("degrade, do not block" per that doc — a
failed check offers a one-tap redo of the specific step, it doesn't
stop the wizard).

This is meaningfully different code from anything the existing module
boundaries (CLAUDE.md's Architecture section) were shaped around:

- It's not `src/dsp` — dsp is "pure functions over Float32Array,"
  stateless, one call in and one value out. The calibration engine is
  a multi-step *state machine*: it has to remember which steps are
  done, allow redoing one without losing the others, and only produce
  a result once every step has run.
- It's not `src/store` — nothing about step-sequencing or validity
  needs IndexedDB. Coupling the engine to persistence would make it
  untestable without a browser, the same problem ADR 0003 avoided for
  session frames.
- It's not `src/main.ts` — that file is already 216 lines wiring
  capture, DSP, rendering, and session persistence into the
  live-instrument loop. A 6-step wizard's sequencing and validity
  logic is a different concern from that loop and would make `main.ts`
  a god module (CLAUDE.md: "flag god modules and propose splits").

## Decision

New `src/calibration/` module: pure, headless, DOM/Web-Audio/Canvas-
free — same testability charter as `src/dsp`, just for step-sequencing
instead of signal processing. It may import `src/dsp` (reusing its
aggregation functions) but not `src/audio`, `src/render`, or
`src/store`, enforced by an `eslint.config.mjs` `no-restricted-imports`
block mirroring the existing `src/dsp` one.

It hands back a plain `CalibrationDraft` object; it does not persist
anything. The one directional exception to "calibration imports
nothing from store": `src/store/calibration.ts` imports the
`ValidityReport` type *from* `src/calibration`, rather than redefining
it, since `src/calibration` is what actually produces a validity
report — `src/store` has no stated import restriction (same as it
already had none on `src/dsp`), so this is allowed one-way.

The initial version registers steps 0, 1, 2, 4, and 5 only. Step 3
(corner-vowel formants) needs LPC-based formant extraction that
doesn't exist yet — see decisions.md's "Corrected" entry on custom DSP
needing golden-file fixtures before it can land. Nothing wires this
module into `main.ts`/`index.html` until step 3 exists and the wizard
can actually complete; see decisions.md for why (shipping an
uncompletable wizard would be a half-finished implementation).

## Consequences

**Positive**: the step-sequencing and validity logic is testable with
plain `node --test`, no browser, same as `src/dsp` — synthetic reading
arrays in, a `CalibrationDraft` or a `ValidityCheck` out. Keeps
`main.ts` from absorbing wizard-specific state.

**Negative**: a fourth module boundary is one more thing to keep
straight, and the current five-directory layout (`audio`/`dsp`/
`render`/`store`/`calibration`) is more structure than a one-canvas
app strictly needs on its own merits — justified here by the state-
machine/testability distinction above, not by general app size.

## Alternatives considered

- **Fold into `src/dsp`**: rejected — dsp's own charter is stateless
  pure functions; a multi-step state machine with redo semantics
  doesn't fit that shape without stretching it.
- **Fold into `src/store`**: rejected — would force IndexedDB into
  the loop for something that's pure sequencing/validity logic, and
  make step-engine tests need a browser.
- **Fold into `src/main.ts`**: rejected — bloats an already-large
  entry point with logic unrelated to the live-instrument loop it
  otherwise owns.
