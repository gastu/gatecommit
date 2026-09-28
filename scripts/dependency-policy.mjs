import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function validateDependencyPolicy(root) {
  const failures = [];
  const packagePath = join(root, "package.json");
  const lockPath = join(root, "package-lock.json");
  if (!existsSync(packagePath)) return [`Missing ${packagePath}`];
  const pkg = readJson(packagePath, failures);
  const sections = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
  const direct = Object.fromEntries(sections.flatMap((section) => Object.entries(pkg[section] ?? {}).map(([name, version]) => [`${section}:${name}`, version])));
  for (const [key, spec] of Object.entries(direct)) if (typeof spec === "string" && /(?:^|@)latest$/u.test(spec)) failures.push(`${key} uses latest`);
  if (!Object.keys(direct).length) return failures;
  if (!existsSync(lockPath)) return [...failures, "package-lock.json is required for direct dependencies"];
  const lock = readJson(lockPath, failures);
  if (!Number.isInteger(lock.lockfileVersion) || !lock.packages?.[""]) return [...failures, "package-lock.json has an unsupported format"];
  for (const section of sections) {
    for (const [name, spec] of Object.entries(pkg[section] ?? {})) {
      if (lock.packages[""][section]?.[name] !== spec) failures.push(`Lockfile does not match ${section}.${name}`);
      const resolved = lock.packages[`node_modules/${name}`];
      const gitResolved = typeof resolved?.resolved === "string" && /^git\+/u.test(resolved.resolved);
      if (!resolved?.version && !gitResolved) failures.push(`Lockfile does not resolve ${name}`);
    }
  }
  return failures;
}

function readJson(path, failures) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (error) { failures.push(`Cannot read ${path}: ${error.message}`); return {}; }
}
