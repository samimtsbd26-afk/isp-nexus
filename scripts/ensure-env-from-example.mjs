#!/usr/bin/env node
/**
 * Append keys from .env.example that are missing in .env (never overwrites).
 * Safe for local dev; run from repo root: node scripts/ensure-env-from-example.mjs
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { fileURLToPath } from "node:url";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)), ".");
const envPath = resolve(root, ".env");
const examplePath = resolve(root, ".env.example");

function parseEnvFile(text) {
  const keys = new Set();
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq > 0) keys.add(t.slice(0, eq).trim());
  }
  return keys;
}

function getExampleDefaults(text) {
  const linesToAppend = [];
  const seen = new Set();
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    if (seen.has(key)) continue;
    seen.add(key);
    linesToAppend.push({ key, line: `${key}=${t.slice(eq + 1).trim()}` });
  }
  return linesToAppend;
}

if (!existsSync(examplePath)) {
  console.error("Missing .env.example");
  process.exit(1);
}

const exampleText = readFileSync(examplePath, "utf8");
const examplePairs = getExampleDefaults(exampleText);

if (!existsSync(envPath)) {
  writeFileSync(envPath, exampleText.endsWith("\n") ? exampleText : `${exampleText}\n`, "utf8");
  console.log("Created .env from .env.example — update secrets before production.");
  process.exit(0);
}

const envText = readFileSync(envPath, "utf8");
const envKeys = parseEnvFile(envText);
const missing = examplePairs.filter((p) => !envKeys.has(p.key));

if (!missing.length) {
  console.log(".env already has all keys present in .env.example.");
  process.exit(0);
}

const block = `\n# --- synced from .env.example (missing keys) ---\n${missing.map((m) => m.line).join("\n")}\n`;
writeFileSync(envPath, envText.trimEnd() + block, "utf8");
console.log(`Appended ${missing.length} missing key(s): ${missing.map((m) => m.key).join(", ")}`);
