#!/usr/bin/env node
/**
 * Fail on weak / placeholder secrets in repo root `.env`.
 * `pnpm env:check` passes --strict. Use SKIP_ENV_CHECK=1 locally to bypass.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env");

const weakSubs = ["CHANGE_ME", "YOUR_BOT", "YOUR_", "skynity_jwt_secret", "YOUR_PASSWORD", "local-dev-pgadmin"];
const placeholders = [/localhost.*secret/i, /^example$/i, /^test$/i, /^admin123$/i];

function parseEnv(content) {
  const out = {};
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    v = v.replace(/^["']|["']$/g, "");
    out[k] = v;
  }
  return out;
}

function fail(msg) {
  console.error("[env-check]", msg);
  process.exitCode = 1;
}

const strict =
  process.env.SKIP_ENV_CHECK === "1"
    ? false
    : process.env.NODE_ENV === "production" ||
      process.env.FORCE_ENV_CHECK === "1" ||
      process.argv.includes("--strict");

if (!strict) {
  console.log("[env-check] Skipping (use --strict, or set NODE_ENV=production / FORCE_ENV_CHECK=1; or SKIP_ENV_CHECK=1 to silence)");
  process.exit(0);
}

if (!existsSync(envPath)) {
  fail(".env missing at repo root.");
  process.exit(1);
}

const env = parseEnv(readFileSync(envPath, "utf8"));

function val(k) {
  return env[k] ?? "";
}

const checks = [
  {
    keys: ["JWT_SECRET", "PORTAL_JWT_SECRET"],
    ok: (s) =>
      typeof s === "string" &&
      s.length >= 32 &&
      !weakSubs.some((w) => s.includes(w)) &&
      !placeholders.some((re) => re.test(s.trim())),
    msg: "JWT_SECRET / PORTAL_JWT_SECRET must be >= 32 chars and not placeholder/value from examples",
  },
  {
    keys: ["ENCRYPTION_KEY"],
    ok: (s) =>
      typeof s === "string" &&
      s.length >= 32 &&
      /^[a-fA-F0-9]+$/i.test(s.trim()) &&
      !weakSubs.some((w) => s.toUpperCase().includes("CHANGE_ME")),
    msg: "ENCRYPTION_KEY must be hex (>=32 chars for API validator), not placeholders",
  },
  {
    keys: ["REDIS_PASSWORD"],
    ok: (s) => typeof s === "string" && s.length >= 16 && !weakSubs.some((w) => s.includes("CHANGE_ME")),
    msg: "REDIS_PASSWORD must be strong (>=16 chars, not CHANGE_ME placeholders)",
  },
  {
    keys: ["POSTGRES_PASSWORD"],
    ok: (s) => typeof s === "string" && s.length >= 16 && !weakSubs.some((w) => s.includes("CHANGE_ME")),
    msg: "POSTGRES_PASSWORD must be strong (>=16 chars, not CHANGE_ME placeholders)",
  },
];

let bad = false;
for (const c of checks) {
  for (const k of c.keys) {
    const s = val(k);
    if (!c.ok(s)) {
      bad = true;
      fail(`${k}: ${c.msg}`);
    }
  }
}

if (bad) {
  console.error("[env-check] Fix .env secrets before production deploy.");
  process.exit(1);
}

console.log("[env-check] No obvious placeholder/weak secrets for required keys.");
