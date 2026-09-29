# Check timeouts and process lifecycle

## ADDED Requirements

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

### Requirement: Timed-out checks SHALL terminate and reap their process tree

GateCommit SHALL report a check exceeding its selected timeout as BLOCKED.
It SHALL request termination of the check process and its descendants, wait no
more than 2,000 ms for graceful exit, force termination of remaining
descendants, and reap the direct child before continuing. Timeout cleanup SHALL
have a bounded duration. A check finishing within its selected timeout SHALL
retain its existing exit-code and REVIEW handling.

#### Scenario: A long suite finishes inside its selected timeout

- **WHEN** a check runs longer than 120 seconds but completes before its
  configured timeout
- **THEN** GateCommit SHALL wait for completion and report the check's normal
  result

#### Scenario: A process hangs past its selected timeout

- **WHEN** a check remains active beyond its selected timeout
- **THEN** GateCommit SHALL terminate it, report BLOCKED, and stop Git closure

#### Scenario: A descendant remains active after graceful termination

- **WHEN** the direct check process or one of its descendants remains active
  after the grace period
- **THEN** GateCommit SHALL force termination and reap the process tree before
  proceeding
