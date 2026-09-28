# Spec Delta

## Purpose

Defines the boundary between shared GateCommit policy and project-owned tests, along with the hooks, Git, Graphify, and OpenSpec lifecycle needed to use GateCommit safely in derived projects.

## ADDED Requirements

### Requirement: Project-owned checks SHALL run through a stable contract

GateCommit SHALL invoke project-owned unit tests using `test:unit` or `test` when the application capability is present. Domain, integration, data, and functional tests SHALL remain owned by the project and MUST be invoked through a documented project contract without GateCommit encoding domain rules. A local smoke test SHALL be required only when the project's documented contract explicitly requires it. A required script missing for an applicable capability SHALL be `BLOCKED`; an optional or inapplicable script SHALL be `N/A` with a reason.

#### Scenario: Application has unit-test contract
- **WHEN** an application declares `test:unit` or `test`
- **THEN** GateCommit executes that project-owned test command

#### Scenario: Application lacks required unit-test contract
- **WHEN** application capability is present and neither canonical unit-test script exists
- **THEN** GateCommit reports `BLOCKED`

#### Scenario: Project requires local smoke test
- **WHEN** the project's documented contract explicitly requires a supported local smoke test
- **THEN** GateCommit runs the declared smoke check and blocks on absence or failure

#### Scenario: Smoke test is not required
- **WHEN** no project contract requires local smoke testing
- **THEN** the absence of a local smoke test does not block closure

### Requirement: GateCommit SHALL test its own implementation without weakening global controls

GateCommit SHALL run its own unit and regression suite through an explicit maintainer-project contract, distinct from derived application capability requirements where the repository is not an application. This contract MUST NOT bypass or downgrade any global control that applies to GateCommit itself.

#### Scenario: GateCommit repository is gated
- **WHEN** GateCommit validates its own repository
- **THEN** its declared implementation tests run even if derived-application capability detection reports no application

#### Scenario: GateCommit has applicable global controls
- **WHEN** GateCommit itself has code, npm dependencies, or another supported capability
- **THEN** the corresponding global controls remain required independently of its maintainer test contract

### Requirement: Git hooks SHALL use one path and prevent internal recursion

GateCommit integration SHALL use `.githooks` as the single repository hook path. GateCommit's internal commit SHALL bypass only its own child pre-commit invocation using an explicit anti-recursion marker; it MUST NOT create competing hook paths or skip the parent validation.

#### Scenario: External commit invokes the gate
- **WHEN** a user commit runs through the configured pre-commit hook
- **THEN** the hook invokes the repository's canonical GateCommit command

#### Scenario: GateCommit performs its validated internal commit
- **WHEN** GateCommit creates a commit after successful validation
- **THEN** the child hook recognizes the internal marker and exits without recursively invoking the gate

### Requirement: Git closure SHALL preserve safe lifecycle guarantees

GateCommit SHALL validate repository root, named branch, configured upstream, Git operation/index-lock state, remote-ahead state, and a pre-validation worktree snapshot. A failure or concurrent snapshot change MUST prevent staging, committing, or pushing. After successful validation GateCommit MAY stage all changes, commit only when staged changes exist, push only to the configured upstream without force, and verify synchronization. It MUST NOT checkout branches, reset or clean files, change remotes, configure an upstream, or create an empty commit. A failed push MUST leave the local commit available for retry or manual recovery.

#### Scenario: Required check fails
- **WHEN** any required check is `BLOCKED`
- **THEN** GateCommit does not stage, commit, or push

#### Scenario: Worktree changes during validation
- **WHEN** the branch, commit, upstream, index, or file snapshot differs from the initial snapshot
- **THEN** GateCommit blocks closure without staging or committing

#### Scenario: Gate passes with changes
- **WHEN** all required controls pass and changes are stable
- **THEN** GateCommit stages, conditionally commits, pushes to the existing upstream, and verifies synchronization

#### Scenario: Gate passes without changes
- **WHEN** the worktree is clean and local and upstream commits are synchronized
- **THEN** GateCommit passes without creating an empty commit

### Requirement: Graphify and OpenSpec SHALL be part of the relevant change lifecycle

For relevant changes, the workflow SHALL query a sufficient existing Graphify graph before implementation, or run `graphify update .` when the graph is absent or incomplete. OpenSpec proposal, specs, design, and tasks SHALL be complete and validated before implementation. After structural implementation, Graphify SHALL be updated; OpenSpec SHALL be synchronized or archived as appropriate before GateCommit closes the change. These tools MUST NOT replace executable project tests. GateCommit MUST NOT install a competing automatic Graphify hook.

#### Scenario: Graph is absent before implementation
- **WHEN** a relevant change begins and no sufficient graph exists
- **THEN** the developer initializes the graph using the documented `graphify update .` lifecycle and inspects the resulting graph before implementation

#### Scenario: Planning is incomplete
- **WHEN** OpenSpec artifacts are required but incomplete or invalid
- **THEN** implementation MUST NOT begin

#### Scenario: Structural implementation is complete
- **WHEN** a change alters modules or architectural relationships
- **THEN** Graphify is updated and OpenSpec is synchronized or archived before the final GateCommit closure

### Requirement: Derived projects SHALL remain compatible without policy copies

Derived projects SHALL use GateCommit's shared implementation and preserve project-owned domain, integration, data, and functional tests. Adoption MUST NOT require projects to copy or adapt global Semgrep, Gitleaks, license, audit, or dependency-policy implementations. Existing local controls MUST NOT be removed until equivalent coverage is verified in a compatible GateCommit release.

#### Scenario: Derived project adopts compatible GateCommit
- **WHEN** the project exposes the documented test contract and has detectable capabilities
- **THEN** GateCommit runs shared applicable controls and project-owned tests without knowing domain rules

#### Scenario: Local shared control exists during migration
- **WHEN** a project has an existing copy of a shared control
- **THEN** the copy is retained until equivalent GateCommit coverage has been verified
