# Tasks

## Process tree cleanup

- [x] 1.1 Track POSIX descendants through parent-child snapshots outside the process group.
- [x] 1.2 Validate process identity before signalling and preserve the group-first strategy.
- [x] 1.3 Add detached-grandchild timeout regression and unrelated-process isolation assertion.

## TOML parsing

- [x] 2.1 Flush and reset binding capture at every TOML table header.
- [x] 2.2 Add duplicate-preservation fixtures for D1, KV, R2, normal tables, array tables, and multiple environments.

## Verification

- [x] 3.1 Run focused timeout/process-tree and Wrangler JSONC/TOML regressions.
- [x] 3.2 Run full tests, maintainer self-test, OpenSpec validation, diff check, and package dry-run.
- [x] 3.3 Update Graphify and review affected process lifecycle and Wrangler parsing relationships.
