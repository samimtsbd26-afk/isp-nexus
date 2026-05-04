import { z } from "zod";
import { eq, and, desc, gte } from "drizzle-orm";
import { router, authedProcedure } from "../middleware.js";
import { activityLog } from "@isp-nexus/db";

export const activityRouter = router({
  list: authedProcedure.input(z.object({
    limit: z.number().default(100),
    offset: z.number().default(0),
    entityType: z.string().optional(),
    since: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const conditions: any[] = [eq(activityLog.orgId, ctx.orgId)];
    if (input.entityType) conditions.push(eq(activityLog.entityType, input.entityType));
    if (input.since) conditions.push(gte(activityLog.createdAt, new Date(input.since)));

    return ctx.db.select().from(activityLog)
      .where(and(...conditions))
      .orderBy(desc(activityLog.createdAt))
      .limit(input.limit)
      .offset(input.offset);
  }),

  get: authedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const [entry] = await ctx.db.select().from(activityLog)
      .where(and(eq(activityLog.id, input.id), eq(activityLog.orgId, ctx.orgId))).limit(1);
    return entry ?? null;
  }),
});
