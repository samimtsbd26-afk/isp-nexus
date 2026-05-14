import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, like, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { router, authedProcedure, adminProcedure, publicProcedure } from "../middleware.js";
import { vouchers } from "@isp-nexus/db";
import { createVoucherBatchSchema } from "@isp-nexus/shared";

function genCode(len = 10): string {
  return randomBytes(len).toString("base64url").toUpperCase().slice(0, len);
}

export const voucherRouter = router({
  list: authedProcedure
    .input(z.object({
      status: z.string().optional(),
      batchName: z.string().optional(),
      packageId: z.string().uuid().optional(),
      routerId: z.string().uuid().optional(),
      search: z.string().optional(),
      limit: z.number().default(100),
      offset: z.number().default(0),
    }))
    .query(async ({ ctx, input }) => {
      const conditions: any[] = [eq(vouchers.orgId, ctx.orgId)];
      if (input.status) conditions.push(eq(vouchers.status, input.status as any));
      if (input.batchName) conditions.push(eq(vouchers.batchName, input.batchName));
      if (input.packageId) conditions.push(eq(vouchers.packageId, input.packageId));
      if (input.routerId) conditions.push(eq(vouchers.routerId, input.routerId));
      if (input.search) {
        const term = `%${input.search}%`;
        conditions.push(sql`${vouchers.code} ILIKE ${term} OR ${vouchers.batchName} ILIKE ${term}`);
      }
      return ctx.db.select().from(vouchers)
        .where(and(...conditions))
        .orderBy(desc(vouchers.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  analytics: authedProcedure.query(async ({ ctx }) => {
    const [total] = await ctx.db.select({ count: sql<number>`count(*)` }).from(vouchers).where(eq(vouchers.orgId, ctx.orgId));
    const [unused] = await ctx.db.select({ count: sql<number>`count(*)` }).from(vouchers).where(and(eq(vouchers.orgId, ctx.orgId), eq(vouchers.status, "unused")));
    const [used] = await ctx.db.select({ count: sql<number>`count(*)` }).from(vouchers).where(and(eq(vouchers.orgId, ctx.orgId), eq(vouchers.status, "used")));
    const [revoked] = await ctx.db.select({ count: sql<number>`count(*)` }).from(vouchers).where(and(eq(vouchers.orgId, ctx.orgId), eq(vouchers.status, "revoked")));
    const [expired] = await ctx.db.select({ count: sql<number>`count(*)` }).from(vouchers).where(and(eq(vouchers.orgId, ctx.orgId), eq(vouchers.status, "expired")));
    const [revenue] = await ctx.db.select({ total: sql<number>`coalesce(sum(price),0)` }).from(vouchers).where(and(eq(vouchers.orgId, ctx.orgId), eq(vouchers.status, "used")));
    return { total: total?.count ?? 0, unused: unused?.count ?? 0, used: used?.count ?? 0, revoked: revoked?.count ?? 0, expired: expired?.count ?? 0, revenue: revenue?.total ?? 0 };
  }),

  createBatch: adminProcedure.input(createVoucherBatchSchema).mutation(async ({ ctx, input }) => {
    const rows = Array.from({ length: input.count }, () => ({
      orgId: ctx.orgId, routerId: input.routerId, code: genCode(),
      packageId: input.packageId, batchName: input.batchName,
      profile: input.profile, timeLimit: input.timeLimit, dataLimit: input.dataLimit,
      sharedUsers: input.sharedUsers, price: input.price,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
      createdBy: ctx.user.id,
    }));
    await ctx.db.insert(vouchers).values(rows as any);
    return { ok: true, count: rows.length };
  }),

  revoke: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await ctx.db.update(vouchers).set({ status: "revoked" })
      .where(and(eq(vouchers.id, input.id), eq(vouchers.orgId, ctx.orgId)));
    return { ok: true };
  }),

  bulkRevoke: adminProcedure
    .input(z.object({ ids: z.array(z.string().uuid()) }))
    .mutation(async ({ ctx, input }) => {
      if (input.ids.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "No IDs provided" });
      await ctx.db.update(vouchers).set({ status: "revoked" })
        .where(and(eq(vouchers.orgId, ctx.orgId), sql`${vouchers.id} IN (${sql.join(input.ids.map(id => sql`${id}`), sql`, `)})`));
      return { ok: true, count: input.ids.length };
    }),

  bulkDelete: adminProcedure
    .input(z.object({ ids: z.array(z.string().uuid()) }))
    .mutation(async ({ ctx, input }) => {
      if (input.ids.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "No IDs provided" });
      await ctx.db.delete(vouchers)
        .where(and(eq(vouchers.orgId, ctx.orgId), sql`${vouchers.id} IN (${sql.join(input.ids.map(id => sql`${id}`), sql`, `)})`));
      return { ok: true, count: input.ids.length };
    }),

  redeem: publicProcedure
    .input(z.object({ code: z.string(), orgId: z.string().uuid(), customerId: z.string().uuid().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [v] = await ctx.db.select().from(vouchers)
        .where(and(eq(vouchers.code, input.code.toUpperCase()), eq(vouchers.orgId, input.orgId))).limit(1);
      if (!v) throw new TRPCError({ code: "NOT_FOUND", message: "Voucher not found" });
      if (v.status !== "unused") throw new TRPCError({ code: "BAD_REQUEST", message: "Voucher already used or revoked" });
      if (v.expiresAt && v.expiresAt < new Date()) throw new TRPCError({ code: "BAD_REQUEST", message: "Voucher expired" });
      await ctx.db.update(vouchers).set({
        status: "used", usedAt: new Date(), usedBy: input.customerId,
      }).where(eq(vouchers.id, v.id));
      return { ok: true, voucher: v };
    }),
});
