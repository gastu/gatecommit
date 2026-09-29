# Clarify portable process cleanup guarantees

## Why

Review reproduced a detached grandchild that survived after its short-lived parent exited before GateCommit's next POSIX process snapshot. A process-group-only strategy can also be escaped with a new session. Portable Node APIs cannot guarantee containment of arbitrary descendants that deliberately detach or become reparented.

## What Changes

- Define timeout cleanup as mandatory for the direct check process and its managed process group, plus safely identified descendants; cleanup of other discoverable descendants is best effort.
- State that GateCommit does not guarantee cleanup for intentionally detached, new-session, or unobserved reparented processes.
- Require scripts declared in `gatecommit.checks` not to daemonize, intentionally detach, create persistent services, or deliberately escape the managed process group.
- Keep timeout outcomes BLOCKED and add tests for ordinary attached trees, observed detached cleanup, unrelated-process isolation, and the explicitly documented race limitation.

## Compatibility

Timeout configuration, check ordering, result semantics, Wrangler validation, project profiles, global controls, and safe Git lifecycle remain unchanged.

## Non-Goals

- Adding platform-specific subreaper, cgroup, native Job Object, or other process-containment dependencies.
- Claiming portable cleanup of arbitrary processes that intentionally escape supervision.
- Changing the 2.0.1 package version or publishing a release.
