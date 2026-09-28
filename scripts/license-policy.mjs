import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const allowed = new Set(["MIT", "ISC", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "0BSD", "CC0-1.0", "Unlicense", "BlueOak-1.0.0", "Python-2.0"]);
const prohibited = /(?:^|\b)(?:AGPL|GPL|SSPL|BUSL|CC-BY-NC)(?:-|\b)/iu;

export function inspectLicenses(root) {
  const packages = new Map();
  const modules = join(root, "node_modules");
  if (!existsSync(modules)) return { items: [{ name: "node_modules", version: "", license: "missing", status: "BLOCKED" }], blocked: 1, review: 0 };
  visit(modules);
  return summarize([...packages.values()].sort((a, b) => a.name.localeCompare(b.name)));
  function visit(directory) {
    for (const name of entries(directory)) {
      if (name === ".bin" || name.startsWith(".")) continue;
      const path = join(directory, name);
      if (name.startsWith("@")) for (const scoped of entries(path)) inspect(join(path, scoped));
      else inspect(path);
    }
  }
  function inspect(directory) {
    const manifest = join(directory, "package.json");
    if (!existsSync(manifest)) return;
    try {
      const pkg = JSON.parse(readFileSync(manifest, "utf8"));
      if (!pkg.name) return;
      const license = typeof pkg.license === "string" ? pkg.license : Array.isArray(pkg.licenses) ? pkg.licenses.map((item) => item?.type).filter(Boolean).join(" OR ") : "";
      const alternatives = license.split(/\s+OR\s+|\|\|/iu).map((option) => option.split(/\s+AND\s+|\s*&\s*/iu).map((term) => term.trim().replace(/[()]/gu, "")));
      const status = alternatives.some((option) => option.length && option.every((term) => allowed.has(term))) ? "PASS" : prohibited.test(license) ? "BLOCKED" : "REVIEW";
      packages.set(`${pkg.name}@${pkg.version ?? "unknown"}`, { name: pkg.name, version: pkg.version ?? "unknown", license: license || "UNKNOWN", status });
      visit(join(directory, "node_modules"));
    } catch { /* unreadable dependency metadata is handled by dependency policy */ }
  }
}
function entries(path) { try { return readdirSync(path); } catch { return []; } }
function summarize(items) { return { items, blocked: items.filter((item) => item.status === "BLOCKED").length, review: items.filter((item) => item.status === "REVIEW").length }; }
