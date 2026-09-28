import { validateDependencyPolicy } from "./dependency-policy.mjs";
const root = process.argv[2] ?? process.cwd();
const failures = validateDependencyPolicy(root);
for (const failure of failures) console.error(`DEPENDENCY_POLICY BLOCKED ${failure}`);
console.log(`DEPENDENCY_POLICY ${failures.length ? "BLOCKED" : "PASS"} findings=${failures.length}`);
process.exitCode = failures.length ? 1 : 0;
