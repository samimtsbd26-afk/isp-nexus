import { sql, eq, gte, and, lt } from "drizzle-orm";
import { router, authedProcedure } from "../middleware.js";
import { orders, customers, subscriptions, packages, routers } from "@isp-nexus/db";

export const analyticsRouter = router({
  dashboard: authedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalCustomers] = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(customers)
      .where(eq(customers.orgId, ctx.orgId));

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
      .where(and(eq(customers.orgId, ctx.orgId), gte(customers.createdAt, since)))
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
});
