# Proposal

## Why

GateCommit v1.0.5 implements a partial, script-name-dependent gate that conflicts with Blueprint's current handoff: it rejects GitHub Actions workflows, does not detect all supported capabilities, and does not execute the full global npm/security policy. Issue gastu/gatecommit#1 requires one verifiable contract before derived repositories can safely adopt GateCommit as their shared implementation.

## What Changes

- Define observable capability detection and a stable `PASS`, `BLOCKED`, `REVIEW`, `N/A` result model.
- Centralize Semgrep, Gitleaks, license policy, npm audit, and dependency policy, including their applicable regression checks.
- Make Actionlint capability-aware: run for workflow YAML files and report `N/A` when none exist.
- Define stable contracts for project-owned unit tests and an ordered `gatecommit.checks` list for additional integration, domain, data, HTTP, deploy, and explicitly required smoke checks.
- Document the mandatory application lint/unit migration checks and the complete 1.x-to-2.0.0 project review path.
- Specify GateCommit's own implementation-test contract separately from derived application capability checks, without exempting it from global controls.
- Preserve a single `.githooks` integration, the internal-commit anti-recursion guard, and the existing safe Git lifecycle.
- Define Graphify and OpenSpec pre-change/post-change lifecycle requirements and compatibility with Blueprint-derived projects.
- **BREAKING:** replace legacy result labels (`FAIL`, `WARN`, `NOT_APPLICABLE`, `SKIP`) in the public gate output with the canonical result labels.

## Capabilities

### New Capabilities

- `governance-controls`: Defines capability signals, global controls, applicability, Actionlint, npm policy, and result semantics.
- `project-contract-and-lifecycle`: Defines project-owned tests, GateCommit self-tests, hook behavior, anti-recursion, Git closure, Graphify/OpenSpec lifecycle, and derived-project compatibility.

### Modified Capabilities

None. GateCommit has no existing OpenSpec specifications.

## Impact

The implementation is expected to affect the gate runner and capability detection in `scripts/blueprint-gate.mjs`, Git behavior in `scripts/git-sync.mjs`, file inventory in `scripts/git-delta.mjs`, tests, package scripts, and project documentation. The normative input is Blueprint commit `37dea8fa033f4494a3ab8e3c3a6f24115751a05d`, especially `docs/GATECOMMIT-HANDOFF.md`, `docs/gatecommit-handoff.json`, and archived change `centralize-development-governance`. No derived repository, deployment, or automatic merge is in scope.
