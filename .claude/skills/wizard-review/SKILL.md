---
name: wizard-review
description: Run a code review against a PR. Defaults to a single correctness wizard, cheaply. The full pass — four wizard-coder personas (correctness, security, simplicity, performance), a cross-wizard reaction round, and a Scrum Master synthesis — is opt-in via "deep". Findings post as real comments on the GitHub PR. Invoke as /wizard-review [PR number] [deep].
---

PR review for this repo. The deep mode uses distinct reviewer personas that actually read and react to each other, not independent reports pretending to be a discussion — closed out by a plain-English Scrum Master summary.

**Default is light: one wizard, no reaction round, no Scrum Master.** The cost of this skill was never the persona definitions (all five total ~2,000 words); it is the fan-out — five or six separate agent runs, each starting cold and re-reading the diff and CLAUDE.md. A routine PR does not need that. Reach for deep mode when the PR earns it.

## 1. Resolve the target PR and the review depth

- If an argument was given and looks like a number, that's the PR.
- Otherwise resolve the current branch's PR: `gh pr view --json number,title,headRefOid,url`.
- If neither works, tell the user there's no PR to review (open one first, or pass a number) and stop — don't guess.

Fetch `number`, `title`, `headRefOid` (short SHA for the intro comment), and `url`.

**Then resolve depth, in this order:**

1. If the user named specific wizards ("security and performance", "just simplicity"), run exactly those. An explicit request always wins — never silently downgrade it to the light default.
2. If the invocation includes `deep` (or the user asked for the full/deep/all-wizards pass), run all four.
3. Otherwise — **light mode**: `wizard-correctness` alone.

Say which mode you resolved and why in the one-line notice in step 2, so a user who wanted the deep pass can catch a wrong guess before six agents spawn. If a PR looks like it warrants more than light mode — a security-sensitive surface, a hot-path change in the audio/render loop, a large refactor — say so in that line and offer `deep`, but don't upgrade on your own.

## 2. Tell the user what's about to happen, and check posting mode

One line: which PR (number + title), which wizard agents are about to review it, **which depth mode was resolved and why**, and that findings will be posted as real comments on that PR. This skill exists specifically to post those comments — running it is the user's consent to do so — but say it out loud before doing it, since posting to GitHub is visible to anyone else on the PR.

In light mode, stop here — skip the posting-mode question entirely. With one wizard and no Scrum Master there is no "full discussion vs. summary" distinction to draw, and asking would be a question with one real answer.

In deep mode only, ask (e.g. via `AskUserQuestion`) whether to post the full wizard discussion or just the final summary:

- **Full discussion (default)** — leading comment, one comment per wizard (Round 1 + Round 2), then the Scrum Master's synthesis comment.
- **Summary only** — skip the individual wizard comments; only the Scrum Master's synthesis comment gets posted. The wizards still run in full internally (Round 1 and Round 2) so the Scrum Master has real findings to synthesize — this mode only changes what's posted to GitHub, not what work happens.

In deep mode the Scrum Master always runs last, after whichever wizards were selected, regardless of posting mode. In light mode it does not run at all — see step 5.5.

## 3. Round 1 — independent reviews

Confirm the effort level with the user unless already specified. Launch the selected wizards in a **single message**, parallel `Agent` tool calls, each with a `name` so they're addressable later. In light mode that is one call, not four:

| `subagent_type` | `name` |
|---|---|
| `wizard-correctness` | `wizard-correctness` |
| `wizard-security` | `wizard-security` |
| `wizard-simplicity` | `wizard-simplicity` |
| `wizard-performance` | `wizard-performance` |

Each gets the same self-contained prompt (they start with zero context — no "based on what we discussed"):

> Review PR #`<number>` ("`<title>`") in this repo along your persona's lens, as defined in your own agent instructions, at `<effort level>` effort. Fetch the diff yourself: `gh pr diff <number>`. Read `CLAUDE.md` and any files you need for real context, not just the diff hunk. Report your findings in the format your instructions specify.

Wait for all results.

## 4. Round 2 — cross-wizard reaction

**Skip this step entirely if fewer than two wizards ran.** A cross-wizard reaction round needs other wizards to react to; with one participant there is nothing to send and nothing to answer. In light mode this step never happens.

For each wizard that ran, `SendMessage` to that wizard's `name` with the other wizards' Round 1 findings (verbatim is fine) and this ask:

> Here's what the other wizards found on this same PR:
> [other reports]
>
> In 2-4 sentences: do you agree or disagree with anything, does it change how you'd prioritize your own findings, or do you have nothing to add? Stay in character, but be substantive — this is a real technical reaction, not flavor text.

Collect all reactions.

## 5. Post to the PR

In **light mode** there is no posting-mode choice: post the single wizard's comment as below, and skip the leading identifier comment — with one comment landing, a separate comment announcing it is noise.

In deep mode, if posting mode is **summary only** (from step 2), skip straight to step 5.5 — none of this step's comments get posted.

Otherwise, one comment per wizard that ran, in this shape, via `gh pr comment <number> --body "..."` (one call per wizard — each lands as its own comment, which is what makes it read as a discussion thread rather than one wall of text):

```
## 🧙 <Persona Name> — <lens, e.g. Correctness>

<Round 1 findings, verbatim>

### Reaction to the others
<Round 2 reply, verbatim>
```

If Round 2 was skipped (fewer than two wizards), **omit the "Reaction to the others" heading entirely** — don't post it with an empty body or a placeholder.

Post them in the order: correctness, security, simplicity, performance (skipping any that didn't run).

In deep mode, post one short leading comment first identifying the run (`Reviewed <headRefOid> — N wizards, <list of which ran>.`) so readers know what they're looking at before the persona comments land. In light mode, fold that identification into the single wizard comment's own header line instead of posting it separately.

## 5.5. Scrum Master synthesis — deep mode only

**Skip this step entirely in light mode.** Spawning a synthesis agent to summarize a single wizard's findings is pure overhead: it re-reads what one agent just said and says it again, at the cost of another cold agent run. With one wizard, that wizard's comment *is* the summary.

This is a deliberate change from the older rule that the Scrum Master always ran last regardless of which reviewers ran. That rule made sense when every run was a four-persona fan-out and synthesis was the only thing making the output readable. It does not survive a one-wizard default.

Launch `wizard-scrummaster` (`Agent` tool, `subagent_type: wizard-scrummaster`) with the PR number, title, and every wizard's Round 1 findings + Round 2 reactions from this run (verbatim). Wait for its result, then post it as one more PR comment via `gh pr comment <number> --body "..."`:

```
## 🧭 Scrum Master — Summary

<Scrum Master's comment, verbatim>
```

Within deep mode this posts regardless of posting mode — it's the one comment that always lands, and in summary-only mode it's the *only* comment that lands (aside from the leading identifier, which summary-only mode also skips — the Scrum Master comment stands alone).

## 6. Report back

Tell the user: the PR link, a one-line tally (e.g. "2 CONFIRMED, 3 PLAUSIBLE across 3 wizards"), and where to look next — this depends on the mode that ran:

- **Light** — point them at the PR for the correctness wizard's comment, and add one line offering `/wizard-review <N> deep` if they want the other three lenses. Say it once; don't push.
- **Deep, full discussion** — point them at the PR for the full wizard-by-wizard discussion.
- **Deep, summary only** — point them at the PR for the Scrum Master's comment specifically (there's no wizard-by-wizard discussion posted to send them to).

Don't re-paste all the full reports into the chat — that defeats the point of posting them.
