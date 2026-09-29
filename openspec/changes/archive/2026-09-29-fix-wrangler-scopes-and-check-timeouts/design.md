# Design

## Context

`validateWranglerConfig()` currently checks flattened D1, KV, and R2 binding
arrays. The flattening loses the Wrangler environment boundary, so a binding
redeclared for `env.production` can be mistaken for a duplicate of its base
declaration. `run()` currently uses `spawnSync()` with a fixed 120,000 ms
timeout. Its synchronous lifecycle does not provide a bounded grace period or
reliable cleanup of descendants such as npm and Vitest.

## Goals / Non-Goals

**Goals:**

- Treat base and each `env.<name>` as independent binding scopes while
  preserving all existing shape, resource, and same-scope duplicate checks.
- Make check timeout selection explicit, validated, and backward compatible.
- Ensure timeout results are BLOCKED and no managed process descendants remain
  after cleanup completes.
- Keep scope and process lifecycle behavior covered by local fixtures.

**Non-Goals:**

- Altering Wrangler configuration in Clubi or any other derived repository.
- Changing global control applicability, result aggregation, project contracts,
  or the safe Git snapshot/commit/push lifecycle.
- Providing a timeout for GateCommit's own parent process or Git operations.

## Decisions

### Validate Wrangler declarations by scope

Parse Wrangler configuration into a base scope and a collection of named
environment scopes. Apply the existing D1 binding and logical-name uniqueness
rules, KV binding uniqueness rules, and R2 binding uniqueness rules separately
to each scope. Repeated names across scopes are valid. A repeated name inside
one scope remains a configuration failure and therefore reports BLOCKED.
Configuration with only the base scope and configuration with multiple
environments use the same validation path. If Wrangler capability is absent,
the Wrangler and resource checks retain their existing N/A behavior. If a
configuration declares no binding capability for a resource, that resource
check remains N/A; malformed or duplicated declared bindings remain BLOCKED.

### Timeout configuration and precedence

The optional `package.json` property has this exact shape:

```json
{
  "gatecommit": {
    "timeoutMs": 120000,
    "checks": ["test:integration"],
    "checkTimeoutsMs": {
      "test:integration": 300000
    }
  }
}
```

`gatecommit.timeoutMs` is an optional project-wide timeout in milliseconds for
each managed check. `gatecommit.checkTimeoutsMs` is an optional object mapping a
script name already declared in `gatecommit.checks` to its timeout in
milliseconds. Selection precedence for a declared check is its
`checkTimeoutsMs[script]` override, then `gatecommit.timeoutMs`, then the
120,000 ms default. Other managed checks use the project timeout or default.
The values must be JSON integers in the inclusive range 1 through 3,600,000.
`checkTimeoutsMs` must be an object (not an array), and every key must name a
script declared in `gatecommit.checks`. Invalid type, range, or key reports a
configuration check as BLOCKED with the invalid field and correction needed;
the gate does not silently fall back from invalid configuration. If both
settings are absent, all managed checks use 120,000 ms. Existing
`gatecommit.checks` ordering and required-script behavior do not change.

### Process-tree termination

Run each managed command asynchronously in its own process group/session where
the platform supports it. On POSIX, signal the process group with SIGTERM when
the selected timeout expires; after a 2,000 ms grace period, send SIGKILL to
the group if it remains. On Windows, terminate the process tree using the
platform tree-termination facility, with force termination after the same
bounded grace interval if needed. Wait for the direct child to exit and reap it
before recording BLOCKED. Timeout cleanup itself is bounded to the command
timeout plus the grace period and a small bounded reap interval. A timed-out
check always reports BLOCKED, regardless of termination status. Commands that
finish within their selected timeout preserve their current exit-code and
REVIEW handling.

### Compatibility boundaries

Only Wrangler duplicate detection and the managed check runner/configuration
change. PASS/BLOCKED/REVIEW/N/A meanings, global control selection, application
and documentation checks, `gatecommit.checks` semantics, and Git lifecycle
remain unchanged. The compatible target release is 2.0.1.

## Risks / Trade-offs

- Platform process-tree APIs differ → isolate termination behavior and test
  descendant cleanup on supported CI platforms.
- A short but valid timeout can stop a slow command → reject zero, non-integer,
  and excessive values with actionable BLOCKED output; preserve a generous
  120-second default and allow documented project overrides.
- Environment parsing can accidentally flatten bindings again → use fixtures
  with identical base/environment names plus same-scope duplicate controls.

## Migration Plan

1. Add Wrangler fixtures for base, multiple environments, cross-scope repeats,
   same-scope duplicates, and absent capability for D1, KV, and R2.
2. Implement per-scope validation while preserving existing validation errors.
3. Add timeout configuration validation and precedence coverage.
4. Implement asynchronous process execution, bounded tree termination, and
   descendant cleanup coverage.
5. Run all affected and repository checks, then update Graphify and sync/archive
   this OpenSpec in the implementation phase.

No data migration or derived-project configuration migration is required.

## Open Questions

None.
