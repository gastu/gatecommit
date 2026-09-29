## REMOVED Requirements

### Requirement: Timed-out checks SHALL terminate and reap their process tree

**Reason**: The absolute process-tree promise includes arbitrarily detached and reparented processes, which portable process-group and snapshot mechanisms cannot guarantee.

**Migration**: Use the replacement managed-process cleanup requirement below. Project-owned `gatecommit.checks` scripts must remain attached and must not daemonize or deliberately escape the managed process group.

### Requirement: Timed-out POSIX checks SHALL terminate escaped descendants

**Reason**: A descendant may create a new session and become reparented before a portable parent-child snapshot observes it.

**Migration**: GateCommit makes best-effort cleanup attempts for safely identified escaped descendants. Do not rely on GateCommit to clean up intentionally detached or persistent processes.

## ADDED Requirements

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
