# Roadmap

Versions are effort-sized, not date-sized. A version is done when its
"done when" criterion is true, whenever that happens to be.

| Version | Scope | Done when |
|---|---|---|
| v0.1 | Mic capture (AGC off), scrolling log-frequency spectrogram, live F0 readout. | It runs, you can see your voice, nothing is stored. |
| v0.2 | IndexedDB feature logging, versioned schema, session start/stop, delete-all. | Sessions persist and export as JSON. |
| v0.3 | 6-step calibration, validity report, degrade-not-block on partial validity. | Calibration produces a stored Calibration object. |
| v0.4 | Targets derived from calibration, post-session report, adherence streak. | The report shows time-in-range against the user's own numbers. |
| v0.5 | StrainEstimator interface, self-report capture, off-day flag. | Self-report labels are stored alongside session features. |
| v1.0 | Onboarding, progressive disclosure (sessions 1-5), risk tiers A/B/C, SLP review incorporated. | A stranger can use it without explanation. |
| v1.1+ | Acoustic strain proxies, n=1 classifier, PWA/offline, HTTPS for mobile testing. | — |
| Someday | Terraform/Azure hosting, Ansible + Molecule runner, GitHub Actions PR review. | — |

This table is intent, not a live status board — a version can sit at
"next" for months. See [docs/ledger.md](./ledger.md) for what's
actually shipped, and [backlog](./backlog.md) for ideas that haven't
been assigned to a version yet.

## Backlog refinement

Tracked as GitHub Issues, with milestones mapped to versions and
labels `epic` / `feature` / `story` / `spike` / `chore`. One grooming
pass before starting each version, roughly 30 minutes every two weeks.
Do not refine more than one version ahead — the roadmap beyond the
next version is a scope sketch, not a commitment.
