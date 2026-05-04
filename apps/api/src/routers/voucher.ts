import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";
import { router, authedProcedure, adminProcedure, publicProcedure } from "../middleware.js";
import { vouchers } from "@isp-nexus/db";
import { createVoucherBatchSchema } from "@isp-nexus/shared";

function genCode(len = 10): string {
  return randomBytes(len).toString("base64url").toUpperCase().slice(0, len);
}

export const voucherRouter = router({
  list: authedProcedure
    .input(z.object({ status: z.string().optional(), batchName: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.select().from(vouchers).where(eq(vouchers.orgId, ctx.orgId));
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
