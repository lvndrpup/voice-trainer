# 2. Disable browser audio processing (echoCancellation, noiseSuppression, autoGainControl)

## Status

Accepted

## Context

`getUserMedia`'s default audio constraints enable echo cancellation
(AEC), noise suppression (ANS), and automatic gain control (AGC).
These defaults exist for VoIP: they make a voice call sound clean over
an imperfect connection. [likely]

All three actively reshape exactly the signal properties this app
measures. AGC continuously rescales input level, which invalidates
every intensity measurement. AEC and ANS run adaptive filters over the
spectrum, which invalidates spectral-tilt and formant measures. A
calibration or session recorded with any of these on would not be
measuring the user's voice; it would be measuring the voice after an
opaque, time-varying DSP chain the app has no visibility into. This is
already stated as non-negotiable in [CLAUDE.md](../../CLAUDE.md) and
recorded in [decisions.md](../decisions.md).

## Decision

Request `echoCancellation`, `noiseSuppression`, and `autoGainControl`
as `{ exact: false }` in the `getUserMedia` audio constraints — not a
bare `false`, which the spec treats as only an *ideal* hint that a
browser may ignore. `exact: false` means a platform that cannot fully
disable one of these three throws `OverconstrainedError` at
acquisition time instead of silently handing back processed audio.

As defense in depth, after acquisition the actual applied values are
read back from `MediaStreamTrack.getSettings()` and stored on
`MicrophoneCaptureInfo` (see [audio-capture.md](../audio-capture.md)),
for future validity reporting (roadmap v0.3) to check against.

## Consequences

**Positive**

- Every downstream intensity and spectral measurement is directly
  interpretable — there is no invisible processing chain to account
  for or explain away.
- Failure is explicit. A platform that can't honor the constraint
  fails capture with a typed error (`MicrophoneConstraintsUnsupportedError`)
  rather than degrading silently into unreliable data that would look
  fine until someone noticed the numbers didn't make sense.

**Negative**

- Availability is traded for validity: on a platform that cannot fully
  disable AEC/ANS/AGC, capture fails entirely rather than falling back
  to a degraded-but-usable mode. Some Android/mobile browsers are
  reported to be unable to fully disable AEC at the OS level
  [likely, unverified against real hardware].
- iOS Safari's behavior here is untested — whether it honors these
  constraints at all is an open question, tracked in
  [decisions.md](../decisions.md).

## Alternatives considered

- **Leave the defaults on.** Rejected outright — forbidden by
  CLAUDE.md, and would silently invalidate every measurement in the
  app.
- **Make AGC/AEC/ANS user-toggleable.** Rejected for v0.1. Without a
  validity-reporting layer (roadmap v0.3) there is no way to flag a
  session recorded with processing on as suspect, so a toggle would
  just be a footgun with no safety net.
- **Request as "ideal" rather than "exact."** Rejected — a browser is
  free to ignore an ideal constraint, which reintroduces silent
  degradation and contradicts the "don't swallow errors" rule for this
  module.
