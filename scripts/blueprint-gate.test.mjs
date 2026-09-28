import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const gate = fileURLToPath(new URL("./blueprint-gate.mjs", import.meta.url));
const roots = [];

test.afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("normal gate preserves scripts, checks, and the result contract", () => {
  const root = createProject();
  const result = runGate(root, withoutCI());

  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /GIT_STATE .*untracked=0/u);
  assert.match(result.stdout, /CHECK gitleaks N\/A/u);
  assert.match(result.stdout, /CHECK project-unit-tests PASS/u);
  assert.match(result.stdout, /CHECK npm-audit N\/A/u);
  assert.match(result.stdout, /TOTAL PASS/u);
  assert.match(result.stdout, /GATE_RESULT findings=0 review=0 expected=0/u);
  assert.match(result.stdout, /SLOWEST CHECKS/u);
});

test("sets CI only when the caller has not defined it", () => {
  const root = createProject({ captureEnvironment: true });

  const defaultEnv = withoutCI();
  defaultEnv.GATE_TEST_PRESERVED = "retained";
  const defaultResult = runGate(root, defaultEnv);
  assert.equal(defaultResult.status, 0, defaultResult.stdout + defaultResult.stderr);
  assert.deepEqual(readEnvironment(root), { CI: "true", orchestrator: "1", preserved: "retained" });

  const explicitEnv = { ...process.env, GATE_TEST_ENV_FILE: join(root, "..", "environment.json"), GATE_TEST_PRESERVED: "retained", CI: "false" };
  const explicitResult = runGate(root, explicitEnv);
  assert.equal(explicitResult.status, 0, explicitResult.stdout + explicitResult.stderr);
  assert.deepEqual(readEnvironment(root), { CI: "false", orchestrator: "1", preserved: "retained" });
});

test("unknown Git state blocks before running checks", () => {
  const root = createProject({ git: false });
  const result = runGate(root, withoutCI());

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /CHECK git-preflight BLOCKED/u);
  assert.match(result.stdout, /GATE_RESULT findings=1/u);
});

test("untracked TypeScript files activate code checks", () => {
  const root = createProject();
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "new.ts"), "export const added = true;\n");
  const result = runGate(root, withoutCI());

  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /GIT_STATE .*untracked=1/u);
  assert.match(result.stdout, /CHECK typecheck BLOCKED/u);
  assert.match(result.stdout, /CHECK gitleaks PASS/u);
  assert.doesNotMatch(result.stdout, /CHECK typecheck N\/A/u);
});

test("documentation profile runs its dedicated checks and shares subprocess environment", () => {
  const root = createDocumentationProject();
  const shimDirectory = createDirectory("gatecommit-bin-");
  const env = withoutCI();
  const result = runGateFrom(root, env, "--profile=documentation");

  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /CHECK markdown-links PASS/u);
  assert.match(result.stdout, /CHECK markdown-links PASS/u);
  assert.match(result.stdout, /TOTAL PASS/u);
  assert.match(result.stdout, /GATE_RESULT findings=0 review=0 expected=0/u);
  assert.match(result.stdout, /CHECK gitleaks N\/A/u);
});

test("slowest-check summary is capped at three and does not change failure status", () => {
  const root = createProject({ failLint: true });
  const result = runGate(root, withoutCI());

  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /TOTAL BLOCKED/u);
  assert.match(result.stdout, /GATE_RESULT findings=1 review=0 expected=0/u);
  const summary = result.stdout.split("SLOWEST CHECKS\n").at(-1).split("GATE_RESULT")[0].trim();
  assert.equal(summary.split("\n").length, 3);
  assert.doesNotMatch(summary, /NOT_APPLICABLE/u);
});

function createProject({ git = true, captureEnvironment = false, failLint = false } = {}) {
  const root = createDirectory("gatecommit-project-");
  const captureScript = captureEnvironment
    ? `node -e 'require("node:fs").writeFileSync(process.env.GATE_TEST_ENV_FILE, JSON.stringify({CI:process.env.CI,orchestrator:process.env.BLUEPRINT_GATE_ORCHESTRATOR,preserved:process.env.GATE_TEST_PRESERVED}))'`
    : "node -e 'process.exit(0)'";
  const scripts = {
    build: "node -e 'process.exit(0)'",
    lint: failLint ? "node -e 'process.exit(1)'" : captureScript,
    "test:unit": "node -e 'process.exit(0)'",
  };
  if (captureEnvironment) scripts.lint = captureScript;
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "gatecommit-test", version: "1.0.0", scripts }, null, 2));
  if (git) initializeRepository(root);
  return root;
}

function createDocumentationProject() {
  const root = createDirectory("gatecommit-documentation-");
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "documentation-test", type: "module" }));
  writeFileSync(join(root, "README.md"), "# Documentation test\n");
  initializeRepository(root);
  return root;
}

function initializeRepository(root) {
  const remote = join(root, "..", `${root.split("/").at(-1)}-remote.git`);
  execFileSync("git", ["init", "--bare", "-q", "-b", "main", remote]);
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  execFileSync("git", ["config", "user.email", "gatecommit-test@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "GateCommit Test"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "baseline"], { cwd: root });
  execFileSync("git", ["remote", "add", "origin", remote], { cwd: root });
  execFileSync("git", ["push", "-qu", "origin", "main"], { cwd: root });
  roots.push(remote);
}

function createDirectory(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

function runGate(root, env, ...arguments_) {
  return spawnSync(process.execPath, [gate, root, ...arguments_], { encoding: "utf8", env, timeout: 30000 });
}

function runGateFrom(root, env, ...arguments_) {
  return spawnSync(process.execPath, [gate, ...arguments_], { cwd: root, encoding: "utf8", env, timeout: 30000 });
}

function withoutCI() {
  const env = { ...process.env, GATE_TEST_ENV_FILE: join(roots.at(-1), "..", "environment.json") };
  delete env.CI;
  return env;
}

function readEnvironment(root) {
  return JSON.parse(readFileSync(join(root, "..", "environment.json"), "utf8"));
}
