# Graph Report - gatecommit  (2026-09-28)

## Corpus Check
- 24 files · ~13,911 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 4 file(s) not represented in the graph (top: (none) 4)

## Summary
- 228 nodes · 349 edges · 15 communities (12 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `50f54c34`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- blueprint-gate.mjs
- git-sync.mjs
- package.json
- governance-gate.test.mjs
- blueprint-gate.test.mjs
- ADDED Requirements
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
2. `captureWorktreeSnapshot()` - 9 edges
3. `report()` - 8 edges
4. `readGitDelta()` - 8 edges
5. `inspectGitState()` - 8 edges
6. `run()` - 7 edges
7. `gitText()` - 7 edges
8. `detectCapabilities()` - 7 edges
9. `Design` - 7 edges
10. `Decisions` - 7 edges

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

## Communities (15 total, 3 thin omitted)

### Community 0 - "blueprint-gate.mjs"
Cohesion: 0.10
Nodes (25): capabilities, delta, initialSnapshot, initialState, knownCapabilities, options, PACKAGE_ROOT, packagePath (+17 more)

### Community 1 - "git-sync.mjs"
Cohesion: 0.23
Nodes (21): ref_node_crypto, readGitDelta(), captureWorktreeSnapshot(), checkIdentity(), count(), digest(), displayGitPath(), failure() (+13 more)

### Community 2 - "package.json"
Cohesion: 0.14
Nodes (13): bin, gatecommit, description, engines, node, files, license, name (+5 more)

### Community 3 - "governance-gate.test.mjs"
Cohesion: 0.11
Nodes (21): ref_node_assert, ref_node_child_process, ref_node_os, ref_node_test, ref_node_url, listVersionedFiles(), parseGitStatus(), createDirectory() (+13 more)

### Community 4 - "blueprint-gate.test.mjs"
Cohesion: 0.25
Nodes (6): createDirectory(), createDocumentationProject(), createProject(), gate, initializeRepository(), roots

### Community 5 - "ADDED Requirements"
Cohesion: 0.07
Nodes (26): ADDED Requirements, Purpose, Requirement: Derived projects SHALL remain compatible without policy copies, Requirement: GateCommit SHALL test its own implementation without weakening global controls, Requirement: Git closure SHALL preserve safe lifecycle guarantees, Requirement: Git hooks SHALL use one path and prevent internal recursion, Requirement: Graphify and OpenSpec SHALL be part of the relevant change lifecycle, Requirement: Project-owned checks SHALL run through a stable contract (+18 more)

### Community 6 - "policy-regression.test.mjs"
Cohesion: 0.11
Nodes (24): ref_node_fs, ref_node_path, failures, readJson(), validateDependencyPolicy(), capability(), detectCapabilities(), listWorkflowFiles() (+16 more)

### Community 7 - "GateCommit"
Cohesion: 0.33
Nodes (5): Capability-driven controls, Change lifecycle, GateCommit, Git and hooks, Results and project-owned tests

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
Cohesion: 0.25
Nodes (7): 1. Characterize current behavior and add capability inventory, 2. Normalize result semantics, 3. Centralize global controls and Actionlint, 4. Define project and maintainer test contracts, 5. Preserve hooks and Git lifecycle, 6. Document compatibility and complete integration, Tasks

## Knowledge Gaps
- **99 isolated node(s):** `name`, `version`, `description`, `license`, `gatecommit` (+94 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 122 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `name`, `version`, `description` to the rest of the system?**
  _99 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `blueprint-gate.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.10344827586206896 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Should `governance-gate.test.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.10582010582010581 - nodes in this community are weakly interconnected._
- **Should `ADDED Requirements` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._
- **Should `policy-regression.test.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.10887096774193548 - nodes in this community are weakly interconnected._
- **Should `ADDED Requirements` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._