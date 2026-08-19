---
name: wizard-review
description: Run a multi-persona code review against a PR — four wizard-coder reviewer agents (correctness, security, simplicity, performance), each independent, then a short cross-wizard reaction round, posted as real discussion on the GitHub PR. Invoke as /wizard-review [PR number].
---

Multi-agent PR review for this repo, with four distinct reviewer personas that actually read and react to each other, not four independent reports pretending to be a discussion.

## 1. Resolve the target PR

- If an argument was given and looks like a number, that's the PR.
- Otherwise resolve the current branch's PR: `gh pr view --json number,title,headRefOid,url`.
- If neither works, tell the user there's no PR to review (open one first, or pass a number) and stop — don't guess.

Fetch `number`, `title`, `headRefOid` (short SHA for the intro comment), and `url`.

## 2. Tell the user what's about to happen

One line: which PR (number + title), that four wizard agents are about to review it, and that findings will be posted as real comments on that PR. This skill exists specifically to post those comments — running it is the user's consent to do so — but say it out loud before doing it, since posting to GitHub is visible to anyone else on the PR.

## 3. Round 1 — independent reviews

Launch all four in a **single message**, parallel `Agent` tool calls, each with a `name` so they're addressable later:

| `subagent_type` | `name` |
|---|---|
| `wizard-correctness` | `wizard-correctness` |
| `wizard-security` | `wizard-security` |
| `wizard-simplicity` | `wizard-simplicity` |
| `wizard-performance` | `wizard-performance` |

Each gets the same self-contained prompt (they start with zero context — no "based on what we discussed"):

> Review PR #`<number>` ("`<title>`") in this repo along your persona's lens, as defined in your own agent instructions. Fetch the diff yourself: `gh pr diff <number>`. Read `CLAUDE.md` and any files you need for real context, not just the diff hunk. Report your findings in the format your instructions specify.

Wait for all four results.

## 4. Round 2 — cross-wizard reaction

For each wizard, `SendMessage` to that wizard's `name` with the other three's Round 1 findings (verbatim is fine) and this ask:

> Here's what the other three wizards found on this same PR:
> [other three reports]
>
> In 2-4 sentences: do you agree or disagree with anything, does it change how you'd prioritize your own findings, or do you have nothing to add? Stay in character, but be substantive — this is a real technical reaction, not flavor text.

Collect all four reactions.

## 5. Post to the PR

One comment per wizard, in this shape, via `gh pr comment <number> --body "..."` (four separate calls — each lands as its own comment, which is what makes it read as a discussion thread rather than one wall of text):

```
## 🧙 <Persona Name> — <lens, e.g. Correctness>

<Round 1 findings, verbatim>

### Reaction to the others
<Round 2 reply, verbatim>
```

Post them in the order: correctness, security, simplicity, performance.

Optionally, post one short leading comment first identifying the run (`Reviewed <headRefOid> — 4 wizards, correctness/security/simplicity/performance.`) so readers know what they're looking at before the four persona comments land.

## 6. Report back

Tell the user: the PR link, a one-line tally (e.g. "2 CONFIRMED, 3 PLAUSIBLE across 4 wizards"), and point them at the PR for the full discussion. Don't re-paste all four full reports into the chat — that defeats the point of posting them.
