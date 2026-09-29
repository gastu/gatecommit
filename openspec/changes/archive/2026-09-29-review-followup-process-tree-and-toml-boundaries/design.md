# Design

## Process discovery and signalling

On POSIX, retain the existing process-group signal as the first efficient cleanup action. While a managed check is active, periodically take a `ps -axo pid=,ppid=,lstart=` snapshot and walk parent-to-child relationships starting at the root PID. Store each discovered PID with its parent PID and `lstart` identity, including processes in other sessions. Before signalling a stored PID, take a fresh snapshot and require the start identity to match. This avoids name-based selection and substantially reduces PID reuse risk; the remaining check-to-signal race is inherent without platform-specific pidfd APIs. Signal known descendants gracefully, wait at most 2,000 ms, rediscover/revalidate known survivors, then force-kill them and the original process group. Reap the direct child before returning.

Windows retains the existing `taskkill /T` strategy because it already enumerates the process tree independent of POSIX process groups.

## TOML table boundaries

Recognize both standard TOML table headers (`[table]`) and array-of-table headers (`[[table]]`). Every header flushes the current binding row and clears capture state. Start a new row only for recognized Wrangler binding array tables. Thus a `binding` key in `[vars]` or another ordinary table cannot mutate a prior resource row.

## Validation

Tests build a root -> child -> detached grandchild topology, trigger timeout, and assert each process is no longer running while an unrelated process remains alive. TOML fixtures retain same-scope duplicates across ordinary-table transitions and verify D1, KV, R2, and multiple environment scopes.
