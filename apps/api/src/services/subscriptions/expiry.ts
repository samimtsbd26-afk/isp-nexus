import { and, eq, gte, lte, isNull } from "drizzle-orm";
import { createDb, customers, packages, routers, subscriptions, telegramConfigs, appSettings } from "@isp-nexus/db";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";
import { connectRouter } from "../../lib/mikrotik.js";
import { logActivity } from "../../lib/activity.js";
import { getRedis } from "../../lib/redis.js";
import { sendExpiryAlert } from "../telegram/bot.js";
import { logIncident } from "../incident/log.js";

const db = createDb(env.DATABASE_URL);

async function clearHotspotSession(orgId: string, username: string): Promise<void> {
  try {
    const redis = getRedis();
    const phoneKey = `hotspot_phone_sess:${orgId}:${username}`;
    const sessToken = await redis.get(phoneKey);
    if (sessToken) await redis.del(`hotspot_sess:v1:${sessToken}`);
    await redis.del(phoneKey);
  } catch { /* non-fatal */ }
}

export async function disableExpiredSubscriptions() {
  const now = new Date();
  const rows = await db
    .select({
      subscriptionId: subscriptions.id,
      orgId: subscriptions.orgId,
      username: subscriptions.username,
      routerId: subscriptions.routerId,
      status: subscriptions.status,
      expiresAt: subscriptions.expiresAt,
      packageType: packages.type,
      packageName: packages.name,
      customerId: subscriptions.customerId,
    })
    .from(subscriptions)
    .innerJoin(packages, eq(subscriptions.packageId, packages.id))
    .where(
      and(
        eq(subscriptions.status, "active"),
        lte(subscriptions.expiresAt, now),
        isNull(subscriptions.deletedAt),
      ),
    );

  let disabled = 0;
  const errors: Array<{ username: string; error: string }> = [];

  for (const row of rows) {
    try {
      const [router] = row.routerId
        ? await db
            .select()
            .from(routers)
            .where(and(eq(routers.orgId, row.orgId), eq(routers.id, row.routerId), eq(routers.isActive, true)))
            .limit(1)
        : await db
            .select()
            .from(routers)
            .where(and(eq(routers.orgId, row.orgId), eq(routers.isDefault, true), eq(routers.isActive, true)))
            .limit(1);

      if (!router) throw new Error("Active router not found");

      const client = await connectRouter(router);

      try {
        if (row.packageType === "pppoe") {
          const [secret] = await client.print("/ppp/secret", { name: row.username });
          if (secret?.id) {
            await client.exec("/ppp/secret", "set", { numbers: secret.id, disabled: "yes" });
          }
        } else {
          const [user] = await client.print("/ip/hotspot/user", { name: row.username });
          if (user?.id) {
            await client.exec("/ip/hotspot/user", "set", { numbers: user.id, disabled: "yes" });
          }
          // Also kick any active hotspot session
          try {
            const [active] = await client.print("/ip/hotspot/active", { user: row.username });
            if (active?.id) {
              await client.remove("/ip/hotspot/active", active.id);
            }
          } catch { /* non-fatal */ }
        }
      } finally {
        await client.close().catch((err) => logger.warn({ err, username: row.username }, "Failed to close MikroTik client in expiry cleanup"));
      }

      // Clear Redis session for this user
      await clearHotspotSession(row.orgId, row.username);

      await db
        .update(subscriptions)
        .set({ status: "expired", updatedAt: new Date() })
        .where(and(eq(subscriptions.id, row.subscriptionId), eq(subscriptions.orgId, row.orgId)));

      await logActivity(db, row.orgId, undefined, "expired", "subscription", row.subscriptionId, { username: row.username });

      // Send Telegram alert to admin about the expiry
      const [tgConfig] = await db.select({ chatId: telegramConfigs.chatId }).from(telegramConfigs)
        .where(and(eq(telegramConfigs.orgId, row.orgId), eq(telegramConfigs.alertsEnabled, true))).limit(1);
      if (tgConfig) {
        const [cust] = await db.select({ fullName: customers.fullName }).from(customers).where(eq(customers.id, row.customerId)).limit(1).catch(() => []);
        sendExpiryAlert(tgConfig.chatId, cust?.fullName ?? row.username, row.packageName ?? "Unknown Package", 0).catch(() => {});
      }

      disabled += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown cleanup failure";
      errors.push({ username: row.username, error: message });
      logger.warn({ err, username: row.username }, "Expired subscription cleanup failed");
      await logIncident(row.orgId, "expiry_failure", `Failed to expire subscription for ${row.username}: ${message}`, { username: row.username });
    }
  }

  return { scanned: rows.length, disabled, errors };
}

// Send advance expiry warnings (1-day, 3-day, 7-day) with WhatsApp renew link
export async function sendExpiryWarnings(): Promise<void> {
  const now = new Date();

  for (const daysAhead of [1, 3, 7]) {
    const target = new Date(now.getTime() + daysAhead * 86_400_000);
    const windowStart = new Date(target.getTime() - 30 * 60_000);
    const windowEnd = new Date(target.getTime() + 30 * 60_000);

    const rows = await db.select({
      subscriptionId: subscriptions.id,
      orgId: subscriptions.orgId,
      username: subscriptions.username,
      packageName: packages.name,
      customerId: subscriptions.customerId,
    }).from(subscriptions).innerJoin(packages, eq(subscriptions.packageId, packages.id))
      .where(and(eq(subscriptions.status, "active"), gte(subscriptions.expiresAt, windowStart), lte(subscriptions.expiresAt, windowEnd), isNull(subscriptions.deletedAt)));

    for (const row of rows) {
      const [tgConfig] = await db.select({ chatId: telegramConfigs.chatId }).from(telegramConfigs)
        .where(and(eq(telegramConfigs.orgId, row.orgId), eq(telegramConfigs.alertsEnabled, true))).limit(1).catch(() => []);
      if (!tgConfig) continue;

      const [cust] = await db.select({ fullName: customers.fullName, phone: customers.phone }).from(customers)
        .where(eq(customers.id, row.customerId)).limit(1).catch(() => []);

      // Build WhatsApp renew link if number is configured
      let portalUrl: string | undefined;
      try {
        const [waSetting] = await db.select({ value: appSettings.value }).from(appSettings)
          .where(and(eq(appSettings.orgId, row.orgId), eq(appSettings.key, "whatsapp_support"))).limit(1).catch(() => []);
        const [domainSetting] = await db.select({ value: appSettings.value }).from(appSettings)
          .where(and(eq(appSettings.orgId, row.orgId), eq(appSettings.key, "hotspot_primary_domain"))).limit(1).catch(() => []);
        const waNum = waSetting?.value?.replace(/\D/g, "");
        const domain = domainSetting?.value;
        if (waNum) {
          const msg = encodeURIComponent(`Hi, I'd like to renew my subscription (${row.username}). Package: ${row.packageName ?? ""}`);
          portalUrl = `https://wa.me/${waNum}?text=${msg}`;
        } else if (domain) {
          portalUrl = domain;
        }
      } catch { /* non-fatal */ }

      sendExpiryAlert(tgConfig.chatId, cust?.fullName ?? row.username, row.packageName ?? "Unknown Package", daysAhead, portalUrl).catch(() => {});
    }
  }
}
