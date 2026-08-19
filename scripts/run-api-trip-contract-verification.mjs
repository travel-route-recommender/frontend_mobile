import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = resolve(import.meta.dirname, "..");
const outputDirectory = join(tmpdir(), "duri-api-trip-verification");
const tscEntrypoint = join(projectRoot, "node_modules", "typescript", "bin", "tsc");
const verificationEntrypoint = join(outputDirectory, "scripts", "verify-api-trip-contract.js");

rmSync(outputDirectory, { recursive: true, force: true });

try {
  const compile = spawnSync(
    process.execPath,
    [tscEntrypoint, "-p", "tsconfig.api-trip-verification.json", "--outDir", outputDirectory],
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
