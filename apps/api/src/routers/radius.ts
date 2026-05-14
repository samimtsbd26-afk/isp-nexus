import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc } from "drizzle-orm";
import { router, authedProcedure, adminProcedure } from "../middleware.js";
import { nas, radcheck, radreply, radacct } from "@isp-nexus/db";
import { logActivity } from "../lib/activity.js";

export const radiusRouter = router({

  // ── NAS / Client management ───────────────────────────────────────────────

  listNas: authedProcedure.query(async ({ ctx }) => {
    return ctx.db.select({
      id: nas.id,
      nasname: nas.nasname,
      shortname: nas.shortname,
      type: nas.type,
      ports: nas.ports,
      server: nas.server,
      community: nas.community,
      description: nas.description,
      // Never expose the secret to the client listing
    }).from(nas).orderBy(nas.id);
  }),

  getNas: authedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const [entry] = await ctx.db.select().from(nas).where(eq(nas.id, input.id)).limit(1);
      if (!entry) throw new TRPCError({ code: "NOT_FOUND" });
      // Return full entry including secret for editing — admin only implicitly via authed
      return entry;
    }),

  upsertNas: adminProcedure
    .input(z.object({
      id: z.number().int().optional(),
      nasname: z.string().min(1, "IP/CIDR required"),
      shortname: z.string().optional(),
      type: z.string().default("other"),
      ports: z.number().int().optional(),
      secret: z.string().min(8, "Secret must be at least 8 characters"),
      server: z.string().optional(),
      community: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      if (id != null) {
        const [existing] = await ctx.db.select({ id: nas.id }).from(nas).where(eq(nas.id, id)).limit(1);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
        await ctx.db.update(nas).set(data).where(eq(nas.id, id));
        await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "update", "radius_nas", String(id), { nasname: data.nasname });
        return { id };
      }
      const [inserted] = await ctx.db.insert(nas).values(data).returning({ id: nas.id });
      await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "create", "radius_nas", String(inserted.id), { nasname: data.nasname });
      return { id: inserted.id };
    }),

  deleteNas: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const [entry] = await ctx.db.select({ nasname: nas.nasname }).from(nas).where(eq(nas.id, input.id)).limit(1);
      if (!entry) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db.delete(nas).where(eq(nas.id, input.id));
      await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "delete", "radius_nas", String(input.id), { nasname: entry.nasname });
      return { ok: true };
    }),

  // ── User check attributes ─────────────────────────────────────────────────

  getUserCheck: authedProcedure
    .input(z.object({ username: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return ctx.db.select().from(radcheck).where(eq(radcheck.username, input.username));
    }),

  getUserReply: authedProcedure
    .input(z.object({ username: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return ctx.db.select().from(radreply).where(eq(radreply.username, input.username));
    }),

  // ── Accounting sessions ───────────────────────────────────────────────────

  listSessions: authedProcedure
    .input(z.object({
      username: z.string().optional(),
      limit: z.number().int().default(50),
      activeOnly: z.boolean().default(false),
    }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.select({
        radacctid: radacct.radacctid,
        username: radacct.username,
        nasipaddress: radacct.nasipaddress,
        acctstarttime: radacct.acctstarttime,
        acctstoptime: radacct.acctstoptime,
        acctsessiontime: radacct.acctsessiontime,
        acctinputoctets: radacct.acctinputoctets,
        acctoutputoctets: radacct.acctoutputoctets,
        framedipaddress: radacct.framedipaddress,
        acctterminatecause: radacct.acctterminatecause,
        callingstationid: radacct.callingstationid,
      }).from(radacct)
        .orderBy(desc(radacct.acctstarttime))
        .limit(input.limit);

      const filtered = rows
        .filter((r) => !input.username || r.username === input.username)
        .filter((r) => !input.activeOnly || r.acctstoptime == null);

      return filtered;
    }),
});
