# Fix Wrangler scopes and configurable check timeouts

## Why

The GateCommit 2.0.0 pilot exposed two defects that can prevent compatible
projects from closing a valid change. Wrangler bindings are currently combined
across the base configuration and `env.*` before duplicate detection, although
each environment is a separate binding scope. In addition, checks have a fixed
120-second timeout and a timed-out command can leave child processes running.

## What Changes

- Validate D1, KV, and R2 binding uniqueness independently in the base scope
  and in each named Wrangler environment. Preserve blocking behavior for a
  duplicate within one scope and report Wrangler configuration as N/A when its
  capability is absent.
- Add validated project and per-script timeout configuration for managed
  checks, retaining 120 seconds as the default.
- Replace synchronous check execution with bounded process-tree termination:
  request termination on timeout, wait for a bounded grace period, then force
  termination and reap the process before reporting BLOCKED.
- Add regression fixtures for scope validation, timeout selection, invalid
  settings, and child-process cleanup.

## Non-Goals

- Editing any derived project or its Wrangler configuration.
- Changing PASS, BLOCKED, REVIEW, or N/A semantics; global controls; application
  or documentation contracts; or safe Git lifecycle behavior.
- Changing the `gatecommit.checks` contract beyond accepting timeout overrides
  for its declared scripts.
- Publishing, committing, or opening a pull request for this change.

## Compatibility

This is a compatible correction to GateCommit 2.0.0. Projects without timeout
settings continue to use 120 seconds. The target version is 2.0.1.
