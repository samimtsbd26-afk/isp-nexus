import type { Context } from "hono";
import { eq } from "drizzle-orm";
import { createDb, users, type Db, type User } from "@isp-nexus/db";
import { env } from "./lib/env.js";
import { verifyAccessToken } from "./auth/session.js";
import { getRedis } from "./lib/redis.js";
import type Redis from "ioredis";

export interface TRPCContext {
  db: Db;
  redis: Redis;
  user: User | null;
  orgId: string | null;
  req: Request;
  resHeaders: Headers;
  setHeader: (name: string, value: string) => void;
}

let dbInstance: Db | null = null;

function getDb(): Db {
  if (!dbInstance) dbInstance = createDb(env.DATABASE_URL);
  return dbInstance;
}

export async function createContext(c: Context): Promise<TRPCContext> {
  const db = getDb();
  const redis = getRedis();
  const resHeaders = new Headers();

  const authHeader = c.req.header("authorization");
  const cookie = c.req.header("cookie") || "";
  let user: User | null = null;
  let orgId: string | null = null;

  const accessCookie = cookie.match(/(?:^|;\s*)isp_access=([^;]+)/)?.[1];
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const token = bearerToken ?? accessCookie;

  if (token) {
    const payload = await verifyAccessToken(token);
    if (payload) {
      const found = await db
        .select()
        .from(users)
        .where(eq(users.id, payload.userId))
        .limit(1);
      if (found[0]?.isActive) {
        user = found[0];
        orgId = found[0].orgId;
      }
    }
  }

  return {
    db, redis, user, orgId, req: c.req.raw, resHeaders,
    setHeader: (name, value) => {
      resHeaders.append(name, value);
      c.header(name, value, { append: true });
    },
  };
}
