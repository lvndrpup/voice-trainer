# Quickstart: Validating the below-noise-floor brightness floor

How to confirm this feature works, and — equally important — which part
of it cannot be confirmed in a headless environment.

## Prerequisites

```bash
npm install
```

No other setup. This feature adds no dependency and needs no device
access for the automated half.

## Automated validation

```bash
npm run lint
npm run typecheck
npm test
```

Expected: all pass, with the new `src/render/index.test.ts` cases
included in the `node --test` run.

The unit tests must establish three things, corresponding directly to
the spec's requirements:

| Check | Proves | Expected result |
|---|---|---|
| Push a column whose input is entirely at or below `minDb` | FR-001 | Every resulting pixel value equals `FLOOR` (8), not 0 |
| Compare that against the value `clear()` writes | FR-002 | `FLOOR` > 0; the two states are numerically distinct |
| Push columns spanning above-floor input | FR-003, SC-004 | Every value at or above `FLOOR` is byte-identical to the pre-change mapping |
| Push input exactly at `minDb` and input below it | Edge case | Both produce `FLOOR` — the floor covers the whole clamped case, not just values literally below the boundary |

Note the renderer needs a canvas context, which Node does not have. The
tests drive `pushColumn` through a minimal recording stub rather than a
real canvas — see [plan.md](./plan.md)'s Structure Decision for the
fallback if that proves unworkable.

## End-to-end validation

```bash
npm run test:e2e
```

Expected: the existing Playwright suite still passes. This change should
not alter any existing e2e assertion; if one fails, the mapping was
changed more broadly than intended.

## Manual validation — required, and not possible headlessly

The automated checks prove two numbers differ. They **cannot** prove a
person sees a difference, which is what the spec's SC-001 and SC-005
actually claim.

```bash
npm run dev
```

Then:

1. Open the app and start capture in as quiet a room as you can manage.
2. Let columns scroll across roughly half the display.
3. Without leaning in or shading the screen, check whether the drawn
   half is distinguishable from the not-yet-drawn half.
4. Repeat under a second, brighter lighting condition if possible — the
   failure mode this guards against is a floor that is visible in a dark
   room and invisible in daylight.
5. Record the display used, the lighting, and the outcome in
   `docs/spectrogram.md`.

**If the floor is not perceptible**, raise `FLOOR` and re-check. It is a
single named constant specifically so this loop is cheap. Do not raise
it past level 16 without revisiting FR-006 — see
[research.md](./research.md)'s table for what each step costs in
collapsed dynamic range.

**In an agent session with no browser and no display, steps 1-5 cannot
be performed.** Leave them unchecked in the PR test plan and say so
explicitly, per CLAUDE.md. An automated pass is not evidence for this
claim.
