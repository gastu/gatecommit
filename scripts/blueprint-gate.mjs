#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { listVersionedFiles, readGitDelta } from "./git-delta.mjs";
import { captureWorktreeSnapshot, formatGitState, inspectGitState, INTERNAL_COMMIT_HOOK, remoteAheadMessage, syncValidatedChanges } from "./git-sync.mjs";

if (process.env[INTERNAL_COMMIT_HOOK] === "1") {
  console.log("GATECOMMIT pre-commit hook: parent validation passed");
  process.exit(0);
}

const options = parseArguments(process.argv.slice(2));
if (!options.ok) {
  console.error(`BLOCKED ${options.reason}`);
  console.log("GATE_RESULT findings=1 review=0 expected=0");
  process.exit(1);
}

const { root, commitMessage, profile } = options;
const packagePath = join(root, "package.json");

if (!existsSync(packagePath)) {
  console.error(`BLOCKED package.json no existe en ${root}`);
  process.exit(1);
}

const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
const scripts = packageJson.scripts ?? {};
const dependencies = { ...(packageJson.dependencies ?? {}), ...(packageJson.devDependencies ?? {}) };
const directDependencies = {
  ...(packageJson.dependencies ?? {}),
  ...(packageJson.devDependencies ?? {}),
  ...(packageJson.optionalDependencies ?? {}),
  ...(packageJson.peerDependencies ?? {}),
};
const delta = readGitDelta(root);
const versionedFiles = listVersionedFiles(root);
const projectFiles = versionedFiles === null || delta === null
  ? null
  : [...new Set([...versionedFiles, ...delta.files])];
const knownProjectFiles = [...(versionedFiles ?? []), ...(delta?.files ?? [])];
const hasCode = hasCapability(knownProjectFiles, projectFiles, /\.(?:c|cjs|cpp|go|java|js|mjs|py|rb|rs|sh|swift|ts|tsx|vue)$/u);
const hasTypeScript = hasCapability(knownProjectFiles, projectFiles, /\.(?:ts|tsx)$/u);
const hasWrangler = existsSync(join(root, "wrangler.jsonc")) || existsSync(join(root, "wrangler.toml"));
const hasApplication = hasWrangler || Object.keys(dependencies).some((name) => /^(?:hono|react|react-dom|next|express|fastify|@cloudflare\/)/u.test(name)) || typeof scripts.build === "string" || typeof scripts.deploy === "string";
const results = [];

const initialState = inspectGitState(root);
if (!initialState.ok) reportGitPreflightFailure(initialState.reason);
console.log(formatGitState(initialState));
if (initialState.remoteAhead > 0) reportGitPreflightFailure(remoteAheadMessage(initialState));

const initialSnapshot = captureWorktreeSnapshot(root);
if (!initialSnapshot.ok) reportGitPreflightFailure(initialSnapshot.reason);

if (profile === "documentation") runDocumentationProfile();
else runApplicationProfile();

const blocked = results.filter((result) => result.status === "BLOCKED");
const warnings = results.filter((result) => result.status === "WARN");
const notApplicable = results.filter((result) => result.status === "NOT_APPLICABLE");
const finalStatus = blocked.length > 0 ? "FAIL" : "PASS";

console.log(`TOTAL ${finalStatus} checks=${results.length} blocked=${blocked.length} warnings=${warnings.length} not_applicable=${notApplicable.length}`);
reportSlowestChecks();
if (blocked.length > 0) {
  console.log(`GATE_RESULT findings=${blocked.length} review=${warnings.length} expected=0`);
  process.exit(1);
}

const sync = syncValidatedChanges(root, initialState, initialSnapshot, commitMessage);
console.log(`GATE_RESULT findings=0 review=${warnings.length} expected=0`);
process.exit(sync.ok ? 0 : 1);

function runApplicationProfile() {
run("diff-unstaged", "git", ["diff", "--check"]);
run("diff-staged", "git", ["diff", "--cached", "--check"]);
run("github-actions", "node", ["--input-type=module", "-e", checkGithubActionsSource()], { blockOnNonZero: true });

runApplicableScript("typecheck", ["typecheck"], hasTypeScript);
runApplicableScript("lint", ["eslint", "lint:eslint", "lint"], hasApplication);
runApplicableScript("unit-tests", ["test:unit", "test"], hasApplication);
runRequiredScript("project-contract", ["contract:validate", "test:contract", "validate:derived-contract"]);
runApplicableScript("drizzle", ["db:check", "db:check:drizzle"], hasDrizzle());

if (hasVite(dependencies) && hasApplication) {
  run("vite-build", "npx", ["--no-install", "vite", "build"]);
} else if (hasApplication) {
  runRequiredScript("build", ["build"]);
} else {
  report("build", "NOT_APPLICABLE", "no existe una aplicación o artefacto compilable");
}

runApplicableScript("wrangler-types", ["wrangler:types:check", "test:wrangler-types", "check:wrangler", "cf-types"], hasWrangler);
runDependencyPolicy();
runRequiredScript("semgrep", ["security:semgrep", "test:semgrep"]);
runRequiredScript("semgrep-regression", ["security:semgrep:test", "test:semgrep:regression"]);
runApplicableScript("secrets", ["security:secrets", "test:gitleaks", "check:secrets"], hasCode);
runApplicableScript("secrets-regression", ["security:secrets:test", "test:gitleaks:regression"], hasCode);
runApplicableScript("licenses", ["security:licenses", "test:licenses"], hasNpmDependencies());
runApplicableScript("licenses-regression", ["security:licenses:test", "test:licenses:regression"], hasNpmDependencies());
runApplicableScript("audit", ["security:dependencies", "test:audit:full"], hasNpmDependencies());
runApplicableScript("dependency-regression", ["security:dependency-policy:test", "test:dependency-policy:regression"], hasNpmDependencies());
runScript("http-account", ["test:http:account"]);
runScript("http-organizations", ["test:http:organizations"]);
runScript("http-platform", ["test:http:platform"]);
runScript("remote-contract", ["test:remote-contract"]);
runScript("deploy-contract", ["test:deploy-contract"]);
runScript("smoke-local", ["test:smoke:harness", "test:smoke:local"]);
}

function reportGitPreflightFailure(reason) {
  console.error(`CHECK git-preflight BLOCKED duration=0ms detail=${JSON.stringify(reason)}`);
  console.log("TOTAL BLOCKED checks=1 blocked=1 warnings=0 not_applicable=0");
  console.log("SLOWEST CHECKS");
  console.log("GATE_RESULT findings=1 review=0 expected=0");
  process.exit(1);
}

function runScript(name, candidates) {
  const script = candidates.find((candidate) => typeof scripts[candidate] === "string" && scripts[candidate].trim() !== "");
  if (!script) {
    report(name, "NOT_APPLICABLE", `no existe ninguno de: ${candidates.join(", ")}`);
    return;
  }
  run(name, "npm", ["run", script]);
}

function runApplicableScript(name, candidates, applies) {
  if (applies === false) {
    report(name, "NOT_APPLICABLE", "la capacidad controlada no existe en el proyecto");
    return;
  }
  runRequiredScript(name, candidates);
}

function runRequiredScript(name, candidates) {
  const script = candidates.find((candidate) => typeof scripts[candidate] === "string" && scripts[candidate].trim() !== "");
  if (!script) {
    report(name, "BLOCKED", `falta un check obligatorio: ${candidates.join(", ")}`);
    return;
  }
  run(name, "npm", ["run", script]);
}

function runDependencyPolicy() {
  const started = performance.now();
  const lockPath = join(root, "package-lock.json");
  const direct = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
    ...(packageJson.optionalDependencies ?? {}),
    ...(packageJson.peerDependencies ?? {}),
  };
  const failures = [];
  if (Object.keys(direct).length > 0 && !existsSync(lockPath)) {
    failures.push("package-lock.json no existe para dependencias directas");
  }
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    const rootDependencies = lock.packages?.[""]?.devDependencies ?? {};
    const rootProduction = lock.packages?.[""]?.dependencies ?? {};
    for (const [name, spec] of Object.entries(direct)) {
      if (String(spec).endsWith("latest")) failures.push(`${name} usa el tag latest`);
      const lockedSpec = rootDependencies[name] ?? rootProduction[name];
      if (lockedSpec !== spec) failures.push(`package-lock.json no coincide con ${name}`);
      const installed = lock.packages?.[`node_modules/${name}`];
      const isExternal = /^(?:github:|git\+|git:|https?:|file:)/u.test(String(spec));
      if (!installed || (!installed.version && !(isExternal && installed.resolved))) {
        failures.push(`package-lock.json no resuelve ${name}`);
      }
    }
  }
  const status = failures.length === 0 ? "PASS" : "BLOCKED";
  report("dependency-policy", status, failures.join("; "), performance.now() - started);
  if (failures.length > 0) results.at(-1).findings = failures.length;
}

function run(name, command, args, options = {}) {
  const started = performance.now();
  const env = { ...process.env, BLUEPRINT_GATE_ORCHESTRATOR: "1" };
  if (env.CI === undefined) env.CI = "true";
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", env });
  const status = result.status === 0 ? "PASS" : options.blockOnNonZero === false ? "WARN" : "BLOCKED";
  report(name, status, result.error?.message, performance.now() - started);
}

function report(name, status, detail = "", duration = 0) {
  const suffix = detail ? ` detail=${JSON.stringify(detail)}` : "";
  console.log(`CHECK ${name} ${status} duration=${Math.round(duration)}ms${suffix}`);
  results.push({ name, status, duration });
}

function reportSlowestChecks() {
  const slowest = results
    .filter((result) => result.status !== "NOT_APPLICABLE")
    .sort((left, right) => right.duration - left.duration)
    .slice(0, 3);

  console.log("SLOWEST CHECKS");
  for (const result of slowest) {
    console.log(`${result.name.padEnd(20)} ${(result.duration / 1000).toFixed(1)}s`);
  }
}

function hasVite(allDependencies) {
  return Boolean(allDependencies.vite || allDependencies["@cloudflare/vite-plugin"]);
}

function hasDrizzle() {
  return Object.keys(dependencies).some((name) => name === "drizzle-orm" || name.startsWith("drizzle-"));
}

function hasNpmDependencies() {
  return Object.keys(directDependencies).length > 0;
}

function hasCapability(observedFiles, completeFiles, pattern) {
  if (observedFiles.some((file) => pattern.test(file))) return true;
  return completeFiles === null ? null : false;
}

function checkGithubActionsSource() {
  return `import { existsSync } from "node:fs"; import { join } from "node:path"; const path = join(${JSON.stringify(root)}, ".github", "workflows"); if (existsSync(path)) { console.error("GitHub Actions no está permitido para validaciones"); process.exit(1); }`;
}

function runDocumentationProfile() {
  run("diff-unstaged", "git", ["diff", "--check"]);
  run("diff-staged", "git", ["diff", "--cached", "--check"]);
  run("github-actions", "node", ["--input-type=module", "-e", checkGithubActionsSource()]);
  run("markdown-links", process.execPath, ["--input-type=module", "-e", markdownLinksSource()]);
  run("dependency-policy", process.execPath, ["--input-type=module", "-e", dependencyPolicySource()]);
  run("contract-regressions", process.execPath, ["--test", ...["gate-metrics.test.mjs", "validate-dependency-policy.test.mjs", "validate-derived-contract.test.mjs"].map((file) => join(root, "scripts", file))]);
  run("gitleaks", "gitleaks", ["detect", "--source", root, "--no-banner", "--redact"]);
}

function parseArguments(args) {
  const profileArgs = args.filter((argument) => argument.startsWith("--"));
  const invalidProfile = profileArgs.find((argument) => argument !== "--profile=documentation");
  if (invalidProfile) return { ok: false, reason: `opción no reconocida: ${invalidProfile}` };

  const positional = args.filter((argument) => !argument.startsWith("--"));
  let root = process.cwd();
  let commitMessage;

  if (positional.length > 0) {
    const candidate = resolve(positional[0]);
    const pathLike = positional[0] === "."
      || positional[0] === ".."
      || positional[0].startsWith("./")
      || positional[0].startsWith("../")
      || isAbsolute(positional[0]);
    if (existsSync(join(candidate, "package.json")) || pathLike) {
      root = candidate;
      positional.shift();
    }
  }

  if (positional.length > 1) return { ok: false, reason: "uso: gatecommit [mensaje de commit]" };
  if (positional.length === 1) {
    if (!positional[0].trim()) return { ok: false, reason: "el mensaje de commit no puede estar vacío" };
    commitMessage = positional[0];
  }

  return { ok: true, root, commitMessage, profile: profileArgs.length ? "documentation" : "application" };
}

function markdownLinksSource() {
  return `import { execFileSync } from "node:child_process"; import { existsSync, readFileSync } from "node:fs"; import { dirname, resolve } from "node:path";
const root = ${JSON.stringify(root)}; const files = execFileSync("git", ["ls-files", "*.md"], { cwd: root, encoding: "utf8" }).split("\\n").filter(Boolean); const missing = []; const pattern = /\\[[^\\]]*\\]\\(([^)]+)\\)/g;
for (const file of files) { const content = readFileSync(resolve(root, file), "utf8"); for (const match of content.matchAll(pattern)) { const target = match[1].trim().split(/[?#]/, 1)[0]; if (!target || /^(?:https?:|mailto:|#)/i.test(target)) continue; if (!existsSync(resolve(root, dirname(file), target))) missing.push(file + " → " + target); } }
if (missing.length) throw new Error("enlaces internos inexistentes:\\n" + missing.join("\\n"));`;
}

function dependencyPolicySource() {
  return `import { validateDependencyPolicy } from ${JSON.stringify(join(root, "scripts", "validate-dependency-policy.mjs"))}; const failures = validateDependencyPolicy(${JSON.stringify(root)}); if (failures.length) { console.error(failures.join("\\n")); process.exit(1); } console.log("DEPENDENCY_POLICY PASS project=${root} findings=0");`;
}
