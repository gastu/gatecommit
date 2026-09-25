#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const root = resolve(process.argv[2] ?? process.cwd());
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
const versionedFiles = listVersionedFiles();
const hasCode = versionedFiles.some((file) => /\.(?:c|cjs|cpp|go|java|js|mjs|py|rb|rs|sh|swift|ts|tsx|vue)$/u.test(file));
const hasTypeScript = versionedFiles.some((file) => /\.(?:ts|tsx)$/u.test(file));
const hasWrangler = existsSync(join(root, "wrangler.jsonc")) || existsSync(join(root, "wrangler.toml"));
const hasApplication = hasWrangler || Object.keys(dependencies).some((name) => /^(?:hono|react|react-dom|next|express|fastify|@cloudflare\/)/u.test(name)) || typeof scripts.build === "string" || typeof scripts.deploy === "string";
const results = [];

if (process.argv.includes("--profile=documentation")) {
  runDocumentationProfile();
  process.exit(results.some((result) => result.status === "BLOCKED") ? 1 : 0);
}

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

const blocked = results.filter((result) => result.status === "BLOCKED");
const warnings = results.filter((result) => result.status === "WARN");
const notApplicable = results.filter((result) => result.status === "NOT_APPLICABLE");
const finalStatus = blocked.length > 0 ? "FAIL" : "PASS";

console.log(`TOTAL ${finalStatus} checks=${results.length} blocked=${blocked.length} warnings=${warnings.length} not_applicable=${notApplicable.length}`);
console.log(`GATE_RESULT findings=${blocked.length} review=${warnings.length} expected=0`);
process.exit(blocked.length > 0 ? 1 : 0);

function runScript(name, candidates) {
  const script = candidates.find((candidate) => typeof scripts[candidate] === "string" && scripts[candidate].trim() !== "");
  if (!script) {
    report(name, "NOT_APPLICABLE", `no existe ninguno de: ${candidates.join(", ")}`);
    return;
  }
  run(name, "npm", ["run", script]);
}

function runApplicableScript(name, candidates, applies) {
  if (!applies) {
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
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", env: { ...process.env, BLUEPRINT_GATE_ORCHESTRATOR: "1" } });
  const status = result.status === 0 ? "PASS" : options.blockOnNonZero === false ? "WARN" : "BLOCKED";
  report(name, status, result.error?.message, performance.now() - started);
}

function report(name, status, detail = "", duration = 0) {
  const suffix = detail ? ` detail=${JSON.stringify(detail)}` : "";
  console.log(`CHECK ${name} ${status} duration=${Math.round(duration)}ms${suffix}`);
  results.push({ name, status });
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

function listVersionedFiles() {
  try {
    return execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
  } catch {
    return [];
  }
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
  const blocked = results.filter((result) => result.status === "BLOCKED").length;
  console.log(`TOTAL ${blocked === 0 ? "PASS" : "FAIL"} checks=${results.length} blocked=${blocked}`);
  console.log(`GATE_RESULT findings=${blocked} review=0 expected=0`);
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
