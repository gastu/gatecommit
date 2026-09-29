# Tasks

## Contract and documentation

- [x] 1.1 Update timeout/process lifecycle requirements to guarantee direct/group cleanup and safely identified descendants only.
- [x] 1.2 Add the `gatecommit.checks` prohibition on daemonizing, detaching, persistent services, and deliberate process-group escape.
- [x] 1.3 Document best-effort detached cleanup and BLOCKED timeout behavior in README and runtime output.

## Regressions

- [x] 2.1 Verify the normal root, child, and grandchild tree is terminated.
- [x] 2.2 Verify observed detached cleanup is best effort and unrelated processes remain alive.
- [x] 2.3 Add the short-lived-parent/reparented-grandchild limitation test with explicit fixture cleanup.
- [x] 2.4 Preserve timeout configuration, Wrangler, status, profile, global-control, and Git lifecycle behavior.

## Verification

- [x] 3.1 Run focused process, timeout configuration, Wrangler, and maintainer tests.
- [x] 3.2 Run `npm test`, strict OpenSpec validation, `git diff --check`, and package dry-run.
- [x] 3.3 Update Graphify incrementally and query the process lifecycle and project-check contract.
