import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

export const DEFAULT_TIMEOUT_MS = 120_000;
export const MAX_TIMEOUT_MS = 3_600_000;
export const TERMINATION_GRACE_MS = 2_000;

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
      else termination?.finally(() => complete(exitResult));
    });
    timer = setTimeout(() => {
      timedOut = true;
      termination = terminateProcessTree(child).catch(() => {
        try { child.kill("SIGKILL"); } catch { /* The child may already have exited. */ }
      }).finally(() => { if (exitResult) complete(exitResult); });
    }, timeoutMs);
    timer.unref?.();
  });
}

function validateValue(value, name, errors) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_TIMEOUT_MS) {
    errors.push(`${name} must be an integer from 1 through ${MAX_TIMEOUT_MS} milliseconds`);
  }
}

async function terminateProcessTree(child) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    const graceful = await runTaskkill(["/PID", String(child.pid), "/T"]);
    if (!graceful) { try { child.kill("SIGTERM"); } catch { /* The child may already have exited. */ } }
    await waitForChildClose(child, TERMINATION_GRACE_MS);
    const forced = await runTaskkill(["/PID", String(child.pid), "/T", "/F"]);
    if (!forced) { try { child.kill("SIGKILL"); } catch { /* The child may already have exited. */ } }
  } else {
    signalProcessGroup(child.pid, "SIGTERM");
    await waitForChildClose(child, TERMINATION_GRACE_MS);
    signalProcessGroup(child.pid, "SIGKILL");
  }
  await waitForChildClose(child);
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
