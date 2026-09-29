# Close PR review findings for process cleanup and TOML boundaries

## Why

Review of PR #3 reproduced two correctness defects in the 2.0.1 implementation: a process descendant could escape the original POSIX process group by starting a new session, and a normal TOML table header could leave a Wrangler binding row active.

## What Changes

- Track POSIX descendants by parent-child relationships, including descendants in a different process group, and validate process start identity before signalling.
- Preserve group termination as the first cleanup action, then gracefully and forcibly terminate known descendants.
- Treat every TOML table header as a binding-row boundary; capture only recognized binding array tables.
- Add regressions for detached descendants, external process isolation, and TOML table transitions across D1, KV, R2, and environments.

## Compatibility

This is a corrective, backward-compatible follow-up to `fix-wrangler-scopes-and-check-timeouts`. Public check states, timeout configuration, Wrangler capability behavior, and TOML support remain unchanged.

## Non-Goals

- Removing Wrangler TOML support or changing derived project configuration.
- Changing Windows termination behavior unless required by a regression.
- Merging, publishing, tagging, releasing, or changing remote settings.
