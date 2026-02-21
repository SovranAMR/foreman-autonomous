#!/usr/bin/env node

/**
 * FOREMAN — Entry Point
 *
 * This thin wrapper bootstraps TypeScript execution via tsx
 * so `foreman` works globally without a build step.
 *
 * Install: npm i -g .
 * Usage:   foreman run "build a calculator"
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const cliPath = join(__dirname, "src", "cli.ts");

// Check if tsx is available
const tsxPaths = [
  join(__dirname, "node_modules", ".bin", "tsx"),
  join(__dirname, "node_modules", "tsx", "dist", "cli.mjs"),
];

let tsxBin = "tsx"; // fallback to global

for (const p of tsxPaths) {
  if (existsSync(p)) {
    tsxBin = p;
    break;
  }
}

try {
  execFileSync(tsxBin, [cliPath, ...process.argv.slice(2)], {
    stdio: "inherit",
    cwd: process.cwd(),
    env: process.env,
  });
} catch (err) {
  // execFileSync throws on non-zero exit — just propagate the exit code
  if (err && typeof err === "object" && "status" in err) {
    process.exit(err.status ?? 1);
  }
  throw err;
}
