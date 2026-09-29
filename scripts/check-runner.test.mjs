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

test("grace period waits for an identified descendant after the root exits", async () => {
  const directory = mkdtempSync(join(tmpdir(), "gatecommit-graceful-child-")); roots.push(directory);
  const pidFile = join(directory, "child.pid");
  const marker = join(directory, "graceful-close");
  const childSource = `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(pidFile)},String(process.pid));process.on('SIGTERM',()=>setTimeout(()=>{fs.writeFileSync(${JSON.stringify(marker)},'closed');process.exit(0)},500));setInterval(()=>{},1000)`;
  const rootSource = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(childSource)}],{stdio:'ignore'});setInterval(()=>{},1000)`;
  const result = await runCheck(process.execPath, ["-e", rootSource], { timeoutMs: 500, stdio: "ignore" });
  assert.equal(result.timedOut, true);
  const childPid = Number(readFileSync(pidFile, "utf8"));
  assert.equal(existsSync(marker), true, "descendant completed its graceful shutdown before any force kill");
  await waitUntilNotRunning(childPid);
});

test("grace period ends early when the managed processes all exit immediately", async () => {
  const directory = mkdtempSync(join(tmpdir(), "gatecommit-grace-fast-")); roots.push(directory);
  const pidFile = join(directory, "child.pid");
  const childSource = `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(pidFile)},String(process.pid));process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000)`;
  const rootSource = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(childSource)}],{stdio:'ignore'});setInterval(()=>{},1000)`;
  const started = Date.now();
  const result = await runCheck(process.execPath, ["-e", rootSource], { timeoutMs: 400, stdio: "ignore" });
  assert.equal(result.timedOut, true);
  await waitUntilNotRunning(Number(readFileSync(pidFile, "utf8")));
  assert.ok(Date.now() - started < 1_500, "cleanup should not consume the full two second grace period when all exit early");
});

test("a managed descendant still alive after two seconds is force killed", async () => {
  const directory = mkdtempSync(join(tmpdir(), "gatecommit-grace-force-")); roots.push(directory);
  const pidFile = join(directory, "child.pid");
  const childSource = `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(pidFile)},String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000)`;
  const rootSource = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(childSource)}],{stdio:'ignore'});setInterval(()=>{},1000)`;
  const started = Date.now();
  const result = await runCheck(process.execPath, ["-e", rootSource], { timeoutMs: 400, stdio: "ignore" });
  const elapsed = Date.now() - started;
  assert.equal(result.timedOut, true);
  await waitUntilNotRunning(Number(readFileSync(pidFile, "utf8")));
  assert.ok(elapsed >= 1_800, `force termination followed the grace period (${elapsed}ms)`);
  assert.ok(elapsed < 4_500, `termination remained bounded (${elapsed}ms)`);
});

test("timeout cleanup terminates and reaps the root and attached child tree", async () => {
  const directory = mkdtempSync(join(tmpdir(), "gatecommit-process-tree-")); roots.push(directory);
  const pidFile = join(directory, "pids.json");
  const grandchildPidFile = join(directory, "grandchild.pid");
  const grandchildSource = `const fs=require('node:fs');process.on('SIGTERM',()=>{});fs.writeFileSync(${JSON.stringify(grandchildPidFile)},String(process.pid));setInterval(()=>{},1000)`;
  const childSource = `const{spawn}=require('node:child_process');const g=spawn(process.execPath,['-e',${JSON.stringify(grandchildSource)}],{stdio:'ignore'});g.unref();setInterval(()=>{},1000)`;
  const rootSource = `const{spawn}=require('node:child_process');const fs=require('node:fs');process.on('SIGTERM',()=>{});const c=spawn(process.execPath,['-e',${JSON.stringify(childSource)}],{stdio:'ignore'});fs.writeFileSync(${JSON.stringify(pidFile)},JSON.stringify({root:process.pid,child:c.pid}));setInterval(()=>{},1000)`;
  const result = await runCheck(process.execPath, ["-e", rootSource], { timeoutMs: 700, stdio: "ignore" });
  assert.equal(result.timedOut, true);
  assert.ok(existsSync(pidFile), "descendant started before timeout");
  const { root, child } = JSON.parse(readFileSync(pidFile, "utf8"));
  const grandchild = await waitForPidFile(grandchildPidFile, 1_000);
  for (const pid of [root, child, grandchild].filter(Boolean)) await waitUntilNotRunning(pid);
});

test("timeout cleanup best-effort kills an observed detached grandchild without signalling unrelated processes", { skip: process.platform === "win32" }, async () => {
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

test("a reparented detached grandchild has best-effort cleanup and timeout remains BLOCKED", { skip: process.platform === "win32" }, async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "gatecommit-reparent-race-")); roots.push(directory);
  const pidFile = join(directory, "detached.json");
  const childPidFile = join(directory, "transient-child.pid");
  const grandchildSource = `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(pidFile)},JSON.stringify({pid:process.pid,ppid:process.ppid}));setInterval(()=>{},1000)`;
  const transientChildSource = `const{spawn}=require('node:child_process');const g=spawn(process.execPath,['-e',${JSON.stringify(grandchildSource)}],{detached:true,stdio:'ignore'});g.unref()`;
  const rootSource = `const{spawn}=require('node:child_process');const fs=require('node:fs');setTimeout(()=>{const c=spawn(process.execPath,['-e',${JSON.stringify(transientChildSource)}],{stdio:'ignore'});fs.writeFileSync(${JSON.stringify(childPidFile)},String(c.pid))},1100);setInterval(()=>{},1000)`;
  let escapedPid;
  try {
    const result = await runCheck(process.execPath, ["-e", rootSource], { timeoutMs: 2_200, stdio: "ignore" });
    assert.equal(result.timedOut, true, "timeout remains BLOCKED even when detached cleanup is not possible");
    const childPid = Number(readFileSync(childPidFile, "utf8"));
    const { pid, ppid } = JSON.parse(readFileSync(pidFile, "utf8"));
    escapedPid = pid;
    await waitUntilNotRunning(childPid);
    assert.notEqual(ppid, childPid, "the detached grandchild has been reparented after its short-lived parent exited");
    t.diagnostic(await processIsRunning(pid)
      ? "detached grandchild remained alive in this run; fixture will clean it up"
      : "best-effort cleanup found and terminated the detached grandchild in this run");
  } finally {
    if (!escapedPid && existsSync(pidFile)) escapedPid = JSON.parse(readFileSync(pidFile, "utf8")).pid;
    if (escapedPid && await processIsRunning(escapedPid)) {
      try { process.kill(escapedPid, "SIGKILL"); } catch { /* It may already have exited. */ }
      await waitUntilNotRunning(escapedPid);
    }
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

async function waitForPidFile(path, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(path) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
  if (!existsSync(path)) throw new Error(`timed out waiting for ${path}`);
  return Number(readFileSync(path, "utf8"));
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
