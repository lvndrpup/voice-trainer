#!/usr/bin/env bash
# PreToolUse hook (Bash matcher). Scoped via subagent frontmatter, not
# global settings.json — only fires while a read-only-tagged subagent
# (groomer, reviewer, docs-auditor, dsp-numerics-auditor) is running.
# See docs/decisions.md for the full threat model and why debugger and
# accessibility-tester are handled differently.
#
# Denies shell-level write primitives — a mutating command, or output
# redirected outside /tmp — so "read-only"/"never edit files" is a
# real tool-level boundary for the common accidental-edit vectors, not
# prose alone. This is NOT a sandbox: it inspects the literal Bash
# command string, so it can't see file writes made by a spawned
# interpreter's own APIs (e.g. fs.writeFileSync inside a `node -e`
# script, or npm run build's internal output). It closes the "typo'd
# a sed -i", "ran git commit by habit", "redirected output into a
# tracked file" class of accident, not every possible way a shell
# command could ultimately cause a write.
set -euo pipefail

input="$(cat)"
command="$(printf '%s' "$input" | jq -r '.tool_input.command // empty')"

deny() {
  jq -n --arg reason "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
}

if [ -z "$command" ]; then
  exit 0
fi

# Mutating commands, matched as a command word (start of string or
# after a shell separator: ; & | && ||), not merely a substring —
# e.g. "grep -rn rm " shouldn't trip this.
if printf '%s' "$command" | grep -qE '(^|[;&|]{1,2}[[:space:]]*)(rm|mv|cp|sed[[:space:]]+-i|git[[:space:]]+(add|commit|push|reset|checkout|stash|apply|clean|rm))\b'; then
  deny "This agent is read-only. \"$command\" looks like a write/mutate command, which is outside its job. If this is a false positive, tell the user rather than working around it."
fi

# Redirection to a path outside /tmp — dsp-numerics-auditor's own
# instructions explicitly allow /tmp scratch scripts; nothing else
# these agents do should ever write anywhere.
targets="$(printf '%s' "$command" | grep -oE '>>?[[:space:]]*[^[:space:]|&;]+' | sed -E 's/^>+[[:space:]]*//' || true)"
if [ -n "$targets" ]; then
  while IFS= read -r target; do
    case "$target" in
      /tmp/*|/dev/null|"") ;;
      *)
        deny "This agent is read-only. \"$command\" redirects output outside /tmp (to \"$target\"). If this is a false positive, tell the user rather than working around it."
        ;;
    esac
  done <<< "$targets"
fi

exit 0
