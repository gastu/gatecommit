import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const gate = fileURLToPath(new URL("./blueprint-gate.mjs", import.meta.url));
const roots = [];

test.afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("valid gate commits changed files and pushes to the configured upstream", () => {
  const { root, remote } = createProject();
  writeFileSync(join(root, "README.md"), "validated update\n");

  const result = runGate(root);

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /COMMIT [0-9a-f]+ PASS/u);
  assert.match(result.stdout, /PUSH origin\/main PASS/u);
  assert.match(result.stdout, /SYNC PASS/u);
  assert.equal(git(root, ["log", "-1", "--format=%s"]), "chore: sync validated changes");
  assert.equal(git(remote, ["log", "-1", "--format=%s"]), "chore: sync validated changes");
  assert.equal(git(root, ["status", "--porcelain"]), "");
});

test("explicit commit message is used verbatim", () => {
  const { root, remote } = createProject();
  writeFileSync(join(root, "README.md"), "changed\n");

  const result = runGate(root, "docs: explain sync behavior");

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(git(root, ["log", "-1", "--format=%s"]), "docs: explain sync behavior");
  assert.equal(git(remote, ["log", "-1", "--format=%s"]), "docs: explain sync behavior");
});

test("push uses the configured upstream without force options", () => {
  const { root } = createProject();
  writeFileSync(join(root, "README.md"), "change\n");
  const shim = mkdtempSync(join(tmpdir(), "gatecommit-git-shim-"));
  roots.push(shim);
  const argsFile = join(shim, "push-args.txt");
  writeFileSync(join(shim, "git"), `#!/bin/sh\nif [ "$1" = "push" ]; then printf '%s\\n' "$@" > '${argsFile}'; fi\nexec /usr/bin/git "$@"\n`);
  chmodSync(join(shim, "git"), 0o755);
  const env = { ...process.env, CI: "true", PATH: `${shim}${delimiter}${process.env.PATH ?? ""}` };

  const result = runGate(root, undefined, env);

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(readFileSync(argsFile, "utf8"), "push\norigin\nHEAD:refs/heads/main\n");
  assert.doesNotMatch(readFileSync(argsFile, "utf8"), /force/u);
});

test("gate failure leaves changes uncommitted and unpublished", () => {
  const { root, remote } = createProject({ failSemgrep: true });
  writeFileSync(join(root, "README.md"), "must remain local\n");

  const result = runGate(root);

  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /TOTAL FAIL/u);
  assert.doesNotMatch(result.stdout, /GIT_STAGED|COMMIT [0-9a-f]|PUSH origin/u);
  assert.equal(git(root, ["log", "-1", "--format=%s"]), "baseline");
  assert.equal(git(remote, ["log", "-1", "--format=%s"]), "baseline");
  assert.equal(readFileSync(join(root, "README.md"), "utf8"), "must remain local\n");
});

test("clean synchronized repository does not create an empty commit or push", () => {
  const { root } = createProject();
  const baseline = git(root, ["rev-parse", "HEAD"]);

  const result = runGate(root);

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /COMMIT NOT_REQUIRED/u);
  assert.match(result.stdout, /PUSH NOT_REQUIRED/u);
  assert.equal(git(root, ["rev-parse", "HEAD"]), baseline);
});

test("existing local commits are pushed after the gate passes", () => {
  const { root, remote } = createProject();
  writeFileSync(join(root, "ahead.txt"), "local commit\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", "existing local commit"]);

  const result = runGate(root);

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /COMMIT NOT_REQUIRED/u);
  assert.match(result.stdout, /PUSH origin\/main PASS/u);
  assert.equal(git(remote, ["log", "-1", "--format=%s"]), "existing local commit");
});

test("pre-commit hooks can invoke GateCommit without recursion", () => {
  const { root, remote } = createProject();
  const hooks = join(root, ".git", "hooks");
  const marker = join(root, "..", "hook-ran.txt");
  writeFileSync(join(hooks, "pre-commit"), `#!/bin/sh\nnode '${gate}' > '${marker}'\n`);
  chmodSync(join(hooks, "pre-commit"), 0o755);
  writeFileSync(join(root, "README.md"), "hook test\n");

  const result = runGate(root);

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(readFileSync(marker, "utf8"), /GATECOMMIT pre-commit hook: parent validation passed/u);
  assert.equal(git(remote, ["log", "-1", "--format=%s"]), "chore: sync validated changes");
});

test("remote ahead blocks before validation and preserves the worktree", () => {
  const { root, remote, peer } = createProject({ peer: true });
  writeFileSync(join(peer, "remote.txt"), "remote advance\n");
  git(peer, ["add", "-A"]);
  git(peer, ["commit", "-m", "remote advance"]);
  git(peer, ["push", "origin", "HEAD:refs/heads/main"]);
  writeFileSync(join(root, "README.md"), "keep local\n");

  const result = runGate(root);

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /upstream tiene 1 commit/u);
  assert.equal(git(root, ["log", "-1", "--format=%s"]), "baseline");
  assert.equal(readFileSync(join(root, "README.md"), "utf8"), "keep local\n");
  assert.equal(git(remote, ["log", "-1", "--format=%s"]), "remote advance");
});

test("divergence blocks without merge or rebase", () => {
  const { root, remote, peer } = createProject({ peer: true });
  writeFileSync(join(root, "local.txt"), "local commit\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", "local advance"]);
  writeFileSync(join(peer, "remote.txt"), "remote commit\n");
  git(peer, ["add", "-A"]);
  git(peer, ["commit", "-m", "remote advance"]);
  git(peer, ["push", "origin", "HEAD:refs/heads/main"]);

  const result = runGate(root);

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /upstream tiene 1 commit/u);
  assert.equal(git(root, ["log", "-1", "--format=%s"]), "local advance");
  assert.equal(git(remote, ["log", "-1", "--format=%s"]), "remote advance");
  assert.equal(git(root, ["status", "--porcelain"]), "");
});

test("missing upstream blocks without changing files", () => {
  const { root } = createProject();
  git(root, ["branch", "--unset-upstream"]);
  writeFileSync(join(root, "README.md"), "keep local\n");

  const result = runGate(root);

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /rama actual no tiene upstream/u);
  assert.equal(git(root, ["log", "-1", "--format=%s"]), "baseline");
  assert.equal(readFileSync(join(root, "README.md"), "utf8"), "keep local\n");
});

test("missing commit identity blocks before staging", () => {
  const { root } = createProject();
  writeFileSync(join(root, "README.md"), "keep unstaged\n");
  git(root, ["config", "user.name", ""]);

  const result = runGate(root);

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /falta git config user\.name/u);
  assert.equal(git(root, ["diff", "--cached", "--name-only"]), "");
  assert.equal(readFileSync(join(root, "README.md"), "utf8"), "keep unstaged\n");
});

test("missing user.email blocks before staging", () => {
  const { root } = createProject();
  writeFileSync(join(root, "README.md"), "keep unstaged\n");
  git(root, ["config", "user.email", ""]);

  const result = runGate(root);

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /falta git config user\.email/u);
  assert.equal(git(root, ["diff", "--cached", "--name-only"]), "");
  assert.equal(readFileSync(join(root, "README.md"), "utf8"), "keep unstaged\n");
});

test("index lock blocks before checks can stage anything", () => {
  const { root } = createProject();
  const lock = git(root, ["rev-parse", "--git-path", "index.lock"]);
  writeFileSync(join(root, lock), "busy\n");
  writeFileSync(join(root, "README.md"), "preserve\n");

  const result = runGate(root);

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /índice Git está bloqueado/u);
  assert.equal(git(root, ["log", "-1", "--format=%s"]), "baseline");
  assert.equal(readFileSync(join(root, "README.md"), "utf8"), "preserve\n");
});

test("empty repository blocks without creating a first commit", () => {
  const base = mkdtempSync(join(tmpdir(), "gatecommit-empty-"));
  roots.push(base);
  const root = join(base, "project");
  mkdirSync(root);
  git(root, ["init", "-q", "-b", "main"]);
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "empty", scripts: {} }));

  const result = runGate(root);

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /no tiene un commit inicial/u);
  assert.notEqual(spawnSync("git", ["rev-parse", "--verify", "HEAD"], { cwd: root }).status, 0);
});

test("configured upstream with no remote blocks clearly", () => {
  const { root } = createProject();
  git(root, ["remote", "remove", "origin"]);
  git(root, ["config", "branch.main.remote", "origin"]);
  git(root, ["config", "branch.main.merge", "refs/heads/main"]);
  writeFileSync(join(root, "README.md"), "preserve\n");

  const result = runGate(root);

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /remoto upstream 'origin' no está configurado/u);
  assert.equal(git(root, ["log", "-1", "--format=%s"]), "baseline");
  assert.equal(readFileSync(join(root, "README.md"), "utf8"), "preserve\n");
});

test("merge in progress blocks without modifying the worktree", () => {
  const { root } = createProject();
  const mergeHead = git(root, ["rev-parse", "--git-path", "MERGE_HEAD"]);
  writeFileSync(join(root, mergeHead), `${git(root, ["rev-parse", "HEAD"])}\n`);
  writeFileSync(join(root, "README.md"), "preserve\n");

  const result = runGate(root);

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /operación Git en curso \(merge\)/u);
  assert.equal(git(root, ["log", "-1", "--format=%s"]), "baseline");
  assert.equal(readFileSync(join(root, "README.md"), "utf8"), "preserve\n");
});

test("concurrent content change during gate blocks before staging", () => {
  const { root } = createProject({ mutateDuringGate: true });
  writeFileSync(join(root, "README.md"), "first snapshot\n");

  const result = runGate(root);

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /working tree changed during gate/u);
  assert.equal(git(root, ["diff", "--cached", "--name-only"]), "");
  assert.equal(git(root, ["log", "-1", "--format=%s"]), "baseline");
  assert.equal(readFileSync(join(root, "README.md"), "utf8"), "changed by gate check\n");
});

test("push rejection keeps the validated local commit", () => {
  const { root, remote } = createProject({ rejectPush: true });
  writeFileSync(join(root, "README.md"), "validated locally\n");

  const result = runGate(root);

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /PUSH origin\/main FAIL/u);
  assert.match(result.stdout + result.stderr, /el commit local se conserva/u);
  assert.equal(git(root, ["log", "-1", "--format=%s"]), "chore: sync validated changes");
  assert.equal(git(remote, ["log", "-1", "--format=%s"]), "baseline");
  assert.equal(git(root, ["status", "--porcelain"]), "");
});

test("documentation profile uses the same commit and push flow", () => {
  const { root, remote } = createProject({ documentation: true });
  writeFileSync(join(root, "README.md"), "# Updated docs\n");
  const shim = mkdtempSync(join(tmpdir(), "gatecommit-doc-bin-"));
  roots.push(shim);
  mkdirSync(shim, { recursive: true });
  const gitleaks = join(shim, "gitleaks");
  writeFileSync(gitleaks, "#!/bin/sh\nexit 0\n");
  chmodSync(gitleaks, 0o755);
  const env = { ...process.env, PATH: `${shim}${delimiter}${process.env.PATH ?? ""}` };

  const result = spawnSync(process.execPath, [gate, "--profile=documentation"], { cwd: root, encoding: "utf8", env, timeout: 30000 });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /TOTAL PASS checks=7/u);
  assert.match(result.stdout, /PUSH origin\/main PASS/u);
  assert.equal(git(remote, ["log", "-1", "--format=%s"]), "chore: sync validated changes");
});

test("detached HEAD blocks without moving HEAD or changing files", () => {
  const { root } = createProject();
  const head = git(root, ["rev-parse", "HEAD"]);
  git(root, ["checkout", "--detach", "-q"]);
  writeFileSync(join(root, "README.md"), "preserve\n");

  const result = runGate(root);

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /HEAD está detached/u);
  assert.equal(git(root, ["rev-parse", "HEAD"]), head);
  assert.equal(readFileSync(join(root, "README.md"), "utf8"), "preserve\n");
});

function createProject({ failSemgrep = false, mutateDuringGate = false, rejectPush = false, peer = false, documentation = false } = {}) {
  const base = mkdtempSync(join(tmpdir(), "gatecommit-sync-"));
  roots.push(base);
  const root = join(base, "project");
  const remote = join(base, "remote.git");
  mkdirSync(root);
  execFileSync("git", ["init", "--bare", "-q", "-b", "main", remote]);
  writeFileSync(join(root, "README.md"), "# Baseline\n");
  if (!documentation) {
    const semgrep = mutateDuringGate
      ? `node -e 'require("node:fs").writeFileSync("README.md", "changed by gate check\\n")'`
      : failSemgrep ? "node -e 'process.exit(1)'" : "node -e 'process.exit(0)'";
    writeFileSync(join(root, "package.json"), JSON.stringify({
      name: "gatecommit-sync-test",
      version: "1.0.0",
      scripts: {
        "contract:validate": "node -e 'process.exit(0)'",
        "security:semgrep": semgrep,
        "security:semgrep:test": "node -e 'process.exit(0)'",
      },
    }, null, 2));
  } else {
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "gatecommit-sync-docs", type: "module" }));
    mkdirSync(join(root, "scripts"));
    writeFileSync(join(root, "scripts", "validate-dependency-policy.mjs"), "export function validateDependencyPolicy() { return []; }\n");
    for (const name of ["gate-metrics", "validate-dependency-policy", "validate-derived-contract"]) {
      writeFileSync(join(root, "scripts", `${name}.test.mjs`), "import test from 'node:test'; test('fixture', () => {});\n");
    }
  }
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "gatecommit-test@example.invalid"]);
  git(root, ["config", "user.name", "GateCommit Test"]);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", "baseline"]);
  git(root, ["remote", "add", "origin", remote]);
  git(root, ["push", "-u", "origin", "main"]);
  if (rejectPush) {
    const hook = join(remote, "hooks", "pre-receive");
    writeFileSync(hook, "#!/bin/sh\necho rejected for test >&2\nexit 1\n");
    chmodSync(hook, 0o755);
  }
  let peerRoot;
  if (peer) {
    peerRoot = join(base, "peer");
    execFileSync("git", ["clone", "-q", remote, peerRoot]);
    git(peerRoot, ["config", "user.email", "gatecommit-peer@example.invalid"]);
    git(peerRoot, ["config", "user.name", "GateCommit Peer"]);
  }
  return { root, remote, peer: peerRoot };
}

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function runGate(root, message, env = { ...process.env, CI: "true" }) {
  const args = message === undefined ? [] : [message];
  return spawnSync(process.execPath, [gate, root, ...args], { encoding: "utf8", env, timeout: 30000 });
}
