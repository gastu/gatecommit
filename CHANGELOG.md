# Changelog

## 2.0.1

- Fix Wrangler binding duplicate validation so base and named environments are independent scopes for D1, KV, and R2.
- Add project-wide and per-declared-check timeout configuration, bounded process-tree termination, and cleanup.
- Preserve GateCommit 2.0.0 result semantics, controls, project checks, and safe Git lifecycle.

## 2.0.0

- **BREAKING:** replace legacy gate outcomes with `PASS`, `BLOCKED`, `REVIEW`, and `N/A`.
- Centralize capability-aware Semgrep, Gitleaks, license, dependency, npm audit, and Actionlint checks.
- Add project-owned and GateCommit maintainer test contracts, and document hooks and lifecycle behavior.
