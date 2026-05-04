import { createDb, organizations, users } from "./index.js";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

async function main() {
  const db = createDb(process.env.DATABASE_URL!);

  console.log("🌱 Seeding database...");

  const [org] = await db
    .insert(organizations)
    .values({ name: "Test ISP", slug: "test-isp" })
    .onConflictDoNothing()
    .returning();

  if (!org) {
    console.log("⚠️  Organization already exists, skipping seed.");
    process.exit(0);
  }

  const passwordHash = await hashPassword("admin123456");

  await db
    .insert(users)
    .values({
      orgId: org.id,
      name: "Admin",
      email: "admin@test.com",
      passwordHash,
      role: "superadmin",
    })
    .onConflictDoNothing();

  console.log("✅ Seed complete!");
  console.log("   Org:   Test ISP");
  console.log("   Email: admin@test.com");
  console.log("   Pass:  admin123456");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
