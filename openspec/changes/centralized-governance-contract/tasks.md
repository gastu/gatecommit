# Tasks

## 1. Characterize current behavior and add capability inventory

- [x] 1.1 Add regression fixtures for presence, absence, changed-only files, and incomplete inventory for code, TypeScript, application, npm, Wrangler, D1, KV, R2, Drizzle, and GitHub Actions; include negative generic database filename fixtures and verify each signal and its reasoned `N/A` behavior.
- [x] 1.2 Implement explicit capability inventory and dependent-control mapping; verify new changed-file capabilities activate checks in the same invocation and unknown inventory blocks safely.

## 2. Normalize result semantics

- [x] 2.1 Add result-model tests for `PASS`, `BLOCKED`, `REVIEW`, and `N/A`, including review-only success and N/A reason requirements; verify legacy statuses are not emitted.
- [x] 2.2 Implement canonical result reporting and aggregate only `BLOCKED` as closure-blocking; verify final output and exit status for every result combination.

## 3. Centralize global controls and Actionlint

- [x] 3.1 Add regression tests for shared Semgrep/Gitleaks and their regressions, license policy/regression, dependency policy/regression, and npm audit including development dependencies at moderate severity; verify required controls block when missing or failing and report N/A only when their capability is absent.
- [x] 3.2 Implement the shared security and npm control scheduling; verify using focused control tests and ensure derived-project-specific copies are not required.
- [x] 3.3 Add Actionlint presence/absence/failure tests for `.yml` and `.yaml` workflow files; verify workflow presence alone passes scheduling and absence reports N/A.
- [x] 3.4 Implement capability-aware Actionlint execution; verify command invocation and canonical results for present and absent workflows.

## 4. Define project and maintainer test contracts

- [x] 4.1 Add tests for `test:unit`/`test`, mandatory application lint/unit absence, optional project checks, ordered `gatecommit.checks`, missing/failing scripts, and contract-required versus optional smoke tests; verify project-owned commands run without embedding domain rules.
- [x] 4.2 Add GateCommit maintainer-profile tests proving its unit/regression suite executes independently of application detection while applicable global controls remain enforced; verify a missing required global control still blocks.
- [x] 4.3 Implement the project-owned and maintainer test contracts and document their script selection; verify GateCommit self-gating, a derived application fixture, and explicit migration of 1.0.5 auto-run checks.

## 5. Preserve hooks and Git lifecycle

- [x] 5.1 Add hook tests for one `.githooks` path and internal anti-recursion; verify internal commits bypass only the child hook and external commits invoke the canonical gate.
- [x] 5.2 Add/retain Git lifecycle regressions for preflight, blocked checks, concurrent changes, upstream-only push, no empty commit, and failed-push recovery; verify no reset, clean, checkout, remote rewrite, upstream setup, or force push occurs.
- [x] 5.3 Implement only lifecycle changes needed to satisfy the contract; verify the complete Git sync regression suite passes without removing existing guarantees.

## 6. Document compatibility and complete integration

- [x] 6.1 Document Blueprint handoff compatibility, canonical statuses, capability signals, project-owned test contract, 1.0.x migration requirements, maintainer tests, and explicit Graphify/OpenSpec lifecycle; verify documentation matches `docs/gatecommit-handoff.json` at Blueprint commit `37dea8fa033f4494a3ab8e3c3a6f24115751a05d`.
- [x] 6.2 Verify no derived repository is changed and no existing project-owned check disappears without an explicit migration route; inspect final diff, package allowlist, and test coverage.
- [x] 6.3 Run `openspec validate centralized-governance-contract`, GateCommit's focused and full test suite, the GateCommit gate, and Graphify post-change update; verify no blocking findings and synchronized Git state before authorized closure.

## 7. Corrective review findings

- [x] 7.1 Remove ambiguous D1 filename signals and verify generic `database.json`, `databases.json`, and unrelated `d1.json` produce D1 `N/A`.
- [x] 7.2 Implement and document the ordered `gatecommit.checks` contract; verify ordering, all-check execution after failure, missing/failing script blocks, empty-list `N/A`, and 1.0.5 check migration coverage.
- [x] 7.3 Keep application lint/unit requirements mandatory with actionable migration failures; document the 1.x-to-2.0.0 checklist without changing derived repositories.
- [x] 7.4 Restrict npm package contents to runtime and required regression artifacts; verify with `npm pack --dry-run`.

## 8. Apply project-owned checks to every profile

- [x] 8.1 Run the shared `gatecommit.checks` implementation after profile-specific checks for application and documentation profiles.
- [x] 8.2 Add documentation-profile regression fixtures for absent, passing, ordered multiple, missing, and failing checks, including a migrated `test:contract` or `validate:derived-contract` script.
- [x] 8.3 Update the 1.0.5 migration guidance and verify the full test suite, maintainer self-test, OpenSpec, package contents, and Graphify for both profiles.
