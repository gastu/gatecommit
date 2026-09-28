# gatecommit

GateCommit runs the project gate, then commits and pushes validated changes to
the current branch's configured upstream. It runs locally and is not part of a
deployed Worker runtime.

```sh
gatecommit
gatecommit "docs: explain the change"
```

The default commit message is `chore: sync validated changes`. From an npm
script, pass a message after `--`, for example
`npm run gate:commit -- "fix: handle empty input"`.

## Git behavior

Before running checks, GateCommit requires a Git repository root, a named
branch with an existing remote upstream, no Git operation or index lock in
progress, and an upstream that is not ahead of the local branch. It never
checks out branches, resets or cleans files, changes remotes, configures an
upstream, or force pushes.

GateCommit snapshots the branch, commit, upstream, index, and changed file
contents before validation. If a check fails, or the snapshot changes while
checks run, it exits without staging, committing, or pushing. After a passing
gate it stages `git add -A`, creates a commit only when there are staged
changes, pushes to the configured upstream, and verifies that the branch and
working tree are synchronized. A failed push leaves the local commit in
place for a later retry or manual resolution.

Git must have `user.name` and `user.email` configured when there are changes to
commit. A clean synchronized repository passes without creating an empty
commit. Locally committed work with no file changes is pushed after the gate
passes.

## Profiles

- `gatecommit` runs the code and application checks supported by the project.
- `gatecommit --profile=documentation` runs the documentation contract used by
  Blueprint, then follows the same commit and push flow.

The documentation profile is a contract for a different repository type, not a
reduced-coverage or faster version of the application gate.

`NOT_APPLICABLE` means GateCommit confirmed that the project does not have the
capability controlled by that check, or that an optional project check script
does not exist.

## Subprocesses and timing

GateCommit preserves the caller's environment and sets `CI=true` only when
`CI` is not already defined. It also sets `BLUEPRINT_GATE_ORCHESTRATOR=1` for
child processes.

At the end of each profile, `SLOWEST CHECKS` lists up to three executed checks
by duration. This summary is informational and does not affect the gate result.
