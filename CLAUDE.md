# Resonance Scope

Browser-based voice analysis and training for vocal feminization.
Instrument first (à la Overtone Analyzer / VoceVista / Voice Tools),
with the memory, personal calibration, and progressive coaching those
tools lack.

## Non-negotiables
- 100% client-side. No backend, no accounts, no network calls carrying
  user data. Audio never leaves the browser.
- getUserMedia MUST set echoCancellation, noiseSuppression, and
  autoGainControl to false. AGC invalidates every intensity and
  spectral measure.
- No hardcoded frequency or formant targets anywhere in src/. Targets
  derive from the user's own calibration.
- Store extracted features, not raw audio. Raw retention is opt-in.
- The app describes; it does not grade. No scores or verdicts on voice.
- Forbidden: performance streaks, leaderboards, personal-best-pitch.
  (Adherence streaks allowed, post-session report only, must survive
  off-day flags.)

## Architecture
Vite + TypeScript. No UI framework. Canvas 2D.
- `src/audio/`  — Web Audio API. The ONLY place that touches it.
- `src/dsp/`    — pure functions over Float32Array. No DOM, no Web
                  Audio. Must run headlessly in Node.
- `src/render/` — Canvas drawing. No audio imports.
- `src/store/`  — IndexedDB. All persisted types carry schemaVersion.

Do not add dependencies without asking. Do not add a framework.

## Documentation is part of done
Every PR-sized change updates docs in the same commit. See
docs/documentation-standards.md. Summary:
- Diátaxis structure (tutorial / how-to / reference / explanation).
  Don't mix modes in one page.
- Mermaid for anything structural: architecture, data flow, state
  machines, sequences. Prose where a diagram wouldn't clarify.
- Architectural choices become numbered ADRs in docs/adr/ (MADR
  format). ADRs are immutable — supersede, never edit.
- Cite external claims with real links. Never invent a reference. If
  a claim is unsourced, tag it [likely] or [speculative] in the doc.
- Relative Markdown links only. No [[wikilinks]] — GitHub won't
  render them.

## Git
- Conventional Commits for commit messages and PR titles.
- Branches: feat/ fix/ docs/ chore/ + short-kebab-description.
- One issue per branch. Squash merge.
- PRs use .github/PULL_REQUEST_TEMPLATE.md. Every test plan item needs
  concrete steps, where to look, and the expected result — not just a
  pass/fail checkbox. If something can't be verified in this
  environment (no browser, no real mic), say so explicitly and leave
  it unchecked rather than skipping it.
- .claude/settings.json blocks `gh pr merge`/`gh pr close` via a
  PreToolUse hook (.claude/hooks/check-test-plan.sh) while the PR's
  Test plan section still has unchecked boxes. Only constrains Claude
  Code sessions — merging manually on GitHub is unaffected.
- `/wizard-review [PR#]` runs four reviewer personas — correctness,
  security, simplicity, performance (.claude/agents/wizard-*.md) —
  independently, then a cross-wizard reaction round, and posts both as
  comments on the PR. Not automatic; run it when you want it.

## Design docs (read when relevant, not by default)
- docs/roadmap.md      — versions and scope
- docs/decisions.md    — running ledger
- docs/calibration.md  — 6-step calibration protocol
- docs/strain.md       — StrainEstimator interface, risk tiers
- docs/backlog.md      — parked ideas

## How I work
- Show the diff first. Explain only what's non-obvious.
- Push back bluntly if my approach is flawed. Correct wrong premises
  before answering the question.
- Don't rewrite whole files when a targeted change works.
- Flag god modules and propose splits.
- Nothing is "done" until you state: edge cases considered, failure
  modes, what you'd test. If you skipped error handling for brevity,
  say so.
- Tag uncertain claims [likely] / [speculative]. Say "I don't know."
