import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const gate = fileURLToPath(new URL("./blueprint-gate.mjs", import.meta.url));
const systemNpm = process.env.PATH.split(delimiter).map((directory) => join(directory, "npm")).find((path) => existsSync(path));
const roots = [];
test.afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

test("a changed TypeScript file activates typecheck and global code controls", () => {
  const { root, bins } = fixture({ scripts: { typecheck: "node -e 'process.exit(0)'" } });
  writeFileSync(join(root, "new.ts"), "export const value = 1;\n");
  const result = run(root, bins);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /CHECK typecheck PASS/u);
  assert.match(result.stdout, /CHECK semgrep PASS/u);
  assert.match(result.stdout, /CHECK gitleaks PASS/u);
});

test("Wrangler with D1, KV and R2 runs config and types checks", () => {
  const { root, bins } = fixture({ scripts: { build: "node -e 'process.exit(0)'", lint: "node -e 'process.exit(0)'", "test:unit": "node -e 'process.exit(0)'", "wrangler:types:check": "node -e 'process.exit(0)'" } });
  writeFileSync(join(root, "wrangler.jsonc"), JSON.stringify({
    name: "fixture", d1_databases: [{ binding: "DB", database_name: "app", database_id: "d1-123" }],
    kv_namespaces: [{ binding: "CACHE", id: "kv-123" }], r2_buckets: [{ binding: "FILES", bucket_name: "files" }],
  }));
  mkdirSync(join(root, "migrations")); writeFileSync(join(root, "migrations", "0001_init.sql"), "CREATE TABLE sample (id INTEGER PRIMARY KEY);\n");
  git(root, ["add", "wrangler.jsonc", "migrations"]); git(root, ["commit", "-qm", "add config"]); git(root, ["push", "-q"]);
  const result = run(root, bins);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  for (const name of ["wrangler-configuration", "d1-configuration", "kv-configuration", "r2-configuration", "wrangler-types"]) assert.match(result.stdout, new RegExp(`CHECK ${name} PASS`, "u"));
});

test("Actionlint runs for workflow YAML and is N/A when workflows are absent", () => {
  const absent = fixture();
  const absentResult = run(absent.root, absent.bins);
  assert.equal(absentResult.status, 0, absentResult.stdout + absentResult.stderr);
  assert.match(absentResult.stdout, /CHECK actionlint N\/A/u);

  const present = fixture();
  mkdirSync(join(present.root, ".github", "workflows"), { recursive: true });
  writeFileSync(join(present.root, ".github", "workflows", "ci.yml"), "name: ci\n");
  git(present.root, ["add", ".github"]); git(present.root, ["commit", "-qm", "add workflow"]); git(present.root, ["push", "-q"]);
  const presentResult = run(present.root, present.bins);
  assert.equal(presentResult.status, 0, presentResult.stdout + presentResult.stderr);
  assert.match(presentResult.stdout, /CHECK actionlint PASS/u);

  const blocked = fixture({ env: { GATE_TEST_FAIL_ACTIONLINT: "1" } });
  mkdirSync(join(blocked.root, ".github", "workflows"), { recursive: true });
  writeFileSync(join(blocked.root, ".github", "workflows", "ci.yaml"), "name: ci\n");
  git(blocked.root, ["add", ".github"]); git(blocked.root, ["commit", "-qm", "add workflow"]); git(blocked.root, ["push", "-q"]);
  const failed = run(blocked.root, blocked.bins, blocked.env);
  assert.notEqual(failed.status, 0);
  assert.match(failed.stdout, /CHECK actionlint BLOCKED/u);
  assert.doesNotMatch(failed.stdout, /COMMIT [0-9a-f]+ PASS/u);

  const missingTool = fixture();
  mkdirSync(join(missingTool.root, ".github", "workflows"), { recursive: true });
  writeFileSync(join(missingTool.root, ".github", "workflows", "ci.yml"), "name: ci\n");
  git(missingTool.root, ["add", ".github"]); git(missingTool.root, ["commit", "-qm", "add workflow"]); git(missingTool.root, ["push", "-q"]);
  unlinkSync(join(missingTool.bins, "actionlint"));
  const absentBinary = run(missingTool.root, missingTool.bins, { PATH: "/usr/bin:/bin" });
  assert.notEqual(absentBinary.status, 0);
  assert.match(absentBinary.stdout, /CHECK actionlint BLOCKED/u);
});

test("REVIEW from license policy does not block and npm audit includes dev dependencies", () => {
  const { root, bins } = fixture({ dependencies: { reviewable: "1.0.0" }, dependencySection: "devDependencies" });
  writeFileSync(join(root, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: { "": { devDependencies: { reviewable: "1.0.0" } }, "node_modules/reviewable": { version: "1.0.0" } } }));
  mkdirSync(join(root, "node_modules", "reviewable"), { recursive: true });
  writeFileSync(join(root, "node_modules", "reviewable", "package.json"), JSON.stringify({ name: "reviewable", version: "1.0.0", license: "NOASSERTION" }));
  git(root, ["add", "package-lock.json"]); git(root, ["commit", "-qm", "add lock"]); git(root, ["push", "-q"]);
  const result = run(root, bins);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /CHECK licenses REVIEW/u);
  assert.match(result.stdout, /TOTAL REVIEW .*review=1/u);
  assert.doesNotMatch(result.stdout, /CHECK [^\n]+ (?:FAIL|WARN|NOT_APPLICABLE|SKIP)\b/u);
  const auditLog = readFileSync(join(bins, "npm-audit-args"), "utf8");
  assert.match(auditLog, /audit --include=dev --audit-level=moderate/u);
});

test("N/A is reasoned and a required application check failure is BLOCKED", () => {
  const empty = fixture();
  const notApplicable = run(empty.root, empty.bins);
  assert.equal(notApplicable.status, 0, notApplicable.stdout + notApplicable.stderr);
  assert.match(notApplicable.stdout, /CHECK semgrep N\/A .*detail=/u);
  assert.match(notApplicable.stdout, /CHECK npm-audit N\/A .*detail=/u);
  assert.match(notApplicable.stdout, /CHECK actionlint N\/A .*detail=/u);
  for (const name of ["wrangler-configuration", "wrangler-types", "d1-configuration", "project-d1-checks", "kv-configuration", "r2-configuration"]) assert.match(notApplicable.stdout, new RegExp(`CHECK ${name} N/A .*detail=`, "u"));
  assert.doesNotMatch(notApplicable.stdout, /CHECK [^\n]+ (?:FAIL|WARN|NOT_APPLICABLE|SKIP)\b/u);

  const blocked = fixture({ scripts: { build: "node -e 'process.exit(0)'", lint: "node -e 'process.exit(1)'", "test:unit": "node -e 'process.exit(0)'" } });
  const failure = run(blocked.root, blocked.bins);
  assert.notEqual(failure.status, 0);
  assert.match(failure.stdout, /CHECK lint BLOCKED/u);
  assert.match(failure.stdout, /TOTAL BLOCKED/u);
  assert.doesNotMatch(failure.stdout, /COMMIT [0-9a-f]+ PASS/u);
});

test("project-owned smoke checks run only when the project contract requires them", () => {
  const optional = fixture({ scripts: { build: "node -e 'process.exit(0)'", lint: "node -e 'process.exit(0)'", "test:unit": "node -e 'process.exit(0)'" } });
  const optionalResult = run(optional.root, optional.bins);
  assert.equal(optionalResult.status, 0, optionalResult.stdout + optionalResult.stderr);
  assert.match(optionalResult.stdout, /CHECK project-smoke N\/A/u);

  const required = fixture({ scripts: { build: "node -e 'process.exit(0)'", lint: "node -e 'process.exit(0)'", "test:unit": "node -e 'process.exit(0)'", "test:smoke:local": "node -e 'process.exit(0)'" }, contract: { smoke: "test:smoke:local" } });
  const requiredResult = run(required.root, required.bins);
  assert.equal(requiredResult.status, 0, requiredResult.stdout + requiredResult.stderr);
  assert.match(requiredResult.stdout, /CHECK project-smoke PASS/u);

  const missing = fixture({ scripts: { build: "node -e 'process.exit(0)'", lint: "node -e 'process.exit(0)'", "test:unit": "node -e 'process.exit(0)'" }, contract: { smoke: "test:smoke:local" } });
  const missingResult = run(missing.root, missing.bins);
  assert.notEqual(missingResult.status, 0);
  assert.match(missingResult.stdout, /CHECK project-smoke BLOCKED/u);
});

test("application project tests accept test:unit or test and block when both are missing", () => {
  const fallback = fixture({ scripts: { build: "node -e 'process.exit(0)'", lint: "node -e 'process.exit(0)'", test: "node -e 'process.exit(0)'" } });
  const fallbackResult = run(fallback.root, fallback.bins);
  assert.equal(fallbackResult.status, 0, fallbackResult.stdout + fallbackResult.stderr);
  assert.match(fallbackResult.stdout, /CHECK project-unit-tests PASS/u);

  const missing = fixture({ scripts: { build: "node -e 'process.exit(0)'", lint: "node -e 'process.exit(0)'" } });
  const missingResult = run(missing.root, missing.bins);
  assert.notEqual(missingResult.status, 0);
  assert.match(missingResult.stdout, /CHECK project-unit-tests BLOCKED/u);
});

test("GateCommit maintainer self-test runs without an application capability", () => {
  const maintainer = fixture({ name: "gatecommit", scripts: { test: "node -e 'process.exit(0)'" } });
  const result = run(maintainer.root, maintainer.bins);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /CHECK capability-application N\/A/u);
  assert.match(result.stdout, /CHECK maintainer-self-test PASS/u);
});

test("maintainer self-test never bypasses an applicable global control", () => {
  const maintainer = fixture({ name: "gatecommit", scripts: { test: "node -e 'process.exit(0)'" }, env: { GATE_TEST_FAIL_SEMGREP: "1" } });
  writeFileSync(join(maintainer.root, "index.js"), "export const value = 1;\n");
  const result = run(maintainer.root, maintainer.bins, maintainer.env);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /CHECK maintainer-self-test PASS/u);
  assert.match(result.stdout, /CHECK semgrep BLOCKED/u);
  assert.match(result.stdout, /TOTAL BLOCKED/u);
});

test("the single .githooks path bypasses only internal commits", () => {
  const { root } = fixture();
  const setup = spawnSync(process.execPath, [fileURLToPath(new URL("./setup-git-hooks.mjs", import.meta.url))], { cwd: root, encoding: "utf8" });
  assert.equal(setup.status, 0, setup.stdout + setup.stderr);
  assert.equal(git(root, ["config", "core.hooksPath"]), ".githooks");
  const hook = join(root, ".githooks", "pre-commit");
  mkdirSync(join(root, ".githooks"));
  copyFileSync(fileURLToPath(new URL("../.githooks/pre-commit", import.meta.url)), hook);
  chmodSync(hook, 0o755);
  const internal = spawnSync("sh", [hook], { cwd: root, env: { ...process.env, GATECOMMIT_INTERNAL_COMMIT: "1" }, encoding: "utf8" });
  assert.equal(internal.status, 0, internal.stdout + internal.stderr);
  assert.match(internal.stdout, /parent validation passed/u);
  const shim = join(root, "bin"); mkdirSync(shim);
  const marker = join(root, "npm-invoked");
  writeFileSync(join(shim, "npm"), `#!/bin/sh\nprintf '%s\\n' "$*" > '${marker}'\n`); chmodSync(join(shim, "npm"), 0o755);
  const external = spawnSync("sh", [hook], { cwd: root, env: { ...process.env, PATH: `${shim}${delimiter}${process.env.PATH}` }, encoding: "utf8" });
  assert.equal(external.status, 0, external.stdout + external.stderr);
  assert.match(readFileSync(marker, "utf8"), /run gate:commit/u);
});

function fixture({ scripts = {}, dependencies = {}, dependencySection = "dependencies", env = {}, name = "fixture", contract = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), "gatecommit-gate-fixture-")); roots.push(root);
  const remote = join(root, "remote.git"); const project = join(root, "project"); mkdirSync(project);
  writeFileSync(join(project, "package.json"), JSON.stringify({ name, version: "1.0.0", scripts: { "gate:commit": "node -e 'process.exit(0)'", ...scripts }, ...(Object.keys(dependencies).length ? { [dependencySection]: dependencies } : {}), ...(Object.keys(contract).length ? { gatecommit: contract } : {}) }));
  git(project, ["init", "-q", "-b", "main"]); git(project, ["config", "user.email", "gatecommit-test@example.invalid"]); git(project, ["config", "user.name", "GateCommit Test"]);
  git(root, ["init", "--bare", "-q", "-b", "main", remote]);
  git(project, ["add", "-A"]); git(project, ["commit", "-qm", "baseline"]); git(project, ["remote", "add", "origin", remote]); git(project, ["push", "-qu", "origin", "main"]);
  const bins = join(root, "tools"); mkdirSync(bins);
  executable(bins, "semgrep", 'if [ "${GATE_TEST_FAIL_SEMGREP:-}" = "1" ]; then exit 1; fi\ncase "$*" in *unsafe.js*) exit 1;; esac\nexit 0');
  executable(bins, "gitleaks", 'if [ "$1" = "dir" ]; then exit 1; fi\nexit 0');
  executable(bins, "actionlint", 'if [ "${GATE_TEST_FAIL_ACTIONLINT:-}" = "1" ]; then exit 1; fi\nexit 0');
  executable(bins, "npm", `if [ "$1" = "audit" ]; then printf '%s\\n' "$*" > '${join(bins, "npm-audit-args")}'; exit 0; fi\nexec '${systemNpm}' "$@"`);
  return { root: project, bins, env: { ...env, PATH: `${bins}${delimiter}${process.env.PATH ?? ""}` } };
}
function executable(directory, name, body) { const path = join(directory, name); writeFileSync(path, `#!/bin/sh\n${body}\n`); chmodSync(path, 0o755); }
function run(root, bins, env = {}) { return spawnSync(process.execPath, [gate, root], { encoding: "utf8", timeout: 30_000, env: { ...process.env, PATH: `${bins}${delimiter}${process.env.PATH ?? ""}`, ...env } }); }
function git(root, args) { return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim(); }
