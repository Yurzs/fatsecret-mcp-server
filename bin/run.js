#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const entry = resolve(__dirname, "..", "src", "index.ts");
const tsx = resolve(__dirname, "..", "node_modules", ".bin", "tsx");

// Run the TypeScript source directly via tsx, inheriting stdio for MCP
import { spawn } from "node:child_process";
const child = spawn(tsx, [entry], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => process.exit(code ?? 0));
