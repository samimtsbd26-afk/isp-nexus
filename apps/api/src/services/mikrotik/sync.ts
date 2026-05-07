import { eq, and } from "drizzle-orm";
import { createDb } from "@isp-nexus/db";
import { env } from "../../lib/env.js";
import { routers, hotspotUsers, pppoeUsers } from "@isp-nexus/db";
import { decryptText } from "../../lib/crypto.js";
import { getMikroTikClient } from "./client.js";
import { logger } from "../../lib/logger.js";

const db = createDb(env.DATABASE_URL);

export async function syncHotspotUsersFromMikroTik() {
  const allRouters = await db.select().from(routers).where(eq(routers.isActive, true));
  
  for (const r of allRouters) {
    let client: Awaited<ReturnType<typeof getMikroTikClient>> | null = null;
    try {
      const password = decryptText(r.passwordEncrypted);
      const port = r.useSsl ? (r.sslPort ?? 8729) : r.port;
      client = await getMikroTikClient({ host: r.host, port, username: r.username, password, useSsl: r.useSsl });
      
      const users = await client.print("/ip/hotspot/user");
      const activeSessions = await client.print("/ip/hotspot/active").catch(() => []);
      const activeNames = new Set(activeSessions.map((a: any) => a.user || a.name));
      
      for (const u of users) {
        const name = u.name;
        const existing = await db.select().from(hotspotUsers)
          .where(and(eq(hotspotUsers.routerId, r.id), eq(hotspotUsers.name, name)))
          .limit(1);
        
        const isActive = activeNames.has(name);
        const data = {
          orgId: r.orgId,
          routerId: r.id,
          mikrotikId: u[".id"] || null,
          name,
          password: u.password || null,
          profile: u.profile || null,
          macAddress: u["mac-address"] || null,
          ipAddress: u["ip-address"] || null,
          comment: u.comment || null,
          disabled: u.disabled === "yes" || u.disabled === true,
          isActive,
          uptime: u.uptime || null,
          bytesIn: u["bytes-in"] ? Number(u["bytes-in"]) : null,
          bytesOut: u["bytes-out"] ? Number(u["bytes-out"]) : null,
          updatedAt: new Date(),
        };

        if (existing.length > 0) {
          await db.update(hotspotUsers).set(data)
            .where(eq(hotspotUsers.id, existing[0].id));
        } else {
          await db.insert(hotspotUsers).values(data);
        }
      }
      
      // Mark users not in MikroTik as inactive
      const allDbUsers = await db.select().from(hotspotUsers).where(eq(hotspotUsers.routerId, r.id));
      const mikrotikNames = new Set(users.map((u: any) => u.name));
      for (const dbUser of allDbUsers) {
        if (!mikrotikNames.has(dbUser.name)) {
          await db.update(hotspotUsers).set({ isActive: false, updatedAt: new Date() })
            .where(eq(hotspotUsers.id, dbUser.id));
        }
      }
    } catch (err) {
      logger.warn({ err, routerId: r.id }, "Hotspot sync failed for router");
    } finally {
      await client?.close().catch(() => {});
    }
  }
}

export async function syncPppoeUsersFromMikroTik() {
  const allRouters = await db.select().from(routers).where(eq(routers.isActive, true));
  
  for (const r of allRouters) {
    let client: Awaited<ReturnType<typeof getMikroTikClient>> | null = null;
    try {
      const password = decryptText(r.passwordEncrypted);
      const port = r.useSsl ? (r.sslPort ?? 8729) : r.port;
      client = await getMikroTikClient({ host: r.host, port, username: r.username, password, useSsl: r.useSsl });
      
      const users = await client.print("/ppp/secret");
      const activeSessions = await client.print("/ppp/active").catch(() => []);
      const activeNames = new Set(activeSessions.map((a: any) => a.name));
      
      for (const u of users) {
        const name = u.name;
        const existing = await db.select().from(pppoeUsers)
          .where(and(eq(pppoeUsers.routerId, r.id), eq(pppoeUsers.name, name)))
          .limit(1);
        
        const isActive = activeNames.has(name);
        const data = {
          orgId: r.orgId,
          routerId: r.id,
          mikrotikId: u[".id"] || null,
          name,
          password: u.password || null,
          service: u.service || "pppoe",
          profile: u.profile || null,
          callerId: u["caller-id"] || null,
          remoteAddress: u["remote-address"] || null,
          comment: u.comment || null,
          disabled: u.disabled === "yes" || u.disabled === true,
          isActive,
          lastSeen: isActive ? new Date() : null,
          uptime: u.uptime || null,
          bytesIn: u["bytes-in"] ? Number(u["bytes-in"]) : null,
          bytesOut: u["bytes-out"] ? Number(u["bytes-out"]) : null,
          updatedAt: new Date(),
        };

        if (existing.length > 0) {
          await db.update(pppoeUsers).set(data)
            .where(eq(pppoeUsers.id, existing[0].id));
        } else {
          await db.insert(pppoeUsers).values(data);
        }
      }
      
      // Mark users not in MikroTik as inactive
      const allDbUsers = await db.select().from(pppoeUsers).where(eq(pppoeUsers.routerId, r.id));
      const mikrotikNames = new Set(users.map((u: any) => u.name));
      for (const dbUser of allDbUsers) {
        if (!mikrotikNames.has(dbUser.name)) {
          await db.update(pppoeUsers).set({ isActive: false, updatedAt: new Date() })
            .where(eq(pppoeUsers.id, dbUser.id));
        }
      }
    } catch (err) {
      logger.warn({ err, routerId: r.id }, "PPPoE sync failed for router");
    } finally {
      await client?.close().catch(() => {});
    }
  }
}
