---

description: "Task list for the below-noise-floor brightness floor"
---

# Tasks: Below-noise-floor brightness floor

**Input**: Design documents from `/specs/001-noise-floor-brightness/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [quickstart.md](./quickstart.md)

**Tests**: Test tasks ARE included. The constitution's Quality Gates
require headless unit coverage for logic of this kind, and the spec's
SC-004 ("unchanged, demonstrably") cannot be satisfied by inspection.

**Source issue**: [#64](https://github.com/lvndrpup/voice-trainer/issues/64)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable — different file, no dependency on incomplete work
- **[US1]/[US2]**: maps to the user story in [spec.md](./spec.md)

## Path Conventions

Single project, existing layout. Paths are repository-relative:
`src/render/`, `docs/`.

---

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Confirm `src/render/index.test.ts` is picked up by the `npm test` glob (`node --test src/**/*.test.ts`) by adding a trivial passing case, and confirm a hand-rolled `CanvasRenderingContext2D` stub satisfies `strictTypeChecked` under `npm run lint` and `npm run typecheck` in `src/render/index.test.ts`

**Why this is a real task, not ceremony**: `src/render/` has had no unit
tests until now — it was covered by Playwright e2e only. Node has no
DOM, so the stub is the one genuinely unknown part of this plan. If it
proves unworkable, [plan.md](./plan.md)'s Structure Decision names the
fallback (extract a pure mapping helper, cover drawing in e2e), and
that decision must be made here rather than half-way through T004.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Blocks both user stories.**

- [ ] T002 Add a module-level `FLOOR` constant (value `8`) in `src/render/index.ts` with a comment stating it is a display-rendering constant, not a frequency/formant target, and citing [research.md](./research.md) for how the value was chosen

**Checkpoint**: constant exists and is referenced nowhere yet.

---

## Phase 3: User Story 1 - Confirming the instrument is live (Priority: P1) 🎯 MVP

**Goal**: A drawn column whose input sits at or below `minDb` is
visibly distinguishable from never-drawn canvas.

**Independent test**: Push an all-below-floor column and compare the
resulting pixel values against what `clear()` writes. Delivers the
entire value of issue #64 on its own.

### Tests for User Story 1

- [ ] T003 [P] [US1] Add tests in `src/render/index.test.ts` asserting that a column pushed with all values at or below `minDb` produces pixel level `FLOOR`, that a column pushed with values *exactly* at `minDb` produces the same `FLOOR` (the edge case issue #64 calls out explicitly), and that `FLOOR` is strictly greater than the level `clear()` writes

### Implementation for User Story 1

- [ ] T004 [US1] Apply the upward clamp `Math.max(FLOOR, Math.round(intensity * 255))` in `SpectrogramRenderer.pushColumn`'s per-row loop in `src/render/index.ts`, leaving the existing `intensity` computation untouched

**Checkpoint**: T003 passes. Issue #64's defect is fixed. This is a
shippable MVP on its own.

---

## Phase 4: User Story 2 - Reading quiet passages without losing detail (Priority: P2)

**Goal**: The floor does not flatten genuine low-level detail, and
above-floor rendering is provably unchanged.

**Independent test**: Render a sweep of input levels and confirm
distinct inputs stay distinct, and that above-floor output matches the
pre-change mapping byte for byte.

### Tests for User Story 2

- [ ] T005 [P] [US2] Add tests in `src/render/index.test.ts` asserting that every input producing a level at or above `FLOOR` is byte-identical to the pre-change mapping (`Math.round(intensity * 255)`), covering the spec's SC-004
- [ ] T006 [P] [US2] Add a test in `src/render/index.test.ts` sweeping input across the quiet end of the range and asserting the count of distinct output levels is not reduced except within the documented `FLOOR/255` band (~2.2 dB), covering FR-006

**Checkpoint**: the trade-off in [research.md](./research.md) Decision 2
is now enforced by a test rather than asserted in prose.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T007 Update the "Magnitude-to-brightness mapping" section of `docs/spectrogram.md` to document the floor: its value, that it applies only at or below `minDb`, the ~2.2 dB it collapses, and its L\* against the table already in that section — **gated by constitution VII, this PR is not done without it**
- [ ] T008 [P] Record the manual verification outcome in `docs/spectrogram.md` per [quickstart.md](./quickstart.md)'s manual steps, including the display and lighting used — **or, if running headless, state explicitly that it was not performed**
- [ ] T009 Run `npm run lint`, `npm run typecheck`, and `npm test`; all must pass
- [ ] T010 Run `npm run test:e2e` and confirm no existing Playwright assertion regressed
- [ ] T011 Write the PR test plan with concrete steps per CLAUDE.md, leaving the manual visual check **unchecked** with an explicit note that no browser or display was available

---

## Dependencies & Execution Order

### Phase Dependencies

```text
Phase 1 (Setup) ──> Phase 2 (FLOOR constant) ──┬──> Phase 3 (US1) ──> Phase 5 (Polish)
                                               └──> Phase 4 (US2) ──┘
```

Phase 4 depends on T004 existing (there is nothing to compare against
until the clamp is in), so despite being separate stories, US2's tests
are written after US1's implementation rather than truly in parallel.

### User Story Dependencies

- **US1** is independent and shippable alone.
- **US2** constrains US1 rather than adding capability. It cannot ship
  first, and it is not a separate release increment — it is the guard
  rail proving US1 did not cost anything.

### Parallel Opportunities

- T003 is `[P]` against nothing else in its phase; it is marked for
  consistency but this feature is too small for meaningful fan-out.
- T005 and T006 genuinely can be written together — same file, but
  independent cases with no shared state.
- T008 is `[P]` against T009/T010 — documentation and test runs do not
  block each other.

**Honest note**: this feature is one `Math.max` and a constant. The
phase structure above is the template's, and the parallelism it invites
is not worth orchestrating here. Working T001 -> T011 in order is the
right execution strategy.

## Implementation Strategy

### MVP First

Phases 1-3 (T001-T004) fix issue #64 completely. If work has to stop,
stopping after T004 plus T007 leaves the repository in a correct,
documented state.

### Incremental Delivery

1. T001-T004 — defect fixed, tested.
2. T005-T006 — trade-off enforced.
3. T007-T011 — documented, verified, honestly reported.

## Notes

- No new dependency is permitted (constitution VI). If any task appears
  to need one, stop and ask.
- `minDb`/`maxDb` defaults (-100/-30) must not change (FR-005).
- Grayscale only (FR-004) — no colormap, at any point.
- If the manual check in T008 shows `FLOOR = 8` is not perceptible,
  raise it and re-run T006; do not exceed level 16 without revisiting
  FR-006 against [research.md](./research.md)'s table.
