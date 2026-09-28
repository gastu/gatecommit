import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CODE = /\.(?:c|cjs|cpp|go|java|js|mjs|py|rb|rs|sh|swift|ts|tsx|vue)$/iu;

export function detectCapabilities(root, versionedFiles, changedFiles) {
  const filesKnown = Array.isArray(versionedFiles) && Array.isArray(changedFiles);
  const files = new Set([...(versionedFiles ?? []), ...(changedFiles ?? [])]);
  const pkg = readJson(join(root, "package.json")) ?? {};
  const scripts = pkg.scripts ?? {};
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies };
  const wranglerPaths = ["wrangler.jsonc", "wrangler.toml"].filter((file) => existsSync(join(root, file)));
  const wranglerConfig = wranglerPaths.length ? readWrangler(join(root, wranglerPaths[0])) : null;
  const yamlWorkflows = listWorkflowFiles(root);
  const code = filesKnown ? [...files].some((file) => CODE.test(file)) : null;
  const typescript = filesKnown ? [...files].some((file) => /\.tsx?$/iu.test(file)) : null;
  const npm = Object.keys(allDeps).length > 0;
  const wrangler = wranglerPaths.length > 0;
  const d1Script = Object.keys(scripts).some((name) => /(?:^|:)d1(?:$|:)/iu.test(name) || /(?:^|:)d1[-_]/iu.test(name));
  // A generic file name such as database.json is not evidence of Cloudflare D1.
  // Wrangler's d1_databases declaration and explicitly named D1 scripts are.
  const d1 = wranglerConfig === null && wrangler ? null : Boolean(wranglerConfig?.d1 || d1Script);
  const kv = wranglerConfig === null && wrangler ? null : wranglerConfig?.kv ?? false;
  const r2 = wranglerConfig === null && wrangler ? null : wranglerConfig?.r2 ?? false;
  const drizzle = Object.keys(allDeps).some((name) => name === "drizzle-orm" || name.startsWith("drizzle-"))
    || [...files].some((file) => /(?:^|\/)drizzle\.config\.[cm]?[jt]s$/u.test(file));
  const githubActions = yamlWorkflows === null ? null : yamlWorkflows.length > 0;
  const application = wrangler || Object.keys(allDeps).some((name) => /^(?:hono|react|react-dom|next|express|fastify|@cloudflare\/)/u.test(name))
    || typeof scripts.build === "string" || typeof scripts.deploy === "string";

  return {
    code: capability(code, "versioned or changed supported source files"),
    typescript: capability(typescript, "versioned or changed .ts/.tsx files"),
    application: capability(application, "supported app dependency, Wrangler config, or build/deploy script"),
    npm: capability(npm, "direct npm dependencies in package.json"),
    wrangler: capability(wrangler, "wrangler.jsonc or wrangler.toml"),
    d1: capability(d1, "d1_databases config or unambiguous D1 project config/script"),
    kv: capability(kv, "kv_namespaces Wrangler binding"),
    r2: capability(r2, "r2_buckets Wrangler binding"),
    drizzle: capability(drizzle, "Drizzle dependency or configuration"),
    "github-actions": capability(githubActions, "YAML workflow directly under .github/workflows"),
    inventoryComplete: filesKnown,
    inventoryReason: filesKnown ? "" : "Git could not provide both versioned and changed file inventories",
    workflowFiles: yamlWorkflows ?? [],
    wranglerConfig,
  };
}

export function result(name, status, detail = "", duration = 0) {
  if (!["PASS", "BLOCKED", "REVIEW", "N/A"].includes(status)) throw new TypeError(`Invalid result status: ${status}`);
  if ((status === "N/A" || status === "REVIEW") && !detail) throw new TypeError(`${status} requires a reason`);
  return { name, status, detail, duration };
}

export function summarizeResults(results) {
  const blocked = results.filter(({ status }) => status === "BLOCKED").length;
  const review = results.filter(({ status }) => status === "REVIEW").length;
  return {
    blocked,
    review,
    notApplicable: results.filter(({ status }) => status === "N/A").length,
    passed: results.filter(({ status }) => status === "PASS").length,
    status: blocked ? "BLOCKED" : review ? "REVIEW" : "PASS",
  };
}

export function validateWranglerConfig(config, root = null) {
  const failures = [];
  if (!config || typeof config !== "object") return ["Wrangler configuration is unreadable or invalid"];
  const seenD1Bindings = new Set(); const seenD1Names = new Set();
  for (const binding of config.d1Bindings ?? []) {
    if (!binding.binding || !binding.database_name) failures.push("D1 binding requires binding and database_name");
    if (binding.binding && seenD1Bindings.has(binding.binding)) failures.push(`D1 binding name ${binding.binding} is duplicated`);
    if (binding.database_name && seenD1Names.has(binding.database_name)) failures.push(`D1 logical database name ${binding.database_name} is duplicated`);
    if (binding.binding) seenD1Bindings.add(binding.binding);
    if (binding.database_name) seenD1Names.add(binding.database_name);
    if (!binding.database_id) failures.push(`D1 binding ${binding.binding ?? "unknown"} requires database_id`);
    else if (/^(?:todo|replace|your[-_])/iu.test(binding.database_id)) failures.push(`D1 binding ${binding.binding ?? "unknown"} has a placeholder database_id`);
  }
  for (const binding of config.kvBindings ?? []) {
    if (!binding.binding || !binding.id) failures.push("KV binding requires binding and id");
    if (binding.id && /^(?:todo|replace|your[-_])/iu.test(binding.id)) failures.push(`KV binding ${binding.binding ?? "unknown"} has a placeholder id`);
  }
  for (const binding of config.r2Bindings ?? []) {
    if (!binding.binding || !binding.bucket_name) failures.push("R2 binding requires binding and bucket_name");
  }
  if ((config.d1Bindings ?? []).length && root) {
    const migrationDirectory = join(root, config.migrationsDir || "migrations");
    if (!existsSync(migrationDirectory)) failures.push(`D1 migrations directory is missing: ${config.migrationsDir || "migrations"}`);
    else {
      const migrations = safeEntries(migrationDirectory).filter((name) => name.endsWith(".sql"));
      if (!migrations.length) failures.push(`D1 migrations directory has no SQL migrations: ${config.migrationsDir || "migrations"}`);
      for (const migration of migrations) {
        try { if (!readFileSync(join(migrationDirectory, migration), "utf8").trim()) failures.push(`D1 migration is empty: ${migration}`); }
        catch { failures.push(`D1 migration cannot be read: ${migration}`); }
      }
    }
  }
  return failures;
}

function capability(present, signal) {
  return { present, signal, reason: present === true ? "" : present === false ? `No ${signal} detected` : `Cannot determine ${signal}` };
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

function readWrangler(path) {
  try {
    const source = readFileSync(path, "utf8");
    if (path.endsWith(".jsonc")) {
      const json = source.replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gmu, "$1").replace(/,\s*([}\]])/gu, "$1");
      const data = JSON.parse(json);
      const bindings = (key) => [...(data[key] ?? []), ...Object.values(data.env ?? {}).flatMap((env) => env[key] ?? [])];
      const d1Declared = Object.hasOwn(data, "d1_databases") || Object.values(data.env ?? {}).some((env) => Object.hasOwn(env, "d1_databases"));
      return { d1Bindings: bindings("d1_databases"), kvBindings: bindings("kv_namespaces"), r2Bindings: bindings("r2_buckets"), migrationsDir: data.migrations_dir, d1: d1Declared, kv: bindings("kv_namespaces").length > 0, r2: bindings("r2_buckets").length > 0 };
    }
    const entries = {
      d1Bindings: parseTomlArrayTables(source, "d1_databases"),
      kvBindings: parseTomlArrayTables(source, "kv_namespaces"),
      r2Bindings: parseTomlArrayTables(source, "r2_buckets"),
    };
    const migrationsDir = source.match(/^\s*migrations_dir\s*=\s*["']([^"']+)["']/mu)?.[1];
    return { ...entries, migrationsDir, d1: entries.d1Bindings.length > 0, kv: entries.kvBindings.length > 0, r2: entries.r2Bindings.length > 0 };
  } catch { return null; }
}

function listWorkflowFiles(root) {
  const directory = join(root, ".github", "workflows");
  if (!existsSync(directory)) return [];
  try { return readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isFile() && /\.ya?ml$/iu.test(entry.name)).map((entry) => join(".github", "workflows", entry.name)); }
  catch { return null; }
}

function safeEntries(directory) { try { return readdirSync(directory); } catch { return []; } }

function parseTomlArrayTables(source, name) {
  const rows = [];
  let active = false; let row = null;
  for (const line of source.split(/\r?\n/u)) {
    const header = line.match(/^\s*\[\[([^\]]+)\]\]\s*$/u);
    if (header) {
      if (row) rows.push(row);
      active = header[1].split(".").at(-1) === name;
      row = active ? {} : null;
      continue;
    }
    if (!active) continue;
    const pair = line.match(/^\s*([\w-]+)\s*=\s*["']([^"']*)["']/u);
    if (pair) row[pair[1]] = pair[2];
  }
  if (row) rows.push(row);
  return rows;
}
