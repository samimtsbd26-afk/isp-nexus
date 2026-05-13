import { and, eq, gte, lte, isNull } from "drizzle-orm";
import { createDb, customers, packages, routers, subscriptions, telegramConfigs } from "@isp-nexus/db";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";
import { connectRouter } from "../../lib/mikrotik.js";
import { logActivity } from "../../lib/activity.js";
import { sendExpiryAlert } from "../telegram/bot.js";

const db = createDb(env.DATABASE_URL);

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
        }
      } finally {
        await client.close().catch((err) => logger.warn({ err, username: row.username }, "Failed to close MikroTik client in expiry cleanup"));
      }

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
    }
  }

  return { scanned: rows.length, disabled, errors };
}

// Send advance expiry warnings (1-day and 3-day)
export async function sendExpiryWarnings(): Promise<void> {
  const now = new Date();
  const in1Day = new Date(now.getTime() + 86400000);
  const in3Days = new Date(now.getTime() + 3 * 86400000);

  for (const daysAhead of [1, 3]) {
    const target = daysAhead === 1 ? in1Day : in3Days;
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
      const [cust] = await db.select({ fullName: customers.fullName }).from(customers)
        .where(eq(customers.id, row.customerId)).limit(1).catch(() => []);
      sendExpiryAlert(tgConfig.chatId, cust?.fullName ?? row.username, row.packageName ?? "Unknown Package", daysAhead).catch(() => {});
    }
  }
}
