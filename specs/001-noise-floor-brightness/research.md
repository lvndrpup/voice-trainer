# Phase 0 Research: Below-noise-floor brightness floor

Resolves the one genuine unknown in this feature: **where to put the
floor, and how to apply it without breaking the mapping above it.**

## Decision 1: How the floor is applied

**Decision**: Clamp the computed level upward —
`level = max(FLOOR, round(intensity * 255))` — inside the existing
per-row loop in `SpectrogramRenderer.pushColumn`.

**Rationale**: Issue #64's acceptance criteria are explicit that this
change "only touches the floor at/below `minDb`, not the whole curve."
An upward clamp satisfies that literally: every level that was already
at or above `FLOOR` is bit-identical to today's output, so FR-003 and
SC-004 hold exactly rather than approximately. It is also monotonic
(non-decreasing in dB), which matters more than it first appears — see
the rejected alternative below.

**Alternatives considered**:

- **Rescale the whole range into `[FLOOR, 255]`**
  (`level = FLOOR + intensity * (255 - FLOOR)`). Preserves every
  distinction in the input, including at the very bottom. Rejected: it
  changes the digital value of *every* pixel in the display, which
  contradicts issue #64's "otherwise unchanged" criterion and would
  silently invalidate the L\* uniformity analysis already recorded in
  [docs/spectrogram.md](../../docs/spectrogram.md) for issue #65. A
  ~3% shift across the whole curve is a bigger change than the bug.
- **Apply the floor only where `intensity` is exactly 0.** Rejected as
  actively broken. `round(intensity * 255)` already yields 0 for any dB
  within ~0.14 dB above `minDb`, so this would leave a sliver of
  genuinely-present signal rendering at pure black — the original bug,
  just narrower — and would make the mapping non-monotonic, with
  quiet-but-present signal appearing *darker* than at-floor signal.
- **Change `clear()` to fill something other than black.** Rejected: it
  inverts the intended semantics (blank would become the visible state)
  and risks reading as signal where there is none. FR-002 requires the
  blank state stay distinguishable, not become prominent.

## Decision 2: The floor value

**Decision**: `FLOOR = 8` (of 255), as the value to implement and put
in front of design review.

**Rationale**: The project already established, for issue #65, that the
right unit for reasoning about this display is CIE L\* rather than raw
digital value — see the existing table in
[docs/spectrogram.md](../../docs/spectrogram.md). Extending that same
method downward to candidate floor values:

| level | L\* | dB collapsed into the floor (70 dB range) |
|---|---|---|
| 0 | 0.00 | 0.00 |
| 2 | 0.55 | 0.55 |
| 4 | 1.10 | 1.10 |
| 6 | 1.65 | 1.65 |
| **8** | **2.19** | **2.20** |
| 10 | 2.74 | 2.75 |
| 12 | 3.32 | 3.29 |
| 16 | 4.68 | 4.39 |
| 20 | 6.32 | 5.49 |

Computed through the sRGB EOTF into CIE L\*, the same conversion used
in the issue #65 analysis, so these numbers are directly comparable to
the ones already in the docs (where -95 dB sits at level 18, L\* 5.5).

Level 8 is the smallest value that clears an L\* of 2 while collapsing
only 2.2 dB of the 70 dB range — about 3% of the displayed span, all of
it at the very bottom where the signal is at or below the noise floor
by definition. That is the FR-001 / FR-006 trade-off resolved as far
toward "preserve detail" as it can go while still moving.

**Uncertainty, stated plainly**: whether L\* 2.19 is *reliably*
distinguishable from L\* 0 on a real display is `[likely]` but not
established. Near-black discrimination depends on the panel's black
level, the viewer's ambient light, and any OS-level contrast setting —
an OLED in a dark room and an IPS panel in daylight will not agree. No
source was found that pins a threshold for this case, so this is
explicitly *not* claimed as settled. The implementation must keep
`FLOOR` a single named constant precisely so this value can be revised
after the manual check without touching the mapping logic.

**Alternatives considered**: Level 4 (L\* 1.10) collapses only 1.1 dB
but is likely below the discrimination threshold on a bright panel —
it risks shipping the bug again at a different brightness, which issue
#64 names as a specific failure mode. Level 16-20 is comfortably
visible but collapses 4.4-5.5 dB, and at level 18 would render the
noise floor at the same brightness the existing docs record for -95 dB
signal, which straightforwardly violates FR-006.

## Decision 3: Verification approach

**Decision**: Two layers, one automated and one manual, with the split
documented rather than blurred.

- **Automated** (`src/render/index.test.ts` does not currently exist;
  the renderer is covered by e2e only): assert the numeric property —
  that a column pushed with all-below-floor input produces pixels whose
  value equals `FLOOR` and is strictly greater than the cleared
  canvas's value, and that a set of above-floor inputs produce
  byte-identical output to the pre-change implementation. This proves
  FR-001, FR-002, and FR-003 as *value* claims.
- **Manual**: a documented visual check that the floor is actually
  perceptible, recorded in `docs/spectrogram.md` with the exact steps
  and the display used.

**Rationale**: The constitution's honest-verification gate. An
automated test can prove two numbers differ; it cannot prove a human
sees a difference. Conflating the two would let the spec's SC-005 pass
on evidence that does not support it.

**This environment cannot run the manual check** — no browser, no
display. That step must be left unchecked in the PR's test plan rather
than assumed, per CLAUDE.md's rule on unverifiable items.

## Non-findings

No new dependency is required. The clamp is one `Math.max` on an
existing integer, and the L\* arithmetic above was done offline to
choose a constant — none of it ships.
