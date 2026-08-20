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
# prose alone. This is NOT a sandbox and not a real shell parser: it
# regex-matches the literal Bash command string, so (a) it can't see
# file writes made by a spawned interpreter's own APIs (fs.writeFileSync
# inside `node -e`, `python3 -c 'open(...).write()'`, npm run build's
# internal output — any interpreter, not just node) and (b) command
# names are matched as bare words anywhere in the string, not scoped to
# "the thing actually being executed" the way a real parser would —
# deliberately: a wizard-correctness review found the original
# separator-anchored version bypassable via command substitution
# ($(rm ...), backticks) and leading whitespace on a line, and the fix
# (match as a word, unanchored) trades a higher false-positive rate
# (e.g. a grep search whose pattern literally contains "rm") for
# closing those bypasses — the safe direction for a write-prevention
# gate, and a denial just tells the agent to report it as a possible
# false positive, not a dead end.
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

# Mutating commands, matched as a bare word anywhere in the string
# (word-boundary, not substring — "grep -rn rm " still shouldn't trip
# the *substring* case, but genuinely does trip this on purpose now,
# since "rm" as its own word is exactly as ambiguous as "rm" as a
# command; see the module comment above). `git` allows up to ~40 chars
# of anything-but-a-shell-separator between it and the subcommand
# (rather than enumerating flag shapes) so a value-taking global flag
# like `git -C /tmp commit` doesn't slip past a "flag, no value"
# assumption — bounded, and excluding `;&|`, so it can't reach across
# into an unrelated later command in the same string.
if printf '%s' "$command" | grep -qE '\b(rm|mv|cp|tee)\b|\bsed\b[[:space:]]+-i\b|\bgit\b[^;&|]{0,40}\b(add|commit|push|reset|checkout|stash|apply|clean|rm)\b'; then
  deny "This agent is read-only. \"$command\" looks like a write/mutate command, which is outside its job. If this is a false positive, tell the user rather than working around it."
fi

# Redirection to a path outside /tmp — dsp-numerics-auditor's own
# instructions explicitly allow /tmp scratch scripts; nothing else
# these agents do should ever write anywhere. Covers plain >/>>, and
# fd-qualified/combined forms (2>, &>, 1>>).
targets="$(printf '%s' "$command" | grep -oE '[0-9]?&?>>?[[:space:]]*[^[:space:]|&;]+' | sed -E 's/^[0-9]?&?>+[[:space:]]*//' || true)"
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
