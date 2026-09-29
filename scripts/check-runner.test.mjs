import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS, resolveCheckTimeout, resolveManagedCommand, runCheck, validateTimeoutConfiguration } from "./check-runner.mjs";

const roots = [];
test.afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

test("timeout precedence uses 120 seconds, project value, then declared script override", () => {
  assert.equal(DEFAULT_TIMEOUT_MS, 120_000);
  assert.equal(resolveCheckTimeout({}), 120_000);
  assert.equal(resolveCheckTimeout({ timeoutMs: 45_000 }), 45_000);
  assert.equal(resolveCheckTimeout({ checks: ["test:integration"], timeoutMs: 45_000, checkTimeoutsMs: { "test:integration": 90_000 } }, "test:integration"), 90_000);
  assert.equal(resolveCheckTimeout({ checks: ["test:integration"], timeoutMs: 45_000, checkTimeoutsMs: { "test:integration": 90_000 } }, "lint"), 45_000);
  assert.equal(resolveCheckTimeout({ checks: ["test:integration"], checkTimeoutsMs: { "test:integration": 90_000 } }, "test:integration"), 90_000);
});

test("timeout configuration accepts the inclusive minimum and maximum", () => {
  assert.deepEqual(validateTimeoutConfiguration({ timeoutMs: 1 }), []);
  assert.deepEqual(validateTimeoutConfiguration({ timeoutMs: MAX_TIMEOUT_MS }), []);
  assert.deepEqual(validateTimeoutConfiguration({ checks: ["test"], checkTimeoutsMs: { test: MAX_TIMEOUT_MS } }), []);
});

test("invalid timeout values, map shapes, and undeclared script references are rejected", () => {
  for (const timeoutMs of [0, -1, MAX_TIMEOUT_MS + 1, 1.5, "1000", null]) {
    assert.ok(validateTimeoutConfiguration({ timeoutMs }).some((error) => error.includes("gatecommit.timeoutMs")), String(timeoutMs));
  }
  assert.ok(validateTimeoutConfiguration({ checkTimeoutsMs: [] }).some((error) => error.includes("must be an object")));
  assert.ok(validateTimeoutConfiguration({ checkTimeoutsMs: { slow: 2 } }).some((error) => error.includes("must reference a script declared")));
  assert.ok(validateTimeoutConfiguration({ checks: ["slow"], checkTimeoutsMs: { slow: 0 } }).some((error) => error.includes("gatecommit.checkTimeoutsMs.slow")));
});

test("Windows npm checks invoke npm-cli.js directly without a command shell", () => {
  const result = resolveManagedCommand("npm", ["run", "test"], {
    platform: "win32", execPath: "C:\\node\\node.exe", env: { npm_execpath: "C:\\npm\\npm-cli.js" }, fileExists: () => true,
  });
  assert.deepEqual(result, { command: "C:\\node\\node.exe", args: ["C:\\npm\\npm-cli.js", "run", "test"] });
  assert.deepEqual(resolveManagedCommand("actionlint", ["ci.yml"], { platform: "win32" }), { command: "actionlint", args: ["ci.yml"] });
});

test("a command that completes inside its timeout retains its exit status", async () => {
  const result = await runCheck(process.execPath, ["-e", "setTimeout(() => process.exit(0), 150)"], { timeoutMs: 2_000, stdio: "ignore" });
  assert.equal(result.status, 0);
  assert.equal(result.timedOut, false);
});

test("a suite longer than the default completes within its explicit project timeout", { timeout: 125_000 }, async () => {
  const result = await runCheck(process.execPath, ["-e", "setTimeout(() => process.exit(0), 120100)"], { timeoutMs: 121_000, stdio: "ignore" });
  assert.equal(result.status, 0);
  assert.equal(result.timedOut, false);
});

test("a genuinely hung process is terminated after timeout", async () => {
  const result = await runCheck(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { timeoutMs: 250, stdio: "ignore" });
  assert.equal(result.timedOut, true);
  assert.notEqual(result.status, 0);
});

test("timed-out process cleanup also terminates and reaps descendants", async () => {
  const directory = mkdtempSync(join(tmpdir(), "gatecommit-process-tree-")); roots.push(directory);
  const pidFile = join(directory, "descendant.pid");
  const childSource = "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)";
  const parentSource = `const {spawn}=require('node:child_process');const fs=require('node:fs');process.on('SIGTERM',()=>{});const child=spawn(process.execPath,['-e',${JSON.stringify(childSource)}],{stdio:'ignore'});fs.writeFileSync(${JSON.stringify(pidFile)},String(child.pid));setInterval(()=>{},1000)`;
  const result = await runCheck(process.execPath, ["-e", parentSource], { timeoutMs: 700, stdio: "ignore" });
  assert.equal(result.timedOut, true);
  assert.ok(existsSync(pidFile), "descendant started before timeout");
  const descendantPid = Number(readFileSync(pidFile, "utf8"));
  const deadline = Date.now() + 3_000;
  while (isProcessAlive(descendantPid) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(isProcessAlive(descendantPid), false, `descendant ${descendantPid} is no longer running`);
});

test("timeout cleanup kills a detached grandchild without signalling unrelated processes", { skip: process.platform === "win32" }, async () => {
  const directory = mkdtempSync(join(tmpdir(), "gatecommit-detached-tree-")); roots.push(directory);
  const pidFile = join(directory, "pids.json");
  const grandchildSource = "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)";
  const childSource = `const{spawn}=require('node:child_process');const fs=require('node:fs');process.on('SIGTERM',()=>{});const grandchild=spawn(process.execPath,['-e',${JSON.stringify(grandchildSource)}],{detached:true,stdio:'ignore'});grandchild.unref();fs.writeFileSync(${JSON.stringify(pidFile)},JSON.stringify({child:process.pid,grandchild:grandchild.pid}));setInterval(()=>{},1000)`;
  const rootSource = `const{spawn}=require('node:child_process');const fs=require('node:fs');process.on('SIGTERM',()=>{});const child=spawn(process.execPath,['-e',${JSON.stringify(childSource)}],{stdio:'ignore'});fs.writeFileSync(${JSON.stringify(pidFile + ".root")},String(process.pid));setInterval(()=>{},1000)`;
  const unrelated = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" });
  try {
    const result = await runCheck(process.execPath, ["-e", rootSource], { timeoutMs: 900, stdio: "ignore" });
    assert.equal(result.timedOut, true);
    const rootPid = Number(readFileSync(pidFile + ".root", "utf8"));
    const { child, grandchild } = JSON.parse(readFileSync(pidFile, "utf8"));
    for (const pid of [rootPid, child, grandchild]) await waitUntilNotRunning(pid);
    assert.equal(await processIsRunning(unrelated.pid), true, "unrelated process remains alive");
  } finally {
    unrelated.kill("SIGKILL");
  }
});

function isProcessAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === "ESRCH") return false; throw error; }
}

async function waitUntilNotRunning(pid) {
  const deadline = Date.now() + 3_000;
  while (await processIsRunning(pid) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(await processIsRunning(pid), false, `process ${pid} is no longer running`);
}

async function processIsRunning(pid) {
  if (!isProcessAlive(pid)) return false;
  if (process.platform === "linux") {
    try { return !/^State:\s+Z/mu.test(readFileSync(`/proc/${pid}/status`, "utf8")); }
    catch (error) { if (error.code === "ENOENT") return false; throw error; }
  }
  const result = spawnSync("ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8" });
  return result.status === 0 && !/^\s*Z/u.test(result.stdout);
}
