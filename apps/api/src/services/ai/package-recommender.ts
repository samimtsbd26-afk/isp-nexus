import { eq, and, gte, sql, isNull } from "drizzle-orm";
import { createDb } from "@isp-nexus/db";
import {
  customers, subscriptions, orders, packages, bandwidthSnapshots, routers,
} from "@isp-nexus/db";
import { env } from "../../lib/env.js";

const db = createDb(env.DATABASE_URL);

export type RecommendationType = "upgrade" | "downgrade" | "renew" | "family_plan" | "stay";

export interface PackageRecommendation {
  customerId: string;
  recommendationType: RecommendationType;
  currentPackageId: string | null;
  currentPackageName: string | null;
  suggestedPackageId: string | null;
  suggestedPackageName: string | null;
  reason: string;
  urgency: "low" | "medium" | "high";
  savingsBdt?: number;
}

interface SubWithPackage {
  subscriptionId: string;
  packageId: string;
  packageName: string;
  packageType: string;
  downloadMbps: number | null;
  uploadMbps: number | null;
  priceBdt: number;
  status: string;
  expiresAt: Date | null;
}

async function getActiveSubscription(customerId: string, orgId: string): Promise<SubWithPackage | null> {
  const [row] = await db
    .select({
      subscriptionId: subscriptions.id,
      packageId: packages.id,
      packageName: packages.name,
      packageType: packages.type,
      downloadMbps: packages.downloadMbps,
      uploadMbps: packages.uploadMbps,
      priceBdt: packages.priceBdt,
      status: subscriptions.status,
      expiresAt: subscriptions.expiresAt,
    })
    .from(subscriptions)
    .innerJoin(packages, eq(subscriptions.packageId, packages.id))
    .where(and(eq(subscriptions.customerId, customerId), eq(subscriptions.orgId, orgId), eq(subscriptions.status, "active")))
    .limit(1);
  return row ?? null;
}

async function getAvgBandwidthForCustomer(customerId: string, orgId: string): Promise<number | null> {
  // Get PPPoE username from subscription to correlate bandwidth
  const [sub] = await db
    .select({ username: subscriptions.username })
    .from(subscriptions)
    .where(and(eq(subscriptions.customerId, customerId), eq(subscriptions.orgId, orgId), eq(subscriptions.status, "active")))
    .limit(1);
  if (!sub?.username) return null;

  const oneWeekAgo = new Date(Date.now() - 7 * 86400000);
  // Use org's routers as proxy for bandwidth — we look at peak usage per router
  const orgRouters = await db.select({ id: routers.id }).from(routers).where(and(eq(routers.orgId, orgId), eq(routers.isActive, true)));
  if (orgRouters.length === 0) return null;

  const [agg] = await db
    .select({ avgRx: sql<number>`avg(rx_rate_bps)`, maxRx: sql<number>`max(rx_rate_bps)` })
    .from(bandwidthSnapshots)
    .where(and(eq(bandwidthSnapshots.routerId, orgRouters[0].id), gte(bandwidthSnapshots.capturedAt, oneWeekAgo)));

  return agg?.avgRx ? Number(agg.avgRx) / 1000 : null; // kbps
}

async function getOrderHistory(customerId: string, orgId: string) {
  const threeMonthsAgo = new Date(Date.now() - 90 * 86400000);
  const [stats] = await db
    .select({
      total: sql<number>`count(*)`,
      onTime: sql<number>`sum(case when status='approved' then 1 else 0 end)`,
    })
    .from(orders)
    .where(and(eq(orders.customerId, customerId), eq(orders.orgId, orgId), gte(orders.createdAt, threeMonthsAgo)));
  return { total: Number(stats?.total ?? 0), onTime: Number(stats?.onTime ?? 0) };
}

async function getUpgradeCandidate(current: SubWithPackage, orgId: string): Promise<{ id: string; name: string; priceBdt: number } | null> {
  const [pkg] = await db
    .select({ id: packages.id, name: packages.name, priceBdt: packages.priceBdt })
    .from(packages)
    .where(and(
      eq(packages.orgId, orgId),
      eq(packages.type, current.packageType as "pppoe" | "hotspot" | "static"),
      eq(packages.isActive, true),
    ))
    .orderBy(sql`price_bdt asc`);
  if (!pkg || pkg.id === current.packageId) return null;
  if (pkg.priceBdt <= current.priceBdt) return null;
  return pkg;
}

async function getDowngradeCandidate(current: SubWithPackage, orgId: string): Promise<{ id: string; name: string; priceBdt: number } | null> {
  const [pkg] = await db
    .select({ id: packages.id, name: packages.name, priceBdt: packages.priceBdt })
    .from(packages)
    .where(and(
      eq(packages.orgId, orgId),
      eq(packages.type, current.packageType as "pppoe" | "hotspot" | "static"),
      eq(packages.isActive, true),
    ))
    .orderBy(sql`price_bdt asc`);
  if (!pkg || pkg.id === current.packageId || pkg.priceBdt >= current.priceBdt) return null;
  return pkg;
}

async function getFamilyPlanCandidate(orgId: string): Promise<{ id: string; name: string; priceBdt: number } | null> {
  const [pkg] = await db
    .select({ id: packages.id, name: packages.name, priceBdt: packages.priceBdt })
    .from(packages)
    .where(and(
      eq(packages.orgId, orgId),
      eq(packages.isActive, true),
      sql`lower(name) like '%family%' or lower(name) like '%shared%' or lower(name) like '%multi%'`,
    ))
    .limit(1);
  return pkg ?? null;
}

export async function recommendPackage(customerId: string, orgId: string): Promise<PackageRecommendation> {
  const [sub, orderHistory] = await Promise.all([
    getActiveSubscription(customerId, orgId),
    getOrderHistory(customerId, orgId),
  ]);

  const base: Omit<PackageRecommendation, "recommendationType" | "reason" | "urgency"> = {
    customerId,
    currentPackageId: sub?.packageId ?? null,
    currentPackageName: sub?.packageName ?? null,
    suggestedPackageId: null,
    suggestedPackageName: null,
  };

  // 1. Renewal reminder — expiring soon
  if (sub?.expiresAt) {
    const daysLeft = Math.floor((new Date(sub.expiresAt).getTime() - Date.now()) / 86400000);
    if (daysLeft <= 7 && daysLeft >= 0) {
      return {
        ...base,
        recommendationType: "renew",
        suggestedPackageId: sub.packageId,
        suggestedPackageName: sub.packageName,
        reason: `Your subscription expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}. Renew now to avoid interruption.`,
        urgency: daysLeft <= 2 ? "high" : daysLeft <= 5 ? "medium" : "low",
      };
    }
  }

  // 2. No active sub — suggest renew if expired
  if (!sub) {
    const [lastSub] = await db
      .select({ packageId: subscriptions.packageId, packageName: packages.name, priceBdt: packages.priceBdt })
      .from(subscriptions)
      .innerJoin(packages, eq(subscriptions.packageId, packages.id))
      .where(and(eq(subscriptions.customerId, customerId), eq(subscriptions.orgId, orgId)))
      .orderBy(sql`subscriptions.created_at desc`)
      .limit(1);
    return {
      ...base,
      currentPackageId: lastSub?.packageId ?? null,
      currentPackageName: lastSub?.packageName ?? null,
      recommendationType: "renew",
      suggestedPackageId: lastSub?.packageId ?? null,
      suggestedPackageName: lastSub?.packageName ?? null,
      reason: "Your subscription has expired. Renew to restore connectivity.",
      urgency: "high",
    };
  }

  // 3. Bandwidth-based upgrade suggestion
  const avgKbps = await getAvgBandwidthForCustomer(customerId, orgId);
  if (avgKbps !== null && sub.downloadMbps) {
    const utilization = avgKbps / (sub.downloadMbps * 1000);
    if (utilization > 0.85) {
      const upgrade = await getUpgradeCandidate(sub, orgId);
      if (upgrade) {
        return {
          ...base,
          recommendationType: "upgrade",
          suggestedPackageId: upgrade.id,
          suggestedPackageName: upgrade.name,
          reason: `You are consistently using ${(utilization * 100).toFixed(0)}% of your plan speed. Upgrading will improve your experience.`,
          urgency: utilization > 0.95 ? "high" : "medium",
        };
      }
    }

    // 4. Low utilization — downgrade suggestion
    if (utilization < 0.25 && sub.priceBdt > 200) {
      const downgrade = await getDowngradeCandidate(sub, orgId);
      if (downgrade) {
        return {
          ...base,
          recommendationType: "downgrade",
          suggestedPackageId: downgrade.id,
          suggestedPackageName: downgrade.name,
          reason: `You only use ${(utilization * 100).toFixed(0)}% of your plan capacity. A smaller plan could save you ৳${sub.priceBdt - downgrade.priceBdt}/month.`,
          urgency: "low",
          savingsBdt: sub.priceBdt - downgrade.priceBdt,
        };
      }
    }
  }

  // 5. Family plan suggestion for loyal customers with good payment history
  const loyaltyDays = (await db.select({ createdAt: customers.createdAt }).from(customers).where(eq(customers.id, customerId)).limit(1))?.[0];
  const age = loyaltyDays ? Math.floor((Date.now() - new Date(loyaltyDays.createdAt).getTime()) / 86400000) : 0;
  if (age > 180 && orderHistory.onTime >= 6) {
    const familyPkg = await getFamilyPlanCandidate(orgId);
    if (familyPkg && familyPkg.id !== sub.packageId) {
      return {
        ...base,
        recommendationType: "family_plan",
        suggestedPackageId: familyPkg.id,
        suggestedPackageName: familyPkg.name,
        reason: "As a valued long-term customer, consider our family/shared plan for better value.",
        urgency: "low",
      };
    }
  }

  return {
    ...base,
    recommendationType: "stay",
    suggestedPackageId: sub.packageId,
    suggestedPackageName: sub.packageName,
    reason: "Your current plan is well-suited to your usage. No changes recommended.",
    urgency: "low",
  };
}

export async function bulkRecommendations(orgId: string, limit = 20): Promise<PackageRecommendation[]> {
  const custList = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.orgId, orgId), isNull(customers.deletedAt)))
    .limit(limit);

  const results = await Promise.allSettled(custList.map((c) => recommendPackage(c.id, orgId)));
  return results
    .filter((r): r is PromiseFulfilledResult<PackageRecommendation> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((r) => r.recommendationType !== "stay");
}
