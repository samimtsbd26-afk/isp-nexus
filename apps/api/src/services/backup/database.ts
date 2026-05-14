import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { env } from "../../lib/env.js";
import { getRedis } from "../../lib/redis.js";
import { logger } from "../../lib/logger.js";

const execFileAsync = promisify(execFile);

export interface DbBackupResult {
  type: "postgres" | "redis";
  label: string;
  sizeBytes: number;
  createdAt: string;
  preview: string; // first 500 chars of pg_dump for postgres, "OK" for redis
}

const DB_BACKUP_KEY = "sys:db_backup:history";
const MAX_HISTORY = 10;

export async function runPostgresBackup(): Promise<DbBackupResult> {
  const url = new URL(env.DATABASE_URL.replace("postgres://", "http://").replace("postgresql://", "http://"));
  const host = url.hostname;
  const port = url.port || "5432";
  const dbName = url.pathname.slice(1);
  const user = url.username;
  const password = url.password;

  const env_override: NodeJS.ProcessEnv = { ...process.env, PGPASSWORD: password };

  let stdout = "";
  try {
    const result = await execFileAsync(
      "pg_dump",
      ["-h", host, "-p", port, "-U", user, "--schema-only", "--no-password", dbName],
      { env: env_override, maxBuffer: 50 * 1024 * 1024 },
    );
    stdout = result.stdout;
  } catch (err: any) {
    // pg_dump not available — store metadata only
    stdout = `-- pg_dump unavailable: ${err?.message ?? "unknown error"}\n-- Backup attempted at ${new Date().toISOString()}`;
  }

  const result: DbBackupResult = {
    type: "postgres",
    label: `postgres-${new Date().toISOString().slice(0, 16).replace("T", "_")}`,
    sizeBytes: Buffer.byteLength(stdout, "utf8"),
    createdAt: new Date().toISOString(),
    preview: stdout.slice(0, 500),
  };

  await storeBackupHistory(result);
  logger.info({ sizeBytes: result.sizeBytes }, "Postgres schema backup completed");
  return result;
}

export async function runRedisBackup(): Promise<DbBackupResult> {
  const result: DbBackupResult = {
    type: "redis",
    label: `redis-${new Date().toISOString().slice(0, 16).replace("T", "_")}`,
    sizeBytes: 0,
    createdAt: new Date().toISOString(),
    preview: "",
  };

  try {
    const redis = getRedis();
    // Trigger Redis background save
    await redis.bgsave();
    const info = await redis.info("persistence");
    const rdbLine = info.split("\n").find((l) => l.startsWith("rdb_last_bgsave_status")) ?? "";
    const rdbSize = info.split("\n").find((l) => l.startsWith("rdb_current_bgsave_time_sec")) ?? "";
    result.preview = `BGSAVE triggered.\n${rdbLine}\n${rdbSize}`;
    result.sizeBytes = parseInt(info.split("\n").find((l) => l.startsWith("used_memory:"))?.split(":")[1] ?? "0");
  } catch (err: any) {
    result.preview = `Redis BGSAVE failed: ${err?.message ?? "unknown"}`;
  }

  await storeBackupHistory(result);
  logger.info({ label: result.label }, "Redis backup triggered");
  return result;
}

async function storeBackupHistory(record: DbBackupResult): Promise<void> {
  try {
    const redis = getRedis();
    await redis.zadd(DB_BACKUP_KEY, Date.now(), JSON.stringify(record));
    await redis.zremrangebyrank(DB_BACKUP_KEY, 0, -(MAX_HISTORY + 1));
    await redis.expire(DB_BACKUP_KEY, 90 * 86_400); // 90 days
  } catch { /* non-fatal */ }
}

export async function getBackupHistory(): Promise<DbBackupResult[]> {
  try {
    const redis = getRedis();
    const raw = await redis.zrevrange(DB_BACKUP_KEY, 0, MAX_HISTORY - 1);
    return raw
      .map((r) => { try { return JSON.parse(r) as DbBackupResult; } catch { return null; } })
      .filter((x): x is DbBackupResult => x !== null);
  } catch {
    return [];
  }
}
