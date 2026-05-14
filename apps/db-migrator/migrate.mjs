// Custom migration runner — applies SQL files directly, skips already-applied statements.
// Avoids drizzle-kit CJS/drizzle-orm resolution issues in Docker/pnpm environments.
import postgres from "postgres";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "../packages/db/migrations");

const ALREADY_EXISTS = new Set(["42710", "42P07", "42701", "42P16", "23505"]);

const sql = postgres(process.env.DATABASE_URL);

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

console.log(`Found ${files.length} migration file(s): ${files.join(", ")}`);

for (const file of files) {
  console.log(`→ ${file}`);
  const content = readFileSync(join(migrationsDir, file), "utf8");
  const statements = content
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const stmt of statements) {
    try {
      await sql.unsafe(stmt);
    } catch (err) {
      if (ALREADY_EXISTS.has(err.code)) {
        console.log(`  skip (${err.code}): ${stmt.slice(0, 60).replace(/\n/g, " ")}…`);
      } else {
        console.error(`  FAIL: ${stmt.slice(0, 100)}`);
        console.error(`  Error: ${err.message}`);
        process.exit(1);
      }
    }
  }
  console.log(`  ✓ done`);
}

await sql.end();
console.log("Migration complete.");
