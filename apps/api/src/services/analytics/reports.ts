import { eq, and, gte, sql } from "drizzle-orm";
import { createDb } from "@isp-nexus/db";
import { env } from "../../lib/env.js";
import { orders, subscriptions, packages } from "@isp-nexus/db";

const db = createDb(env.DATABASE_URL);

export async function getDailySales(orgId: string, days: number = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      date: sql<string>`DATE(${orders.createdAt})`,
      total: sql<number>`COALESCE(SUM(${orders.amountBdt}), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(orders)
    .where(and(eq(orders.orgId, orgId), eq(orders.status, "approved"), gte(orders.createdAt, since)))
    .groupBy(sql`DATE(${orders.createdAt})`)
    .orderBy(sql`DATE(${orders.createdAt})`);
  return rows;
}

export async function getMonthlyRecurringRevenue(orgId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  
  const [result] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${packages.priceBdt}), 0)`,
      count: sql<number>`COUNT(${subscriptions.id})`,
    })
    .from(subscriptions)
    .innerJoin(packages, eq(subscriptions.packageId, packages.id))
    .where(and(
      eq(subscriptions.orgId, orgId),
      eq(subscriptions.status, "active"),
      gte(subscriptions.createdAt, monthStart)
    ));
  
  return result;
}

export async function getTrialConversionRate(orgId: string) {
  const [trialOrders] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(orders)
    .where(and(eq(orders.orgId, orgId), eq(orders.paymentMethod, "free")));
  
  const [paidOrders] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(orders)
    .where(and(eq(orders.orgId, orgId), eq(orders.status, "approved"), sql`${orders.paymentMethod} != 'free'`));
  
  const trialCount = trialOrders.count || 0;
  const paidCount = paidOrders.count || 0;
  
  return {
    trialCount,
    paidCount,
    conversionRate: trialCount > 0 ? Math.round((paidCount / trialCount) * 100) : 0,
  };
}

export async function getChurnMetrics(orgId: string) {
  const [suspended] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(subscriptions)
    .where(and(eq(subscriptions.orgId, orgId), eq(subscriptions.status, "suspended")));
  
  const [expired] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(subscriptions)
    .where(and(eq(subscriptions.orgId, orgId), eq(subscriptions.status, "expired")));
  
  const [cancelled] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(subscriptions)
    .where(and(eq(subscriptions.orgId, orgId), eq(subscriptions.status, "cancelled")));
  
  const [total] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(subscriptions)
    .where(eq(subscriptions.orgId, orgId));
  
  const totalCount = total.count || 1;
  
  return {
    suspended: suspended.count,
    expired: expired.count,
    cancelled: cancelled.count,
    churnRate: Math.round(((suspended.count + expired.count + cancelled.count) / totalCount) * 100),
  };
}
