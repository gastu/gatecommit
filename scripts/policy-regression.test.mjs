import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { detectCapabilities, result, summarizeResults, validateWranglerConfig } from "./governance.mjs";
import { validateDependencyPolicy } from "./dependency-policy.mjs";
import { inspectLicenses } from "./license-policy.mjs";

const roots = [];
const kind = process.env.GATECOMMIT_REGRESSION_KIND;
const onlyKind = (name) => kind && kind !== name;
test.afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

test("detects source, TypeScript and application capabilities including changed-only files", { skip: onlyKind("dependency") }, () => {
  const root = project({ scripts: { build: "node build.js" } });
  const caps = detectCapabilities(root, ["README.md"], ["src/new.ts"]);
  assert.equal(caps.code.present, true);
  assert.equal(caps.typescript.present, true);
  assert.equal(caps.application.present, true);
});

test("reports unknown inventory as unknown, not absent", { skip: onlyKind("dependency") }, () => {
  const root = project();
  const caps = detectCapabilities(root, null, null);
  assert.equal(caps.code.present, null);
  assert.equal(caps.typescript.present, null);
  assert.equal(caps.inventoryComplete, false);
});

test("detects Wrangler, D1, KV and R2 from JSONC bindings", { skip: onlyKind("dependency") }, () => {
  const root = project();
  writeFileSync(join(root, "wrangler.jsonc"), `{
    // comments and trailing commas are accepted
    "d1_databases": [{"binding":"DB", "database_name":"app", "database_id":"abc"}],
    "kv_namespaces": [{"binding":"CACHE", "id":"kv-id"}],
    "r2_buckets": [{"binding":"FILES", "bucket_name":"files"}],
  }`);
  const caps = detectCapabilities(root, ["wrangler.jsonc"], []);
  assert.equal(caps.wrangler.present, true);
  assert.equal(caps.application.present, true);
  assert.equal(caps.d1.present, true);
  assert.equal(caps.kv.present, true);
  assert.equal(caps.r2.present, true);
  assert.deepEqual(validateWranglerConfig(caps.wranglerConfig), []);
});

test("detects D1, KV and R2 bindings in Wrangler TOML", { skip: onlyKind("dependency") }, () => {
  const root = project();
  writeFileSync(join(root, "wrangler.toml"), `name = "fixture"\nmigrations_dir = "db/migrations"\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "app"\ndatabase_id = "d1-id"\n[[kv_namespaces]]\nbinding = "CACHE"\nid = "kv-id"\n[[r2_buckets]]\nbinding = "FILES"\nbucket_name = "files"\n`);
  const caps = detectCapabilities(root, ["wrangler.toml"], []);
  assert.equal(caps.d1.present, true);
  assert.equal(caps.kv.present, true);
  assert.equal(caps.r2.present, true);
  assert.equal(caps.wranglerConfig.migrationsDir, "db/migrations");
});

test("detects D1 from unambiguous project scripts and Drizzle from configuration", { skip: onlyKind("dependency") }, () => {
  const root = project({ scripts: { "db:check:d1": "node db.js" } });
  mkdirSync(join(root, "scripts"));
  writeFileSync(join(root, "scripts", "drizzle.config.ts"), "export default {};");
  const caps = detectCapabilities(root, ["scripts/drizzle.config.ts"], []);
  assert.equal(caps.d1.present, true);
  assert.equal(caps.drizzle.present, true);
});

test("detects YAML workflows and reports absent workflows as N/A capability", { skip: onlyKind("dependency") }, () => {
  const root = project();
  assert.equal(detectCapabilities(root, [], [])["github-actions"].present, false);
  mkdirSync(join(root, ".github", "workflows"), { recursive: true });
  writeFileSync(join(root, ".github", "workflows", "ci.yaml"), "name: CI\n");
  assert.equal(detectCapabilities(root, [], [])["github-actions"].present, true);
});

test("REVIEW does not block and N/A and REVIEW require explanations", { skip: onlyKind("dependency") }, () => {
  assert.throws(() => result("missing-reason", "N/A"), /requires a reason/u);
  assert.throws(() => result("missing-review-reason", "REVIEW"), /requires a reason/u);
  assert.equal(summarizeResults([result("review", "REVIEW", "manual review"), result("n-a", "N/A", "no capability")]).status, "REVIEW");
  assert.equal(summarizeResults([result("review", "REVIEW", "manual review"), result("bad", "BLOCKED", "failed")]).status, "BLOCKED");
});

test("dependency policy checks all direct sections and lockfile resolution", { skip: onlyKind("dependency") }, () => {
  const root = project({ dependencies: { a: "1.0.0" }, devDependencies: { b: "2.0.0" }, optionalDependencies: { c: "3.0.0" }, peerDependencies: { d: "4.0.0" } });
  writeFileSync(join(root, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: {
    "": { dependencies: { a: "1.0.0" }, devDependencies: { b: "2.0.0" }, optionalDependencies: { c: "3.0.0" }, peerDependencies: { d: "4.0.0" } },
    "node_modules/a": { version: "1.0.0" }, "node_modules/b": { version: "2.0.0" }, "node_modules/c": { version: "3.0.0" }, "node_modules/d": { version: "4.0.0" },
  } }));
  assert.deepEqual(validateDependencyPolicy(root), []);
  assert.deepEqual(validateDependencyPolicy(project({ dependencies: { a: "latest" } })).some((item) => item.includes("latest")), true);
});

test("license policy marks unknown licenses REVIEW and prohibited licenses BLOCKED", { skip: onlyKind("license") }, () => {
  const root = project({ dependencies: { unknown: "1" } });
  writeFileSync(join(root, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: { "": { dependencies: { unknown: "1" } }, "node_modules/unknown": { version: "1" } } }));
  mkdirSync(join(root, "node_modules", "unknown"), { recursive: true });
  writeFileSync(join(root, "node_modules", "unknown", "package.json"), JSON.stringify({ name: "unknown", version: "1", license: "NOASSERTION" }));
  assert.equal(inspectLicenses(root).review, 1);
  writeFileSync(join(root, "node_modules", "unknown", "package.json"), JSON.stringify({ name: "unknown", version: "1", license: "GPL-3.0" }));
  assert.equal(inspectLicenses(root).blocked, 1);
});

test("license policy blocks when declared dependencies are not installed", { skip: onlyKind("license") }, () => {
  const root = project({ dependencies: { absent: "1.0.0" } });
  const cli = fileURLToPath(new URL("./license-policy-cli.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [cli, root], { encoding: "utf8" });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /missing installed metadata/u);
});

test("Semgrep regression rejects the unsafe fixture and accepts the safe fixture", { skip: onlyKind("semgrep") }, () => {
  const fixture = mkdtempSync(join(tmpdir(), "gatecommit-semgrep-")); roots.push(fixture);
  const unsafe = join(fixture, "unsafe.js");
  const safe = join(fixture, "safe.js");
  writeFileSync(unsafe, "eval('1');\n");
  writeFileSync(safe, "const value = 1;\n");
  const config = fileURLToPath(new URL("./security/semgrep.yml", import.meta.url));
  const bad = spawnSync("semgrep", ["--quiet", "--error", "--metrics=off", "--config", config, unsafe], { encoding: "utf8" });
  const good = spawnSync("semgrep", ["--quiet", "--error", "--metrics=off", "--config", config, safe], { encoding: "utf8" });
  assert.equal(bad.status, 1, bad.stdout + bad.stderr);
  assert.equal(good.status, 0, good.stdout + good.stderr);
});

test("Gitleaks regression detects a known-format test secret in an isolated fixture", { skip: onlyKind("gitleaks") }, () => {
  const fixture = mkdtempSync(join(tmpdir(), "gatecommit-gitleaks-")); roots.push(fixture);
  const testToken = ["ghp_", "0123456789abcdefghij0123456789abcdef"].join("");
  writeFileSync(join(fixture, "fixture.js"), `const token = '${testToken}';\n`);
  const result = spawnSync("gitleaks", ["dir", "--no-banner", "--redact", fixture], { encoding: "utf8" });
  assert.equal(result.status, 1, result.stdout + result.stderr);
});

function project(pkg = {}) {
  const root = mkdtempSync(join(tmpdir(), "gatecommit-policy-")); roots.push(root);
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "fixture", version: "1.0.0", ...pkg }));
  execFileSync("git", ["init", "-q"], { cwd: root });
  return root;
}
