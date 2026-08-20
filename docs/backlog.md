# Backlog

Parked ideas, not abandoned. Everything outside the current milestone
lives here so it stops occupying attention. See [roadmap](./roadmap.md)
for what's actually scheduled.

- Acoustic strain proxies (glottal source measures, perturbation/CPPS) — see [strain.md](./strain.md)
- n=1 strain classifier
- PWA and offline support
- HTTPS dev server for mobile testing. `http://192.168.x.x` is not a
  secure context, so getUserMedia is blocked on a phone over LAN —
  needs `@vitejs/plugin-basic-ssl` or a tunnel.
- Optional on-device LLM for free-text self-report parsing
- Population-prior overlay
- Opt-in anonymised export
- Exercise library sourced from published SLP material
- Terraform/Azure hosting
- Ansible + Molecule self-hosted runner
- GitHub Actions PR review
- Golden-file DSP fixtures

## Claude Code subagents

Candidate `.claude/agents/*.md` beyond the existing wizard-review
persona set (correctness/security/simplicity/performance, reviews
PRs) and the shipped `groomer`, `reviewer`, `ledger-scribe`,
`docs-auditor`, and `debugger` subagents. Parked here rather than
filed as issues since these are dev tooling, not versioned product
scope — pick one, and it graduates straight to a drafted agent file,
no milestone needed.

- **accessibility-tester** — canvas-only UI: keyboard access to
  start/stop, screen-reader labeling, colorblind-safe grayscale
  (already flagged as a "revisit" in [spectrogram.md](./spectrogram.md)).
  Nothing currently covers this axis.
- **dsp-numerics-auditor** — checks a new DSP estimator against
  synthetic/analytic ground truth before ship, ahead of issue #17's
  upcoming LPC/corner-vowel work. Narrower than wizard-correctness's
  general bug hunt.
- *(weaker, optional)* **dependency-gatekeeper** — flags new
  `package.json` deps/bundle size against CLAUDE.md's "ask before
  adding dependencies, no framework" rule. Partial overlap with
  wizard-simplicity; only worth it if that overlap turns out to
  matter in practice.
