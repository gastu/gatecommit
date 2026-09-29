## 1. Implementation and verification

- [x] 1.1 Track the live state of the direct process, managed process group,
  and safely identified descendants throughout the graceful period.
- [x] 1.2 Force-terminate identified survivors only after the grace deadline;
  continue immediately when all known processes exit earlier.
- [x] 1.3 Add regressions for root-fast/descendant-graceful, early completion,
  and force termination after the grace period.
- [x] 1.4 Run the full test suite and focused process, timeout, and Wrangler
  regressions; verify no test processes remain.
- [x] 1.5 Validate OpenSpec, update Graphify, review the complete PR diff, and
  run package and diff checks.
