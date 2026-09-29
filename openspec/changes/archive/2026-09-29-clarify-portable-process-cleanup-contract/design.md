# Design

## Portability analysis

Node's portable child-process API can launch a POSIX check in its own process group and can signal that group. A descendant can call `setsid()` or create a new process group and leave it. PID/PPID snapshots only show current relationships: when a short-lived parent exits, a detached child is reparented and the original ancestry is lost. Snapshot polling has an unavoidable observation gap. `lstart` revalidation reduces PID reuse risk but cannot make check-and-signal atomic, and its timestamp precision is platform-dependent.

Linux subreapers (`PR_SET_CHILD_SUBREAPER`) and cgroups can improve containment, but require Linux-specific native/process integration; cgroup access also varies across hosts and CI. macOS has no equivalent portable POSIX subreaper facility. Windows `taskkill /T` enumerates a process tree at termination time; stronger Job Object containment would require native/platform-specific support and policy around breakaway processes. Adding these mechanisms would not provide one portable guarantee and would add maintenance or host privilege assumptions.

Therefore GateCommit guarantees termination and collection of the direct check process, termination of its managed process group where supported, and termination attempts for descendants it can identify safely. Discovery and cleanup of additional descendants is best effort. Timeout always returns BLOCKED. Project-owned scripts in `gatecommit.checks` must remain attached to the managed lifecycle and must not intentionally daemonize, detach, create persistent services, or escape the process group.

## Regression design

Keep tests proving normal root/child/grandchild cleanup, safely observed detached cleanup, and unrelated-process isolation. Add a deterministic timing fixture where a short-lived child launches a detached grandchild between process snapshots; assert the check still times out as BLOCKED, demonstrate that the detached process may remain alive, and explicitly force-kill/reap that fixture process in `finally` so the suite leaves no residue.
