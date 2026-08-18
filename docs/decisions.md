# Decisions

A running ledger, grouped under Decided / Corrected / Open / Deferred.

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
- getUserMedia must disable echoCancellation, noiseSuppression, and
  autoGainControl. AGC alone invalidates every intensity and spectral-
  tilt measure.
- Mic frequency response is uncalibrated and device-specific. Store
  deviceId with calibration; invalidate calibration on device change.
- No population priors are obtainable without a backend, so they must
  come from published literature or an explicit opt-in export. Do not
  quietly abandon the no-backend rule to solve this.

## Decided — process

- Documentation is part of the definition of done and goes in the same
  commit as the code.
- SSH auth (ed25519, passphrase, shared agent socket). Account
  `lvndrpup`, noreply commit email.
- Private repo until v0.1, then public.
- Conventional Commits, branch per issue, squash merge, even solo.
- Personal hardware only. Never work hardware.

## Corrected

- Golden-file test harness was originally scheduled first, then
  deferred, and is now scheduled to land immediately before any custom
  DSP. Rationale: AnalyserNode's FFT is not code we wrote, so there was
  nothing to verify in v0.1. The oracle requirement returns the moment
  we write our own estimators.
- Streak ban was initially blanket. Narrowed: adherence streaks are
  fine and probably good (practice frequency is the real predictor);
  performance streaks remain forbidden.
- Strain risk was initially over-weighted relative to the risk of never
  shipping. Voice Tools ships pitch games and a streak counter, is
  widely used in the trans community, and there is no visible epidemic
  of harm. Caution was directionally right and quantitatively
  overtuned.

## Open

- Log-axis bin remapping approach (first real coding problem).
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
- GitHub Actions, Terraform, Ansible + Molecule, Vault, Artifactory.
  RHEL practice will come via podman + Molecule containers, not from
  the dev shell.

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
