import { eq, and, gte, sql, isNull } from "drizzle-orm";
import { createDb } from "@isp-nexus/db";
import {
  customers, subscriptions, orders, supportTickets, deviceBindings,
} from "@isp-nexus/db";
import { env } from "../../lib/env.js";

const db = createDb(env.DATABASE_URL);

export interface CustomerScore {
  customerId: string;
  score: number;          // 0–100
  grade: "A" | "B" | "C" | "D" | "F";
  churnRisk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  breakdown: {
    paymentScore: number;   // 0–40
    supportScore: number;   // 0–20
    stabilityScore: number; // 0–20
    loyaltyScore: number;   // 0–20
  };
  insights: string[];
}

export interface CustomerScoreRow {
  customerId: string;
  totalOrders: number;
  approvedOrders: number;
  rejectedOrders: number;
  openTickets: number;
  resolvedTickets: number;
  totalTickets: number;
  deviceChanges: number;
  activeSubscriptions: number;
  expiredSubscriptions: number;
  cancelledSubscriptions: number;
  daysSinceCreated: number;
  daysSinceLastOrder: number | null;
}

async function fetchCustomerData(customerId: string, orgId: string): Promise<CustomerScoreRow | null> {
  const [cust] = await db
    .select({ createdAt: customers.createdAt })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.orgId, orgId), isNull(customers.deletedAt)));
  if (!cust) return null;

  const daysSinceCreated = Math.floor((Date.now() - new Date(cust.createdAt).getTime()) / 86400000);

  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000);

  const [orderStats] = await db
    .select({
      total: sql<number>`count(*)`,
      approved: sql<number>`sum(case when status='approved' then 1 else 0 end)`,
      rejected: sql<number>`sum(case when status='rejected' then 1 else 0 end)`,
    })
    .from(orders)
    .where(and(eq(orders.customerId, customerId), eq(orders.orgId, orgId)));

  const [lastOrderRow] = await db
    .select({ createdAt: orders.createdAt })
    .from(orders)
    .where(and(eq(orders.customerId, customerId), eq(orders.orgId, orgId), eq(orders.status, "approved")))
    .orderBy(sql`created_at desc`)
    .limit(1);

  const daysSinceLastOrder = lastOrderRow
    ? Math.floor((Date.now() - new Date(lastOrderRow.createdAt).getTime()) / 86400000)
    : null;

  const [ticketStats] = await db
    .select({
      total: sql<number>`count(*)`,
      open: sql<number>`sum(case when status='open' or status='in_progress' then 1 else 0 end)`,
      resolved: sql<number>`sum(case when status='resolved' or status='closed' then 1 else 0 end)`,
    })
    .from(supportTickets)
    .where(and(eq(supportTickets.customerId, customerId), eq(supportTickets.orgId, orgId)));

  const [deviceCount] = await db
    .select({ changes: sql<number>`count(*)` })
    .from(deviceBindings)
    .where(and(eq(deviceBindings.customerId, customerId)));

  const [subStats] = await db
    .select({
      active: sql<number>`sum(case when status='active' then 1 else 0 end)`,
      expired: sql<number>`sum(case when status='expired' then 1 else 0 end)`,
      cancelled: sql<number>`sum(case when status='cancelled' then 1 else 0 end)`,
    })
    .from(subscriptions)
    .where(and(eq(subscriptions.customerId, customerId), eq(subscriptions.orgId, orgId)));

  return {
    customerId,
    totalOrders: Number(orderStats?.total ?? 0),
    approvedOrders: Number(orderStats?.approved ?? 0),
    rejectedOrders: Number(orderStats?.rejected ?? 0),
    openTickets: Number(ticketStats?.open ?? 0),
    resolvedTickets: Number(ticketStats?.resolved ?? 0),
    totalTickets: Number(ticketStats?.total ?? 0),
    deviceChanges: Number(deviceCount?.changes ?? 0),
    activeSubscriptions: Number(subStats?.active ?? 0),
    expiredSubscriptions: Number(subStats?.expired ?? 0),
    cancelledSubscriptions: Number(subStats?.cancelled ?? 0),
    daysSinceCreated,
    daysSinceLastOrder,
  };
}

function computePaymentScore(data: CustomerScoreRow): { score: number; insight: string | null } {
  if (data.totalOrders === 0) return { score: 20, insight: "No payment history yet" };
  const approvalRate = data.approvedOrders / data.totalOrders;
  let score = Math.round(approvalRate * 35);

  // Recency bonus
  if (data.daysSinceLastOrder !== null && data.daysSinceLastOrder <= 30) score = Math.min(40, score + 5);

  const insight = approvalRate < 0.7
    ? `${data.rejectedOrders} rejected payments (${(100 - approvalRate * 100).toFixed(0)}% rejection rate)`
    : null;
  return { score: Math.min(40, score), insight };
}

function computeSupportScore(data: CustomerScoreRow): { score: number; insight: string | null } {
  let score = 20;
  if (data.openTickets > 3) score -= 8;
  else if (data.openTickets > 1) score -= 4;
  if (data.totalTickets > 10) score -= 4;
  const insight = data.openTickets > 0
    ? `${data.openTickets} open support ticket${data.openTickets > 1 ? "s" : ""}`
    : null;
  return { score: Math.max(0, score), insight };
}

function computeStabilityScore(data: CustomerScoreRow): { score: number; insight: string | null } {
  let score = 20;
  // Many device changes indicate instability
  if (data.deviceChanges > 5) score -= 6;
  else if (data.deviceChanges > 2) score -= 3;
  // Cancelled subscriptions
  if (data.cancelledSubscriptions > 2) score -= 6;
  else if (data.cancelledSubscriptions > 0) score -= 2;
  const insight = data.deviceChanges > 3
    ? `${data.deviceChanges} device changes recorded`
    : null;
  return { score: Math.max(0, score), insight };
}

function computeLoyaltyScore(data: CustomerScoreRow): { score: number; insight: string | null } {
  let score = 0;
  // Long-term customer
  if (data.daysSinceCreated > 365) score += 10;
  else if (data.daysSinceCreated > 180) score += 7;
  else if (data.daysSinceCreated > 90) score += 4;
  else score += 2;

  // Active subscription
  if (data.activeSubscriptions > 0) score += 6;

  // Regular payments
  if (data.approvedOrders > 12) score += 4;
  else if (data.approvedOrders > 6) score += 2;

  const insight = data.daysSinceCreated < 30 ? "New customer" : null;
  return { score: Math.min(20, score), insight };
}

export function scoreCustomerData(data: CustomerScoreRow): CustomerScore {
  const payment = computePaymentScore(data);
  const support = computeSupportScore(data);
  const stability = computeStabilityScore(data);
  const loyalty = computeLoyaltyScore(data);

  const total = payment.score + support.score + stability.score + loyalty.score;
  const grade: CustomerScore["grade"] =
    total >= 85 ? "A" : total >= 70 ? "B" : total >= 55 ? "C" : total >= 40 ? "D" : "F";

  const churnRisk: CustomerScore["churnRisk"] =
    total >= 70 ? "LOW"
    : total >= 55 ? "MEDIUM"
    : total >= 35 ? "HIGH"
    : "CRITICAL";

  const insights: string[] = [];
  if (payment.insight) insights.push(payment.insight);
  if (support.insight) insights.push(support.insight);
  if (stability.insight) insights.push(stability.insight);
  if (loyalty.insight) insights.push(loyalty.insight);

  // Churn warning
  if (data.daysSinceLastOrder !== null && data.daysSinceLastOrder > 45 && data.activeSubscriptions === 0) {
    insights.push(`No renewal in ${data.daysSinceLastOrder} days — churn risk`);
  }

  return {
    customerId: data.customerId,
    score: total,
    grade,
    churnRisk,
    breakdown: {
      paymentScore: payment.score,
      supportScore: support.score,
      stabilityScore: stability.score,
      loyaltyScore: loyalty.score,
    },
    insights,
  };
}

export async function scoreCustomer(customerId: string, orgId: string): Promise<CustomerScore | null> {
  const data = await fetchCustomerData(customerId, orgId);
  if (!data) return null;
  return scoreCustomerData(data);
}

export async function scoreAllCustomers(orgId: string, limit = 50): Promise<CustomerScore[]> {
  const custList = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.orgId, orgId), isNull(customers.deletedAt)))
    .limit(limit);

  const results = await Promise.allSettled(custList.map((c) => fetchCustomerData(c.id, orgId)));
  const scores: CustomerScore[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) {
      scores.push(scoreCustomerData(r.value));
    }
  }
  return scores.sort((a, b) => a.score - b.score);
}

export async function getChurnRiskCustomers(orgId: string): Promise<CustomerScore[]> {
  const all = await scoreAllCustomers(orgId, 100);
  return all.filter((s) => s.churnRisk === "HIGH" || s.churnRisk === "CRITICAL");
}
