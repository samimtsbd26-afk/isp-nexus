import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { router, authedProcedure, adminProcedure } from "../middleware.js";
import {
  resellers, resellerCustomers, resellerCommissions,
  users, customers, orders,
} from "@isp-nexus/db";

export const resellerRouter = router({

  list: authedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: resellers.id,
        userId: resellers.userId,
        commissionPct: resellers.commissionPct,
        walletBalanceBdt: resellers.walletBalanceBdt,
        isActive: resellers.isActive,
        notes: resellers.notes,
        createdAt: resellers.createdAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(resellers)
      .leftJoin(users, eq(resellers.userId, users.id))
      .where(eq(resellers.orgId, ctx.orgId))
      .orderBy(desc(resellers.createdAt));

    return Promise.all(
      rows.map(async (r) => {
        const [custCount] = await ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(resellerCustomers)
          .where(and(eq(resellerCustomers.resellerId, r.id), eq(resellerCustomers.orgId, ctx.orgId)));
        const [pendingComm] = await ctx.db
          .select({ total: sql<number>`coalesce(sum(amount_bdt),0)` })
          .from(resellerCommissions)
          .where(and(eq(resellerCommissions.resellerId, r.id), eq(resellerCommissions.status, "pending")));
        return {
          ...r,
          customerCount: Number(custCount?.count ?? 0),
          pendingCommissionBdt: Number(pendingComm?.total ?? 0),
        };
      }),
    );
  }),

  listUsers: authedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users)
      .where(and(eq(users.orgId, ctx.orgId), eq(users.isActive, true)))
      .orderBy(users.name);
  }),

  create: adminProcedure
    .input(z.object({
      userId: z.string().uuid(),
      commissionPct: z.number().min(0).max(100).default(0),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db.select().from(users)
        .where(and(eq(users.id, input.userId), eq(users.orgId, ctx.orgId))).limit(1);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      await ctx.db.update(users).set({ role: "reseller" }).where(eq(users.id, input.userId));
      const [created] = await ctx.db.insert(resellers).values({
        orgId: ctx.orgId,
        userId: input.userId,
        commissionPct: input.commissionPct,
        notes: input.notes,
      }).returning();
      return created;
    }),

  update: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      commissionPct: z.number().min(0).max(100).optional(),
      isActive: z.boolean().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await ctx.db.update(resellers)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(resellers.id, id), eq(resellers.orgId, ctx.orgId)));
      return { ok: true };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [r] = await ctx.db.select().from(resellers)
        .where(and(eq(resellers.id, input.id), eq(resellers.orgId, ctx.orgId))).limit(1);
      if (r) {
        await ctx.db.update(users).set({ role: "admin" }).where(eq(users.id, r.userId));
      }
      await ctx.db.delete(resellers)
        .where(and(eq(resellers.id, input.id), eq(resellers.orgId, ctx.orgId)));
      return { ok: true };
    }),

  getCustomers: authedProcedure
    .input(z.object({ resellerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select({
          id: customers.id,
          fullName: customers.fullName,
          phone: customers.phone,
          customerCode: customers.customerCode,
          assignedAt: resellerCustomers.createdAt,
        })
        .from(resellerCustomers)
        .innerJoin(customers, eq(resellerCustomers.customerId, customers.id))
        .where(and(eq(resellerCustomers.resellerId, input.resellerId), eq(resellerCustomers.orgId, ctx.orgId)))
        .orderBy(desc(resellerCustomers.createdAt));
    }),

  assignCustomers: adminProcedure
    .input(z.object({
      resellerId: z.string().uuid(),
      customerIds: z.array(z.string().uuid()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const rows = input.customerIds.map((customerId) => ({
        orgId: ctx.orgId,
        resellerId: input.resellerId,
        customerId,
      }));
      await ctx.db.insert(resellerCustomers).values(rows).onConflictDoNothing();
      return { ok: true, count: rows.length };
    }),

  unassignCustomer: adminProcedure
    .input(z.object({ resellerId: z.string().uuid(), customerId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(resellerCustomers)
        .where(and(
          eq(resellerCustomers.resellerId, input.resellerId),
          eq(resellerCustomers.customerId, input.customerId),
          eq(resellerCustomers.orgId, ctx.orgId),
        ));
      return { ok: true };
    }),

  getCommissions: authedProcedure
    .input(z.object({ resellerId: z.string().uuid(), status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const conditions = [
        eq(resellerCommissions.orgId, ctx.orgId),
        eq(resellerCommissions.resellerId, input.resellerId),
      ] as ReturnType<typeof eq>[];
      if (input.status) conditions.push(eq(resellerCommissions.status, input.status as any));
      return ctx.db
        .select()
        .from(resellerCommissions)
        .where(and(...conditions))
        .orderBy(desc(resellerCommissions.createdAt))
        .limit(100);
    }),

  payCommissions: adminProcedure
    .input(z.object({ resellerId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const pending = await ctx.db.select()
        .from(resellerCommissions)
        .where(and(
          eq(resellerCommissions.resellerId, input.resellerId),
          eq(resellerCommissions.orgId, ctx.orgId),
          eq(resellerCommissions.status, "pending"),
        ));
      if (pending.length === 0) return { ok: true, paid: 0, totalBdt: 0 };

      const totalBdt = pending.reduce((s, c) => s + c.amountBdt, 0);
      const ids = pending.map((c) => c.id);

      await ctx.db.update(resellerCommissions)
        .set({ status: "paid", paidAt: new Date() })
        .where(and(eq(resellerCommissions.orgId, ctx.orgId), inArray(resellerCommissions.id, ids)));

      await ctx.db.update(resellers)
        .set({
          walletBalanceBdt: sql`wallet_balance_bdt + ${totalBdt}`,
          updatedAt: new Date(),
        })
        .where(eq(resellers.id, input.resellerId));

      return { ok: true, paid: pending.length, totalBdt };
    }),

  analytics: authedProcedure
    .input(z.object({ resellerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const assigned = await ctx.db
        .select({ customerId: resellerCustomers.customerId })
        .from(resellerCustomers)
        .where(and(eq(resellerCustomers.resellerId, input.resellerId), eq(resellerCustomers.orgId, ctx.orgId)));
      const customerIds = assigned.map((c) => c.customerId);

      let monthlyRevenueBdt = 0;
      let totalRevenueBdt = 0;
      if (customerIds.length > 0) {
        const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const [monthly] = await ctx.db
          .select({ total: sql<number>`coalesce(sum(amount_bdt),0)` })
          .from(orders)
          .where(and(eq(orders.orgId, ctx.orgId), eq(orders.status, "approved"), inArray(orders.customerId, customerIds), sql`created_at >= ${since30}`));
        const [total] = await ctx.db
          .select({ total: sql<number>`coalesce(sum(amount_bdt),0)` })
          .from(orders)
          .where(and(eq(orders.orgId, ctx.orgId), eq(orders.status, "approved"), inArray(orders.customerId, customerIds)));
        monthlyRevenueBdt = Number(monthly?.total ?? 0);
        totalRevenueBdt = Number(total?.total ?? 0);
      }

      const [pending] = await ctx.db
        .select({ total: sql<number>`coalesce(sum(amount_bdt),0)` })
        .from(resellerCommissions)
        .where(and(eq(resellerCommissions.resellerId, input.resellerId), eq(resellerCommissions.status, "pending")));
      const [earned] = await ctx.db
        .select({ total: sql<number>`coalesce(sum(amount_bdt),0)` })
        .from(resellerCommissions)
        .where(eq(resellerCommissions.resellerId, input.resellerId));
      const [row] = await ctx.db.select().from(resellers)
        .where(and(eq(resellers.id, input.resellerId), eq(resellers.orgId, ctx.orgId))).limit(1);

      return {
        customerCount: customerIds.length,
        monthlyRevenueBdt,
        totalRevenueBdt,
        pendingCommissionBdt: Number(pending?.total ?? 0),
        totalEarnedBdt: Number(earned?.total ?? 0),
        walletBalanceBdt: row?.walletBalanceBdt ?? 0,
        commissionPct: row?.commissionPct ?? 0,
      };
    }),
});
