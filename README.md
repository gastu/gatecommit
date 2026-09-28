# gatecommit

GateCommit validates a project locally before commit. Install it as a
development dependency and run `gatecommit` from a local pre-commit hook. It
is not part of the deployed Worker runtime.

## Profiles

- `gatecommit` runs the code and application checks supported by the project.
- `gatecommit --profile=documentation` runs the documentation contract used by
  Blueprint.

The documentation profile is a contract for a different repository type, not a
reduced-coverage or faster version of the application gate.

## Changed files and fallback

GateCommit reads staged, unstaged, untracked, renamed, and deleted paths from
Git once per run. It reports whether that delta is known but does not yet use
file types or paths to skip checks. If Git cannot determine the delta or the
tracked file list, code-related capabilities are treated as unknown and their
checks run; an unknown state is never `NOT_APPLICABLE`.

`NOT_APPLICABLE` means GateCommit confirmed that the project does not have the
capability controlled by that check, or that an optional project check script
does not exist.

## Subprocesses and timing

GateCommit preserves the caller's environment and sets `CI=true` only when
`CI` is not already defined. It also sets `BLUEPRINT_GATE_ORCHESTRATOR=1` for
child processes.

At the end of each profile, `SLOWEST CHECKS` lists up to three executed checks
by duration. This summary is informational and does not affect the gate result.
