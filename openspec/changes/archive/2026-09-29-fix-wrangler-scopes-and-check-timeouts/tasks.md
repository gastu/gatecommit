# Tasks

## 1. Wrangler environment scopes

- [x] 1.1 Add base-only and multiple-environment fixtures for Wrangler parsing.
- [x] 1.2 Add D1 fixtures for valid cross-scope reuse and duplicate binding or
      logical name within one scope.
- [x] 1.3 Add KV fixtures for valid cross-scope reuse and same-scope duplicate.
- [x] 1.4 Add R2 fixtures for valid cross-scope reuse and same-scope duplicate.
- [x] 1.5 Cover absent Wrangler/binding capabilities as reasoned N/A.
- [x] 1.6 Implement scope-preserving parse and independent validation.

## 2. Timeout contract

- [x] 2.1 Validate timeoutMs, checkTimeoutsMs shape, integer bounds, and
      declared-script keys; report invalid configuration as actionable BLOCKED.
- [x] 2.2 Implement default 120,000 ms, project timeout, per-script override,
      and precedence selection.
- [x] 2.3 Cover absent configuration, each precedence level, and invalid
      values/keys.

## 3. Process lifecycle

- [x] 3.1 Replace synchronous execution for managed checks with asynchronous
      execution and timeout tracking.
- [x] 3.2 Implement process-group/tree graceful termination, a 2,000 ms grace
      period, force termination, and bounded child reaping.
- [x] 3.3 Cover a suite that runs beyond the default but completes within its
      configured timeout.
- [x] 3.4 Cover a genuinely hung process reporting BLOCKED.
- [x] 3.5 Cover descendant termination and verify no child remains alive after
      timeout cleanup.
- [x] 3.6 Preserve non-timeout exit-code, REVIEW, output, and Git lifecycle
      behavior.

## 4. Completion

- [x] 4.1 Run the focused Wrangler and timeout regressions, then the full local
      GateCommit checks.
- [x] 4.2 Update Graphify after structural implementation changes.
- [x] 4.3 Sync or archive this OpenSpec only after implementation and checks.
- [x] 4.4 Confirm version target 2.0.1 and verify no derived-project files were
      changed.
