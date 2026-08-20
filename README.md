# Resonance Scope

*Working name — see [docs/decisions.md](docs/decisions.md) for the open question on what this project is ultimately called.*

A browser-based voice analysis and training instrument for vocal feminization — a real-time spectrogram and pitch readout in the spirit of Overtone Analyzer, VoceVista Video Pro, and Voice Tools, with the memory, personal calibration, and progressive coaching those tools don't have.

**Everything runs client-side.** Your audio never leaves your browser — no backend, no accounts, no network calls carrying your data. See [CLAUDE.md](CLAUDE.md) for the full set of non-negotiables this project holds itself to.

The app describes what it hears; it doesn't grade you. There are no scores, no performance streaks, no "personal best pitch" — see [docs/decisions.md](docs/decisions.md) for why.

## Status

v0.2 shipped (of the plan in [docs/roadmap.md](docs/roadmap.md)): mic capture, a scrolling log-frequency spectrogram, a live F0 readout, and IndexedDB session storage with export/delete. v0.3 is in progress — the full 6-step calibration engine (including corner-vowel formant capture, LPC-based) and its IndexedDB store have landed, but the wizard UI itself (`index.html`/`main.ts` wiring) hasn't, so there's no user-facing calibration flow yet. Still pre-1.0 — expect rough edges, and see the roadmap for what's next.

This paragraph is a snapshot, not a live source — the roadmap describes *intent* and can drift out of date. [docs/ledger.md](docs/ledger.md) is the append-only, per-issue record of what's actually shipped, anchored to real commit SHAs.

## Getting started

```
npm install
npm run dev
```

Opens at `http://localhost:5173`. Click **Start capture**, allow microphone access, and you should see your own spectrogram and pitch readout live.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run lint` | ESLint (flat config, `typescript-eslint` strict + stylistic) |
| `npm run typecheck` | `tsc -b` |
| `npm run test` | Unit tests (Node's built-in test runner) over pure functions — DSP and export serialization |
| `npm run test:e2e` | Playwright, against a real headless Chromium with a synthetic mic — the browser-only paths (`getUserMedia`, IndexedDB) `npm run test` can't reach |
| `npm run build` | Typecheck, then production build |
| `npm run preview` | Serve the production build locally |

See [docs/testing.md](docs/testing.md) for what each suite actually covers, and [docs/index.md](docs/index.md) for the full documentation set.

## Architecture

Vite + TypeScript, no UI framework, Canvas 2D. Modules with enforced import boundaries — `src/audio` (Web Audio, the only place that touches it), `src/dsp` (pure functions, headlessly testable), `src/render` (Canvas), `src/store` (IndexedDB, every persisted type carries a `schemaVersion`). Full details, the current module list, the layer model, and every ADR are in [docs/index.md](docs/index.md) — start there for anything architectural, since the list here goes stale the moment a new module lands and this file isn't the source of truth for it (see "Docs vs. specs," below).

## Contributing

Solo project today, but it's built to hold up if that changes:

- Conventional Commits, one branch per issue (`feat/`, `fix/`, `docs/`, `chore/` + a short kebab description), squash merge.
- Every PR-sized change updates docs in the same commit — see [docs/documentation-standards.md](docs/documentation-standards.md).
- PRs use [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md): every test plan item needs concrete steps, where to look, and the expected result, not just a checkbox.
- **Docs vs. specs**: reference docs (the ones listed in [docs/index.md](docs/index.md), written alongside the code they describe) plus the code itself and [docs/ledger.md](docs/ledger.md) are ground truth for what's actually shipped. [docs/roadmap.md](docs/roadmap.md), [docs/decisions.md](docs/decisions.md), and [docs/backlog.md](docs/backlog.md) describe intent — useful for direction, not proof something exists. See CLAUDE.md's "Docs vs. specs" rule.

If you're working in this repo with [Claude Code](https://claude.com/claude-code), repo-specific tooling lives in `.claude/`:

- **`/wizard-review [PR#]`** — four reviewer personas (correctness, security, simplicity, performance) independently review a PR, react to each other's findings, then a Scrum Master persona synthesizes the discussion, and the whole thing posts as comments on the PR itself.
- **`/wizard-act [PR#]`** — follow-up to `/wizard-review`: reads the Scrum Master's summary and the wizard/human comments, checks which findings still hold against current code, then proposes concrete fixes in plan mode before editing anything.
- `groomer`, `reviewer`, `ledger-scribe`, `docs-auditor`, `accessibility-tester`, `dsp-numerics-auditor`, and `debugger` subagents — turning a roadmap item into a Ready issue, reviewing a diff against its issue's acceptance criteria, appending `docs/ledger.md` rows after a PR merges, sweeping the whole `docs/` tree for Diátaxis/ADR/link/diagram drift, auditing the canvas-only UI for keyboard/screen-reader/colorblind-contrast access, validating a DSP estimator against synthetic/analytic ground truth, and reproducing/root-causing a live failure, respectively.
- A merge gate (`.claude/hooks/check-test-plan.sh`) blocks `gh pr merge`/`gh pr close` from a Claude Code session while the PR's Test plan section still has unchecked boxes. It only constrains Claude Code — merging by hand on GitHub is unaffected.

## License

Not yet decided — see the open question in [docs/decisions.md](docs/decisions.md). Don't assume permissive reuse until this is resolved.
