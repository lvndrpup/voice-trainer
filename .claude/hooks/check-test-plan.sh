#!/usr/bin/env bash
# PreToolUse hook (Bash matcher). Blocks `gh pr merge`/`gh pr close` while
# the target PR's "## Test plan" section still has unchecked "- [ ]" items.
# See CLAUDE.md's Git section and .github/PULL_REQUEST_TEMPLATE.md.
set -euo pipefail

input="$(cat)"
command="$(printf '%s' "$input" | jq -r '.tool_input.command // empty')"

if ! printf '%s' "$command" | grep -qE 'gh[[:space:]]+pr[[:space:]]+(merge|close)\b'; then
  exit 0
fi

# An explicit PR number or URL argument (e.g. `gh pr merge 14 --squash`)
# takes precedence; otherwise gh resolves the PR for the current branch.
pr_ref="$(printf '%s' "$command" \
  | grep -oE 'gh[[:space:]]+pr[[:space:]]+(merge|close)[[:space:]]+[^[:space:]]+' \
  | awk '{print $4}' || true)"
if ! printf '%s' "$pr_ref" | grep -qE '^[0-9]+$|^https://'; then
  pr_ref=""
fi

if [ -n "$pr_ref" ]; then
  body="$(gh pr view "$pr_ref" --json body -q .body 2>/dev/null || true)"
else
  body="$(gh pr view --json body -q .body 2>/dev/null || true)"
fi

# Can't determine the PR (no gh auth, no PR for this branch, bad ref) —
# don't block on something we can't verify; gh's own error will surface.
if [ -z "$body" ]; then
  exit 0
fi

plan="$(printf '%s\n' "$body" | awk '/^## [Tt]est [Pp]lan/{f=1; next} /^## /{f=0} f')"
unchecked="$(printf '%s\n' "$plan" | grep -E '^[[:space:]]*-[[:space:]]*\[ \]' || true)"

if [ -n "$unchecked" ]; then
  reason="Test plan has unchecked items:
$unchecked

Complete or explicitly resolve these before merging/closing (see CLAUDE.md's Git section and .github/PULL_REQUEST_TEMPLATE.md)."
  jq -n --arg reason "$reason" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
fi

exit 0
