# Spec Delta

## Purpose

Defines how GateCommit determines which shared governance controls apply and how it reports their outcomes consistently across GateCommit and derived projects.

## ADDED Requirements

### Requirement: Capabilities SHALL be detected from observable project signals

GateCommit SHALL detect code, TypeScript, application, npm dependencies, Wrangler, D1, KV, R2, Drizzle, and GitHub Actions from versioned and current changed files plus applicable manifest/configuration signals defined by the Blueprint handoff. Detection SHALL be recomputed so newly added capabilities apply before closure. A missing capability SHALL cause its dependent checks to report `N/A` with a reason.

D1 SHALL be present only when Wrangler configuration declares `d1_databases` or an explicitly D1-named project script provides equivalent unambiguous evidence. Generic `database.json`, `databases.json`, or unrelated `d1.json` filenames alone SHALL NOT activate D1.

#### Scenario: Newly changed source adds a capability
- **WHEN** a supported capability exists only in a current changed file
- **THEN** GateCommit detects it and runs its required applicable checks in that invocation

#### Scenario: Capability is absent
- **WHEN** a capability's observable signals are absent from the project
- **THEN** dependent controls report `N/A` with an explanatory reason

#### Scenario: Capability inventory is unavailable
- **WHEN** GateCommit cannot establish a reliable complete file inventory
- **THEN** it MUST NOT infer that a capability is absent and MUST report a blocking detection error for checks whose applicability cannot be established

### Requirement: Global security and dependency controls SHALL be provided by GateCommit

GateCommit SHALL provide Semgrep and its regression, Gitleaks and its secret regression, license policy and its regression, dependency policy and its regression, and npm audit as shared controls. Npm audit SHALL use `npm audit --include=dev --audit-level=moderate`. These implementations MUST NOT depend on derived projects carrying adapted copies of the global policy. Controls SHALL be `N/A` only when their required capability is absent; a missing or failed required control for a present capability SHALL be `BLOCKED`.

#### Scenario: Code capability is present
- **WHEN** the project contains supported code
- **THEN** GateCommit runs Semgrep, its regression, Gitleaks, and its secret regression

#### Scenario: Npm dependencies are present
- **WHEN** direct dependencies exist in dependencies, devDependencies, optionalDependencies, or peerDependencies
- **THEN** GateCommit applies license and dependency policy controls and runs `npm audit --include=dev --audit-level=moderate`

#### Scenario: Npm dependencies are absent
- **WHEN** no direct npm dependencies exist
- **THEN** npm-specific controls report `N/A` with a reason

#### Scenario: Required control is unavailable
- **WHEN** a global control required for a present capability is missing or fails
- **THEN** GateCommit reports `BLOCKED` and prevents Git closure

### Requirement: GitHub Actions validation SHALL be capability-aware

GateCommit SHALL run Actionlint when one or more `.yml` or `.yaml` workflow files exist directly under `.github/workflows/`. Workflow presence by itself MUST NOT be treated as failure. When no workflow files exist, Actionlint SHALL report `N/A` with a reason.

#### Scenario: Valid workflows exist
- **WHEN** workflow YAML files exist and Actionlint succeeds
- **THEN** the Actionlint control reports `PASS`

#### Scenario: Invalid workflows exist
- **WHEN** workflow YAML files exist and Actionlint reports errors
- **THEN** the control reports `BLOCKED`

#### Scenario: Workflows are absent
- **WHEN** no workflow YAML files exist
- **THEN** the Actionlint control reports `N/A`

### Requirement: Gate results SHALL use canonical result semantics

Every control result SHALL be `PASS`, `BLOCKED`, `REVIEW`, or `N/A`. `PASS` requires evidence of a successful applicable check. `BLOCKED` means a required check is missing or failed and prevents closure. `REVIEW` is informative and MUST NOT block by itself or count as `PASS`. `N/A` requires an absent capability and a reason. Legacy labels MUST NOT be emitted as result statuses.

#### Scenario: Review-only observation
- **WHEN** all blocking checks pass and one or more controls produce only review observations
- **THEN** the overall gate does not block solely because of those observations and reports them as `REVIEW`

#### Scenario: Blocking result exists
- **WHEN** any required control reports `BLOCKED`
- **THEN** the overall gate reports blocked findings and does not perform Git closure

#### Scenario: Non-applicable result
- **WHEN** a capability is absent
- **THEN** the dependent control reports `N/A` with the reason and does not count as passed evidence
