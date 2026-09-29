# check-timeouts-and-process-lifecycle Specification

## Purpose
Define configurable execution limits and reliable cleanup for every managed
GateCommit check so a slow or hung subprocess cannot block closure indefinitely
or leave its child processes running.

## Requirements

### Requirement: Managed checks SHALL use validated configurable timeouts

GateCommit SHALL accept optional `package.json` configuration at
`gatecommit.timeoutMs` and `gatecommit.checkTimeoutsMs`. `timeoutMs` SHALL be
an integer number of milliseconds from 1 through 3,600,000, inclusive.
`checkTimeoutsMs` SHALL be an object whose keys are script names declared in
`gatecommit.checks` and whose values are integers in the same range. For a
declared project check, GateCommit SHALL select the per-script value first,
then the project-wide value, then the 120,000 ms default. Other managed checks
SHALL use the project-wide value or the default. Invalid configuration SHALL
produce BLOCKED with an actionable message and SHALL NOT silently fall back.
When neither timeout property is present, the 120,000 ms default SHALL apply.

#### Scenario: No timeout configuration uses the default

- **WHEN** neither timeout property is configured
- **THEN** every managed check SHALL use 120,000 ms

#### Scenario: Project timeout overrides the default

- **WHEN** `gatecommit.timeoutMs` is a valid integer
- **THEN** managed checks without a per-script override SHALL use that value

#### Scenario: Per-script timeout overrides the project timeout

- **WHEN** a declared check has a valid entry in `gatecommit.checkTimeoutsMs`
- **THEN** that check SHALL use the per-script value
- **AND** other checks SHALL use the project timeout or default

#### Scenario: Precedence resolves to the most specific configured value

- **WHEN** a declared check has both `timeoutMs` and a
  `checkTimeoutsMs[script]` value
- **THEN** GateCommit SHALL choose per-script override, project timeout, and
  default in that order

#### Scenario: Timeout values are invalid

- **WHEN** a timeout value is non-integer, non-positive, or greater than
  3,600,000 ms, or a per-script key is not declared in `gatecommit.checks`
- **THEN** timeout configuration SHALL report BLOCKED
- **AND** its message SHALL identify the invalid setting and corrective range
  or script name requirement

### Requirement: Timed-out checks SHALL terminate the managed process and attempt best-effort descendant cleanup

GateCommit SHALL report a check exceeding its selected timeout as BLOCKED. It MUST terminate the direct check process and its managed process group where the platform supports that mechanism. On POSIX, it SHALL request graceful process-group termination, wait no more than 2,000 ms, then force-terminate the group. On Windows, it SHALL use the supported process-tree termination mechanism with the same bounded graceful period and force termination. GateCommit MUST safely revalidate process identity before signalling individually discovered descendants. It SHOULD make best-effort graceful and force-termination attempts for other descendants it can identify safely, including observed descendants in another session. It MUST NOT claim that arbitrary descendants are all terminated: a process that deliberately detaches, creates a new session, or is reparented before observation may be outside its control. GateCommit MUST wait for and collect the direct child before returning BLOCKED. A check finishing within its selected timeout SHALL retain its existing exit-code and REVIEW handling.

#### Scenario: A long suite finishes inside its selected timeout

- **WHEN** a check runs longer than 120 seconds but completes before its configured timeout
- **THEN** GateCommit SHALL wait for completion and report the check's normal result

#### Scenario: A process hangs past its selected timeout

- **WHEN** a check remains active beyond its selected timeout
- **THEN** GateCommit SHALL terminate the direct process and managed group, report BLOCKED, and stop Git closure

#### Scenario: A descendant remains active after graceful termination

- **WHEN** a safely identified process in the managed group or a safely identified descendant remains active after the grace period
- **THEN** GateCommit SHALL force-terminate that process and SHALL collect the direct child before proceeding

#### Scenario: A normal attached root-child-grandchild tree times out

- **WHEN** a check starts attached child and grandchild processes that remain in the managed group
- **THEN** GateCommit SHALL terminate the root and managed group and SHALL return BLOCKED after collecting the direct child

#### Scenario: A grandchild escapes into a new session

- **WHEN** a check starts a child that starts a grandchild in a new session and GateCommit observes the relationship before it is lost
- **THEN** GateCommit SHOULD attempt to terminate the safely identified grandchild
- **AND** an unrelated process SHALL remain unaffected

#### Scenario: A detached grandchild is reparented before observation

- **WHEN** a short-lived child starts a detached grandchild and exits before GateCommit observes the relationship
- **THEN** GateCommit SHALL still return BLOCKED when the root check times out
- **AND** GateCommit SHALL NOT claim that the detached grandchild was terminated

### Requirement: Project-owned checks SHALL stay within the managed process lifecycle

Scripts declared in `gatecommit.checks` MUST NOT daemonize, intentionally launch detached processes, create persistent services, or deliberately escape GateCommit's managed process group. Normal attached subprocess trees used by tools such as npm and Vitest SHALL remain subject to centralized timeout cleanup.

#### Scenario: A declared check starts normal tool subprocesses

- **WHEN** a declared check starts attached npm, Vitest, or other ordinary child processes and exceeds its timeout
- **THEN** GateCommit SHALL terminate the managed group and safely identified descendants, report BLOCKED, and collect its direct child

#### Scenario: A declared check would daemonize or detach

- **WHEN** a project defines a `gatecommit.checks` script that intentionally daemonizes, detaches, creates a persistent service, or escapes the managed process group
- **THEN** the project check contract is violated and the project MUST change that script to remain attached to the check lifecycle

### Requirement: The graceful termination period SHALL cover the known managed process set

After requesting graceful termination for a timed-out check, GateCommit SHALL
allow the direct check process, its managed process group, and safely
identified descendants up to 2,000 ms to exit. The grace period SHALL NOT end
solely because the direct process closed while a known managed process remains
alive. GateCommit SHALL refresh known process state during this period and
force-terminate only identified survivors after the deadline. If all known
managed processes exit earlier, GateCommit SHALL proceed without waiting for
the remainder of the period. It SHALL await and collect the direct child before
returning BLOCKED. Unobserved detached or reparented processes remain subject
to best-effort cleanup only.

#### Scenario: The root exits before a descendant finishes graceful shutdown

- **WHEN** a timed-out root exits promptly after SIGTERM while an identified
  descendant completes graceful shutdown within 2,000 ms
- **THEN** GateCommit SHALL allow that descendant to finish without sending it
  SIGKILL
- **AND** GateCommit SHALL return BLOCKED after collecting the direct child

#### Scenario: All known managed processes exit before the grace deadline

- **WHEN** the direct process, managed group, and identified descendants exit
  before 2,000 ms
- **THEN** GateCommit SHALL continue cleanup immediately without waiting out
  the unused grace period

#### Scenario: An identified descendant survives the grace deadline

- **WHEN** an identified descendant remains alive after 2,000 ms of graceful
  termination
- **THEN** GateCommit SHALL force-terminate that survivor and collect the
  direct child before returning BLOCKED
