---
name: wizard-review
description: Run a multi-persona code review against a PR — up to four wizard-coder reviewer agents (correctness, security, simplicity, performance), each independent, then a short cross-wizard reaction round, then a Scrum Master synthesis comment, posted as real discussion on the GitHub PR. Invoke as /wizard-review [PR number].
---

Multi-agent PR review for this repo, with distinct reviewer personas that actually read and react to each other, not independent reports pretending to be a discussion — closed out by a plain-English Scrum Master summary.

## 1. Resolve the target PR

- If an argument was given and looks like a number, that's the PR.
- Otherwise resolve the current branch's PR: `gh pr view --json number,title,headRefOid,url`.
- If neither works, tell the user there's no PR to review (open one first, or pass a number) and stop — don't guess.

Fetch `number`, `title`, `headRefOid` (short SHA for the intro comment), and `url`.

## 2. Tell the user what's about to happen, and check posting mode

One line: which PR (number + title), which wizard agents are about to review it, and that findings will be posted as real comments on that PR. This skill exists specifically to post those comments — running it is the user's consent to do so — but say it out loud before doing it, since posting to GitHub is visible to anyone else on the PR.

Also ask (e.g. via `AskUserQuestion`) whether to post the full wizard discussion or just the final summary:

- **Full discussion (default)** — leading comment, one comment per wizard (Round 1 + Round 2), then the Scrum Master's synthesis comment.
- **Summary only** — skip the individual wizard comments; only the Scrum Master's synthesis comment gets posted. The wizards still run in full internally (Round 1 and Round 2) so the Scrum Master has real findings to synthesize — this mode only changes what's posted to GitHub, not what work happens.

The Scrum Master step itself is never optional — it always runs last, after whichever wizards were selected, regardless of posting mode.

## 3. Round 1 — independent reviews

Per CLAUDE.md, clarify with the user which of the four reviewer wizards to include and what effort level they should use, unless already specified. Launch the selected ones in a **single message**, parallel `Agent` tool calls, each with a `name` so they're addressable later:

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

For each wizard that ran, `SendMessage` to that wizard's `name` with the other wizards' Round 1 findings (verbatim is fine) and this ask:

> Here's what the other wizards found on this same PR:
> [other reports]
>
> In 2-4 sentences: do you agree or disagree with anything, does it change how you'd prioritize your own findings, or do you have nothing to add? Stay in character, but be substantive — this is a real technical reaction, not flavor text.

Collect all reactions.

## 5. Post to the PR

If posting mode is **summary only** (from step 2), skip straight to step 5.5 — none of this step's comments get posted.

Otherwise, one comment per wizard that ran, in this shape, via `gh pr comment <number> --body "..."` (one call per wizard — each lands as its own comment, which is what makes it read as a discussion thread rather than one wall of text):

```
## 🧙 <Persona Name> — <lens, e.g. Correctness>

<Round 1 findings, verbatim>

### Reaction to the others
<Round 2 reply, verbatim>
```

Post them in the order: correctness, security, simplicity, performance (skipping any that didn't run).

Post one short leading comment first identifying the run (`Reviewed <headRefOid> — N wizards, <list of which ran>.`) so readers know what they're looking at before the persona comments land.

## 5.5. Scrum Master synthesis — always runs

Launch `wizard-scrummaster` (`Agent` tool, `subagent_type: wizard-scrummaster`) with the PR number, title, and every wizard's Round 1 findings + Round 2 reactions from this run (verbatim). Wait for its result, then post it as one more PR comment via `gh pr comment <number> --body "..."`:

```
## 🧭 Scrum Master — Summary

<Scrum Master's comment, verbatim>
```

This posts regardless of posting mode — it's the one comment that always lands, and in summary-only mode it's the *only* comment that lands (aside from the leading identifier, which summary-only mode also skips — the Scrum Master comment stands alone).

## 6. Report back

Tell the user: the PR link, a one-line tally (e.g. "2 CONFIRMED, 3 PLAUSIBLE across 3 wizards"), and where to look next — this depends on posting mode:

- **Full discussion** — point them at the PR for the full wizard-by-wizard discussion.
- **Summary only** — point them at the PR for the Scrum Master's comment specifically (there's no wizard-by-wizard discussion posted to send them to).

Don't re-paste all the full reports into the chat — that defeats the point of posting them.
