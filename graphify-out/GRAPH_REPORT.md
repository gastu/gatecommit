# Graph Report - gatecommit  (2026-09-29)

## Corpus Check
- 42 files · ~24,901 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 4 file(s) not represented in the graph (top: (none) 4)

## Summary
- 402 nodes · 542 edges · 31 communities (29 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.95)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f0dd8c28`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- blueprint-gate.mjs
- git-sync.mjs
- package.json
- blueprint-gate.test.mjs
- Requirement: Timed-out checks SHALL terminate the managed process and attempt best-effort descendant cleanup
- Requirement: Project-owned checks SHALL run through a stable contract
- policy-regression.test.mjs
- GateCommit
- ADDED Requirements
- Decisions
- Proposal
- Tasks
- Changelog
- pre-commit
- centralized-governance-contract/README.md
- check-runner.mjs
- Requirement: Managed checks SHALL use validated configurable timeouts
- Requirement: Wrangler bindings SHALL be validated independently per environment scope
- Requirement: Wrangler bindings SHALL be validated independently per environment scope
- Design
- Fix Wrangler scopes and configurable check timeouts
- Tasks
- Requirement: Timed-out checks SHALL terminate the managed process and attempt best-effort descendant cleanup
- Close PR review findings for process cleanup and TOML boundaries
- Clarify portable process cleanup guarantees
- Design
- Requirement: TOML table headers SHALL end Wrangler binding rows
- Tasks
- Tasks
- ADDED Requirements
- Design

## God Nodes (most connected - your core abstractions)
1. `syncValidatedChanges()` - 12 edges
2. `run()` - 10 edges
3. `report()` - 9 edges
4. `captureWorktreeSnapshot()` - 9 edges
5. `Requirement: Wrangler bindings SHALL be validated independently per environment scope` - 9 edges
6. `Requirement: Project-owned checks SHALL run through a stable contract` - 9 edges
7. `Tasks` - 9 edges
8. `Requirement: Wrangler bindings SHALL be validated independently per environment scope` - 9 edges
9. `readGitDelta()` - 8 edges
10. `inspectGitState()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `Context` --references--> `validateWranglerConfig()`  [INFERRED]
  openspec/changes/archive/2026-09-29-fix-wrangler-scopes-and-check-timeouts/design.md → scripts/governance.mjs
- `runRuntimeControls()` --calls--> `validateWranglerConfig()`  [EXTRACTED]
  scripts/blueprint-gate.mjs → scripts/governance.mjs
- `run()` --calls--> `runCheck()`  [EXTRACTED]
  scripts/blueprint-gate.mjs → scripts/check-runner.mjs
- `captureWorktreeSnapshot()` --calls--> `readGitDelta()`  [EXTRACTED]
  scripts/git-sync.mjs → scripts/git-delta.mjs
- `inspectGitState()` --calls--> `readGitDelta()`  [EXTRACTED]
  scripts/git-sync.mjs → scripts/git-delta.mjs

## Import Cycles
- None detected.

## Communities (31 total, 2 thin omitted)

### Community 0 - "blueprint-gate.mjs"
Cohesion: 0.10
Nodes (25): capabilities, delta, initialSnapshot, initialState, knownCapabilities, options, PACKAGE_ROOT, packagePath (+17 more)

### Community 1 - "git-sync.mjs"
Cohesion: 0.22
Nodes (21): ref_node_crypto, captureWorktreeSnapshot(), checkIdentity(), count(), digest(), displayGitPath(), failure(), fileSnapshot() (+13 more)

### Community 2 - "package.json"
Cohesion: 0.14
Nodes (13): bin, gatecommit, description, engines, node, files, license, name (+5 more)

### Community 3 - "blueprint-gate.test.mjs"
Cohesion: 0.08
Nodes (28): ref_node_assert, ref_node_child_process, ref_node_os, ref_node_test, ref_node_url, createDirectory(), createDocumentationProject(), createProject() (+20 more)

### Community 4 - "Requirement: Timed-out checks SHALL terminate the managed process and attempt best-effort descendant cleanup"
Cohesion: 0.10
Nodes (19): check-timeouts-and-process-lifecycle Specification, Purpose, Requirement: Managed checks SHALL use validated configurable timeouts, Requirement: Project-owned checks SHALL stay within the managed process lifecycle, Requirement: Timed-out checks SHALL terminate the managed process and attempt best-effort descendant cleanup, Requirements, Scenario: A declared check starts normal tool subprocesses, Scenario: A declared check would daemonize or detach (+11 more)

### Community 5 - "Requirement: Project-owned checks SHALL run through a stable contract"
Cohesion: 0.06
Nodes (30): ADDED Requirements, Purpose, Requirement: Derived projects SHALL remain compatible without policy copies, Requirement: GateCommit SHALL test its own implementation without weakening global controls, Requirement: Git closure SHALL preserve safe lifecycle guarantees, Requirement: Git hooks SHALL use one path and prevent internal recursion, Requirement: Graphify and OpenSpec SHALL be part of the relevant change lifecycle, Requirement: Project-owned checks SHALL run through a stable contract (+22 more)

### Community 6 - "policy-regression.test.mjs"
Cohesion: 0.10
Nodes (27): Context, ref_node_fs, ref_node_path, failures, readJson(), validateDependencyPolicy(), capability(), detectCapabilities() (+19 more)

### Community 7 - "GateCommit"
Cohesion: 0.29
Nodes (6): Capability-driven controls, Change lifecycle, GateCommit, Git and hooks, Migrating from GateCommit 1.x to 2.0.0, Results and project-owned tests

### Community 8 - "ADDED Requirements"
Cohesion: 0.10
Nodes (20): ADDED Requirements, Purpose, Requirement: Capabilities SHALL be detected from observable project signals, Requirement: Gate results SHALL use canonical result semantics, Requirement: GitHub Actions validation SHALL be capability-aware, Requirement: Global security and dependency controls SHALL be provided by GateCommit, Scenario: Blocking result exists, Scenario: Capability inventory is unavailable (+12 more)

### Community 9 - "Decisions"
Cohesion: 0.14
Nodes (13): Capability inventory is independent from execution, Context, Decisions, Design, Goals / Non-Goals, Keep tool lifecycle outside automatic hooks, Migration Plan, Normalize result records before aggregation (+5 more)

### Community 10 - "Proposal"
Cohesion: 0.25
Nodes (7): Capabilities, Impact, Modified Capabilities, New Capabilities, Proposal, What Changes, Why

### Community 11 - "Tasks"
Cohesion: 0.20
Nodes (9): 1. Characterize current behavior and add capability inventory, 2. Normalize result semantics, 3. Centralize global controls and Actionlint, 4. Define project and maintainer test contracts, 5. Preserve hooks and Git lifecycle, 6. Document compatibility and complete integration, 7. Corrective review findings, 8. Apply project-owned checks to every profile (+1 more)

### Community 12 - "Changelog"
Cohesion: 0.50
Nodes (3): 2.0.0, 2.0.1, Changelog

### Community 15 - "check-runner.mjs"
Cohesion: 0.17
Nodes (19): DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS, monitorDescendants(), processDepth(), readProcessSnapshot(), resolveManagedCommand(), runCheck(), runTaskkill() (+11 more)

### Community 16 - "Requirement: Managed checks SHALL use validated configurable timeouts"
Cohesion: 0.15
Nodes (12): ADDED Requirements, Check timeouts and process lifecycle, Requirement: Managed checks SHALL use validated configurable timeouts, Requirement: Timed-out checks SHALL terminate and reap their process tree, Scenario: A descendant remains active after graceful termination, Scenario: A long suite finishes inside its selected timeout, Scenario: A process hangs past its selected timeout, Scenario: No timeout configuration uses the default (+4 more)

### Community 17 - "Requirement: Wrangler bindings SHALL be validated independently per environment scope"
Cohesion: 0.12
Nodes (15): Purpose, Requirement: TOML table headers SHALL end Wrangler binding rows, Requirement: Wrangler bindings SHALL be validated independently per environment scope, Requirements, Scenario: An ordinary table follows duplicate binding rows, Scenario: Base and production D1 declarations reuse a binding name, Scenario: Base and production KV declarations reuse a binding name, Scenario: Base and production R2 declarations reuse a binding name (+7 more)

### Community 18 - "Requirement: Wrangler bindings SHALL be validated independently per environment scope"
Cohesion: 0.17
Nodes (11): ADDED Requirements, Requirement: Wrangler bindings SHALL be validated independently per environment scope, Scenario: Base and production D1 declarations reuse a binding name, Scenario: Base and production KV declarations reuse a binding name, Scenario: Base and production R2 declarations reuse a binding name, Scenario: Base-only and multiple-environment Wrangler configurations, Scenario: D1 declarations duplicate a binding in one scope, Scenario: KV declarations duplicate a binding in one scope (+3 more)

### Community 19 - "Design"
Cohesion: 0.18
Nodes (10): Compatibility boundaries, Decisions, Design, Goals / Non-Goals, Migration Plan, Open Questions, Process-tree termination, Risks / Trade-offs (+2 more)

### Community 20 - "Fix Wrangler scopes and configurable check timeouts"
Cohesion: 0.33
Nodes (5): Compatibility, Fix Wrangler scopes and configurable check timeouts, Non-Goals, What Changes, Why

### Community 21 - "Tasks"
Cohesion: 0.33
Nodes (5): 1. Wrangler environment scopes, 2. Timeout contract, 3. Process lifecycle, 4. Completion, Tasks

### Community 22 - "Requirement: Timed-out checks SHALL terminate the managed process and attempt best-effort descendant cleanup"
Cohesion: 0.13
Nodes (14): ADDED Requirements, REMOVED Requirements, Requirement: Project-owned checks SHALL stay within the managed process lifecycle, Requirement: Timed-out checks SHALL terminate and reap their process tree, Requirement: Timed-out checks SHALL terminate the managed process and attempt best-effort descendant cleanup, Requirement: Timed-out POSIX checks SHALL terminate escaped descendants, Scenario: A declared check starts normal tool subprocesses, Scenario: A declared check would daemonize or detach (+6 more)

### Community 23 - "Close PR review findings for process cleanup and TOML boundaries"
Cohesion: 0.33
Nodes (5): Close PR review findings for process cleanup and TOML boundaries, Compatibility, Non-Goals, What Changes, Why

### Community 24 - "Clarify portable process cleanup guarantees"
Cohesion: 0.33
Nodes (5): Clarify portable process cleanup guarantees, Compatibility, Non-Goals, What Changes, Why

### Community 25 - "Design"
Cohesion: 0.40
Nodes (4): Design, Process discovery and signalling, TOML table boundaries, Validation

### Community 26 - "Requirement: TOML table headers SHALL end Wrangler binding rows"
Cohesion: 0.40
Nodes (4): ADDED Requirements, Requirement: TOML table headers SHALL end Wrangler binding rows, Scenario: An ordinary table follows duplicate binding rows, Scenario: Resource tables cross environments and table kinds

### Community 27 - "Tasks"
Cohesion: 0.40
Nodes (4): Process tree cleanup, Tasks, TOML parsing, Verification

### Community 28 - "Tasks"
Cohesion: 0.40
Nodes (4): Contract and documentation, Regressions, Tasks, Verification

### Community 29 - "ADDED Requirements"
Cohesion: 0.50
Nodes (3): ADDED Requirements, Requirement: Timed-out POSIX checks SHALL terminate escaped descendants, Scenario: A grandchild escapes into a new session

### Community 30 - "Design"
Cohesion: 0.50
Nodes (3): Design, Portability analysis, Regression design

## Knowledge Gaps
- **199 isolated node(s):** `name`, `version`, `description`, `license`, `gatecommit` (+194 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 239 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `validateWranglerConfig()` connect `policy-regression.test.mjs` to `blueprint-gate.mjs`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `Context` connect `policy-regression.test.mjs` to `Design`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `Design` connect `Design` to `policy-regression.test.mjs`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _199 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `blueprint-gate.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.1032258064516129 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Should `blueprint-gate.test.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.07948717948717948 - nodes in this community are weakly interconnected._