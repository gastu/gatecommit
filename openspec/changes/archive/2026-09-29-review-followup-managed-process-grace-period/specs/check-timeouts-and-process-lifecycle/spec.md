## ADDED Requirements

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
