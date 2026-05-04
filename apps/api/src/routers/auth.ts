import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { router, publicProcedure, authedProcedure, adminProcedure } from "../middleware.js";
import { users, organizations, refreshTokens } from "@isp-nexus/db";
import { hashPassword, verifyPassword } from "../lib/crypto.js";
import {
  signAccessToken, signPortalToken, generateRefreshToken, hashRefreshToken,
  buildSessionCookie, clearSessionCookie,
} from "../auth/session.js";
import { loginSchema, registerSchema, changePasswordSchema } from "@isp-nexus/shared";
import { env } from "../lib/env.js";

export const authRouter = router({
  setupStatus: publicProcedure.query(async ({ ctx }) => {
    const existing = await ctx.db.select({ id: users.id }).from(users).limit(1);
    return { needsSetup: existing.length === 0 };
  }),

  setupAdmin: publicProcedure
    .input(z.object({
      orgName: z.string().min(2),
      name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(8),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.select({ id: users.id }).from(users).limit(1);
      if (existing.length > 0) throw new TRPCError({ code: "FORBIDDEN", message: "Already setup" });
      const slug = input.orgName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const [org] = await ctx.db.insert(organizations).values({ name: input.orgName, slug }).returning();
      const passwordHash = await hashPassword(input.password);
      await ctx.db.insert(users).values({ orgId: org.id, name: input.name, email: input.email, passwordHash, role: "superadmin" });
      return { ok: true };
    }),

  login: publicProcedure.input(loginSchema).mutation(async ({ ctx, input }) => {
    const [user] = await ctx.db.select().from(users).where(eq(users.email, input.email)).limit(1);
    if (!user || !user.isActive) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
    await ctx.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    const accessToken = await signAccessToken({ userId: user.id, orgId: user.orgId, role: user.role as any, type: "admin" });
    const refreshToken = generateRefreshToken();
    const tokenHash = hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await ctx.db.insert(refreshTokens).values({ userId: user.id, tokenHash, expiresAt });
    ctx.resHeaders.set("Set-Cookie", buildSessionCookie(refreshToken, env.NODE_ENV === "production"));
    return { accessToken, user: { id: user.id, name: user.name, email: user.email, role: user.role, orgId: user.orgId } };
  }),

  refresh: publicProcedure.mutation(async ({ ctx }) => {
    const cookie = ctx.req.headers.get("cookie") || "";
    const match = cookie.match(/isp_refresh=([^;]+)/);
    if (!match) throw new TRPCError({ code: "UNAUTHORIZED" });
    const tokenHash = hashRefreshToken(match[1]);
    const [stored] = await ctx.db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash)).limit(1);
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Refresh token expired" });
    }
    await ctx.db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, stored.id));
    const [user] = await ctx.db.select().from(users).where(eq(users.id, stored.userId)).limit(1);
    if (!user?.isActive) throw new TRPCError({ code: "UNAUTHORIZED" });
    const accessToken = await signAccessToken({ userId: user.id, orgId: user.orgId, role: user.role as any, type: "admin" });
    const newRefreshToken = generateRefreshToken();
    const newHash = hashRefreshToken(newRefreshToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await ctx.db.insert(refreshTokens).values({ userId: user.id, tokenHash: newHash, expiresAt });
    ctx.resHeaders.set("Set-Cookie", buildSessionCookie(newRefreshToken, env.NODE_ENV === "production"));
    return { accessToken };
  }),

  logout: authedProcedure.mutation(async ({ ctx }) => {
    const cookie = ctx.req.headers.get("cookie") || "";
    const match = cookie.match(/isp_refresh=([^;]+)/);
    if (match) {
      const tokenHash = hashRefreshToken(match[1]);
      await ctx.db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.tokenHash, tokenHash));
    }
    ctx.resHeaders.set("Set-Cookie", clearSessionCookie());
    return { ok: true };
  }),

  me: authedProcedure.query(async ({ ctx }) => {
    const { passwordHash: _, ...safe } = ctx.user;
    return safe;
  }),

  changePassword: authedProcedure.input(changePasswordSchema).mutation(async ({ ctx, input }) => {
    const valid = await verifyPassword(input.currentPassword, ctx.user.passwordHash);
    if (!valid) throw new TRPCError({ code: "BAD_REQUEST", message: "Current password incorrect" });
    const passwordHash = await hashPassword(input.newPassword);
    await ctx.db.update(users).set({ passwordHash }).where(eq(users.id, ctx.user.id));
    return { ok: true };
  }),

  listUsers: adminProcedure.query(async ({ ctx }) => {
    const result = await ctx.db.select({
      id: users.id, name: users.name, email: users.email, role: users.role,
      isActive: users.isActive, lastLoginAt: users.lastLoginAt, createdAt: users.createdAt,
    }).from(users).where(eq(users.orgId, ctx.orgId));
    return result;
  }),

  createUser: adminProcedure.input(registerSchema).mutation(async ({ ctx, input }) => {
    const passwordHash = await hashPassword(input.password);
    const [user] = await ctx.db.insert(users).values({
      orgId: ctx.orgId, name: input.name, email: input.email, passwordHash, role: input.role,
    }).returning({ id: users.id, name: users.name, email: users.email, role: users.role });
    return user;
  }),

  updateUser: adminProcedure
    .input(z.object({ id: z.string().uuid(), name: z.string().min(2).optional(), role: z.enum(["superadmin","admin","reseller","viewer"]).optional(), isActive: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await ctx.db.update(users).set({ ...data, updatedAt: new Date() }).where(eq(users.id, id));
      return { ok: true };
    }),

  resetUserPassword: adminProcedure
    .input(z.object({ id: z.string().uuid(), newPassword: z.string().min(8) }))
    .mutation(async ({ ctx, input }) => {
      const passwordHash = await hashPassword(input.newPassword);
      await ctx.db.update(users).set({ passwordHash }).where(eq(users.id, input.id));
      return { ok: true };
    }),

  deleteUser: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    if (input.id === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot delete yourself" });
    await ctx.db.delete(users).where(eq(users.id, input.id));
    return { ok: true };
  }),
});
