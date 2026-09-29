# Clarify graceful shutdown across the managed process set

## Why

Final review reproduced that the POSIX runner could force-kill an identified
descendant immediately when the direct check process exited, even though the
descendant was still handling graceful termination.

## What changes

- Define the grace period over the direct check process, the managed POSIX
  process group, and safely identified descendants.
- Continue observing known processes during the grace period and force-kill
  only survivors after the bounded period.
- Keep early completion when every known managed process exits, and retain the
  best-effort limit for detached or reparented processes not observed in time.

## Compatibility

This is a compatible correction to timeout cleanup. It does not change timeout
configuration, timeout results, Wrangler validation, project profiles, or Git
lifecycle behavior.
