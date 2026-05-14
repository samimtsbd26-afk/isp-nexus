import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc } from "drizzle-orm";
import { router, authedProcedure, adminProcedure } from "../middleware.js";
import { routers, backupConfigs } from "@isp-nexus/db";
import { connectRouter } from "../lib/mikrotik.js";

async function getRouterAndClient(db: any, orgId: string, routerId: string) {
  const [r] = await db.select().from(routers)
    .where(and(eq(routers.id, routerId), eq(routers.orgId, orgId))).limit(1);
  if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Router not found" });
  const client = await connectRouter(r);
  return { client, router: r };
}

export const backupRouter = router({
  list: authedProcedure.input(z.object({ routerId: z.string().uuid().optional() })).query(async ({ ctx, input }) => {
    if (input.routerId) {
      return ctx.db.select({
        id: backupConfigs.id, name: backupConfigs.name, fileName: backupConfigs.fileName,
        backupType: backupConfigs.backupType, fileSize: backupConfigs.fileSize, createdAt: backupConfigs.createdAt,
        routerId: backupConfigs.routerId,
      }).from(backupConfigs)
        .where(and(eq(backupConfigs.orgId, ctx.orgId), eq(backupConfigs.routerId, input.routerId)))
        .orderBy(desc(backupConfigs.createdAt));
    }
    return ctx.db.select({
      id: backupConfigs.id, name: backupConfigs.name, fileName: backupConfigs.fileName,
      backupType: backupConfigs.backupType, fileSize: backupConfigs.fileSize, createdAt: backupConfigs.createdAt,
      routerId: backupConfigs.routerId,
    }).from(backupConfigs)
      .where(eq(backupConfigs.orgId, ctx.orgId))
      .orderBy(desc(backupConfigs.createdAt));
  }),

  create: adminProcedure.input(z.object({
    routerId: z.string().uuid(),
    type: z.enum(["backup", "export"]).default("export"),
    description: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const { client, router: r } = await getRouterAndClient(ctx.db, ctx.orgId, input.routerId);
    try {
      const now = new Date();
      const baseName = `${r.name.replace(/\s+/g, "-")}-${now.toISOString().slice(0, 10)}`;

      if (input.type === "export") {
        const result = await client.exec("/", "export");
        const content = Array.isArray(result) ? result.map((l: any) => JSON.stringify(l)).join("\n") : String(result);
        const [saved] = await ctx.db.insert(backupConfigs).values({
          orgId: ctx.orgId,
          routerId: input.routerId,
          name: baseName,
          description: input.description,
          configData: content,
          fileName: `${baseName}.rsc`,
          fileSize: content.length,
          backupType: "export",
          createdBy: ctx.user.id,
        }).returning();
        return saved;
      } else {
        const filename = `${baseName}.backup`;
        await client.exec("/system/backup", "save", { name: baseName });
        const [saved] = await ctx.db.insert(backupConfigs).values({
          orgId: ctx.orgId,
          routerId: input.routerId,
          name: baseName,
          description: input.description,
          configData: "",
          fileName: filename,
          fileSize: 0,
          backupType: "backup",
          createdBy: ctx.user.id,
        }).returning();
        return saved;
      }
    } finally {
      await client.close();
    }
  }),

  getContent: authedProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const [b] = await ctx.db.select().from(backupConfigs)
      .where(and(eq(backupConfigs.id, input.id), eq(backupConfigs.orgId, ctx.orgId))).limit(1);
    if (!b) throw new TRPCError({ code: "NOT_FOUND" });
    return b;
  }),

  delete: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await ctx.db.delete(backupConfigs)
      .where(and(eq(backupConfigs.id, input.id), eq(backupConfigs.orgId, ctx.orgId)));
    return { ok: true };
  }),

  // ── Database backups (Postgres + Redis) ───────────────────────────────────

  runDbBackup: adminProcedure
    .input(z.object({ type: z.enum(["postgres", "redis"]) }))
    .mutation(async ({ input }) => {
      const { runPostgresBackup, runRedisBackup } = await import("../services/backup/database.js");
      if (input.type === "postgres") return runPostgresBackup();
      return runRedisBackup();
    }),

  listDbBackups: adminProcedure.query(async () => {
    const { getBackupHistory } = await import("../services/backup/database.js");
    return getBackupHistory();
  }),
});
