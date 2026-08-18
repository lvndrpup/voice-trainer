# 1. Client-side only architecture

## Status

Accepted

## Context

The app processes voice recordings from trans users, a population with
elevated privacy risk. A backend would create a breach surface, a
subpoena surface, and an operating cost, and would require accounts.

## Decision

All processing and storage happen in the browser. No backend, no
accounts, no network calls carrying user data.

## Consequences

**Positive**

- The privacy claim is structural rather than policy-based.
- Roughly 80% of infrastructure disappears.
- Hosting is a static file drop.

**Negative**

- No population priors can be gathered, so they must come from
  published literature or an explicit opt-in export.
- No cross-device sync.
- No server-side compute for heavier DSP.

## Alternatives considered

- **Backend with encryption at rest.** Rejected — still a breach and
  subpoena surface.
- **Optional cloud sync.** Rejected for now, revisit only if user
  demand is strong and it can be end-to-end encrypted.
