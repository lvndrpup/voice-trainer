# Feature Specification: Below-noise-floor brightness floor

**Feature Branch**: `fix/noise-floor-brightness`

**Created**: 2026-08-28

**Status**: Draft

**Source issue**: [#64 — Below-noise-floor spectrogram signal is visually
identical to blank canvas](https://github.com/lvndrpup/voice-trainer/issues/64)

**Input**: User description: "Give below-noise-floor spectrogram pixels a
minimum brightness floor so that a column that was actually drawn is
visibly distinguishable from a blank/uninitialized canvas."

> This spec **consumes** issue #64 rather than re-deriving it. The issue's
> acceptance criteria, non-goals, and edge cases are authoritative and are
> carried through below.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Confirming the instrument is live (Priority: P1)

Someone opens the app and starts capture in a quiet room, or while not
yet speaking. The display should tell them the instrument is running and
receiving a signal that is genuinely quiet — not leave them unable to
tell that apart from an instrument that has not started, has silently
failed, or has lost the microphone.

**Why this priority**: This is the entire defect. Today those two states
are pixel-identical, so the display carries zero information in exactly
the moment a user most needs reassurance that it works. It also affects
every viewer, not only colorblind users — it is a missing-information
problem, not a hue problem.

**Independent Test**: Start capture in silence and observe the region of
the display that has scrolled past. It must be visibly distinguishable
from the region that has not yet been drawn to. Delivers the whole value
of the fix on its own.

**Acceptance Scenarios**:

1. **Given** capture is running in a silent room, **When** columns have
   scrolled across part of the display, **Then** the drawn region is
   visibly distinguishable from the not-yet-drawn region.
2. **Given** the display has been cleared and no column has been drawn,
   **When** the user looks at it, **Then** it reads as empty rather than
   as a captured silent signal.
3. **Given** a drawn column at the very bottom of the intensity range,
   **When** it is compared against a column carrying genuine quiet
   signal slightly above that range, **Then** the two remain
   distinguishable from each other.

---

### User Story 2 - Reading quiet passages without losing detail (Priority: P2)

Someone reviewing a breathy or quiet passage needs the quiet end of the
display to stay readable. Raising the floor must not come at the cost of
flattening genuine low-level detail into the floor.

**Why this priority**: Secondary to the defect itself, but a fix that
compresses useful dynamic range near the noise floor trades one display
problem for another. The constraint bounds the fix; it is not new
capability.

**Independent Test**: Compare rendered output across a sweep of quiet
input levels and confirm distinct levels remain distinct.

**Acceptance Scenarios**:

1. **Given** input intensities spanning the quiet end of the displayed
   range, **When** they are rendered, **Then** distinguishable input
   levels remain distinguishable on screen.
2. **Given** input above the floor, **When** rendered, **Then** its
   brightness relationship to other above-floor values is unchanged from
   current behaviour.

### Edge Cases

Carried from issue #64:

- **Exactly at the floor vs. below it.** Input exactly at the bottom of
  the displayed range and input below it currently both clamp to the same
  value. The floor must apply to that entire clamped case, not only to
  input literally below the boundary.
- **A floor set too low** reproduces the original bug at a slightly
  different brightness — indistinguishable in practice from the blank
  state at typical display brightness and contrast.
- **A floor set too high** becomes confusable with genuine low-but-present
  signal, or visually implies signal where there is effectively none.
- **Verification is itself an edge case.** "Visually distinct at typical
  display brightness/contrast" cannot be asserted by a pixel-value test
  alone; the chosen verification method must be documented, and anything
  requiring a real display must be stated as unverified rather than
  assumed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A pixel produced by an actual drawn column whose input is at
  or below the bottom of the displayed intensity range MUST render at a
  brightness distinguishable from the display's blank/uninitialized state.
- **FR-002**: The blank/uninitialized state MUST remain visually distinct
  from any drawn content, so "nothing here yet" stays readable as such.
- **FR-003**: The brightness relationship for inputs above the bottom of
  the range MUST be unchanged by this feature.
- **FR-004**: The display MUST remain grayscale. No colormap, hue, or
  colour-based encoding may be introduced.
- **FR-005**: The bounds of the displayed intensity range MUST NOT change.
- **FR-006**: The floor MUST NOT compress the usable distinction between
  genuine low-level signals near the bottom of the range.
- **FR-007**: The chosen floor value and its rationale MUST be documented
  in the spectrogram reference documentation, including how it was
  verified.

### Key Entities

- **Drawn column**: One slice of captured signal rendered to the display.
  Carries the property, new to this feature, of being visibly identifiable
  as drawn regardless of how quiet its content is.
- **Blank region**: Display area that has not received a drawn column.
  Must remain distinguishable from every drawn column.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can tell, at a glance and without interacting, that
  the instrument is running and receiving quiet input rather than showing
  nothing at all.
- **SC-002**: 100% of drawn columns are distinguishable from the blank
  state, including those whose input sits entirely at or below the bottom
  of the displayed range.
- **SC-003**: The number of distinguishable brightness steps across the
  quiet end of the range is no lower after the change than before it.
- **SC-004**: Rendering output for all inputs above the bottom of the
  range is unchanged, demonstrably, from current behaviour.
- **SC-005**: The distinction in SC-002 holds under a documented,
  repeatable verification method rather than a one-off visual impression.

## Assumptions

- The exact floor value is left to the implementation and design review;
  issue #64 explicitly marks it "TBD by implementer/design review". This
  spec constrains it from both sides (FR-001, FR-006) rather than fixing
  a number.
- Grayscale-only is treated as settled design intent, per the existing
  spectrogram documentation's "no colormap dependency" position, not as
  an open question.
- The separate question of perceptual linearity across the rest of the
  intensity range is out of scope and already tracked independently.
- Verification of true on-screen appearance requires a real display and
  is expected to be partly manual; automated checks can establish that
  values differ, not that a human perceives them as different.
- No new dependency is expected. If one turns out to be needed, the
  constitution requires stopping to ask rather than adding it.

## Out of Scope

Carried from issue #64's non-goals:

- Introducing a colormap or hue-based encoding.
- The perceptual-linearity/gamma question for the rest of the intensity
  range.
- Changing the defaults that bound the displayed intensity range.
