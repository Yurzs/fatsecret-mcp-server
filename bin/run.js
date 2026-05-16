#!/usr/bin/env node

import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const entry = resolve(__dirname, "..", "src", "index.ts");

// Resolve tsx's ESM register hook — works with both nested and hoisted node_modules
const require = createRequire(import.meta.url);
let tsxImport;
try {
  // tsx 4.x exposes an ESM loader at tsx/esm
  tsxImport = pathToFileURL(require.resolve("tsx/esm")).href;
} catch {
  // Fallback to just "tsx" and let Node resolve it
  tsxImport = "tsx";
}

const child = spawn(process.execPath, ["--import", tsxImport, entry], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => process.exit(code ?? 0));
