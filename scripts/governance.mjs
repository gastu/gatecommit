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
  const scopes = config.scopes ?? [{ name: "base", d1Bindings: config.d1Bindings ?? [], kvBindings: config.kvBindings ?? [], r2Bindings: config.r2Bindings ?? [], migrationsDir: config.migrationsDir }];
  for (const scope of scopes) {
    const label = scope.name ?? "base";
    const seenD1Bindings = new Set(); const seenD1Names = new Set();
    const seenKvBindings = new Set(); const seenR2Bindings = new Set();
    for (const binding of scope.d1Bindings ?? []) {
      if (!binding.binding || !binding.database_name) failures.push(`${label}: D1 binding requires binding and database_name`);
      if (binding.binding && seenD1Bindings.has(binding.binding)) failures.push(`${label}: D1 binding name ${binding.binding} is duplicated`);
      if (binding.database_name && seenD1Names.has(binding.database_name)) failures.push(`${label}: D1 logical database name ${binding.database_name} is duplicated`);
      if (binding.binding) seenD1Bindings.add(binding.binding);
      if (binding.database_name) seenD1Names.add(binding.database_name);
      if (!binding.database_id) failures.push(`${label}: D1 binding ${binding.binding ?? "unknown"} requires database_id`);
      else if (/^(?:todo|replace|your[-_])/iu.test(binding.database_id)) failures.push(`${label}: D1 binding ${binding.binding ?? "unknown"} has a placeholder database_id`);
    }
    for (const binding of scope.kvBindings ?? []) {
      if (!binding.binding || !binding.id) failures.push(`${label}: KV binding requires binding and id`);
      if (binding.binding && seenKvBindings.has(binding.binding)) failures.push(`${label}: KV binding name ${binding.binding} is duplicated`);
      if (binding.binding) seenKvBindings.add(binding.binding);
      if (binding.id && /^(?:todo|replace|your[-_])/iu.test(binding.id)) failures.push(`${label}: KV binding ${binding.binding ?? "unknown"} has a placeholder id`);
    }
    for (const binding of scope.r2Bindings ?? []) {
      if (!binding.binding || !binding.bucket_name) failures.push(`${label}: R2 binding requires binding and bucket_name`);
      if (binding.binding && seenR2Bindings.has(binding.binding)) failures.push(`${label}: R2 binding name ${binding.binding} is duplicated`);
      if (binding.binding) seenR2Bindings.add(binding.binding);
    }
    if ((scope.d1Bindings ?? []).length && root) {
      const migrationsDir = scope.migrationsDir || config.migrationsDir || "migrations";
      const migrationDirectory = join(root, migrationsDir);
      if (!existsSync(migrationDirectory)) failures.push(`${label}: D1 migrations directory is missing: ${migrationsDir}`);
      else {
        const migrations = safeEntries(migrationDirectory).filter((name) => name.endsWith(".sql"));
        if (!migrations.length) failures.push(`${label}: D1 migrations directory has no SQL migrations: ${migrationsDir}`);
        for (const migration of migrations) {
          try { if (!readFileSync(join(migrationDirectory, migration), "utf8").trim()) failures.push(`${label}: D1 migration is empty: ${migration}`); }
          catch { failures.push(`${label}: D1 migration cannot be read: ${migration}`); }
        }
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
      const scopes = [{ name: "base", d1Bindings: data.d1_databases ?? [], kvBindings: data.kv_namespaces ?? [], r2Bindings: data.r2_buckets ?? [], migrationsDir: data.migrations_dir },
        ...Object.entries(data.env ?? {}).map(([name, env]) => ({ name: `env.${name}`, d1Bindings: env.d1_databases ?? [], kvBindings: env.kv_namespaces ?? [], r2Bindings: env.r2_buckets ?? [], migrationsDir: env.migrations_dir }))];
      const d1Declared = Object.hasOwn(data, "d1_databases") || Object.values(data.env ?? {}).some((env) => Object.hasOwn(env, "d1_databases"));
      return { scopes, d1: d1Declared, kv: scopes.some((scope) => scope.kvBindings.length > 0), r2: scopes.some((scope) => scope.r2Bindings.length > 0) };
    }
    const migrationsDir = source.match(/^\s*migrations_dir\s*=\s*["']([^"']+)["']/mu)?.[1];
    const scopes = parseTomlBindingScopes(source, migrationsDir);
    return { scopes, migrationsDir, d1: scopes.some((scope) => scope.d1Bindings.length > 0), kv: scopes.some((scope) => scope.kvBindings.length > 0), r2: scopes.some((scope) => scope.r2Bindings.length > 0) };
  } catch { return null; }
}

function listWorkflowFiles(root) {
  const directory = join(root, ".github", "workflows");
  if (!existsSync(directory)) return [];
  try { return readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isFile() && /\.ya?ml$/iu.test(entry.name)).map((entry) => join(".github", "workflows", entry.name)); }
  catch { return null; }
}

function safeEntries(directory) { try { return readdirSync(directory); } catch { return []; } }

function parseTomlBindingScopes(source, migrationsDir) {
  const scopes = new Map([["base", { name: "base", d1Bindings: [], kvBindings: [], r2Bindings: [], migrationsDir }]]);
  let active = null; let row = null;
  for (const line of source.split(/\r?\n/u)) {
    const header = line.match(/^\s*(\[\[?)([^\]]+)(\]\]?)\s*(?:#.*)?$/u);
    if (header) {
      if (row) active.rows.push(row);
      // Every TOML table boundary ends the preceding binding row. Ordinary
      // tables are intentionally not captured, even if they contain `binding`.
      active = null;
      row = null;
      const isArrayTable = header[1] === "[[" && header[3] === "]]";
      if (!isArrayTable) continue;
      const parts = header[2].trim().split(".");
      const kind = parts.at(-1);
      const scopeName = parts[0] === "env" ? `env.${parts[1]}` : "base";
      const key = kind === "d1_databases" ? "d1Bindings" : kind === "kv_namespaces" ? "kvBindings" : kind === "r2_buckets" ? "r2Bindings" : null;
      if (key) {
        if (!scopes.has(scopeName)) scopes.set(scopeName, { name: scopeName, d1Bindings: [], kvBindings: [], r2Bindings: [], migrationsDir });
        active = { rows: scopes.get(scopeName)[key] };
        row = {};
      } else { active = null; row = null; }
      continue;
    }
    if (!active) continue;
    const pair = line.match(/^\s*([\w-]+)\s*=\s*["']([^"']*)["']/u);
    if (pair) row[pair[1]] = pair[2];
  }
  if (row) active.rows.push(row);
  return [...scopes.values()];
}
