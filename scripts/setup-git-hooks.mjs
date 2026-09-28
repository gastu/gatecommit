import { spawnSync } from "node:child_process";

const result = spawnSync("git", ["config", "core.hooksPath", ".githooks"], { encoding: "utf8" });
if (result.error || result.status !== 0) {
  console.error(`Could not set core.hooksPath to .githooks: ${result.error?.message ?? result.stderr}`);
  process.exit(1);
}
console.log("Git hooks configured from .githooks");
