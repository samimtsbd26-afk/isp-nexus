import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, asc } from "drizzle-orm";
import { router, authedProcedure, adminProcedure } from "../middleware.js";
import { virtualHosts } from "@isp-nexus/db";
import { buildCaddyConfig } from "../services/caddy/config-builder.js";
import { applyCaddyConfig, getCaddyConfig, getCaddyStatus } from "../services/caddy/client.js";
import { logActivity } from "../lib/activity.js";
import { logger } from "../lib/logger.js";

const vhostInput = z.object({
  domain: z.string().min(1),
  label: z.string().optional(),
  isEnabled: z.boolean().default(true),
  listenHttp: z.boolean().default(false),
  primaryUpstream: z.string().optional(),
  hasApiProxy: z.boolean().default(false),
  apiUpstream: z.string().default("api:3001"),
  hasSocketProxy: z.boolean().default(false),
  staticRoot: z.string().optional(),
  staticFallback: z.string().optional(),
  gzipEnabled: z.boolean().default(true),
  securityHeaders: z.boolean().default(false),
  cacheControl: z.string().optional(),
  sortOrder: z.number().int().default(0),
});

export const caddyRouter = router({
  listVirtualHosts: authedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(virtualHosts)
      .where(eq(virtualHosts.orgId, ctx.orgId))
      .orderBy(asc(virtualHosts.sortOrder));
  }),

  getVirtualHost: authedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [vh] = await ctx.db
        .select()
        .from(virtualHosts)
        .where(and(eq(virtualHosts.id, input.id), eq(virtualHosts.orgId, ctx.orgId)))
        .limit(1);
      if (!vh) throw new TRPCError({ code: "NOT_FOUND" });
      return vh;
    }),

  upsertVirtualHost: adminProcedure
    .input(vhostInput.extend({ id: z.string().uuid().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      if (id) {
        const [existing] = await ctx.db
          .select({ id: virtualHosts.id })
          .from(virtualHosts)
          .where(and(eq(virtualHosts.id, id), eq(virtualHosts.orgId, ctx.orgId)))
          .limit(1);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
        await ctx.db
          .update(virtualHosts)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(virtualHosts.id, id));
        await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "update", "virtual_host", id, { domain: data.domain });
        return { id };
      }
      const [inserted] = await ctx.db
        .insert(virtualHosts)
        .values({ orgId: ctx.orgId, ...data })
        .returning({ id: virtualHosts.id });
      await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "create", "virtual_host", inserted.id, { domain: data.domain });
      return { id: inserted.id };
    }),

  deleteVirtualHost: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [vh] = await ctx.db
        .select({ domain: virtualHosts.domain })
        .from(virtualHosts)
        .where(and(eq(virtualHosts.id, input.id), eq(virtualHosts.orgId, ctx.orgId)))
        .limit(1);
      if (!vh) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db
        .delete(virtualHosts)
        .where(and(eq(virtualHosts.id, input.id), eq(virtualHosts.orgId, ctx.orgId)));
      await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "delete", "virtual_host", input.id, { domain: vh.domain });
      return { ok: true };
    }),

  getStatus: authedProcedure.query(async () => {
    return getCaddyStatus();
  }),

  getRunningConfig: authedProcedure.query(async () => {
    try {
      return await getCaddyConfig();
    } catch (err) {
      logger.warn({ err }, "Failed to fetch Caddy running config");
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Caddy Admin API unreachable" });
    }
  }),

  previewConfig: authedProcedure.query(async ({ ctx }) => {
    return buildCaddyConfig(ctx.db, ctx.orgId);
  }),

  applyConfig: adminProcedure.mutation(async ({ ctx }) => {
    const config = await buildCaddyConfig(ctx.db, ctx.orgId);
    try {
      await applyCaddyConfig(config);
    } catch (err) {
      logger.error({ err }, "Caddy config apply failed");
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: err instanceof Error ? err.message : "Caddy apply failed",
      });
    }
    await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "apply", "caddy_config", ctx.orgId, {});
    return { ok: true, applied: new Date().toISOString() };
  }),
});
