import { defineConfig } from "drizzle-kit";
import { getCliDatabaseUrl, loadRepoEnv } from "./src/cli-env";

loadRepoEnv();

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: getCliDatabaseUrl(),
  },
  // Exclude FreeRADIUS tables managed separately via infrastructure/radius/sql/schema.sql
  tablesFilter: ["!radcheck", "!radreply", "!radgroupcheck", "!radgroupreply", "!radusergroup", "!radacct", "!radpostauth", "!nas"],
});
