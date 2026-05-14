/**
 * Sync drizzle.__drizzle_migrations with SQL migrations after migrate.mjs runs.
 * Drizzle-kit reads this ledger; without rows it re-applies DDL and duplicates enums/types.
 * Safe: INSERT only missing hashes — no DDL, no deletes, no password echo.
 */
import crypto from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = join(__dirname, "..");
const migrationsFolder = join(appRoot, "packages/db/migrations");
const journalPath = join(migrationsFolder, "meta", "_journal.json");

const sql = postgres(process.env.DATABASE_URL);

async function main() {
  await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
  await sql`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `;

  if (!existsSync(journalPath)) throw new Error(`Missing ${journalPath}`);
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));

  for (const entry of journal.entries) {
    const filePath = join(migrationsFolder, `${entry.tag}.sql`);
    if (!existsSync(filePath)) throw new Error(`Missing migration file ${filePath}`);
    const body = readFileSync(filePath, "utf8");
    const hash = crypto.createHash("sha256").update(body).digest("hex");
    const millis = Number(entry.when);
    const found = await sql`select 1 from drizzle.__drizzle_migrations where hash = ${hash} limit 1`;
    if (!found.length) {
      await sql`insert into drizzle.__drizzle_migrations (hash, created_at) values (${hash}, ${millis})`;
    }
  }

  await sql.end();
  console.log("Drizzle migration ledger synced (baseline rows added if missing).");
}

main().catch(async (err) => {
  console.error(err);
  try {
    await sql.end({ timeout: 1 });
  } catch {}
  process.exit(1);
});
