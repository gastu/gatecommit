## ADDED Requirements

### Requirement: Timed-out POSIX checks SHALL terminate escaped descendants

When a managed POSIX check exceeds its configured timeout, GateCommit SHALL attempt process-group termination first and SHALL also discover descendants by parent-child relationships, including descendants in a different process group or session. GateCommit SHALL validate a discovered process identity before signalling it, request graceful termination, wait no more than 2,000 ms, force termination of survivors, and reap the direct child before returning BLOCKED. Process discovery SHALL NOT select processes by ambiguous executable name.

#### Scenario: A grandchild escapes into a new session

- **WHEN** a check starts a child that starts a grandchild in a new session and the check times out
- **THEN** GateCommit SHALL terminate the root, child, and detached grandchild
- **AND** an unrelated process SHALL remain unaffected
