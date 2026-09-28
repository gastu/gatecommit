import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, renameSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { listVersionedFiles, readGitDelta } from "./git-delta.mjs";

const roots = [];

test.afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("reads staged, unstaged, and untracked changes", () => {
  const root = createRepository();
  writeFileSync(join(root, "staged.txt"), "staged\n");
  execFileSync("git", ["add", "staged.txt"], { cwd: root });
  writeFileSync(join(root, "tracked.txt"), "unstaged\n");
  writeFileSync(join(root, "new.txt"), "untracked\n");

  const delta = readGitDelta(root);
  assert.ok(delta);
  assert.equal(delta.changes.find((change) => change.path === "staged.txt")?.staged, true);
  assert.equal(delta.changes.find((change) => change.path === "tracked.txt")?.unstaged, true);
  assert.equal(delta.changes.find((change) => change.path === "new.txt")?.untracked, true);
  assert.deepEqual(new Set(delta.files), new Set(["staged.txt", "tracked.txt", "new.txt"]));
});

test("includes both paths for a staged rename", () => {
  const root = createRepository({ "rename-old.txt": "enough unchanged content for rename detection\n" });
  renameSync(join(root, "rename-old.txt"), join(root, "rename-new.txt"));
  execFileSync("git", ["add", "-A"], { cwd: root });

  const delta = readGitDelta(root);
  assert.ok(delta);
  assert.deepEqual(delta.changes.find((change) => change.kind === "renamed"), {
    path: "rename-new.txt",
    originalPath: "rename-old.txt",
    indexStatus: "R",
    worktreeStatus: " ",
    staged: true,
    unstaged: false,
    untracked: false,
    kind: "renamed",
  });
  assert.ok(delta.files.includes("rename-old.txt"));
  assert.ok(delta.files.includes("rename-new.txt"));
});

test("reports staged deletions", () => {
  const root = createRepository({ "deleted.txt": "delete me\n" });
  unlinkSync(join(root, "deleted.txt"));
  execFileSync("git", ["add", "-u"], { cwd: root });

  const delta = readGitDelta(root);
  assert.ok(delta);
  assert.equal(delta.changes.find((change) => change.path === "deleted.txt")?.kind, "deleted");
  assert.ok(delta.files.includes("deleted.txt"));
});

test("returns unknown when Git cannot determine status or tracked files", () => {
  const root = createDirectory();
  assert.equal(readGitDelta(root), null);
  assert.equal(listVersionedFiles(root), null);
});

function createRepository(files = { "tracked.txt": "initial\n" }) {
  const root = createDirectory();
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "gatecommit-test@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "GateCommit Test"], { cwd: root });
  for (const [name, contents] of Object.entries(files)) writeFileSync(join(root, name), contents);
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "baseline"], { cwd: root });
  return root;
}

function createDirectory() {
  const root = mkdtempSync(join(tmpdir(), "gatecommit-delta-"));
  roots.push(root);
  mkdirSync(root, { recursive: true });
  return root;
}
