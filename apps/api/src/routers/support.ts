import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc } from "drizzle-orm";
import { router, authedProcedure, adminProcedure } from "../middleware.js";
import { supportTickets, supportMessages } from "@isp-nexus/db";

export const supportRouter = router({
  listTickets: adminProcedure
    .input(z.object({ status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.select().from(supportTickets)
        .where(eq(supportTickets.orgId, ctx.orgId))
        .orderBy(desc(supportTickets.createdAt));
    }),

  getTicket: adminProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const [ticket] = await ctx.db.select().from(supportTickets)
      .where(and(eq(supportTickets.id, input.id), eq(supportTickets.orgId, ctx.orgId))).limit(1);
    if (!ticket) throw new TRPCError({ code: "NOT_FOUND" });
    const messages = await ctx.db.select().from(supportMessages)
      .where(eq(supportMessages.ticketId, ticket.id)).orderBy(supportMessages.createdAt);
    return { ...ticket, messages };
  }),

  assignTicket: adminProcedure
    .input(z.object({ id: z.string().uuid(), userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(supportTickets).set({ assignedTo: input.userId, updatedAt: new Date() })
        .where(and(eq(supportTickets.id, input.id), eq(supportTickets.orgId, ctx.orgId)));
      return { ok: true };
    }),

  closeTicket: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    await ctx.db.update(supportTickets)
      .set({ status: "closed", resolvedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(supportTickets.id, input.id), eq(supportTickets.orgId, ctx.orgId)));
    return { ok: true };
  }),

  sendMessage: authedProcedure
    .input(z.object({ ticketId: z.string().uuid(), message: z.string().min(1), senderType: z.enum(["admin", "customer"]) }))
    .mutation(async ({ ctx, input }) => {
      const [ticket] = await ctx.db.select({ id: supportTickets.id }).from(supportTickets)
        .where(and(eq(supportTickets.id, input.ticketId), eq(supportTickets.orgId, ctx.orgId))).limit(1);
      if (!ticket) throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found" });
      await ctx.db.insert(supportMessages).values({
        ticketId: input.ticketId, senderType: "admin",
        senderId: ctx.user.id, message: input.message,
      });
      await ctx.db.update(supportTickets).set({ updatedAt: new Date() })
        .where(eq(supportTickets.id, input.ticketId));
      return { ok: true };
    }),
});
