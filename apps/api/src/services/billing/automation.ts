import { createDb, subscriptions, customers, orders, invoices, packages, appSettings } from "@isp-nexus/db";
import { eq, and, lt, isNull, sql, desc } from "drizzle-orm";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";
import { sendAlert } from "../telegram/bot.js";
import { createDb as getDb } from "@isp-nexus/db";

function db() { return createDb(env.DATABASE_URL); }

async function getSetting(orgId: string, key: string, fallback = ""): Promise<string> {
  const d = db();
  const [row] = await d.select().from(appSettings)
    .where(and(eq(appSettings.orgId, orgId), eq(appSettings.key, key))).limit(1);
  return row?.value ?? fallback;
}

export type OverdueCustomer = {
  customerId: string;
  fullName: string;
  phone: string;
  subscriptionId: string;
  username: string;
  expiredAt: Date;
  daysOverdue: number;
};

export async function getOverdueCustomers(orgId: string): Promise<OverdueCustomer[]> {
  const d = db();
  const now = new Date();
  const rows = await d
    .select({
      customerId: customers.id,
      fullName: customers.fullName,
      phone: customers.phone,
      subscriptionId: subscriptions.id,
      username: subscriptions.username,
      expiredAt: subscriptions.expiresAt,
    })
    .from(subscriptions)
    .innerJoin(customers, eq(subscriptions.customerId, customers.id))
    .where(
      and(
        eq(subscriptions.orgId, orgId),
        eq(subscriptions.status, "expired"),
        isNull(subscriptions.deletedAt),
      ),
    )
    .orderBy(subscriptions.expiresAt);

  return rows
    .filter((r) => r.expiredAt != null)
    .map((r) => ({
      ...r,
      expiredAt: r.expiredAt as Date,
      daysOverdue: Math.floor((now.getTime() - (r.expiredAt as Date).getTime()) / 86_400_000),
    }));
}

export async function sendOverdueReminders(orgId: string): Promise<number> {
  const overdue = await getOverdueCustomers(orgId);
  if (overdue.length === 0) return 0;

  const telegramChatId = await getSetting(orgId, "telegram_chat_id", "");
  if (!telegramChatId) {
    logger.info({ orgId }, "billing: no telegram chat configured, skipping overdue reminders");
    return 0;
  }

  const msg = [
    `📋 *Billing Alert — Overdue Customers*`,
    ``,
    `${overdue.length} customer(s) have expired subscriptions:`,
    ``,
    ...overdue.slice(0, 10).map(
      (c) => `• *${c.fullName}* (${c.phone}) — @${c.username} — ${c.daysOverdue}d overdue`,
    ),
    overdue.length > 10 ? `...and ${overdue.length - 10} more` : "",
  ].filter(Boolean).join("\n");

  await sendAlert(telegramChatId, msg).catch((err) =>
    logger.warn({ err, orgId }, "billing: failed to send overdue reminder"),
  );

  logger.info({ orgId, count: overdue.length }, "billing: overdue reminders sent");
  return overdue.length;
}

export async function suspendUnpaidCustomers(orgId: string, graceDays = 7): Promise<number> {
  const overdue = await getOverdueCustomers(orgId);
  const toSuspend = overdue.filter((c) => c.daysOverdue >= graceDays);
  if (toSuspend.length === 0) return 0;

  const d = db();
  const { connectRouter } = await import("../../lib/mikrotik.js");
  const { routers } = await import("@isp-nexus/db");

  let suspended = 0;
  for (const c of toSuspend) {
    try {
      await d.update(subscriptions)
        .set({ status: "suspended", updatedAt: new Date() })
        .where(and(eq(subscriptions.id, c.subscriptionId), eq(subscriptions.orgId, orgId)));

      // Also disable in MikroTik if on a router
      const [sub] = await d.select().from(subscriptions)
        .where(eq(subscriptions.id, c.subscriptionId)).limit(1);
      if (sub?.routerId) {
        const [r] = await d.select().from(routers)
          .where(and(eq(routers.id, sub.routerId), eq(routers.orgId, orgId))).limit(1);
        if (r?.isActive) {
          const client = await connectRouter(r).catch(() => null);
          if (client) {
            await client.exec("/ip/hotspot/user", "set", { name: sub.username, disabled: "yes" }).catch(() => {});
            await client.close().catch(() => {});
          }
        }
      }
      suspended++;
    } catch (err) {
      logger.warn({ err, customerId: c.customerId }, "billing: suspend failed for customer");
    }
  }

  logger.info({ orgId, suspended }, "billing: suspended unpaid customers");
  return suspended;
}

export async function applyLateFees(orgId: string): Promise<number> {
  const lateFeeStr = await getSetting(orgId, "billing_late_fee_pct", "0");
  const lateFee_pct = parseFloat(lateFeeStr);
  if (lateFee_pct <= 0) return 0;

  const graceDaysStr = await getSetting(orgId, "billing_grace_days", "7");
  const graceDays = parseInt(graceDaysStr, 10);

  const d = db();
  const now = new Date();
  const cutoff = new Date(now.getTime() - graceDays * 86_400_000);

  // Find unpaid invoices past grace period without late fee already applied
  const unpaid = await d.select().from(invoices)
    .where(
      and(
        eq(invoices.orgId, orgId),
        isNull(invoices.paidAt),
        lt(invoices.dueAt as any, cutoff),
        sql`late_fee_bdt = 0`,
      ),
    ).limit(200);

  if (unpaid.length === 0) return 0;

  for (const inv of unpaid) {
    const fee = Math.round(inv.amountBdt * lateFee_pct / 100);
    if (fee <= 0) continue;
    await d.update(invoices)
      .set({ lateFee_bdt: fee, overdueNotifiedAt: now })
      .where(eq(invoices.id, inv.id));
  }

  logger.info({ orgId, count: unpaid.length, lateFee_pct }, "billing: late fees applied");
  return unpaid.length;
}

export async function getOverdueInvoices(orgId: string) {
  const d = db();
  const now = new Date();
  return d.select({
    id: invoices.id,
    invoiceNumber: invoices.invoiceNumber,
    amountBdt: invoices.amountBdt,
    lateFee_bdt: invoices.lateFee_bdt,
    dueAt: invoices.dueAt,
    customerId: invoices.customerId,
    customerName: customers.fullName,
    customerPhone: customers.phone,
  })
    .from(invoices)
    .innerJoin(customers, eq(invoices.customerId, customers.id))
    .where(
      and(
        eq(invoices.orgId, orgId),
        isNull(invoices.paidAt),
        lt(invoices.dueAt as any, now),
      ),
    )
    .orderBy(invoices.dueAt)
    .limit(200);
}

export async function runBillingCycle(orgId: string): Promise<{
  overdueSent: number;
  lateFeesApplied: number;
  suspended: number;
}> {
  const graceDaysStr = await getSetting(orgId, "billing_grace_days", "7");
  const graceDays = parseInt(graceDaysStr, 10);

  const [overdueSent, lateFeesApplied, suspended] = await Promise.all([
    sendOverdueReminders(orgId),
    applyLateFees(orgId),
    suspendUnpaidCustomers(orgId, graceDays),
  ]);
  return { overdueSent, lateFeesApplied, suspended };
}
