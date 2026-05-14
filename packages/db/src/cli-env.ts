/**
 * Load monorepo root `.env` for CLI tools (drizzle-kit, seed) and resolve a DB URL
 * that works from the host (127.0.0.1) while `.env` may use Docker service host `postgres`.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const packageDbDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(packageDbDir, "..", "..", "..");

function applyLines(text: string, override: boolean) {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    val = val.replace(/^["']|["']$/g, "");
    if (override || !(key in process.env)) process.env[key] = val;
  }
}

export function loadRepoEnv(): void {
  const envPath = resolve(repoRoot, ".env");
  if (existsSync(envPath)) applyLines(readFileSync(envPath, "utf8"), false);
  const localPath = resolve(repoRoot, ".env.local");
  if (existsSync(localPath)) applyLines(readFileSync(localPath, "utf8"), true);
}

/** Host for CLI migrate/seed: localhost binds from docker-compose. Override with POSTGRES_HOST_MIGRATE=e.g. cloud SQL */
function migrateHost(): string {
  return process.env.DRIZZLE_DOCKER_INTERNAL === "1"
    ? "postgres"
    : (process.env.POSTGRES_HOST_MIGRATE ?? "127.0.0.1");
}

/** Prefer discrete POSTGRES_* (same vars as Compose) so URL never drifts from DATABASE_URL typos/copies. */
function urlFromDiscretePostgresVars(): string | null {
  const user = process.env.POSTGRES_USER?.trim();
  const pw = process.env.POSTGRES_PASSWORD;
  const db = process.env.POSTGRES_DB?.trim();
  if (!user || pw === undefined || pw === "" || !db) return null;
  const port = process.env.POSTGRES_PORT?.trim() || "5432";
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(pw)}@${migrateHost()}:${port}/${encodeURIComponent(db)}`;
}

/** @see .env.example — override with DATABASE_URL_MIGRATE if needed */
export function getCliDatabaseUrl(): string {
  loadRepoEnv();
  const explicit = process.env.DATABASE_URL_MIGRATE?.trim();
  if (explicit) return explicit;
  const discrete = urlFromDiscretePostgresVars();
  if (discrete) return discrete;
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    throw new Error(
      "Set POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB (recommended) or DATABASE_URL / DATABASE_URL_MIGRATE in repo root .env — see .env.example.",
    );
  }
  if (raw.includes("@postgres:") && process.env.DRIZZLE_DOCKER_INTERNAL !== "1") {
    return raw.replace("@postgres:", "@127.0.0.1:");
  }
  return raw;
}
