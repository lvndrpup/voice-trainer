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
can't be part of the PR it's documenting. After a PR that closes an
issue merges:

1. Note the squash-merge commit SHA (`git log --oneline -1 main`, or
   `gh pr view <N> --json mergeCommit`).
2. Add one row to the table below, in its own small `docs:` commit
   direct to a short-lived branch → PR → merge (same process as any
   other change — nothing here is exempt from that).
3. Close the issue if "Closes #N" in the PR body didn't already do it.

## Ledger

| Version | Issue | PR | Commit | What shipped |
|---|---|---|---|---|

*(Empty until the next PR merges after this file exists — see
"History" below for everything that shipped before it did.)*

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

Infra/process-only PRs (#4, #5, #7, #13, #15, #16 — scaffolding, CI,
ESLint, PR template, wizard-review, README) aren't listed here; this
file tracks roadmap-linked work, not every merge. That line is a
judgment call, not a hard rule — if infra work ever needs its own
traceability, it gets its own row when that's actually needed, not
preemptively.
