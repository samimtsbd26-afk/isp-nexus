import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { routers } from "@isp-nexus/db";
import type { Db } from "@isp-nexus/db";
import { decryptText } from "./crypto.js";
import { getMikroTikClient, type MikroTikApi } from "../services/mikrotik/client.js";
export type { MikroTikApi };

type RouterRow = typeof routers.$inferSelect;

/**
 * Connect to a MikroTik router given its full DB row.
 * Caller owns the connection lifecycle — always call client.close() in a finally block.
 */
export async function connectRouter(router: RouterRow): Promise<MikroTikApi> {
  const password = decryptText(router.passwordEncrypted);
  const port = router.useSsl ? (router.sslPort ?? 8729) : router.port;
  return getMikroTikClient({ host: router.host, port, username: router.username, password, useSsl: router.useSsl });
}

/**
 * Fetch a router by ID scoped to orgId, then connect.
 * Throws tRPC NOT_FOUND if the router doesn't exist or belongs to a different org.
 */
export async function getRouterClient(db: Db, orgId: string, routerId: string): Promise<MikroTikApi> {
  const [r] = await db.select().from(routers)
    .where(and(eq(routers.id, routerId), eq(routers.orgId, orgId), eq(routers.isActive, true)))
    .limit(1);
  if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Router not found" });
  return connectRouter(r);
}

/**
 * Enable or disable a named user on both hotspot and PPPoE on a given router.
 * Requires orgId so the router lookup is always tenant-scoped.
 */
export async function setMikroTikUserDisabled(
  db: Db,
  orgId: string,
  routerId: string,
  username: string,
  disabled: boolean,
): Promise<void> {
  const [r] = await db.select().from(routers)
    .where(and(eq(routers.id, routerId), eq(routers.orgId, orgId)))
    .limit(1);
  if (!r) return;
  const client = await connectRouter(r);
  const flag = disabled ? "yes" : "no";
  try {
    const hsUsers = await client.print("/ip/hotspot/user", { name: username }).catch(() => []);
    for (const u of hsUsers) {
      const id = u[".id"] ?? u.id;
      if (id) await client.exec("/ip/hotspot/user", "set", { numbers: id, disabled: flag }).catch(() => {});
    }
    const pppUsers = await client.print("/ppp/secret", { name: username }).catch(() => []);
    for (const u of pppUsers) {
      const id = u[".id"] ?? u.id;
      if (id) await client.exec("/ppp/secret", "set", { numbers: id, disabled: flag }).catch(() => {});
    }
  } finally {
    await client.close().catch(() => {});
  }
}
