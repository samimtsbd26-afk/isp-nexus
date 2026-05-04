import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { router, publicProcedure, authedProcedure, adminProcedure } from "../middleware.js";
import { packages } from "@isp-nexus/db";
import { createPackageSchema } from "@isp-nexus/shared";

export const packageRouter = router({
  list: publicProcedure.input(z.object({ orgId: z.string().uuid().optional() })).query(async ({ ctx, input }) => {
    const orgId = input.orgId ?? ctx.orgId;
    if (!orgId) return [];
    return ctx.db.select().from(packages).where(and(eq(packages.orgId, orgId), eq(packages.isActive, true)));
  }),

  listAll: authedProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(packages).where(eq(packages.orgId, ctx.orgId));
  }),

  get: publicProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const [p] = await ctx.db.select().from(packages).where(eq(packages.id, input.id)).limit(1);
    if (!p) throw new TRPCError({ code: "NOT_FOUND" });
    return p;
  }),

  create: adminProcedure.input(createPackageSchema).mutation(async ({ ctx, input }) => {
    const [p] = await ctx.db.insert(packages).values({ orgId: ctx.orgId, ...input }).returning();
    return p;
  }),

  update: adminProcedure
    .input(z.object({ id: z.string().uuid() }).merge(createPackageSchema.partial()))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await ctx.db.update(packages).set({ ...data, updatedAt: new Date() })
        .where(and(eq(packages.id, id), eq(packages.orgId, ctx.orgId)));
      return { ok: true };
    }),

  delete: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await ctx.db.delete(packages).where(and(eq(packages.id, input.id), eq(packages.orgId, ctx.orgId)));
    return { ok: true };
  }),
});
