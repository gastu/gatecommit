# Graph Report - gatecommit  (2026-09-28)

## Corpus Check
- 24 files · ~15,479 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 4 file(s) not represented in the graph (top: (none) 4)

## Summary
- 234 nodes · 358 edges · 14 communities (11 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1ceffa3f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- blueprint-gate.mjs
- git-sync.mjs
- package.json
- blueprint-gate.test.mjs
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

## God Nodes (most connected - your core abstractions)
1. `syncValidatedChanges()` - 12 edges
2. `report()` - 9 edges
3. `captureWorktreeSnapshot()` - 9 edges
4. `run()` - 8 edges
5. `readGitDelta()` - 8 edges
6. `inspectGitState()` - 8 edges
7. `Requirement: Project-owned checks SHALL run through a stable contract` - 8 edges
8. `Tasks` - 8 edges
9. `gitText()` - 7 edges
10. `detectCapabilities()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `runRuntimeControls()` --calls--> `validateWranglerConfig()`  [EXTRACTED]
  scripts/blueprint-gate.mjs → scripts/governance.mjs
- `report()` --calls--> `result()`  [EXTRACTED]
  scripts/blueprint-gate.mjs → scripts/governance.mjs
- `captureWorktreeSnapshot()` --calls--> `readGitDelta()`  [EXTRACTED]
  scripts/git-sync.mjs → scripts/git-delta.mjs
- `inspectGitState()` --calls--> `readGitDelta()`  [EXTRACTED]
  scripts/git-sync.mjs → scripts/git-delta.mjs
- `syncValidatedChanges()` --calls--> `readGitDelta()`  [EXTRACTED]
  scripts/git-sync.mjs → scripts/git-delta.mjs

## Import Cycles
- None detected.

## Communities (14 total, 3 thin omitted)

### Community 0 - "blueprint-gate.mjs"
Cohesion: 0.11
Nodes (24): capabilities, delta, initialSnapshot, initialState, knownCapabilities, options, PACKAGE_ROOT, packagePath (+16 more)

### Community 1 - "git-sync.mjs"
Cohesion: 0.23
Nodes (21): ref_node_crypto, readGitDelta(), captureWorktreeSnapshot(), checkIdentity(), count(), digest(), displayGitPath(), failure() (+13 more)

### Community 2 - "package.json"
Cohesion: 0.14
Nodes (13): bin, gatecommit, description, engines, node, files, license, name (+5 more)

### Community 3 - "blueprint-gate.test.mjs"
Cohesion: 0.08
Nodes (27): ref_node_assert, ref_node_child_process, ref_node_os, ref_node_test, ref_node_url, createDirectory(), createDocumentationProject(), createProject() (+19 more)

### Community 5 - "Requirement: Project-owned checks SHALL run through a stable contract"
Cohesion: 0.07
Nodes (29): ADDED Requirements, Purpose, Requirement: Derived projects SHALL remain compatible without policy copies, Requirement: GateCommit SHALL test its own implementation without weakening global controls, Requirement: Git closure SHALL preserve safe lifecycle guarantees, Requirement: Git hooks SHALL use one path and prevent internal recursion, Requirement: Graphify and OpenSpec SHALL be part of the relevant change lifecycle, Requirement: Project-owned checks SHALL run through a stable contract (+21 more)

### Community 6 - "policy-regression.test.mjs"
Cohesion: 0.10
Nodes (26): ref_node_fs, ref_node_path, failures, readJson(), validateDependencyPolicy(), capability(), detectCapabilities(), listWorkflowFiles() (+18 more)

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
Cohesion: 0.22
Nodes (8): 1. Characterize current behavior and add capability inventory, 2. Normalize result semantics, 3. Centralize global controls and Actionlint, 4. Define project and maintainer test contracts, 5. Preserve hooks and Git lifecycle, 6. Document compatibility and complete integration, 7. Corrective review findings, Tasks

## Knowledge Gaps
- **104 isolated node(s):** `name`, `version`, `description`, `license`, `gatecommit` (+99 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 127 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `name`, `version`, `description` to the rest of the system?**
  _104 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `blueprint-gate.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.11330049261083744 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Should `blueprint-gate.test.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.0796221322537112 - nodes in this community are weakly interconnected._
- **Should `Requirement: Project-owned checks SHALL run through a stable contract` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Should `policy-regression.test.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.10338680926916222 - nodes in this community are weakly interconnected._
- **Should `ADDED Requirements` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._