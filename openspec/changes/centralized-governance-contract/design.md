# Design

## Context

See proposal.md - Why. GateCommit v1.0.5 places capability heuristics, check selection, result aggregation, and profile behavior in `scripts/blueprint-gate.mjs`; file inventory is provided by `scripts/git-delta.mjs`, and Git state/snapshot/synchronization is handled in `scripts/git-sync.mjs`. Current results use `FAIL`, `WARN`, and `NOT_APPLICABLE`. Application checks depend partly on npm script aliases, GitHub Actions presence is currently rejected, and there is a separate documentation profile. Blueprint's handoff is `docs/gatecommit-handoff.md` plus `docs/gatecommit-handoff.json` at commit `37dea8fa033f4494a3ab8e3c3a6f24115751a05d`.

## Goals / Non-Goals

**Goals:**

- Preserve the existing safe Git snapshot and upstream synchronization behavior while making check applicability explicit.
- Give every capability and result an observable, regression-testable contract.
- Keep global-policy implementation centralized and project behavior/tests project-owned.
- Keep GateCommit maintainer tests runnable without misclassifying the repository as a derived application.

**Non-Goals:**

- Migrating or editing any derived repository.
- Replacing Blueprint's normative rules or introducing a GateCommit-only policy exception.
- Deploying, publishing a release, or merging the change.

## Decisions

### Capability inventory is independent from execution

Compute a complete inventory from tracked and changed files plus manifests/configuration before scheduling controls. Model each signal and dependent control explicitly, including unknown/incomplete inventory as blocking rather than false absence. This avoids today's problem where a missing script alias or partial file list can silently make a control inapplicable.

### Separate shared controls from project contract checks

Keep global controls (security, license, npm, dependency, Actionlint) owned by GateCommit. Application capability continues to require a lint script (`lint:eslint` or `lint`) and a unit-test script (`test:unit` or `test`), as Blueprint's handoff requires. Additional project-owned checks use the ordered `gatecommit.checks` array of npm script names; GateCommit validates, runs each in declaration order, and never embeds project/domain script names. The list cannot repeat canonical lint, unit, or build checks, or duplicate the separately declared smoke check. A missing or failing declared check blocks; an absent or empty list is N/A. GateCommit's own repository uses a maintainer test contract that runs its unit/regression suite regardless of derived application classification; it receives no exemption from global controls.

The 1.x-to-2.0.0 migration checklist explicitly carries forward project-owned scripts formerly run by GateCommit 1.0.5. Projects declare integration, HTTP, remote/deploy contract, and other required checks in `gatecommit.checks`; they add missing mandatory application lint/unit scripts rather than weakening GateCommit's application requirements. Build and D1 checks retain their existing contract fields.

### Normalize result records before aggregation

Use the canonical statuses directly at reporting and aggregation boundaries. Only `BLOCKED` affects the exit code and Git closure; `REVIEW` is visible but does not block, and `N/A` requires a reason. Do not preserve legacy aliases as externally reported statuses because they obscure the Blueprint contract.

### Treat Actionlint as a capability control

Enumerate workflow YAML files directly in `.github/workflows`; invoke Actionlint only when any exist. Do not prohibit workflows as a blanket policy. Missing Actionlint for a present workflow capability is blocking.

### Preserve and strengthen the existing Git transaction boundary

Retain the preflight, initial snapshot, and post-validation snapshot comparison before any staging. A blocked check or changed snapshot exits before Git mutations. Keep the existing configured-upstream-only push behavior and internal hook marker; extend tests around every boundary before changing behavior.

### Keep tool lifecycle outside automatic hooks

Graphify is an explicit pre-change and post-structural-change operation, not a competing post-commit hook. OpenSpec planning validation precedes implementation and sync/archive precedes closure. Neither is treated as a substitute for project tests or as a new runtime gate on every commit.

## Risks / Trade-offs

- [Capability false negatives] → Test each signal with presence, absence, changed-only, and incomplete-inventory fixtures.
- [Policy migration weakens self-validation] → Run GateCommit's maintainer tests while preserving every applicable global control; test that missing mandatory shared controls block.
- [Result compatibility changes consumers] → Document the status vocabulary and test all output/result consumers before removing legacy names.
- [Gate complexity grows] → Keep detection, control scheduling, aggregation, and Git closure as separately testable responsibilities.
- [External scanners unavailable locally] → Report required-tool failures as `BLOCKED`; do not silently skip a present capability.

## Migration Plan

1. Add characterization/regression coverage for existing check selection, output, and Git lifecycle.
2. Implement capability inventory and canonical result records; verify detector and aggregation tests.
3. Route global controls and Actionlint through capability-aware scheduling; test each applicable/absent branch.
4. Add project-owned and GateCommit maintainer test contracts, with tests for missing, optional, and required commands.
5. Preserve hooks and Git lifecycle while adding failure and concurrency regressions.
6. Update documentation and compare the completed behavior to Blueprint's machine-readable handoff.
7. Run OpenSpec validation, GateCommit's complete test/gate suite, Graphify update, then normal Git closure when implementation phase is authorized.

Rollback retains the prior implementation until equivalent coverage passes. Do not remove existing checks or local controls in derived projects as part of this change.

## Open Questions

None. Scanner invocation, npm audit flags, capability signals, status behavior, test contract, and Git guarantees are defined by the Blueprint handoff and issue acceptance criteria.
