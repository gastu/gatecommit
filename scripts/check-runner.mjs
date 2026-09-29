import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

export const DEFAULT_TIMEOUT_MS = 120_000;
export const MAX_TIMEOUT_MS = 3_600_000;
export const TERMINATION_GRACE_MS = 2_000;
const PROCESS_TREE_SCAN_MS = 200;

export function validateTimeoutConfiguration(gatecommit = {}) {
  const errors = [];
  const checks = gatecommit.checks;
  const declared = Array.isArray(checks) ? checks : [];
  if (gatecommit.timeoutMs !== undefined) validateValue(gatecommit.timeoutMs, "gatecommit.timeoutMs", errors);
  if (gatecommit.checkTimeoutsMs !== undefined) {
    const overrides = gatecommit.checkTimeoutsMs;
    if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
      errors.push("gatecommit.checkTimeoutsMs must be an object mapping declared gatecommit.checks script names to integer milliseconds");
    } else {
      for (const [script, timeout] of Object.entries(overrides)) {
        if (!declared.includes(script)) errors.push(`gatecommit.checkTimeoutsMs.${script} must reference a script declared in gatecommit.checks`);
        validateValue(timeout, `gatecommit.checkTimeoutsMs.${script}`, errors);
      }
    }
  }
  return errors;
}

export function resolveCheckTimeout(gatecommit = {}, script = undefined) {
  const override = script === undefined ? undefined : gatecommit.checkTimeoutsMs?.[script];
  return override ?? gatecommit.timeoutMs ?? DEFAULT_TIMEOUT_MS;
}

export function resolveManagedCommand(command, args, { platform = process.platform, execPath = process.execPath, env = process.env, fileExists = existsSync } = {}) {
  if (platform !== "win32" || command !== "npm") return { command, args };
  const npmCli = env.npm_execpath || join(dirname(execPath), "node_modules", "npm", "bin", "npm-cli.js");
  if (!fileExists(npmCli)) return { command, args };
  return { command: execPath, args: [npmCli, ...args] };
}

export function runCheck(command, args, { cwd, env, timeoutMs = DEFAULT_TIMEOUT_MS, stdio = "inherit" } = {}) {
  return new Promise((resolve) => {
    const resolved = resolveManagedCommand(command, args, { env });
    const child = spawn(resolved.command, resolved.args, { cwd, env, stdio, detached: process.platform !== "win32", windowsHide: true });
    let timedOut = false;
    let settled = false;
    let timer;
    let exitResult;
    let termination;
    let treeMonitor;
    if (process.platform !== "win32" && child.pid) treeMonitor = monitorDescendants(child.pid);
    const complete = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...result, timedOut });
    };
    child.once("error", (error) => complete({ error, status: null, signal: null }));
    child.once("close", (status, signal) => {
      exitResult = { status, signal, error: null };
      if (!timedOut) complete(exitResult);
      else termination?.finally(() => { treeMonitor?.stop(); complete(exitResult); });
    });
    timer = setTimeout(() => {
      timedOut = true;
      termination = terminateProcessTree(child, treeMonitor).catch(() => {
        try { child.kill("SIGKILL"); } catch { /* The child may already have exited. */ }
      }).finally(() => { treeMonitor?.stop(); if (exitResult) complete(exitResult); });
    }, timeoutMs);
    timer.unref?.();
  });
}

function validateValue(value, name, errors) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_TIMEOUT_MS) {
    errors.push(`${name} must be an integer from 1 through ${MAX_TIMEOUT_MS} milliseconds`);
  }
}

async function terminateProcessTree(child, treeMonitor = undefined) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    const graceful = await runTaskkill(["/PID", String(child.pid), "/T"]);
    if (!graceful) { try { child.kill("SIGTERM"); } catch { /* The child may already have exited. */ } }
    await waitForChildClose(child, TERMINATION_GRACE_MS);
    const forced = await runTaskkill(["/PID", String(child.pid), "/T", "/F"]);
    if (!forced) { try { child.kill("SIGKILL"); } catch { /* The child may already have exited. */ } }
  } else {
    signalProcessGroup(child.pid, "SIGTERM");
    await treeMonitor?.refresh();
    await signalKnownDescendants(treeMonitor?.known, "SIGTERM");
    await waitForChildClose(child, TERMINATION_GRACE_MS);
    await treeMonitor?.refresh();
    await signalKnownDescendants(treeMonitor?.known, "SIGKILL");
    signalProcessGroup(child.pid, "SIGKILL");
  }
  await waitForChildClose(child);
}

// `ps` provides a portable POSIX parent/child snapshot. We retain process start
// identities while the check runs, then revalidate them immediately before a
// signal so PID reuse cannot normally redirect cleanup to an unrelated process.
function monitorDescendants(rootPid) {
  const known = new Map();
  let rootStart;
  let stopped = false;
  let scanInFlight;
  const scan = () => {
    if (stopped) return Promise.resolve();
    if (scanInFlight) return scanInFlight;
    scanInFlight = (async () => {
      try {
        const processes = await readProcessSnapshot();
        const children = new Map();
        for (const process of processes.values()) {
          if (!children.has(process.ppid)) children.set(process.ppid, []);
          children.get(process.ppid).push(process);
        }
        const root = processes.get(rootPid);
        if (root && rootStart === undefined) rootStart = root.start;
        const queue = [];
        if (root && root.start === rootStart) queue.push(rootPid);
        for (const [pid, identity] of known) {
          if (processes.get(pid)?.start === identity.start) queue.push(pid);
        }
        const visited = new Set(queue);
        while (queue.length) {
          const parent = queue.shift();
          for (const process of children.get(parent) ?? []) {
            if (visited.has(process.pid)) continue;
            const previous = known.get(process.pid);
            if (previous && previous.start !== process.start) continue;
            visited.add(process.pid);
            if (!previous) known.set(process.pid, process);
            queue.push(process.pid);
          }
        }
      } catch { /* A transient ps failure must not interrupt the normal group kill. */ }
    })().finally(() => { scanInFlight = undefined; });
    return scanInFlight;
  };
  void scan();
  const timer = setInterval(() => { void scan(); }, PROCESS_TREE_SCAN_MS);
  timer.unref?.();
  return { known, refresh: scan, stop: () => { stopped = true; clearInterval(timer); } };
}

function readProcessSnapshot() {
  return new Promise((resolve, reject) => {
    const ps = spawn("ps", ["-axo", "pid=,ppid=,lstart="], { stdio: ["ignore", "pipe", "ignore"] });
    let output = "";
    ps.stdout.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
    ps.once("error", reject);
    ps.once("close", (status) => {
      if (status !== 0) return reject(new Error("ps process snapshot failed"));
      const processes = new Map();
      for (const line of output.split(/\r?\n/u)) {
        const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/u);
        if (match) processes.set(Number(match[1]), { pid: Number(match[1]), ppid: Number(match[2]), start: match[3] });
      }
      resolve(processes);
    });
  });
}

async function signalKnownDescendants(known, signal) {
  if (!known?.size) return;
  let current;
  try { current = await readProcessSnapshot(); } catch { return; }
  // Descendants first, so a surviving child is signalled before its parent exits.
  const ordered = [...known.values()].sort((a, b) => processDepth(b.pid, known) - processDepth(a.pid, known));
  for (const original of ordered) {
    const present = current.get(original.pid);
    if (!present || present.start !== original.start) continue;
    try { process.kill(original.pid, signal); }
    catch (error) { if (error.code !== "ESRCH") throw error; }
  }
}

function processDepth(pid, known) {
  let depth = 0;
  let current = known.get(pid);
  const seen = new Set([pid]);
  while (current && known.has(current.ppid) && !seen.has(current.ppid)) {
    seen.add(current.ppid);
    depth += 1;
    current = known.get(current.ppid);
  }
  return depth;
}

function signalProcessGroup(pid, signal) {
  try { process.kill(-pid, signal); }
  catch (error) {
    if (error.code !== "ESRCH") {
      try { process.kill(pid, signal); } catch (fallbackError) { if (fallbackError.code !== "ESRCH") throw fallbackError; }
    }
  }
}

function waitForChildClose(child, duration = undefined) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    let timer;
    const done = () => { clearTimeout(timer); child.removeListener("close", done); resolve(); };
    child.once("close", done);
    if (duration !== undefined) timer = setTimeout(done, duration);
  });
}

function runTaskkill(args) {
  return new Promise((resolve) => {
    const killer = spawn("taskkill", args, { stdio: "ignore", windowsHide: true });
    let settled = false;
    const finish = (success) => { if (settled) return; settled = true; clearTimeout(timer); resolve(success); };
    const timer = setTimeout(() => { try { killer.kill(); } catch { /* best effort */ } finish(false); }, 1_000);
    killer.once("error", () => finish(false));
    killer.once("close", (status) => finish(status === 0));
  });
}
