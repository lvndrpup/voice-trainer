---
name: wizard-act
description: Turn a /wizard-review pass into action — read the Scrum Master's bottom line and every wizard/human comment on a PR, check which findings still hold against current code, then use plan mode to propose concrete fixes for approval before editing anything. Invoke as /wizard-act [PR number].
---

Closes the loop that `wizard-review` deliberately leaves open. That skill posts findings; it never touches code. This one reads what got posted, figures out what's actually actionable right now, and — after you approve a plan — makes the edits.

You always run this yourself, after reading the review. Nothing here auto-triggers off `wizard-review` finishing — plan mode's approval step only means something if a human chose to ask for it.

## 1. Resolve the target PR

Same rule as `wizard-review`: if an argument looks like a number, that's the PR; otherwise resolve the current branch's PR via `gh pr view --json number,title,headRefOid,url`. If neither works, tell the user and stop.

## 2. Gather the discussion

`gh pr view <n> --json title,body,comments` (and `gh pr diff <n>` for the current diff). From the comments, separate three things:

- **The Scrum Master's Bottom Line** — the comment headed `## 🧭 Scrum Master — Summary`. This is the macro directive: mergeable as-is, blocked on something specific, or fine with minor notes.
- **Wizard findings** — comments headed `## 🧙 <Persona> — <lens>`, each with CONFIRMED/PLAUSIBLE findings and file:line claims.
- **Human comments** — anything else, including the PR author's own replies. Weight these at least as high as wizard findings — a human saying "actually that's intentional" overrides a wizard's guess.

If there's no Scrum Master comment on the PR, tell the user this PR hasn't been through `/wizard-review` (or the comment predates it) and ask whether to proceed on human comments alone or stop.

## 3. Reconcile against current code — don't trust the comments blindly

Comments can be stale by the time you run this (more commits may have landed since). For each finding with a concrete file:line claim:

- Read the file at its current state. Confirm the issue is still there, was already fixed, or the referenced lines have moved/changed meaning.
- Trace one level of dependency out — callers, related state, anything the comment's author didn't check — so the plan doesn't fix a symptom the SM's bottom line actually points upstream of.

Sort findings into two buckets:

- **Actionable** — concrete claim, confirmed still present, clear fix. These go into the plan.
- **Flagged, not actioned** — vague opinion ("consider simplifying this"), disputed, already stale, or the fix isn't obvious enough to propose without more input. These get listed for the user, not silently dropped and not silently auto-fixed.

## 4. Enter plan mode

Call `EnterPlanMode`. Once in plan mode, write a plan file covering:

- One line: the Scrum Master's bottom line, verbatim or near-verbatim.
- The actionable findings, grouped by file, each as a concrete change (not "improve X" — say what the diff will actually do).
- The flagged-not-actioned list, with why each was left out.
- Which of `npm run lint` / `npm run typecheck` / `npm test` apply to the files being touched, so the user knows what will run after approval.

Then call `ExitPlanMode` to request approval. If the user redirects instead of approving outright, treat that as new input to bucket 3 and revise before re-exiting.

## 5. On approval — execute

- Make the edits from the approved plan. Nothing outside its scope — if you notice something else worth fixing while in there, mention it at the end, don't fold it in unasked.
- Run whichever of lint/typecheck/test apply to the touched files. Report pass/fail plainly; don't silently swallow a failure.
- Per CLAUDE.md, update docs in the same change if the edit touches anything documented (reference docs, ADRs, ledger).

## 6. Report back — don't auto-post

Summarize what changed and the test/lint results in the chat. Ask (`AskUserQuestion`) whether to post a short "addressed in `<sha>`" comment back to the PR noting which findings were resolved — don't post it unprompted. This mirrors `wizard-review`'s own rule: posting to a shared PR thread is a visible action and gets explicit consent each time, not just once.
