# 5. Spec-driven development with GitHub Spec Kit

## Status

Accepted

## Context

This project had tooling at both ends of a change and nothing in the
middle.

At the front, the `groomer` subagent turned roadmap items into Ready
issues with acceptance criteria, Size, Layer, non-goals, and edge
cases. At the back, `/wizard-review` ran multi-persona code review and
`ledger-scribe` recorded the merge. Between "here is a well-formed
issue" and "here is a diff to review" there was nothing — no
architectural plan, no task decomposition, no artifact recording *how*
a change was going to be built before it was built. That gap was
filled ad hoc, in conversation, and left no trace.

The secondary motivation was transferable practice: spec-driven
development is a workflow worth knowing outside this repo, and this
repo is a low-stakes place to learn it.

[GitHub Spec Kit](https://github.com/github/spec-kit) is the
best-known implementation. At evaluation it was one year old to the
day (repository created 2025-08-21), had just shipped
[v1.0.0](https://github.com/github/spec-kit/releases/tag/v1.0.0) on
2026-08-21 with v1.0.1 hours later, and had ~132k stars.

Three claims commonly made about it are false for v1.0.1, and were
checked against a real install rather than documentation:

1. Its commands are `/speckit-specify`, `/speckit-plan`,
   `/speckit-tasks`, `/speckit-implement` — hyphenated, `speckit-`
   prefixed, installed as **skills** under `.claude/skills/`. There is
   no `/specify`, and no separate plugin installation step.
2. It does not read, write, or reference `CLAUDE.md`. A grep over the
   full install returns zero matches. Nothing auto-syncs.
3. It does not create git branches. `create-new-feature.sh` writes
   `specs/NNN-slug/spec.md` and nothing else; branch creation is an
   optional extension that is not installed by default.

Two further findings bounded what could reasonably be adopted:

**Spec Kit contains no code review.** `/speckit-analyze`, the only
command that looks like review, declares itself `STRICTLY READ-ONLY`
over "the three core artifacts (`spec.md`, `plan.md`, `tasks.md`)" and
never opens a source file. It checks a plan against itself, not code
against a plan.

**Spec Kit is not cheaper than what this repo already had.** Measured
at adoption: its ten skills total 18,477 words against 4,701 for all
fourteen pre-existing agent and skill definitions. `/speckit-checklist`
alone (2,993 words) exceeds the five `wizard-*` personas combined
(2,000). An initial hypothesis that adopting it would reduce token
spend was wrong, and was abandoned rather than built on.

## Decision

Adopt Spec Kit v1.0.1, version-pinned, as the driver for any change
that adds or alters product capability. The loop is `/speckit-specify`
-> `/speckit-plan` -> `/speckit-tasks` -> `/speckit-implement`, with
per-feature artifacts under `specs/<NNN-slug>/`.

Specifically:

- **`/speckit-specify` consumes the linked board issue** rather than
  re-deriving it. Issues in this repo are already spec-shaped, so the
  spec is an expansion of the issue, not a competing statement of it.
  The issue remains the board's unit of work.
- **Retire `groomer`.** It is the one genuine overlap;
  `/speckit-specify` produces the same artifact with more structure.
  Its board-field responsibilities (Size, Layer, milestone) move into
  the documented issue-to-spec handoff step rather than disappearing.
- **Keep everything else.** `reviewer`, the `wizard-*` bench,
  `docs-auditor`, `accessibility-tester`, `dsp-numerics-auditor`,
  `debugger`, and `ledger-scribe` all do things Spec Kit cannot do at
  all.
- **Write a full standalone constitution** at
  `.specify/memory/constitution.md`, covering all eight rule classes a
  plan can violate, with a Governance section carrying an explicit
  ownership rule dividing it from `CLAUDE.md`.
- **Fence off two commands.** `/speckit-taskstoissues` is never run —
  it mass-creates issues through the board's WIP-limit-1 and
  Ready-cap-5 rules. `/speckit-analyze` may be run but is documented
  as not being code review.
- **`specs/` is intent, `docs/` is record.** Specs join roadmap.md and
  decisions.md as forward-looking documents. The reference docs, the
  ADRs, and ledger.md remain ground truth for what shipped.

## Consequences

**Positive.** The plan and task-decomposition phase now produces a
durable artifact instead of vanishing into conversation. Plans are
mechanically checked against the project's non-negotiables at the
moment they are written, which is earlier than review has ever caught
them. The four product non-negotiables exist in gate-checkable form for
the first time. Practice transfers to repositories that have a
constitution but no `CLAUDE.md`.

**Negative.** Token cost goes up, not down — measurably, per the
figures above, and the artifact tree is re-read by later phases.
Process overhead is real: small changes now need an explicit carve-out
to avoid spec/plan/tasks ceremony for a one-line fix, which is why the
"when to use it" rules exist. There are now two rules files, and the
ownership rule is prose, not enforcement — nothing mechanically
prevents the constitution and `CLAUDE.md` from drifting apart. A future
`specify init` for an upgrade rewrites `.claude/settings.json` (ASCII
re-escaping only, semantically identical) and that churn must be
manually reverted each time.

**Neutral but worth knowing.** The speckit skills ship
`disable-model-invocation: false`, meaning an agent can fire them
unprompted. This is documented as user-invoked-only in `CLAUDE.md`, a
prose control rather than a technical one — the same class of
mitigation, and the same weakness, as the read-only-subagent rules
before `deny-bash-writes.sh` existed.

## Alternatives considered

**Keep the ad-hoc flow.** Zero cost, zero new concepts. Rejected: it
leaves the plan phase untooled and untraceable, which was the actual
problem, and teaches nothing transferable.

**Adopt Spec Kit wholesale, including `/speckit-taskstoissues`, and
relax the board rules to suit.** Highest fidelity to the tool's
intended shape. Rejected: the WIP-limit-1 and Ready-cap-5 rules are
deliberate flow control, and a task list is a finer granularity than
this board is meant to track. Bending working process to fit a new
tool's defaults is backwards.

**Retire the `wizard-*` bench and `reviewer` in favour of Spec Kit.**
Considered seriously, on the premise that Spec Kit is more mature and
cheaper. Rejected on both counts once measured: Spec Kit has no
code-review capability whatsoever, so this would have removed code
review entirely and replaced it with nothing, and it is roughly four
times the prompt size rather than a saving. The genuine cost problem —
`/wizard-review` fanning out to five or six cold agent runs — is real
but orthogonal, and is addressed separately in issue
[#79](https://github.com/lvndrpup/voice-trainer/issues/79).

**A minimal constitution pointing back at `CLAUDE.md`.** Least
duplication, no drift risk. Rejected: the constitution is only
consulted at plan time, so anything omitted from it is simply not
gated. A pointer stub would have let module-boundary and
new-dependency violations pass the gate unchecked, which defeats the
purpose of having a gate.

**Making the constitution the sole authority, with `CLAUDE.md`
deferring to it.** True single source of truth. Rejected because
`CLAUDE.md` is the file loaded automatically into every session and
the constitution is not; moving the non-negotiables into a file that
is only read when a `/speckit-*` command runs would make them
invisible during ordinary work.
