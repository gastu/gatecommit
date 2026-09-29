# Design: managed-process grace period

## Decision

On POSIX, process snapshots record PID, PPID, process-group ID, start identity,
and process state. The monitor retains identities for members of GateCommit's
created process group and descendants discovered through parent-child links.
After graceful signalling, the runner refreshes snapshots until all retained,
still-identifiable managed processes have exited or become zombies, or the
2,000 ms deadline expires. Only then are remaining known descendants and the
managed group force-signalled. The direct child is still awaited and collected
before the timed-out check resolves.

If every known process exits sooner, cleanup continues immediately rather than
sleeping for the full grace period. Detached/reparented processes not observed
remain best-effort and outside the guarantee. Windows retains its existing
`taskkill /T` graceful/force mechanism.

## Risks

Process snapshots are inherently racy; recorded start identities are rechecked
before individual signals. Process-group signalling remains the primary,
efficient cleanup for attached processes. A failed POSIX snapshot is treated
conservatively as a possible survivor until the grace deadline.
