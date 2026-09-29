#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCheckTimeout, runCheck, validateTimeoutConfiguration } from "./check-runner.mjs";
import { listVersionedFiles, readGitDelta } from "./git-delta.mjs";
import { detectCapabilities, result, summarizeResults, validateWranglerConfig } from "./governance.mjs";
import { captureWorktreeSnapshot, formatGitState, inspectGitState, INTERNAL_COMMIT_HOOK, remoteAheadMessage, syncValidatedChanges } from "./git-sync.mjs";

const PACKAGE_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
if (process.env[INTERNAL_COMMIT_HOOK] === "1") {
  console.log("GATECOMMIT pre-commit hook: parent validation passed");
  process.exit(0);
}

const options = parseArguments(process.argv.slice(2));
if (!options.ok) blockedBeforeChecks(options.reason);
const { root, commitMessage, profile } = options;
const packagePath = join(root, "package.json");
if (!existsSync(packagePath)) blockedBeforeChecks(`package.json does not exist in ${root}`);

let packageJson;
try { packageJson = JSON.parse(readFileSync(packagePath, "utf8")); }
catch (error) { blockedBeforeChecks(`package.json is invalid: ${error.message}`); }
const scripts = packageJson.scripts ?? {};
const timeoutErrors = validateTimeoutConfiguration(packageJson.gatecommit ?? {});
if (timeoutErrors.length) blockedTimeoutConfiguration(timeoutErrors);
const delta = readGitDelta(root);
const versioned = listVersionedFiles(root);
const capabilities = detectCapabilities(root, versioned, delta?.files ?? null);
const results = [];

const initialState = inspectGitState(root);
if (!initialState.ok) reportGitPreflightFailure(initialState.reason);
console.log(formatGitState(initialState));
if (initialState.remoteAhead > 0) reportGitPreflightFailure(remoteAheadMessage(initialState));
const initialSnapshot = captureWorktreeSnapshot(root);
if (!initialSnapshot.ok) reportGitPreflightFailure(initialSnapshot.reason);

await run("diff-unstaged", "git", ["diff", "--check"]);
await run("diff-staged", "git", ["diff", "--cached", "--check"]);
if (!capabilities.inventoryComplete) report("capability-inventory", "BLOCKED", capabilities.inventoryReason);

const knownCapabilities = ["code", "typescript", "application", "npm", "wrangler", "d1", "kv", "r2", "drizzle", "github-actions"];
for (const name of knownCapabilities) {
  const capability = capabilities[name];
  if (capability.present === false) report(`capability-${name}`, "N/A", capability.reason);
}

await runGlobalControls();
await runRuntimeControls();
if (profile === "documentation") runDocumentationChecks();
else await runProjectChecks();
await runDeclaredProjectChecks();
if (packageJson.name === "gatecommit") await runMaintainerContract();

const summary = summarizeResults(results);
console.log(`TOTAL ${summary.status} checks=${results.length} blocked=${summary.blocked} review=${summary.review} not_applicable=${summary.notApplicable}`);
reportSlowestChecks();
if (summary.blocked > 0) {
  console.log(`GATE_RESULT findings=${summary.blocked} review=${summary.review} expected=0`);
  process.exit(1);
}
const sync = syncValidatedChanges(root, initialState, initialSnapshot, commitMessage);
console.log(`GATE_RESULT findings=0 review=${summary.review} expected=0`);
process.exit(sync.ok ? 0 : 1);

async function runGlobalControls() {
  if (capabilities.code.present === true) {
    await run("semgrep", "semgrep", ["--jobs", "1", "--error", "--metrics=off", "--disable-version-check", "--config", join(PACKAGE_ROOT, "scripts/security/semgrep.yml"), "."]);
    await runPolicyRegression("semgrep-regression");
    await run("gitleaks", "gitleaks", ["detect", "--source", root, "--no-banner", "--redact"]);
    await runPolicyRegression("gitleaks-regression");
  } else if (capabilities.code.present === null) {
    report("semgrep", "BLOCKED", capabilities.code.reason);
    report("gitleaks", "BLOCKED", capabilities.code.reason);
  } else {
    report("semgrep", "N/A", capabilities.code.reason);
    report("semgrep-regression", "N/A", capabilities.code.reason);
    report("gitleaks", "N/A", capabilities.code.reason);
    report("gitleaks-regression", "N/A", capabilities.code.reason);
  }

  if (capabilities.npm.present) {
    await run("dependency-policy", process.execPath, [join(PACKAGE_ROOT, "scripts/dependency-policy-cli.mjs"), root]);
    await runPolicyRegression("dependency-policy-regression");
    await run("licenses", process.execPath, [join(PACKAGE_ROOT, "scripts/license-policy-cli.mjs"), root], { reviewExitCode: 2 });
    await runPolicyRegression("license-regression");
    await run("npm-audit", "npm", ["audit", "--include=dev", "--audit-level=moderate"], { cwd: root });
  } else {
    for (const name of ["dependency-policy", "dependency-policy-regression", "licenses", "license-regression", "npm-audit"]) report(name, "N/A", capabilities.npm.reason);
  }

  if (capabilities["github-actions"].present === true) await run("actionlint", "actionlint", capabilities.workflowFiles);
  else if (capabilities["github-actions"].present === false) report("actionlint", "N/A", capabilities["github-actions"].reason);
  else report("actionlint", "BLOCKED", capabilities["github-actions"].reason);
}

async function runRuntimeControls() {
  for (const name of ["wrangler", "d1", "kv", "r2"]) {
    const cap = capabilities[name];
    if (cap.present === null) { report(`${name}-configuration`, "BLOCKED", cap.reason); continue; }
    if (!cap.present) { report(`${name}-configuration`, "N/A", cap.reason); continue; }
    const failures = validateWranglerConfig(capabilities.wranglerConfig, root);
    if (name === "d1" && capabilities.d1.present && !capabilities.wranglerConfig?.scopes?.some(({ d1Bindings }) => d1Bindings.length)) failures.push("D1 capability has no detectable d1_databases binding");
    if (name === "kv" && capabilities.kv.present && !capabilities.wranglerConfig?.scopes?.some(({ kvBindings }) => kvBindings.length)) failures.push("KV capability has no valid kv_namespaces binding");
    if (name === "r2" && capabilities.r2.present && !capabilities.wranglerConfig?.scopes?.some(({ r2Bindings }) => r2Bindings.length)) failures.push("R2 capability has no valid r2_buckets binding");
    report(`${name}-configuration`, failures.length ? "BLOCKED" : "PASS", failures.join("; "));
  }
  if (capabilities.d1.present === true) {
    const declared = packageJson.gatecommit?.d1Checks;
    if (declared !== undefined && (!Array.isArray(declared) || declared.some((script) => typeof script !== "string" || !script.trim()))) {
      report("project-d1-checks", "BLOCKED", "gatecommit.d1Checks must be an array of required npm script names");
    } else if (!declared?.length) {
      report("project-d1-checks", "N/A", "no project-specific D1 check is required by its contract");
    } else {
      for (const script of declared) await runRequiredScript(`project-d1-${script}`, [script]);
    }
  } else if (capabilities.d1.present === false) report("project-d1-checks", "N/A", capabilities.d1.reason);
  if (capabilities.wrangler.present === true) await runRequiredScript("wrangler-types", ["wrangler:types:check", "test:wrangler-types", "check:wrangler", "cf-types"]);
  else if (capabilities.wrangler.present === false) report("wrangler-types", "N/A", capabilities.wrangler.reason);
  if (capabilities.drizzle.present === true) await runRequiredScript("drizzle-schema", ["db:check:drizzle", "db:check"]);
  else if (capabilities.drizzle.present === false) report("drizzle-schema", "N/A", capabilities.drizzle.reason);
  else report("drizzle-schema", "BLOCKED", capabilities.drizzle.reason);
}

async function runProjectChecks() {
  if (capabilities.typescript.present === true) await runRequiredScript("typecheck", ["typecheck"]);
  else if (capabilities.typescript.present === false) report("typecheck", "N/A", capabilities.typescript.reason);
  else report("typecheck", "BLOCKED", capabilities.typescript.reason);

  if (capabilities.application.present === true) {
    await runRequiredScript("lint", ["lint:eslint", "lint"]);
    await runRequiredScript("project-unit-tests", ["test:unit", "test"]);
    if (typeof scripts.build === "string") await run("build", "npm", ["run", "build"]);
    else if (packageJson.gatecommit?.buildRequired === true) report("build", "BLOCKED", "project contract requires a build script");
    else report("build", "N/A", "no build artifact is declared by the project");
  } else if (capabilities.application.present === false) {
    for (const name of ["lint", "project-unit-tests", "build"]) report(name, "N/A", capabilities.application.reason);
  } else {
    for (const name of ["lint", "project-unit-tests", "build"]) report(name, "BLOCKED", capabilities.application.reason);
  }

  const smoke = packageJson.gatecommit?.smoke;
  if (smoke === undefined || smoke === false) report("project-smoke", "N/A", "project contract does not require local smoke testing");
  else if (typeof smoke === "string" && typeof scripts[smoke] === "string") await run("project-smoke", "npm", ["run", smoke]);
  else report("project-smoke", "BLOCKED", "gatecommit.smoke must name an existing required project script");

}

async function runDeclaredProjectChecks() {
  const declared = packageJson.gatecommit?.checks;
  if (declared === undefined || (Array.isArray(declared) && declared.length === 0)) {
    report("project-owned-checks", "N/A", "no additional project-owned checks are declared");
    return;
  }
  if (!Array.isArray(declared) || declared.some((script) => typeof script !== "string" || !script.trim())) {
    report("project-owned-checks", "BLOCKED", "gatecommit.checks must be an ordered array of required npm script names");
    return;
  }
  const reserved = new Set(["lint:eslint", "lint", "test:unit", "test", "build"]);
  const duplicates = new Set();
  const seen = new Set();
  for (const script of declared) {
    if (reserved.has(script)) duplicates.add(script);
    if (script === packageJson.gatecommit?.smoke) duplicates.add(script);
    if (seen.has(script)) duplicates.add(script);
    seen.add(script);
  }
  if (duplicates.size) {
    report("project-owned-checks", "BLOCKED", `gatecommit.checks duplicates a canonical check: ${[...duplicates].join(", ")}`);
    return;
  }

  const statuses = [];
  for (const [index, script] of declared.entries()) {
    if (typeof scripts[script] !== "string" || !scripts[script].trim()) {
      report(`project-check-${index + 1}`, "BLOCKED", `gatecommit.checks declares missing npm script '${script}'`);
      statuses.push("BLOCKED");
      continue;
    }
    statuses.push(await run(`project-check-${index + 1}`, "npm", ["run", script], { script }));
  }
  const blocked = statuses.filter((status) => status === "BLOCKED").length;
  report("project-owned-checks", blocked ? "BLOCKED" : "PASS", blocked ? `${blocked} declared project check(s) failed or are missing` : `${declared.length} declared project check(s) passed`);
}

function runDocumentationChecks() {
  const markdownFiles = versioned?.filter((file) => file.endsWith(".md")) ?? [];
  const missing = [];
  for (const file of markdownFiles) {
    const content = readFileSync(join(root, file), "utf8");
    for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)) {
      const target = match[1].trim().split(/[?#]/u, 1)[0];
      if (!target || /^(?:https?:|mailto:|#)/iu.test(target)) continue;
      if (!existsSync(resolve(root, file, "..", target))) missing.push(`${file} -> ${target}`);
    }
  }
  report("markdown-links", missing.length ? "BLOCKED" : "PASS", missing.join("; "));
}

function runMaintainerContract() {
  return run("maintainer-self-test", "npm", ["test"], { cwd: root });
}

async function runPolicyRegression(name) {
  const kind = name.startsWith("semgrep") ? "semgrep" : name.startsWith("gitleaks") ? "gitleaks" : name.startsWith("license") ? "license" : "dependency";
  await run(name, process.execPath, ["--test", join(PACKAGE_ROOT, "scripts/policy-regression.test.mjs")], { env: { GATECOMMIT_REGRESSION_KIND: kind } });
}

async function runRequiredScript(name, candidates) {
  const script = candidates.find((candidate) => typeof scripts[candidate] === "string" && scripts[candidate].trim());
  if (!script) {
    const purpose = name === "lint" ? "application capability requires a lint script" : name === "project-unit-tests" ? "application capability requires a unit-test script" : "missing required project check";
    report(name, "BLOCKED", `${purpose}; add one of: ${candidates.join(" or ")}`);
    return;
  }
  await run(name, "npm", ["run", script]);
}

async function run(name, command, args, options = {}) {
  const started = performance.now();
  const env = { ...process.env, ...options.env, BLUEPRINT_GATE_ORCHESTRATOR: "1", ...(process.env.CI === undefined ? { CI: "true" } : {}) };
  delete env.NODE_TEST_CONTEXT;
  const timeoutMs = resolveCheckTimeout(packageJson.gatecommit ?? {}, options.script);
  const childResult = await runCheck(command, args, { cwd: options.cwd ?? root, stdio: "inherit", env, timeoutMs });
  const detail = childResult.timedOut ? `check exceeded timeout of ${timeoutMs}ms; direct process termination completed and descendant cleanup was attempted`
    : childResult.error ? `${childResult.error.code === "ENOENT" ? `${command} is not installed or not on PATH` : childResult.error.message}`
      : childResult.status !== 0 && childResult.status !== options.reviewExitCode ? `${command} exited with status ${childResult.status}` : "";
  const status = childResult.timedOut ? "BLOCKED" : childResult.status === 0 ? "PASS" : childResult.status === options.reviewExitCode ? "REVIEW" : "BLOCKED";
  const reportDetail = status === "REVIEW" && !detail ? "license metadata requires review" : detail;
  report(name, status, reportDetail, performance.now() - started);
  return status;
}

function report(name, status, detail = "", duration = 0) {
  const item = result(name, status, detail, duration);
  console.log(`CHECK ${name} ${status} duration=${Math.round(duration)}ms${detail ? ` detail=${JSON.stringify(detail)}` : ""}`);
  results.push(item);
}

function reportGitPreflightFailure(reason) {
  console.error(`CHECK git-preflight BLOCKED duration=0ms detail=${JSON.stringify(reason)}`);
  console.log("TOTAL BLOCKED checks=1 blocked=1 review=0 not_applicable=0");
  console.log("SLOWEST CHECKS"); console.log("GATE_RESULT findings=1 review=0 expected=0"); process.exit(1);
}

function reportSlowestChecks() {
  console.log("SLOWEST CHECKS");
  for (const item of results.filter(({ status }) => status !== "N/A").sort((a, b) => b.duration - a.duration).slice(0, 3)) console.log(`${item.name.padEnd(28)} ${(item.duration / 1000).toFixed(1)}s`);
}

function blockedBeforeChecks(reason) {
  console.error(`BLOCKED ${reason}`);
  console.log("GATE_RESULT findings=1 review=0 expected=0");
  process.exit(1);
}

function blockedTimeoutConfiguration(errors) {
  const reason = `invalid timeout configuration: ${errors.join("; ")}`;
  console.error(`CHECK timeout-configuration BLOCKED duration=0ms detail=${JSON.stringify(reason)}`);
  console.log("TOTAL BLOCKED checks=1 blocked=1 review=0 not_applicable=0");
  console.log("GATE_RESULT findings=1 review=0 expected=0");
  process.exit(1);
}

function parseArguments(args) {
  const profileArgs = args.filter((argument) => argument.startsWith("--"));
  const invalid = profileArgs.find((argument) => argument !== "--profile=documentation");
  if (invalid) return { ok: false, reason: `unknown option: ${invalid}` };
  const positional = args.filter((argument) => !argument.startsWith("--"));
  let root = process.cwd(); let commitMessage;
  if (positional.length) {
    const candidate = resolve(positional[0]);
    const pathLike = [".", ".."].includes(positional[0]) || positional[0].startsWith("./") || positional[0].startsWith("../") || isAbsolute(positional[0]);
    if (existsSync(join(candidate, "package.json")) || pathLike) { root = candidate; positional.shift(); }
  }
  if (positional.length > 1) return { ok: false, reason: "usage: gatecommit [commit message]" };
  if (positional.length && !positional[0].trim()) return { ok: false, reason: "commit message cannot be empty" };
  if (positional.length) commitMessage = positional[0];
  return { ok: true, root, commitMessage, profile: profileArgs.length ? "documentation" : "application" };
}
