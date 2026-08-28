# Implementation Plan: Below-noise-floor brightness floor

**Branch**: `fix/noise-floor-brightness` | **Date**: 2026-08-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-noise-floor-brightness/spec.md`

## Summary

Give any pixel produced by an actual drawn column a minimum brightness
of `FLOOR = 8`/255, so a captured-but-silent column is distinguishable
from never-drawn canvas. Applied as an upward clamp
(`max(FLOOR, round(intensity * 255))`) inside the existing per-row loop
in `SpectrogramRenderer.pushColumn`, leaving every level already at or
above `FLOOR` bit-identical to today's output. See
[research.md](./research.md) for how the value and the clamp form were
chosen.

## Technical Context

**Language/Version**: TypeScript 6.0.3, ES modules, `strictTypeChecked`

**Primary Dependencies**: None. Vite 8 + Canvas 2D; no runtime deps.

**Storage**: N/A — this feature touches rendering only.

**Testing**: `node --test` for headless unit tests; Playwright for e2e.
See [docs/testing.md](../../docs/testing.md).

**Target Platform**: Browser, Canvas 2D.

**Project Type**: Single project (client-side web app).

**Performance Goals**: No regression to the existing per-frame render
budget. `pushColumn` runs once per animation frame over `canvas.height`
rows.

**Constraints**: Grayscale only. `minDb`/`maxDb` defaults (-100/-30)
unchanged. `src/render/` must not import from `src/audio/`.

**Scale/Scope**: One method, one new constant, one new test file, one
documentation section. No new files in `src/`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Checked against [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md) v1.0.0.

| Principle | Verdict | Notes |
|---|---|---|
| I. Client-Side Only | **PASS** | Pure canvas drawing. No network, storage, or telemetry touched. |
| II. Raw Capture | **PASS** | Does not touch `getUserMedia` or any capture constraint. |
| III. No Hardcoded Targets | **PASS** | `FLOOR` is a display-rendering constant, not a target. It is a property of the *canvas*, carries no frequency or formant meaning, and is never presented to the user as something to reach. This is the same category as `minDb`/`maxDb`, which already exist. Worth stating explicitly since the principle forbids hardcoded constants and this change adds one. |
| IV. Describes, Never Grades | **PASS** | Adds no score, verdict, or comparison. Strictly increases the information the display carries. |
| V. Module Boundaries | **PASS** | Confined to `src/render/index.ts`. No new imports at all, so the `render` -> `audio` restriction in `eslint.config.mjs` cannot be violated. |
| VI. No New Dependencies | **PASS** | One `Math.max` call. The L\* arithmetic used to pick the constant was done offline and does not ship. |
| VII. Docs Are Part of Done | **PASS** — *gates a task* | `docs/spectrogram.md`'s "Magnitude-to-brightness mapping" section must be updated in the same commit. Enforced as T005 below; the task list is incomplete without it. |
| VIII. Features, Not Raw Audio | **PASS** | Nothing persisted. No schema touched. |

**Quality gates**: The honest-verification gate binds here and shapes
the plan. SC-005 cannot be fully satisfied in this environment — no
browser, no display — so the plan splits verification into an automated
value-check and a manual perceptual check, and the manual half is
carried into the PR test plan as explicitly unverified rather than
assumed. See [research.md](./research.md) Decision 3.

**Result: PASS, no violations.** Complexity Tracking table omitted —
it is only filled when there are violations to justify, and there are
none.

## Project Structure

### Documentation (this feature)

```text
specs/001-noise-floor-brightness/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 — floor value and clamp form
├── quickstart.md        # Phase 1 — how to validate
├── checklists/
│   └── requirements.md  # Spec quality validation
└── tasks.md             # Phase 2 output (/speckit-tasks — not created here)
```

`data-model.md` and `contracts/` are deliberately **not** generated.
This feature introduces no entities, no persisted shape, and no
external interface — the only surface is one existing public method
whose signature is unchanged. Generating empty artifacts to satisfy a
template would be ceremony, and the constitution's simplicity posture
argues against it. The spec's "Key Entities" section names two display
concepts, neither of which is data.

### Source Code (repository root)

```text
src/
├── render/
│   ├── index.ts         # MODIFIED — FLOOR constant + upward clamp in pushColumn
│   └── index.test.ts    # NEW — headless unit tests for the mapping
docs/
└── spectrogram.md       # MODIFIED — document the floor and its verification
```

**Structure Decision**: Single project, existing layout. This is a
localized change to one existing module; nothing about it argues for
new structure. `src/render/index.test.ts` is new but follows the
established `src/<layer>/index.test.ts` convention already used by
`src/dsp/`, `src/store/`, and `src/calibration/`.

One thing to confirm during implementation: `src/render/` has had no
unit tests until now (it was covered by Playwright e2e only). The
`npm test` script globs `src/**/*.test.ts`, so a new file there is
picked up automatically — but the renderer needs a canvas, and Node has
no DOM. The tests must therefore drive the mapping through a minimal
hand-rolled `CanvasRenderingContext2D` stub that records `fillStyle`
values, rather than a real canvas. This is the one part of the plan
with genuine unknowns; if a stub turns out to be unworkable against the
`strictTypeChecked` lint rules, fall back to asserting the mapping via
an extracted pure helper and cover the drawing itself in e2e.

## Complexity Tracking

Not applicable — the Constitution Check passed with no violations.
