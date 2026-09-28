import { spawnSync } from "node:child_process";

export function readGitDelta(root) {
  const result = spawnSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], {
    cwd: root,
    encoding: "utf8",
  });

  if (result.error || result.status !== 0) return null;
  return parseGitStatus(result.stdout);
}

export function listVersionedFiles(root) {
  const result = spawnSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" });
  if (result.error || result.status !== 0) return null;
  return result.stdout.split("\0").filter(Boolean);
}

function parseGitStatus(output) {
  const fields = output.split("\0");
  const changes = [];
  const files = new Set();

  for (let index = 0; index < fields.length;) {
    const field = fields[index++];
    if (!field) continue;
    if (field.length < 4 || field[2] !== " ") return null;

    const indexStatus = field[0];
    const worktreeStatus = field[1];
    const path = field.slice(3);
    if (!path) return null;

    const isRename = indexStatus === "R" || worktreeStatus === "R";
    const isCopy = indexStatus === "C" || worktreeStatus === "C";
    const originalPath = isRename || isCopy ? fields[index++] : undefined;
    if ((isRename || isCopy) && !originalPath) return null;
    let kind = "changed";
    if (isRename) kind = "renamed";
    else if (isCopy) kind = "copied";
    else if (indexStatus === "D" || worktreeStatus === "D") kind = "deleted";
    else if (indexStatus === "?") kind = "untracked";

    files.add(path);
    if (originalPath) files.add(originalPath);
    changes.push({
      path,
      ...(originalPath ? { originalPath } : {}),
      indexStatus,
      worktreeStatus,
      staged: indexStatus !== " " && indexStatus !== "?",
      unstaged: worktreeStatus !== " " && worktreeStatus !== "?",
      untracked: indexStatus === "?" && worktreeStatus === "?",
      kind,
    });
  }

  return { changes, files: [...files] };
}
