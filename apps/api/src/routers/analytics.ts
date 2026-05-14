import { sql, eq, gte, lte, and, isNull } from "drizzle-orm";
import { router, authedProcedure, adminProcedure } from "../middleware.js";
import { orders, customers, subscriptions, packages, routers, invoices, resellers, resellerCommissions, users } from "@isp-nexus/db";
import { connectRouter } from "../lib/mikrotik.js";
import { logger } from "../lib/logger.js";

export const analyticsRouter = router({
  dashboard: authedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalCustomers] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(customers)
      .where(and(eq(customers.orgId, ctx.orgId), isNull(customers.deletedAt)));

    const [activeSubscriptions] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(subscriptions)
      .where(and(eq(subscriptions.orgId, ctx.orgId), eq(subscriptions.status, "active")));

    const [pppoeActive] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(subscriptions)
      .innerJoin(packages, eq(subscriptions.packageId, packages.id))
      .where(
        and(
          eq(subscriptions.orgId, ctx.orgId),
          eq(subscriptions.status, "active"),
          eq(packages.type, "pppoe"),
        ),
      );

    const [hotspotActive] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(subscriptions)
      .innerJoin(packages, eq(subscriptions.packageId, packages.id))
      .where(
        and(
          eq(subscriptions.orgId, ctx.orgId),
          eq(subscriptions.status, "active"),
          eq(packages.type, "hotspot"),
        ),
      );

    const [expiredSubs] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.orgId, ctx.orgId),
          eq(subscriptions.status, "expired"),
        ),
      );

    const [pendingOrders] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(and(eq(orders.orgId, ctx.orgId), eq(orders.status, "pending")));

    const [monthRevenue] = await ctx.db
      .select({ total: sql<number>`coalesce(sum(amount_bdt), 0)` })
      .from(orders)
      .where(
        and(
          eq(orders.orgId, ctx.orgId),
          eq(orders.status, "approved"),
          gte(orders.createdAt, monthStart),
        ),
      );

    const [totalRevenue] = await ctx.db
      .select({ total: sql<number>`coalesce(sum(amount_bdt), 0)` })
      .from(orders)
      .where(and(eq(orders.orgId, ctx.orgId), eq(orders.status, "approved")));

    const routerList = await ctx.db
      .select({
        id: routers.id,
        name: routers.name,
        host: routers.host,
        isActive: routers.isActive,
        cpuLoad: routers.cpuLoad,
        freeMemoryMb: routers.freeMemoryMb,
        temperatureCelsius: routers.temperatureCelsius,
        lastSeenAt: routers.lastSeenAt,
        uptimeSeconds: routers.uptimeSeconds,
        model: routers.model,
        rosVersion: routers.rosVersion,
      })
      .from(routers)
      .where(eq(routers.orgId, ctx.orgId));

    const routersOnline = routerList.filter((r) => r.isActive).length;
    const routersOffline = routerList.filter((r) => !r.isActive).length;

    return {
      totalCustomers: Number(totalCustomers?.count ?? 0),
      activeSubscriptions: Number(activeSubscriptions?.count ?? 0),
      pppoeActive: Number(pppoeActive?.count ?? 0),
      hotspotActive: Number(hotspotActive?.count ?? 0),
      expiredSubs: Number(expiredSubs?.count ?? 0),
      pendingOrders: Number(pendingOrders?.count ?? 0),
      monthRevenueBdt: Number(monthRevenue?.total ?? 0),
      totalRevenueBdt: Number(totalRevenue?.total ?? 0),
      routersOnline,
      routersOffline,
      routerList,
    };
  }),

  revenue: authedProcedure.query(async ({ ctx }) => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return ctx.db
      .select({
        date: sql<string>`date_trunc('day', created_at)::date`,
        total: sql<number>`sum(amount_bdt)`,
        count: sql<number>`count(*)`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.orgId, ctx.orgId),
          eq(orders.status, "approved"),
          gte(orders.createdAt, since),
        ),
      )
      .groupBy(sql`date_trunc('day', created_at)`)
      .orderBy(sql`date_trunc('day', created_at)`);
  }),

  customerGrowth: authedProcedure.query(async ({ ctx }) => {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    return ctx.db
      .select({
        date: sql<string>`date_trunc('day', created_at)::date`,
        count: sql<number>`count(*)`,
      })
      .from(customers)
      .where(and(eq(customers.orgId, ctx.orgId), gte(customers.createdAt, since), isNull(customers.deletedAt)))
      .groupBy(sql`date_trunc('day', created_at)`)
      .orderBy(sql`date_trunc('day', created_at)`);
  }),

  recentOrders: authedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: orders.id,
        amountBdt: orders.amountBdt,
        status: orders.status,
        paymentMethod: orders.paymentMethod,
        createdAt: orders.createdAt,
        customerName: customers.fullName,
        customerPhone: customers.phone,
      })
      .from(orders)
      .innerJoin(customers, eq(orders.customerId, customers.id))
      .where(eq(orders.orgId, ctx.orgId))
      .orderBy(sql`orders.created_at desc`)
      .limit(10);
  }),

  subscriptionsByPackage: authedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        packageName: packages.name,
        packageType: packages.type,
        count: sql<number>`count(*)`,
      })
      .from(subscriptions)
      .innerJoin(packages, eq(subscriptions.packageId, packages.id))
      .where(
        and(eq(subscriptions.orgId, ctx.orgId), eq(subscriptions.status, "active")),
      )
      .groupBy(packages.id, packages.name, packages.type)
      .orderBy(sql`count(*) desc`)
      .limit(10);
  }),

  // ── Business metrics — MRR / ARPU / Churn / Unpaid / Reseller payouts ──────
  businessMetrics: adminProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    // MRR — paid orders this month (exclude free trials)
    const [mrrRow] = await ctx.db
      .select({ total: sql<number>`coalesce(sum(amount_bdt), 0)` })
      .from(orders)
      .where(and(
        eq(orders.orgId, ctx.orgId),
        eq(orders.status, "approved"),
        gte(orders.createdAt, monthStart),
        sql`amount_bdt > 0`,
      ));
    const mrr = Number(mrrRow?.total ?? 0);

    // Prev-month MRR for growth %
    const [prevMrrRow] = await ctx.db
      .select({ total: sql<number>`coalesce(sum(amount_bdt), 0)` })
      .from(orders)
      .where(and(
        eq(orders.orgId, ctx.orgId),
        eq(orders.status, "approved"),
        gte(orders.createdAt, prevMonthStart),
        lte(orders.createdAt, prevMonthEnd),
        sql`amount_bdt > 0`,
      ));
    const prevMrr = Number(prevMrrRow?.total ?? 0);
    const mrrGrowthPct = prevMrr > 0 ? Math.round(((mrr - prevMrr) / prevMrr) * 100) : null;

    // Active subscribers
    const [activeSubs] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(subscriptions)
      .where(and(eq(subscriptions.orgId, ctx.orgId), eq(subscriptions.status, "active")));
    const activeCount = Number(activeSubs?.count ?? 0);

    // ARPU
    const arpu = activeCount > 0 ? Math.round(mrr / activeCount) : 0;

    // Churn rate — subs that expired or were cancelled this month
    const [churnedRow] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(subscriptions)
      .where(and(
        eq(subscriptions.orgId, ctx.orgId),
        sql`status IN ('expired', 'cancelled')`,
        gte(subscriptions.updatedAt, monthStart),
      ));
    const churned = Number(churnedRow?.count ?? 0);
    const churnBase = activeCount + churned;
    const churnRatePct = churnBase > 0 ? Math.round((churned / churnBase) * 100 * 10) / 10 : 0;

    // Unpaid invoices — issued but paidAt is null
    const unpaidRows = await ctx.db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        amountBdt: invoices.totalBdt,
        issuedAt: invoices.issuedAt,
        dueAt: invoices.dueAt,
        customerName: customers.fullName,
        customerPhone: customers.phone,
      })
      .from(invoices)
      .innerJoin(customers, eq(invoices.customerId, customers.id))
      .where(and(
        eq(invoices.orgId, ctx.orgId),
        isNull(invoices.paidAt),
        sql`invoices.amount_bdt > 0`,
      ))
      .orderBy(sql`invoices.issued_at desc`)
      .limit(50);

    const unpaidTotal = unpaidRows.reduce((s, r) => s + (r.amountBdt ?? 0), 0);

    // Reseller payout summary — pending commissions per reseller (join users for name/email)
    const resellerPayouts = await ctx.db
      .select({
        resellerId: resellers.id,
        name: users.name,
        email: users.email,
        commissionPct: resellers.commissionPct,
        walletBalanceBdt: resellers.walletBalanceBdt,
        pendingBdt: sql<number>`coalesce(sum(case when ${resellerCommissions.status}='pending' then ${resellerCommissions.amountBdt} else 0 end), 0)`,
        totalEarnedBdt: sql<number>`coalesce(sum(${resellerCommissions.amountBdt}), 0)`,
      })
      .from(resellers)
      .innerJoin(users, eq(users.id, resellers.userId))
      .leftJoin(resellerCommissions, and(
        eq(resellerCommissions.resellerId, resellers.id),
        eq(resellerCommissions.orgId, ctx.orgId),
      ))
      .where(eq(resellers.orgId, ctx.orgId))
      .groupBy(resellers.id, users.name, users.email, resellers.commissionPct, resellers.walletBalanceBdt);

    const totalPendingPayouts = resellerPayouts.reduce((s, r) => s + Number(r.pendingBdt ?? 0), 0);

    return {
      mrr,
      prevMrr,
      mrrGrowthPct,
      arpu,
      activeSubscribers: activeCount,
      churnedThisMonth: churned,
      churnRatePct,
      unpaidInvoices: unpaidRows,
      unpaidCount: unpaidRows.length,
      unpaidTotalBdt: unpaidTotal,
      resellerPayouts: resellerPayouts.map((r) => ({ resellerId: r.resellerId, name: r.name, email: r.email, commissionPct: r.commissionPct, walletBalanceBdt: r.walletBalanceBdt, pendingBdt: Number(r.pendingBdt), totalEarnedBdt: Number(r.totalEarnedBdt) })),
      totalPendingPayoutsBdt: totalPendingPayouts,
    };
  }),

  // ── Network map — all routers with live MikroTik stats ────────────────────

  networkMap: authedProcedure.query(async ({ ctx }) => {
    const routerList = await ctx.db.select().from(routers).where(eq(routers.orgId, ctx.orgId));

    const results = await Promise.allSettled(
      routerList.map(async (r) => {
        const base = {
          id: r.id,
          name: r.name,
          host: r.host,
          model: r.model,
          rosVersion: r.rosVersion,
          isActive: r.isActive,
          isDefault: r.isDefault,
          cpuLoad: r.cpuLoad,
          freeMemoryMb: r.freeMemoryMb,
          temperatureCelsius: r.temperatureCelsius,
          uptimeSeconds: r.uptimeSeconds,
          lastSeenAt: r.lastSeenAt,
          activeUsers: 0,
          rxMbps: 0,
          txMbps: 0,
          liveError: null as string | null,
        };
        if (!r.isActive) return base;
        try {
          const client = await connectRouter(r);
          try {
            const [ifaces, hotspotActive] = await Promise.allSettled([
              client.print("/interface"),
              client.print("/ip/hotspot/active"),
            ]);
            if (ifaces.status === "fulfilled") {
              let rx = 0, tx = 0;
              for (const iface of (ifaces.value as any[])) {
                rx += parseInt((iface as any)["rx-bits-per-second"] ?? "0", 10);
                tx += parseInt((iface as any)["tx-bits-per-second"] ?? "0", 10);
              }
              base.rxMbps = Math.round(rx / 1_000_000 * 10) / 10;
              base.txMbps = Math.round(tx / 1_000_000 * 10) / 10;
            }
            if (hotspotActive.status === "fulfilled") {
              base.activeUsers = (hotspotActive.value as any[]).length;
            }
          } finally {
            await client.close().catch(() => {});
          }
        } catch (err: any) {
          base.liveError = err?.message ?? "Connection failed";
          logger.debug({ err, routerId: r.id }, "networkMap: router live stats fetch failed");
        }
        return base;
      }),
    );

    return results.map((r) =>
      r.status === "fulfilled" ? r.value : { id: "", name: "Unknown", liveError: String((r as PromiseRejectedResult).reason), isActive: false, host: "", model: null, rosVersion: null, isDefault: false, cpuLoad: null, freeMemoryMb: null, temperatureCelsius: null, uptimeSeconds: null, lastSeenAt: null, activeUsers: 0, rxMbps: 0, txMbps: 0 },
    );
  }),
});
