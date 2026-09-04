import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const [tsconfigPath, compiledEntrypoint] = process.argv.slice(2);
if (!tsconfigPath || !compiledEntrypoint) {
  throw new Error("사용법: node scripts/run-ts-verification.mjs <tsconfig> <compiled-entrypoint>");
}

const projectRoot = resolve(import.meta.dirname, "..");
const outputDirectory = mkdtempSync(join(tmpdir(), "duri-ts-verification-"));
const tscEntrypoint = join(projectRoot, "node_modules", "typescript", "bin", "tsc");
const verificationEntrypoint = join(outputDirectory, compiledEntrypoint);

try {
  const compile = spawnSync(
    process.execPath,
    [tscEntrypoint, "-p", tsconfigPath, "--outDir", outputDirectory],
    { cwd: projectRoot, env: process.env, stdio: "inherit" },
  );
  if (compile.error) throw compile.error;
  if (compile.status !== 0) process.exitCode = compile.status ?? 1;
  else {
    const nodeModulesDirectory = join(projectRoot, "node_modules");
    const nodePath = process.env.NODE_PATH
      ? `${nodeModulesDirectory}${delimiter}${process.env.NODE_PATH}`
      : nodeModulesDirectory;
    const verify = spawnSync(process.execPath, [verificationEntrypoint], {
      cwd: projectRoot,
      env: { ...process.env, NODE_PATH: nodePath },
      stdio: "inherit",
    });
    if (verify.error) throw verify.error;
    process.exitCode = verify.status ?? 1;
  }
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}
