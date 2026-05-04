import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, gte, desc } from "drizzle-orm";
import { router, authedProcedure, adminProcedure } from "../middleware.js";
import { alertLogs, resourceSnapshots, bandwidthSnapshots, pingSnapshots, sfpSnapshots, pingTargets, routers } from "@isp-nexus/db";
import { pingTargetSchema } from "@isp-nexus/shared";

async function assertRouterAccess(ctx: { db: any; orgId: string }, routerId: string): Promise<void> {
  const [router] = await ctx.db.select({ id: routers.id }).from(routers)
    .where(and(eq(routers.id, routerId), eq(routers.orgId, ctx.orgId))).limit(1);
  if (!router) throw new TRPCError({ code: "NOT_FOUND", message: "Router not found" });
}

export const monitoringRouter = router({
  getResourceSnapshots: authedProcedure
    .input(z.object({ routerId: z.string().uuid(), since: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      await assertRouterAccess(ctx, input.routerId);
      const since = input.since ? new Date(input.since) : new Date(Date.now() - 3600_000);
      return ctx.db.select().from(resourceSnapshots)
        .where(and(eq(resourceSnapshots.routerId, input.routerId), gte(resourceSnapshots.capturedAt, since)))
        .orderBy(desc(resourceSnapshots.capturedAt)).limit(360);
    }),

  getBandwidthSnapshots: authedProcedure
    .input(z.object({ routerId: z.string().uuid(), since: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      await assertRouterAccess(ctx, input.routerId);
      const since = input.since ? new Date(input.since) : new Date(Date.now() - 3600_000);
      return ctx.db.select().from(bandwidthSnapshots)
        .where(and(eq(bandwidthSnapshots.routerId, input.routerId), gte(bandwidthSnapshots.capturedAt, since)))
        .orderBy(desc(bandwidthSnapshots.capturedAt)).limit(720);
    }),

  getPingSnapshots: authedProcedure
    .input(z.object({ routerId: z.string().uuid(), since: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      await assertRouterAccess(ctx, input.routerId);
      const since = input.since ? new Date(input.since) : new Date(Date.now() - 3600_000);
      return ctx.db.select().from(pingSnapshots)
        .where(and(eq(pingSnapshots.routerId, input.routerId), gte(pingSnapshots.capturedAt, since)))
        .orderBy(desc(pingSnapshots.capturedAt)).limit(360);
    }),

  getSfpSnapshots: authedProcedure
    .input(z.object({ routerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertRouterAccess(ctx, input.routerId);
      return ctx.db.select().from(sfpSnapshots)
        .where(eq(sfpSnapshots.routerId, input.routerId))
        .orderBy(desc(sfpSnapshots.capturedAt)).limit(100);
    }),

  getPingTargets: authedProcedure
    .input(z.object({ routerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.select().from(pingTargets)
        .where(and(eq(pingTargets.routerId, input.routerId), eq(pingTargets.orgId, ctx.orgId)));
    }),

  getAlerts: authedProcedure
    .input(z.object({ routerId: z.string().uuid(), limit: z.number().int().min(1).max(50).default(10) }))
    .query(async ({ ctx, input }) => {
      await assertRouterAccess(ctx, input.routerId);
      return ctx.db.select().from(alertLogs)
        .where(and(eq(alertLogs.routerId, input.routerId), eq(alertLogs.orgId, ctx.orgId), eq(alertLogs.resolved, false)))
        .orderBy(desc(alertLogs.createdAt))
        .limit(input.limit);
    }),

  createPingTarget: adminProcedure.input(pingTargetSchema).mutation(async ({ ctx, input }) => {
    await assertRouterAccess(ctx, input.routerId);
    const [t] = await ctx.db.insert(pingTargets).values({ orgId: ctx.orgId, ...input }).returning();
    return t;
  }),

  deletePingTarget: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await ctx.db.delete(pingTargets).where(and(eq(pingTargets.id, input.id), eq(pingTargets.orgId, ctx.orgId)));
    return { ok: true };
  }),
});
