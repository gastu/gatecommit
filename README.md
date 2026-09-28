# GateCommit

GateCommit provides capability-aware shared governance checks, then commits and
pushes validated changes to the current branch's configured upstream. It runs
locally and is not part of a deployed runtime.

```sh
gatecommit
gatecommit "docs: explain the change"
npm run gate:commit -- "fix: handle an empty input"
```

This implementation follows Blueprint's [GateCommit handoff](https://github.com/gastu/blueprint/blob/37dea8fa033f4494a3ab8e3c3a6f24115751a05d/docs/GATECOMMIT-HANDOFF.md)
and machine-readable [handoff contract](https://github.com/gastu/blueprint/blob/37dea8fa033f4494a3ab8e3c3a6f24115751a05d/docs/gatecommit-handoff.json).

## Capability-driven controls

GateCommit inventories tracked and current changed files along with package and
runtime configuration before scheduling checks. Capabilities are recomputed on
each run so newly added files activate checks before closure.

| Capability | Observable signals | Controls |
| --- | --- | --- |
| Code | Supported source files | Shared Semgrep and Gitleaks plus regressions |
| TypeScript | `.ts` or `.tsx` files | Required project typecheck |
| Application | Supported app dependency, Wrangler config, `build`, or `deploy` | Lint, unit tests, declared build |
| Npm | Direct dependencies in any package dependency section | Shared dependency policy, licenses, regression suites, `npm audit --include=dev --audit-level=moderate` |
| Wrangler | `wrangler.jsonc` or `wrangler.toml` | Runtime configuration and declared type generation/check |
| D1 | Wrangler `d1_databases` or an unambiguous D1 script/config | Binding, logical name, resource ID shape, project check when declared |
| KV / R2 | Wrangler `kv_namespaces` / `r2_buckets` | Binding and runtime configuration |
| Drizzle | `drizzle-orm`/`drizzle-*` dependency or Drizzle config | Required Drizzle schema check |
| GitHub Actions | YAML files directly under `.github/workflows/` | Actionlint; workflow presence is allowed |

An absent capability reports `N/A` with a reason. An incomplete inventory is
`BLOCKED` rather than treated as absence.

## Results and project-owned tests

- `PASS`: an applicable check passed with evidence.
- `BLOCKED`: a required check is missing or failed; Git closure stops.
- `REVIEW`: an informational observation; the overall result remains `REVIEW`
  when there are no blockers, exits successfully, and does not claim `PASS`.
- `N/A`: the controlling capability is absent, with an explicit reason.

Applications expose their unit tests as `test:unit` or `test`. Domain,
integration, data, and functional tests remain in their project. A local smoke
test is required only when the project's `package.json` explicitly declares
`gatecommit.smoke` as the name of a required script. A declared
`gatecommit.d1Checks` array can name additional required D1 project checks.
Additional required project-owned checks use the ordered `gatecommit.checks`
array of npm script names. For example:

```json
{
  "gatecommit": {
    "checks": ["test:integration", "test:http:contract", "test:deploy:contract"],
    "smoke": "test:smoke:local",
    "d1Checks": ["db:test:from-zero", "db:test:upgrade"]
  }
}
```

GateCommit executes every entry in order, continues after a failure so all
declared checks run, and blocks if any script is missing or fails. An absent or
empty list reports `N/A`. Do not repeat `lint:eslint`,
`lint`, `test:unit`, `test`, `build`, or the separately declared
`gatecommit.smoke` script in this list. Use it for project-specific integration,
HTTP, remote/deploy contract, smoke, data, or other required checks.
Wrangler runtime validation checks D1 binding names, database names and resource
IDs, KV/R2 binding fields, and the configured D1 migrations directory.

GateCommit runs `npm test` under a separate maintainer contract when it gates
its own repository. This does not exempt its code from Semgrep or Gitleaks and
does not weaken any applicable shared check.

Global scanner implementations and their regression suites ship with
GateCommit. Derived projects do not need adapted copies of Semgrep, Gitleaks,
license policy, npm audit, or dependency policy. The required scanner binaries
(`semgrep`, `gitleaks`, and `actionlint` when workflows exist) must be available
on `PATH`; a missing required scanner blocks the gate.

## Git and hooks

Before validation GateCommit requires the repository root, a named branch, a
configured remote upstream, no Git operation or index lock in progress, and no
upstream commits ahead of local. It snapshots the branch, commit, upstream,
index, and changed file contents. A failed check or snapshot change prevents
staging, committing, and pushing. After a passing gate, it stages `git add -A`,
commits only when there are staged changes, pushes only to the configured
upstream without force, then verifies synchronization. A failed push leaves the
local commit for retry or manual recovery.

Git must have `user.name` and `user.email` configured when there are changes.
A clean synchronized repository passes without an empty commit. Locally
committed work with no file changes is pushed after checks pass.

Repositories use one `.githooks` path. Install it with `npm run hooks:install`;
the pre-commit hook invokes `npm run gate:commit`. GateCommit's internal commit
sets `GATECOMMIT_INTERNAL_COMMIT=1`; the child hook exits immediately after
recognizing this marker, preventing recursion after parent validation.

## Change lifecycle

For relevant structural changes, query an existing sufficient Graphify graph
before implementation; if it is missing or incomplete, run `graphify update .`.
Complete and validate OpenSpec proposal/specs/design/tasks before implementation.
After structural changes, update Graphify, sync/archive OpenSpec, run the
project's tests, and close with GateCommit. Graphify is run explicitly; do not
install its competing post-commit hook. Machine-local Graphify root/python
state is ignored; portable graph outputs may be versioned.

GateCommit does not migrate derived repositories or remove local checks there.
Keep an existing local shared control until equivalent coverage is verified in
a compatible GateCommit version.

## Migrating from GateCommit 1.x to 2.0.0

GateCommit 2.0.0 keeps Blueprint's application requirements: every detected
application must declare a lint script (`lint:eslint` or `lint`) and a unit
script (`test:unit` or `test`). Rename the former `eslint` script to one of the
accepted lint names. Missing requirements block with an actionable
message. Projects must add the correct project-owned scripts before adopting
2.0.0; GateCommit does not provide project-specific exceptions.

Before updating each project, review and declare:

1. **Application checks:** confirm application detection and required lint and
   unit scripts. Confirm the `build` script exists when the project produces a
   build artifact; set `gatecommit.buildRequired` when that artifact is
   required but GateCommit cannot infer it from the script.
2. **Previously automatic project checks:** move every required integration,
   HTTP, remote/deploy contract, data, and other project-owned check into
   `gatecommit.checks`, preserving order. This includes any existing
   `contract:validate`, `test:contract`, or `validate:derived-contract` check
   previously run by GateCommit 1.0.5, unless its retirement or replacement is
   documented, and any existing
   `test:http:account`, `test:http:organizations`, `test:http:platform`,
   `test:remote-contract`, and `test:deploy-contract` checks.
3. **Smoke and D1 checks:** review prior `test:smoke:harness` and
   `test:smoke:local` scripts. Declare a required local smoke script in
   `gatecommit.smoke` or `gatecommit.checks`; declare additional D1 checks in
   `gatecommit.d1Checks`.
4. **Shared policies and status consumers:** remove local copies only after
   equivalent GateCommit coverage is verified. Update consumers of old
   `FAIL`/`WARN`/`NOT_APPLICABLE`/`SKIP` output to canonical
   `BLOCKED`/`REVIEW`/`N/A` results.
5. **Other capabilities:** verify TypeScript typecheck, Wrangler type checks and
   runtime configuration, Drizzle schema checks, npm lock/dependency policy,
   and Actionlint when workflows are present.
