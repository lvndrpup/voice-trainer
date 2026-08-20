# Ledger

A durable, in-repo record of what actually shipped: which issue,
which PR, which commit. Append-only — once a row is merged, it doesn't
change; a correction gets a new row, not an edit to an old one, same
rule as ADRs.

## Why this exists

This project already keeps two other kinds of forward-looking record —
[roadmap.md](./roadmap.md) (versions and scope) and
[decisions.md](./decisions.md) (why, with its own "Corrected"/"Open"
sections) — plus a GitHub Project board that tracks day-to-day
workflow state. All three describe *intent*: what's planned, why, what
might still be wrong. decisions.md says so about itself explicitly —
"every entry here is untested belief until real signal arrives."

None of the three is a record of what *actually happened*, anchored to
something that can't drift. roadmap.md can describe a version as
"next" for months. The Project board lives entirely outside git — it
doesn't travel with a clone, a fork, or a mirror, and if the board or
an issue gets deleted, that history is just gone. This file is the
fix: one row per shipped issue, anchored to the one identifier in this
project's toolchain that's actually durable — a squash-merge commit
SHA on `main`. Git commit SHAs are content-addressed; per this
project's own git safety rules (no force-push to main, no rewriting
merged history), a merge commit's SHA is permanent from the moment it
lands, the same way a plan-tracking system built on some other VCS's
durable change-id would be — the ledger doesn't care what the
underlying VCS is, only that the identifier it records survives
everything short of the CLAUDE.md-forbidden operations.

**When reasoning about what's actually shipped, this file and the code
itself outrank roadmap.md/decisions.md/backlog.md.** See CLAUDE.md's
"Documentation is part of done" section for the fuller version of that
rule.

## How to add a row

The merge commit SHA doesn't exist until *after* a PR merges, so this
can't be part of the PR it's documenting. After a PR merges:

1. Note the squash-merge commit SHA (`git log --oneline -1 main`, or
   `gh pr view <N> --json mergeCommit`).
2. Decide which table it belongs in:
   - **Ledger** — the PR ships work traceable to a version in
     [roadmap.md](./roadmap.md)'s scope table, whether or not an issue
     was filed for it.
   - **Infra & Tooling** — everything else that isn't pure prose-only
     doc polish: CI, scaffolding, lint config, PR/issue process,
     `.claude/agents/*` definitions, admin passes on the planning docs
     themselves. Kept in its own table so it doesn't dilute the
     Ledger's signal of "what shipped to the product," while still
     giving this real, load-bearing work a durable trace instead of
     living only in `git log`.
   - Neither — a PR that only edits prose within an existing doc
     without adding new tracked capability (e.g. wording fixes,
     re-adding a ledger row) doesn't need a row in either table. This
     is a judgment call, not a hard rule — see the note below the
     History tables.
3. Add one row to the applicable table below, in its own small `docs:`
   commit direct to a short-lived branch → PR → merge (same process as
   any other change — nothing here is exempt from that).
4. Close the issue if "Closes #N" in the PR body didn't already do it.

## Ledger

| Version | Issue | PR | Commit | What shipped |
|---|---|---|---|---|
| v0.3 | #17 | #18 | `f686930` | Calibration step-sequencing engine (steps 0/1/2/4/5) + CalibrationStore; SessionStore split into idb.ts |
| v0.3 | #43 | #45 | `7dba395` | LPC-based `estimateFormants` (F1/F2 extraction) added to `src/dsp` |
| v0.3 | #44 | #47 | `1849d65` | Corner-vowel (3-step) formant capture wired into CalibrationEngine; CALIBRATION_SCHEMA_VERSION bumped to 2 |
| v0.3 | #53 | #59 | `7a5a1db` | Wizard now persists raw per-step readings into `calibrationFrames` instead of an empty map |
| v0.3 | #54 | #60 | `b1a20c3` | Calibration wizard accessibility fixes — cancellation/completion focus handling, deferred validity announcements, redo re-announcement, focus-guard for programmatic focus calls |
| v0.3 | #38 | #62 | `fd95f50` | Live-region fix for peak dB/F0 readouts (decoupled visual refresh from announcement rate) + `aria-label` on the spectrogram canvas |
| v0.3 | #68 | #70 | `111c4e0` | `estimateFormants` unit test fixtures switched to realistic 2048-sample capture-sized windows, matching what `MicrophoneCapture` actually provides in production |

## Infra & Tooling

Process, CI, and agent-tooling work — not mapped to a roadmap version,
so it doesn't belong in the Ledger table above, but still real,
durable work worth being able to find later. Same append-only rule
applies.

| PR | Commit | What shipped |
|---|---|---|
| #19 | `7377da1` | GitHub Project tracking workflow documented in CLAUDE.md; CI hang fix |
| #20 | `58b19a1` | `docs/ledger.md` added + docs-vs-specs authority rule in CLAUDE.md |
| #21 | `f4dfa90` | Roadmap/backlog admin pass — labels, stale issues closed, doc cross-links |
| #22 | `56eae32` | `wizard-scrummaster` agent added to close out `/wizard-review` |
| #23 | `e955597` | Fixed scrummaster's tool grant and a stale step-6 doc pointer |
| #24 | `87a3952` | `groomer`, `reviewer`, `ledger-scribe` subagent definitions added |
| #28 | `8b37609` | `/wizard-act` skill added — reconciles `/wizard-review` findings against current code, gates edits behind plan-mode approval |
| #30 | `8668458` | Repo-wide PR tracking-bar policy (linked issue + board item required) codified in CLAUDE.md; standing Infra & Tooling milestone added |
| #37 | `fea5f3a` | `docs-auditor` subagent added — sweeps `docs/` for Diátaxis mode-mixing, ADR-immutability violations, dead links, stale diagrams |
| #42 | `d1d2307` | `debugger` subagent added — reproduces and root-causes a live failure, report-only, never applies a fix |
| #39 | `914d853` | `accessibility-tester` subagent added — audits canvas UI for keyboard access, screen-reader labeling, colorblind-safe contrast |
| #40 | `5ea184e` | `dsp-numerics-auditor` subagent added — validates DSP estimators against synthetic/analytic ground truth |

## History (pre-dates this file)

Everything below shipped before this ledger existed. Commit SHAs are
real, pulled from `git log`/`gh pr list --state merged`, not
reconstructed from memory. Issue links are **not** verified GitHub
"Closes #N" references — none of these PRs used that keyword, so
GitHub never auto-closed the corresponding issue (issues #1-3 are
still open despite the work being done). Where a v0.1 PR title
obviously corresponds to an issue, it's noted as inferred, explicitly
marked as such — the entire point of this file is not asserting things
it can't back up.

| Version | Issue | PR | Commit | What shipped |
|---|---|---|---|---|
| v0.1 | #1 *(inferred — not GitHub-linked)* | #6 | `213e82d` | Microphone capture, AGC/AEC/ANS forced off |
| v0.1 | #2 *(inferred — not GitHub-linked)* | #8 | `eb4b8a5` | Scrolling log-frequency spectrogram |
| v0.1 | #3 *(inferred — not GitHub-linked)* | #9 | `bfd30d9` | Live F0 readout |
| v0.2 | — *(no issue filed)* | #10 | `304b110` | IndexedDB session store, versioned schema |
| v0.2 | — *(no issue filed)* | #11 | `3724063` | Session start/stop wired into the capture harness |
| v0.2 | — *(no issue filed)* | #12 | `87c5433` | Delete-all and export-as-JSON UI |
| v0.2 | — *(no issue filed)* | #14 | `f17524d` | Playwright e2e coverage for the SessionStore end-to-end path |

Infra/process-only PRs that predate this file, backfilled into the
Infra & Tooling table's history the same way:

| PR | Commit | What shipped |
|---|---|---|
| #4 | `6b672b4` | `docs/` skeleton |
| #5 | `63bec27` | Vite + TypeScript project scaffold |
| #7 | `c6bdce3` | ESLint + typescript-eslint + GitHub Actions CI |
| #13 | `c75233c` | PR template with concrete test-plan guidance |
| #15 | `f11de0e` | `/wizard-review` multi-persona PR review + test-plan merge gate |
| #16 | `daf926b` | Project README |

Not every merge gets a row in either table — PRs that only edit prose
within an existing doc without adding new tracked capability (e.g.
#25, which just re-added #18's Ledger row) are deliberately excluded.
That's a judgment call, not a hard rule — see "How to add a row"
above.
