# Calibration

Reference doc for the 6-step calibration protocol. Total runtime is
roughly 90 seconds. Order matters — no range tasks on a cold voice.

## Protocol

| Step | Prompt | Duration | Produces |
|---|---|---|---|
| 0 | "Stay quiet a moment while I listen to your room" | 3s | Noise floor, deviceId, validity gate |
| 1 | "Say ahh, like at the doctor" | 5s | Baseline F0, perturbation, source quality, level reference |
| 2 | "Count to five like you're reading out a phone number" | ~5s | Habitual speaking F0 — the most important single number |
| 3 | "Say eee ... ahh ... ooo" | 2s each | Corner-vowel formants, resonance anchor |
| 4 | "Say hiii like you're greeting a dog" | 2s | Top of comfortable range, in greeting register |
| 5 | "Hum a slide up, then down — stop wherever it stops feeling easy" | 8s | Comfortable range |

## Design rationale

- Step 4 replaces the maximum-pitch task used by consumer singing apps.
  A max-effort task yields physiological ceiling, which is the wrong
  basis for targets, and asks the user to push in the first 90 seconds
  before the app has any strain data. Greeting register samples the top
  of the comfortable range instead, because most people already have
  that register and access it without effort. [likely]
- Step 5's wording does safety work. "Stop when it stops feeling easy"
  is a materially different instruction from "go as high as you can."
- Physiological max range is opt-in, gated behind several completed
  sessions and a warning. Never during onboarding.

## UI constraints

- No score, no verdict. Output is descriptive.
- Never auto-play the recording back. Playback is a button the user
  chooses to press.
- One-tap redo per step.
- Don't say "calibrating." Say what it's for.

## Data model

```typescript
interface Calibration {
  schemaVersion: number;
  timestamp: number;
  deviceId: string;
  noiseFloorDb: number;
  levelReferenceDb: number;
  habitualF0Hz: number;
  comfortableF0Range: [number, number];
  cornerVowels: { i: Formants; a: Formants; u: Formants };
  validity: ValidityReport;
}
```

Store the raw feature frames from calibration too, not just the
summary, so old calibrations can be recomputed when the formant code
changes.

## Re-calibration

Triggers: device change, 30+ days elapsed, user-reported vocal change,
or drift detection (recent habitual F0 diverging from the stored
value).

Re-calibration is itself a progress artifact — session-1 vs. session-40
calibration under the same protocol is probably a better progress
signal than any single metric.

## Validity handling

DEGRADE, do not block. A partly-invalid calibration blocks Tier B and
Tier C targets (see [strain.md](./strain.md) for the tier definitions)
but still shows the instrument. The validity report must say what went
wrong and offer to redo that one step.

Checks: noise floor above threshold, insufficient voiced frames,
implausible F0 variance, formants outside physiological bounds, level
far from the session-1 reference.

Rationale: a bad calibration fails silently and poisons every target
for months — someone whispers because a roommate is asleep, or holds
the phone at arm's length, and the app just feels broken.
