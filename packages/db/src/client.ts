import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";
import * as radiusSchema from "./schema/radius";

export function createDb(connectionString: string) {
  const client = postgres(connectionString, { max: 10 });
  return drizzle(client, { schema: { ...schema, ...radiusSchema } });
}

export type Db = ReturnType<typeof createDb>;
