import { createHash } from "node:crypto";
import { closeSync, existsSync, lstatSync, openSync, readlinkSync, readSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { readGitDelta } from "./git-delta.mjs";

export const INTERNAL_COMMIT_HOOK = "GATECOMMIT_INTERNAL_COMMIT";

export function inspectGitState(root) {
  const topLevel = gitText(root, ["rev-parse", "--show-toplevel"]);
  if (!topLevel.ok) return failure(`no se pudo determinar el repositorio: ${topLevel.reason}`);
  if (realpathSync(topLevel.value) !== realpathSync(root)) return failure("el proyecto no está en la raíz del repositorio Git");

  const branch = gitText(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  if (!branch.ok) return failure("HEAD está detached; cambia a una rama antes de ejecutar GateCommit");

  const head = gitText(root, ["rev-parse", "--verify", "HEAD^{commit}"]);
  if (!head.ok) return failure("el repositorio no tiene un commit inicial");

  const operation = findGitOperation(root);
  if (operation) return failure(`hay una operación Git en curso (${operation})`);

  const lockPath = gitText(root, ["rev-parse", "--git-path", "index.lock"]);
  if (!lockPath.ok) return failure(`no se pudo revisar el bloqueo del índice: ${lockPath.reason}`);
  if (existsSync(resolve(root, lockPath.value))) return failure("el índice Git está bloqueado por otra operación");

  const unmerged = gitText(root, ["ls-files", "-u", "-z"]);
  if (!unmerged.ok) return failure(`no se pudo revisar el índice: ${unmerged.reason}`);
  if (unmerged.value) return failure("hay conflictos sin resolver en el índice");

  const remote = gitText(root, ["config", "--get", `branch.${branch.value}.remote`]);
  const mergeRef = gitText(root, ["config", "--get", `branch.${branch.value}.merge`]);
  if (!remote.ok || !mergeRef.ok) return failure("la rama actual no tiene upstream configurado");
  if (remote.value === ".") return failure("el upstream apunta a una rama local, no a un remoto publicable");
  if (!mergeRef.value.startsWith("refs/heads/")) return failure("la rama upstream configurada no es válida");

  const remoteUrl = gitText(root, ["remote", "get-url", remote.value]);
  if (!remoteUrl.ok) return failure(`el remoto upstream '${remote.value}' no está configurado`);

  const upstreamBranch = mergeRef.value.slice("refs/heads/".length);
  const upstreamRef = `refs/remotes/${remote.value}/${upstreamBranch}`;
  const fetch = git(root, ["fetch", "--quiet", "--no-tags", remote.value, `${mergeRef.value}:${upstreamRef}`]);
  if (!fetch.ok) return failure(`no se pudo actualizar el upstream '${remote.value}/${upstreamBranch}': ${fetch.reason}`);

  const upstream = gitText(root, ["rev-parse", "--verify", `${upstreamRef}^{commit}`]);
  if (!upstream.ok) return failure(`no se pudo resolver el upstream '${remote.value}/${upstreamBranch}'`);

  const counts = gitText(root, ["rev-list", "--left-right", "--count", `HEAD...${upstreamRef}`]);
  if (!counts.ok) return failure(`no se pudo comparar HEAD con upstream: ${counts.reason}`);
  const [localAhead, remoteAhead] = counts.value.trim().split(/\s+/u).map(Number);
  if (!Number.isInteger(localAhead) || !Number.isInteger(remoteAhead)) return failure("Git devolvió un conteo de sincronización inválido");

  const delta = readGitDelta(root);
  if (!delta) return failure("Git no pudo determinar de forma segura los cambios locales");

  return {
    ok: true,
    branch: branch.value,
    head: head.value,
    remote: remote.value,
    mergeRef: mergeRef.value,
    upstreamBranch,
    upstreamRef,
    upstream: upstream.value,
    localAhead,
    remoteAhead,
    delta,
  };
}

export function captureWorktreeSnapshot(root) {
  const state = inspectLocalState(root);
  if (!state.ok) return state;

  const delta = readGitDelta(root);
  if (!delta) return failure("Git no pudo determinar de forma segura los cambios locales");
  const cachedDiff = git(root, ["diff", "--cached", "--binary", "--no-ext-diff"], { encoding: "buffer" });
  if (!cachedDiff.ok) return failure(`no se pudo capturar el índice staged: ${cachedDiff.reason}`);
  const workingDiff = git(root, ["diff", "--binary", "--no-ext-diff"], { encoding: "buffer" });
  if (!workingDiff.ok) return failure(`no se pudo capturar el working tree: ${workingDiff.reason}`);

  const files = [];
  try {
    for (const path of [...delta.files].sort()) files.push(fileSnapshot(root, path));
  } catch (error) {
    return failure(`no se pudo capturar el contenido cambiado: ${error.message}`);
  }

  const filesFingerprint = digest(JSON.stringify(files));
  const fingerprint = digest(JSON.stringify({
    branch: state.branch,
    head: state.head,
    upstream: state.upstream,
    changes: delta.changes,
    cachedDiff: digest(cachedDiff.stdout),
    workingDiff: digest(workingDiff.stdout),
    filesFingerprint,
  }));

  return { ok: true, fingerprint, filesFingerprint, files, branch: state.branch, head: state.head, upstream: state.upstream };
}

export function syncValidatedChanges(root, initialState, initialSnapshot, commitMessage) {
  const currentState = inspectGitState(root);
  if (!currentState.ok) return syncFailure(currentState.reason);
  if (currentState.branch !== initialState.branch || currentState.head !== initialState.head || currentState.upstream !== initialState.upstream) {
    return syncFailure("rama, HEAD o upstream cambiaron durante el gate; ejecuta GateCommit nuevamente");
  }
  if (currentState.remoteAhead > 0) return syncFailure(remoteAheadMessage(currentState));

  const currentSnapshot = captureWorktreeSnapshot(root);
  if (!currentSnapshot.ok) return syncFailure(currentSnapshot.reason);
  if (currentSnapshot.fingerprint !== initialSnapshot.fingerprint) {
    return syncFailure("working tree changed during gate; run gatecommit again");
  }

  let commit = "NOT_REQUIRED";
  if (currentState.delta.files.length > 0) {
    const identity = checkIdentity(root);
    if (!identity.ok) return syncFailure(identity.reason);

    const changes = git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { encoding: "buffer" });
    if (!changes.ok) return syncFailure(`no se pudieron enumerar los cambios para staging: ${changes.reason}`);
    const listedChanges = parsePorcelainChanges(changes.stdout);
    if (!listedChanges) return syncFailure("Git devolvió una lista de cambios inválida");
    console.log(`GIT_CHANGES files=${listedChanges.length}`);
    for (const change of listedChanges) {
      console.log(`${change.status} ${displayGitPath(change.path)}${change.originalPath === undefined ? "" : ` <- ${displayGitPath(change.originalPath)}`}`);
    }

    const add = git(root, ["add", "-A", "--"], { stdio: "inherit" });
    if (!add.ok) return syncFailure(`git add -A falló: ${add.reason}`);

    const stagedFiles = git(root, ["diff", "--cached", "--name-only", "-z"], { encoding: "buffer" });
    if (!stagedFiles.ok) return syncFailure(`no se pudo verificar el staging: ${stagedFiles.reason}`);
    const stagedPaths = stagedFiles.stdout.toString("utf8").split("\0").filter(Boolean);
    if (stagedPaths.length === 0) {
      console.log("GIT_STAGED files=0");
    } else {
      console.log(`GIT_STAGED files=${stagedPaths.length}`);
    }

    const afterAdd = captureWorktreeSnapshot(root);
    if (!afterAdd.ok) return syncFailure(afterAdd.reason);
    if (afterAdd.branch !== initialSnapshot.branch || afterAdd.head !== initialSnapshot.head || afterAdd.filesFingerprint !== initialSnapshot.filesFingerprint) {
      return syncFailure("working tree changed while staging; no commit created");
    }

    const cachedChange = git(root, ["diff", "--cached", "--quiet", "HEAD", "--"]);
    if (!cachedChange.ok && cachedChange.status !== 1) return syncFailure(`no se pudo comprobar el staging: ${cachedChange.reason}`);
    if (cachedChange.status !== 0) {
      const expectedTree = gitText(root, ["write-tree"]);
      if (!expectedTree.ok) return syncFailure(`no se pudo verificar el árbol staged: ${expectedTree.reason}`);

      const message = commitMessage ?? "chore: sync validated changes";
      const committed = git(root, ["commit", "-m", message], {
        stdio: "inherit",
        env: { [INTERNAL_COMMIT_HOOK]: "1" },
      });
      if (!committed.ok) return syncFailure(`git commit falló: ${committed.reason}`);

      const head = gitText(root, ["rev-parse", "--verify", "HEAD"]);
      const commitTree = gitText(root, ["rev-parse", "--verify", "HEAD^{tree}"]);
      if (!head.ok || !commitTree.ok) return syncFailure("no se pudo verificar el commit creado");
      if (commitTree.value !== expectedTree.value) return syncFailure("un hook modificó el contenido staged; el commit local se conserva y no se publicará");
      if (head.value === initialSnapshot.head) return syncFailure("Git informó éxito sin crear un commit nuevo");

      commit = head.value;
      console.log(`COMMIT ${commit} PASS`);
    }
  }

  if (commit === "NOT_REQUIRED") console.log("COMMIT NOT_REQUIRED");

  const prePushDelta = readGitDelta(root);
  if (!prePushDelta) return syncFailure("Git no pudo comprobar el working tree antes del push", { commit });
  if (prePushDelta.files.length !== 0) return syncFailure("quedaron cambios después del commit; no se publicará", { commit });

  const headBeforePush = gitText(root, ["rev-parse", "--verify", "HEAD"]);
  if (!headBeforePush.ok) return syncFailure(`no se pudo verificar HEAD antes del push: ${headBeforePush.reason}`);

  if (currentState.localAhead === 0 && commit === "NOT_REQUIRED") {
    console.log("PUSH NOT_REQUIRED");
    console.log("SYNC PASS");
    return { ok: true, commit, pushed: false };
  }

  const push = git(root, ["push", currentState.remote, `HEAD:${currentState.mergeRef}`], { stdio: "inherit" });
  if (!push.ok) {
    console.error(`PUSH ${currentState.remote}/${currentState.upstreamBranch} FAIL detail=${JSON.stringify(push.reason)}`);
    return syncFailure(`git push falló: ${push.reason}; el commit local se conserva`, { commit, pushFailed: true });
  }
  console.log(`PUSH ${currentState.remote}/${currentState.upstreamBranch} PASS`);

  const finalState = inspectGitState(root);
  if (!finalState.ok) return syncFailure(`no se pudo verificar la sincronización final: ${finalState.reason}`, { commit, pushed: true });
  const finalSnapshot = captureWorktreeSnapshot(root);
  if (!finalSnapshot.ok) return syncFailure(`no se pudo verificar el working tree final: ${finalSnapshot.reason}`, { commit, pushed: true });
  if (finalState.head !== headBeforePush.value) return syncFailure("HEAD cambió durante el push", { commit, pushed: true });
  if (finalState.localAhead !== 0 || finalState.remoteAhead !== 0) return syncFailure("local y upstream no quedaron sincronizados", { commit, pushed: true });
  if (finalState.delta.files.length !== 0) return syncFailure("quedaron cambios en el working tree después del push", { commit, pushed: true });
  console.log("SYNC PASS");
  return { ok: true, commit, pushed: true };
}

export function formatGitState(state) {
  return `GIT_STATE branch=${state.branch} upstream=${state.remote}/${state.upstreamBranch} staged=${count(state.delta.changes, "staged")} unstaged=${count(state.delta.changes, "unstaged")} untracked=${count(state.delta.changes, "untracked")} local_ahead=${state.localAhead} remote_ahead=${state.remoteAhead}`;
}

export function remoteAheadMessage(state) {
  return `upstream tiene ${state.remoteAhead} commit(s) que no están en la rama local; reconcilia manualmente antes de reintentar`;
}

function parsePorcelainChanges(buffer) {
  const records = buffer.toString("utf8").split("\0");
  if (records.at(-1) === "") records.pop();
  const changes = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record.length < 4 || record[2] !== " ") return null;
    const code = record.slice(0, 2);
    const path = record.slice(3);
    if (!path) return null;
    let status = code;
    let originalPath;
    if (code === "??") status = "??";
    else {
      const kind = [...code].find((value) => "MADRC".includes(value));
      status = kind === "R" || kind === "C" ? "R " : kind === "A" ? "A " : kind === "D" ? "D " : "M ";
      if (kind === "R" || kind === "C") {
        originalPath = records[++index];
        if (originalPath === undefined || originalPath === "") return null;
      }
    }
    changes.push({ status, path, originalPath });
  }
  return changes;
}

function displayGitPath(path) {
  return /[\r\n\t\0]/u.test(path) ? JSON.stringify(path) : path;
}

function inspectLocalState(root) {
  const branch = gitText(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  if (!branch.ok) return failure("HEAD está detached");
  const head = gitText(root, ["rev-parse", "--verify", "HEAD^{commit}"]);
  if (!head.ok) return failure("el repositorio no tiene un commit inicial");
  const upstream = gitText(root, ["rev-parse", "--verify", "@{upstream}^{commit}"]);
  if (!upstream.ok) return failure("la rama actual no tiene upstream configurado");
  return { ok: true, branch: branch.value, head: head.value, upstream: upstream.value };
}

function findGitOperation(root) {
  const operations = [
    ["MERGE_HEAD", "merge"],
    ["CHERRY_PICK_HEAD", "cherry-pick"],
    ["REVERT_HEAD", "revert"],
    ["REBASE_HEAD", "rebase"],
    ["rebase-apply", "rebase"],
    ["rebase-merge", "rebase"],
    ["BISECT_LOG", "bisect"],
    ["sequencer", "sequencer"],
  ];

  for (const [gitPath, name] of operations) {
    const path = gitText(root, ["rev-parse", "--git-path", gitPath]);
    if (!path.ok) return name;
    if (existsSync(resolve(root, path.value))) return name;
  }
  return null;
}

function checkIdentity(root) {
  for (const name of ["user.name", "user.email"]) {
    const value = gitText(root, ["config", "--get", name]);
    if (!value.ok || !value.value.trim()) return failure(`falta git config ${name}; configúrala y vuelve a ejecutar GateCommit`);
  }
  return { ok: true };
}

function fileSnapshot(root, path) {
  const absolute = resolve(root, path);
  const fromRoot = relative(root, absolute);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) throw new Error(`ruta fuera del repositorio: ${path}`);

  let before;
  try {
    before = lstatSync(absolute, { bigint: true });
  } catch (error) {
    if (error.code === "ENOENT") return { path, state: "deleted" };
    throw error;
  }

  let contentHash;
  let kind;
  if (before.isSymbolicLink()) {
    kind = "symlink";
    contentHash = digest(readlinkSync(absolute));
  } else if (before.isFile()) {
    kind = "file";
    contentHash = hashFile(absolute);
  } else {
    throw new Error(`tipo de archivo no soportado: ${path}`);
  }

  const after = lstatSync(absolute, { bigint: true });
  if (!sameStat(before, after)) throw new Error(`el archivo cambió al capturar el delta: ${path}`);
  return { path, kind, mode: String(before.mode & 0o777n), contentHash };
}

function hashFile(path) {
  const hash = createHash("sha256");
  const fd = openSync(path, "r");
  const buffer = Buffer.alloc(64 * 1024);
  try {
    let bytesRead;
    do {
      bytesRead = readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    closeSync(fd);
  }
  return hash.digest("hex");
}

function sameStat(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mode === right.mode
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function count(changes, key) {
  return changes.filter((change) => change[key]).length;
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function gitText(root, args) {
  const result = git(root, args);
  return result.ok ? { ...result, value: result.stdout.trim() } : result;
}

function git(root, args, options = {}) {
  const env = { ...process.env, ...options.env };
  if (env.CI === undefined) env.CI = "true";
  if (env.GIT_TERMINAL_PROMPT === undefined) env.GIT_TERMINAL_PROMPT = "0";
  const spawnOptions = {
    cwd: root,
    env,
    stdio: options.stdio,
    maxBuffer: 64 * 1024 * 1024,
  };
  if (options.encoding === "buffer") spawnOptions.encoding = "buffer";
  else spawnOptions.encoding = options.encoding ?? "utf8";
  const result = spawnSync("git", args, spawnOptions);
  if (result.error || result.status !== 0) {
    const output = [result.stderr, result.stdout].filter((value) => typeof value === "string" && value.trim()).join("\n");
    return {
      ok: false,
      status: result.status,
      reason: result.error?.message ?? (output || `exit status ${result.status}`),
    };
  }
  return { ok: true, status: result.status, stdout: result.stdout ?? "" };
}

function failure(reason) {
  return { ok: false, reason };
}

function syncFailure(reason, details = {}) {
  console.error(`SYNC BLOCKED detail=${JSON.stringify(reason)}`);
  console.log("SYNC FAIL");
  return { ok: false, reason, ...details };
}
