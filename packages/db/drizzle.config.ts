import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Exclude FreeRADIUS tables managed separately via infrastructure/radius/sql/schema.sql
  tablesFilter: ["!radcheck", "!radreply", "!radgroupcheck", "!radgroupreply", "!radusergroup", "!radacct", "!radpostauth", "!nas"],
});
