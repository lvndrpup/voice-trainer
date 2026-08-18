# Documentation standards

How-to doc: what the documentation rules in
[CLAUDE.md](../CLAUDE.md) mean in practice.

## Diátaxis structure

Every doc has one primary mode. Don't mix them on one page — a reader
looking something up shouldn't have to wade through a tutorial, and a
newcomer following a tutorial shouldn't hit reference-density detail.

- **Tutorial** — learning-oriented, a guided path for someone with no
  context. We don't have one of these yet; the app doesn't exist.
- **How-to** — goal-oriented steps for someone who already knows the
  basics and wants to do a specific thing (this doc is one).
- **Reference** — dry, structural, looked up rather than read start to
  end (e.g. [roadmap.md](./roadmap.md), [calibration.md](./calibration.md)'s
  data model, [backlog.md](./backlog.md)).
- **Explanation** — the "why," discussion of trade-offs and context,
  not meant to be executed (e.g. [strain.md](./strain.md)).

If a doc needs both a procedure and a rationale, split it into
sections under clear headings rather than interleaving them, so each
mode stays skimmable on its own.

## Mermaid vs. prose

Use a Mermaid diagram when the thing being described is structural:
architecture, data flow, state machines, sequences — anything where
the relationships between parts are the point. Use prose when a
diagram would just be boxes with one arrow each; a diagram that adds
shapes without adding clarity is worse than a sentence.

## ADRs (MADR format)

Architectural choices become numbered files in `docs/adr/`, using this
template:

```markdown
# N. Title

## Status
Proposed | Accepted | Superseded by ADR-000M

## Context
What forces are in play — the problem, constraints, prior art.

## Decision
What we're doing.

## Consequences
Positive and negative, stated plainly.

## Alternatives considered
What else was on the table and why it lost.
```

**ADRs are immutable.** Once accepted, never edit the Decision or
Context of an existing ADR — write a new numbered ADR that supersedes
it, and change the old one's Status line to `Superseded by ADR-000M`.
Editing in place destroys the record of why the team once believed
something else, which is the entire value of keeping ADRs at all. See
[0001-client-side-only.md](./adr/0001-client-side-only.md) for a
worked example.

## Reference policy

External links are welcome and encouraged where a real source backs a
claim — they're one of the strongest ways to turn `[likely]` into
something load-bearing. The rule is on *how* a link gets there, not
*whether*: every external link must be one that was actually opened
and read (by a human, or by an agent using a fetch tool) before being
added — never invent a citation, and never add a link on the strength
of a search snippet alone. If a claim is unsourced after a genuine
search, tag it inline as `[likely]` or `[speculative]` rather than
dressing it up with a fake reference. See [decisions.md](./decisions.md)
and [strain.md](./strain.md) for these tags — and citations — in use.

## Relative links, not wikilinks

Use relative Markdown links (`./strain.md`), not `[[wikilinks]]`.
GitHub does not render wikilinks at all; Obsidian resolves relative
links fine. Relative links are the only form that works in both.
