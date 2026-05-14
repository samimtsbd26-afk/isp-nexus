import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { router, authedProcedure, adminProcedure, superadminProcedure } from "../middleware.js";
import { vpsConnections } from "@isp-nexus/db";
import { encryptText, decryptText } from "../lib/crypto.js";
import { logActivity } from "../lib/activity.js";
import { logger } from "../lib/logger.js";
import { sshExec, sshTest } from "../services/ssh/client.js";
import { buildCommand, COMMAND_SPECS, ALLOWED_SERVICES } from "../services/ssh/commands.js";
import type { CommandKey } from "../services/ssh/commands.js";

const COMMAND_KEY_SCHEMA = z.enum([
  "system:info",
  "system:disk",
  "system:uptime",
  "docker:ps",
  "docker:logs",
  "docker:restart",
  "docker:pull",
  "caddy:reload",
  "caddy:validate",
] as const);

async function resolveVps(db: any, orgId: string, vpsId?: string) {
  if (vpsId) {
    const [conn] = await db.select().from(vpsConnections)
      .where(and(eq(vpsConnections.id, vpsId), eq(vpsConnections.orgId, orgId))).limit(1);
    if (!conn) throw new TRPCError({ code: "NOT_FOUND", message: "VPS connection not found" });
    return conn;
  }
  const [conn] = await db.select().from(vpsConnections)
    .where(and(eq(vpsConnections.orgId, orgId), eq(vpsConnections.isDefault, true))).limit(1);
  if (!conn) throw new TRPCError({ code: "NOT_FOUND", message: "No default VPS connection configured" });
  return conn;
}

function buildSshOpts(conn: typeof vpsConnections.$inferSelect) {
  return {
    host: conn.host,
    port: conn.port,
    username: conn.username,
    privateKey: conn.privateKeyEnc ? decryptText(conn.privateKeyEnc) : undefined,
    password: conn.passwordEnc ? decryptText(conn.passwordEnc) : undefined,
  };
}

export const systemRouter = router({

  // ── VPS connection management ─────────────────────────────────────────────

  listVpsConnections: authedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select({
      id: vpsConnections.id,
      label: vpsConnections.label,
      host: vpsConnections.host,
      port: vpsConnections.port,
      username: vpsConnections.username,
      authType: vpsConnections.authType,
      isDefault: vpsConnections.isDefault,
      lastTestedAt: vpsConnections.lastTestedAt,
      lastTestOk: vpsConnections.lastTestOk,
    }).from(vpsConnections).where(eq(vpsConnections.orgId, ctx.orgId));
    return rows;
  }),

  addVpsConnection: superadminProcedure
    .input(z.object({
      label: z.string().min(1),
      host: z.string().min(1),
      port: z.number().int().default(22),
      username: z.string().min(1).default("root"),
      authType: z.enum(["key", "password"]),
      privateKey: z.string().optional(),
      password: z.string().optional(),
      isDefault: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.authType === "key" && !input.privateKey) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Private key required for key auth" });
      }
      if (input.authType === "password" && !input.password) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Password required for password auth" });
      }

      if (input.isDefault) {
        await ctx.db.update(vpsConnections)
          .set({ isDefault: false })
          .where(eq(vpsConnections.orgId, ctx.orgId));
      }

      const [inserted] = await ctx.db.insert(vpsConnections).values({
        orgId: ctx.orgId,
        label: input.label,
        host: input.host,
        port: input.port,
        username: input.username,
        authType: input.authType,
        privateKeyEnc: input.privateKey ? encryptText(input.privateKey) : null,
        passwordEnc: input.password ? encryptText(input.password) : null,
        isDefault: input.isDefault,
      }).returning({ id: vpsConnections.id });

      await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "create", "vps_connection", inserted.id, { host: input.host });
      return { id: inserted.id };
    }),

  deleteVpsConnection: superadminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [conn] = await ctx.db.select({ host: vpsConnections.host })
        .from(vpsConnections)
        .where(and(eq(vpsConnections.id, input.id), eq(vpsConnections.orgId, ctx.orgId))).limit(1);
      if (!conn) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db.delete(vpsConnections)
        .where(and(eq(vpsConnections.id, input.id), eq(vpsConnections.orgId, ctx.orgId)));
      await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "delete", "vps_connection", input.id, { host: conn.host });
      return { ok: true };
    }),

  setDefaultVps: superadminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [conn] = await ctx.db.select({ id: vpsConnections.id })
        .from(vpsConnections)
        .where(and(eq(vpsConnections.id, input.id), eq(vpsConnections.orgId, ctx.orgId))).limit(1);
      if (!conn) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db.update(vpsConnections).set({ isDefault: false }).where(eq(vpsConnections.orgId, ctx.orgId));
      await ctx.db.update(vpsConnections).set({ isDefault: true }).where(eq(vpsConnections.id, input.id));
      return { ok: true };
    }),

  // ── Connection test ───────────────────────────────────────────────────────

  testVpsConnection: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await resolveVps(ctx.db, ctx.orgId, input.id);
      const ok = await sshTest(buildSshOpts(conn));
      await ctx.db.update(vpsConnections).set({
        lastTestedAt: new Date(),
        lastTestOk: ok,
        updatedAt: new Date(),
      }).where(eq(vpsConnections.id, conn.id));
      return { ok, host: conn.host };
    }),

  // ── Command execution — strictly whitelisted ──────────────────────────────

  listCommands: authedProcedure.query(async () => {
    return Object.entries(COMMAND_SPECS).map(([key, spec]) => ({ key, ...spec }));
  }),

  listAllowedServices: authedProcedure.query(async () => {
    return [...ALLOWED_SERVICES];
  }),

  exec: adminProcedure
    .input(z.object({
      vpsId: z.string().uuid().optional(),
      command: COMMAND_KEY_SCHEMA,
      service: z.string().optional(),
      lines: z.number().int().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await resolveVps(ctx.db, ctx.orgId, input.vpsId);
      const spec = COMMAND_SPECS[input.command as CommandKey];

      let shellCmd: string;
      try {
        shellCmd = buildCommand(input.command as CommandKey, {
          service: input.service,
          lines: input.lines,
        });
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Invalid command parameters",
        });
      }

      logger.info({ command: input.command, service: input.service, host: conn.host }, "SSH command exec");

      let result: { stdout: string; stderr: string; code: number };
      try {
        result = await sshExec(buildSshOpts(conn), shellCmd);
      } catch (err) {
        logger.error({ err, command: input.command }, "SSH exec failed");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "SSH exec failed",
        });
      }

      await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "exec", "vps_command", conn.id, {
        command: input.command,
        service: input.service ?? null,
        exitCode: result.code,
        dangerous: spec.dangerous,
      });

      return {
        command: input.command,
        label: spec.label,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.code,
        host: conn.host,
        executedAt: new Date().toISOString(),
      };
    }),
});
