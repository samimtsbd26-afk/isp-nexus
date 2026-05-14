import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, desc, asc, ne } from "drizzle-orm";
import { router, publicProcedure } from "../middleware.js";
import { customers, packages, orders, subscriptions, invoices, supportTickets, supportMessages, routers, telegramConfigs, hotspotUsers, pppoeUsers, vouchers, deviceBindings, appSettings } from "@isp-nexus/db";
import { hashPassword, verifyPassword, encryptText, decryptText } from "../lib/crypto.js";
import { signPortalToken, verifyPortalToken } from "../auth/session.js";
import { portalRegisterSchema, submitOrderSchema, guestOrderSchema, checkOrderSchema, trialRegisterSchema, redeemVoucherSchema, normalizePhone } from "@isp-nexus/shared";
import { connectRouter, type MikroTikApi } from "../lib/mikrotik.js";
import { logger } from "../lib/logger.js";
import { getRedis } from "../lib/redis.js";
import { sendOrderNotification, sendLoginAlert, sendTrialRequestNotification } from "../services/telegram/bot.js";
import { emitOrgEvent } from "../boot.js";
import { logActivity } from "../lib/activity.js";
import { ensureHotspotProfile, syncHotspotRadiusUser } from "../services/hotspot/provisioning.js";
import { nextCustomerCode } from "./customer.js";
import { hotspotPlanComment, packageActivationDurationSeconds, packageLimitUptimeHours } from "@isp-nexus/shared";

const portalAuthed = publicProcedure.use(async ({ ctx, next, input }: any) => {
  const token: string = input?.token;
  if (!token) throw new TRPCError({ code: "UNAUTHORIZED" });
  const payload = await verifyPortalToken(token);
  if (!payload) throw new TRPCError({ code: "UNAUTHORIZED" });
  const [customer] = await ctx.db.select().from(customers)
    .where(and(eq(customers.id, payload.customerId), eq(customers.orgId, payload.orgId)))
    .limit(1);
  if (!customer?.isActive) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, customer, orgId: payload.orgId } });
});

function validatePortalPayment(input: { paymentMethod: string; trxId?: string; paymentFrom?: string }, amountBdt: number) {
  if (input.paymentMethod === "free" && amountBdt > 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Free payment is only allowed for free packages" });
  }
  if (["bkash", "nagad", "rocket"].includes(input.paymentMethod) && (!input.trxId || !input.paymentFrom)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Transaction ID and payment phone are required" });
  }
}

async function assertUniqueTransaction(ctx: { db: any }, input: { orgId: string; paymentMethod: string; trxId?: string }) {
  if (!input.trxId || ["cash", "free"].includes(input.paymentMethod)) return;
  const [existing] = await ctx.db.select({ id: orders.id }).from(orders)
    .where(and(eq(orders.orgId, input.orgId), eq(orders.paymentMethod, input.paymentMethod as any), eq(orders.trxId, input.trxId)))
    .limit(1);
  if (existing) throw new TRPCError({ code: "CONFLICT", message: "Transaction ID already submitted" });
}

async function checkRateLimit(key: string, max: number, windowSec: number, msg: string): Promise<void> {
  try {
    const r = getRedis();
    const count = await r.incr(key);
    if (count === 1) await r.expire(key, windowSec);
    if (count > max) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: msg });
  } catch (e) {
    if (e instanceof TRPCError) throw e;
    // Redis unavailable — fail open
  }
}

async function assertNoExistingHotspotUser(ctx: { db: any }, input: { orgId: string; phone: string }) {
  const [existing] = await ctx.db.select({ id: subscriptions.id }).from(subscriptions)
    .where(and(eq(subscriptions.orgId, input.orgId), eq(subscriptions.username, input.phone)))
    .limit(1);
  if (existing) throw new TRPCError({ code: "CONFLICT", message: "A trial or subscription already exists for this phone" });
}

export const portalRouter = router({
  register: publicProcedure
    .input(portalRegisterSchema.extend({ orgId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const phone = normalizePhone(input.phone);
      const existing = await ctx.db.select({ id: customers.id }).from(customers)
        .where(and(eq(customers.phone, phone), eq(customers.orgId, input.orgId))).limit(1);
      if (existing.length > 0) throw new TRPCError({ code: "CONFLICT", message: "Phone already registered" });
      const passwordHash = await hashPassword(input.password);
      const code = await nextCustomerCode(ctx.db, input.orgId);
      const [customer] = await ctx.db.insert(customers).values({
        orgId: input.orgId, customerCode: code, fullName: input.fullName,
        phone, email: input.email, passwordHash,
      }).returning({ id: customers.id, fullName: customers.fullName, phone: customers.phone });
      await logActivity(ctx.db, input.orgId, undefined, "customer.created", "customer", customer.id, { fullName: input.fullName, phone, source: "portal" });
      const token = await signPortalToken({ customerId: customer.id, orgId: input.orgId, type: "portal" });
      return { token, customer };
    }),

  login: publicProcedure
    .input(z.object({ orgId: z.string().uuid(), phone: z.string(), password: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [customer] = await ctx.db.select().from(customers)
        .where(and(eq(customers.phone, input.phone), eq(customers.orgId, input.orgId))).limit(1);
      if (!customer?.passwordHash) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
      if (!customer.isActive) throw new TRPCError({ code: "UNAUTHORIZED", message: "Account is inactive or pending approval" });
      const valid = await verifyPassword(input.password, customer.passwordHash);
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
      const token = await signPortalToken({ customerId: customer.id, orgId: customer.orgId, type: "portal" });
      // Non-blocking Telegram login alert to admin
      ctx.db.select({ chatId: telegramConfigs.chatId }).from(telegramConfigs)
        .where(and(eq(telegramConfigs.orgId, customer.orgId), eq(telegramConfigs.alertsEnabled, true))).limit(1)
        .then(([cfg]) => { if (cfg) sendLoginAlert(cfg.chatId, customer.fullName, customer.phone).catch(() => {}); })
        .catch(() => {});
      const { passwordHash: _, ...safe } = customer;
      return { token, customer: safe };
    }),

  me: publicProcedure.input(z.object({ token: z.string() })).query(async ({ ctx, input }) => {
    const payload = await verifyPortalToken(input.token);
    if (!payload) return null;
    const [customer] = await ctx.db.select().from(customers)
      .where(and(eq(customers.id, payload.customerId), eq(customers.orgId, payload.orgId))).limit(1);
    if (!customer) return null;
    const { passwordHash: _, ...safe } = customer;
    return safe;
  }),

  dashboard: portalAuthed.input(z.object({ token: z.string() })).mutation(async ({ ctx }) => {
    const customer = (ctx as any).customer;
    const orgId = ctx.orgId as string;
    const subs = await ctx.db.select().from(subscriptions)
      .where(and(eq(subscriptions.customerId, customer.id), eq(subscriptions.orgId, orgId)));
    const recentOrders = await ctx.db.select().from(orders)
      .where(and(eq(orders.customerId, customer.id), eq(orders.orgId, orgId))).orderBy(desc(orders.createdAt)).limit(5);
    const availablePkgs = await ctx.db.select().from(packages)
      .where(and(eq(packages.orgId, customer.orgId), eq(packages.isActive, true)));
    const { passwordHash: _, ...safeCustomer } = customer;
    return { customer: safeCustomer, subscriptions: subs, recentOrders, packages: availablePkgs };
  }),

  submitOrder: portalAuthed
    .input(submitOrderSchema.extend({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const customer = (ctx as any).customer;
      const orgId = ctx.orgId as string;
      const [pkg] = await ctx.db.select().from(packages)
        .where(and(eq(packages.id, input.packageId), eq(packages.orgId, orgId), eq(packages.isActive, true))).limit(1);
      if (!pkg) throw new TRPCError({ code: "NOT_FOUND", message: "Package not found" });
      validatePortalPayment(input, pkg.priceBdt);
      await assertUniqueTransaction(ctx, { ...input, orgId });
      const [o] = await ctx.db.insert(orders).values({
        orgId, customerId: customer.id,
        packageId: input.packageId, amountBdt: pkg.priceBdt,
        paymentMethod: input.paymentMethod, trxId: input.trxId,
        paymentFrom: input.paymentFrom, screenshotUrl: input.screenshotUrl,
        status: "pending",
      }).returning({ id: orders.id });
      return { orderId: o.id };
    }),

  myOrders: portalAuthed.input(z.object({ token: z.string() })).mutation(async ({ ctx }) => {
    const customer = (ctx as any).customer;
    const orgId = ctx.orgId as string;
    return ctx.db.select().from(orders)
      .where(and(eq(orders.customerId, customer.id), eq(orders.orgId, orgId)))
      .orderBy(desc(orders.createdAt));
  }),

  myInvoices: portalAuthed.input(z.object({ token: z.string() })).mutation(async ({ ctx }) => {
    const customer = (ctx as any).customer;
    const orgId = ctx.orgId as string;
    return ctx.db.select().from(invoices)
      .where(and(eq(invoices.customerId, customer.id), eq(invoices.orgId, orgId)));
  }),

  changePassword: portalAuthed
    .input(z.object({ token: z.string(), currentPassword: z.string(), newPassword: z.string().min(6) }))
    .mutation(async ({ ctx, input }) => {
      const customer = (ctx as any).customer;
      if (!customer?.passwordHash) throw new TRPCError({ code: "BAD_REQUEST" });
      const valid = await verifyPassword(input.currentPassword, customer.passwordHash);
      if (!valid) throw new TRPCError({ code: "BAD_REQUEST", message: "Incorrect current password" });
      const passwordHash = await hashPassword(input.newPassword);
      await ctx.db.update(customers).set({ passwordHash }).where(eq(customers.id, customer.id));
      return { ok: true };
    }),

  openTicket: portalAuthed
    .input(z.object({ token: z.string(), subject: z.string().min(5), message: z.string().min(10) }))
    .mutation(async ({ ctx, input }) => {
      const customer = (ctx as any).customer;
      const orgId = ctx.orgId as string;
      const [ticket] = await ctx.db.insert(supportTickets).values({
        orgId, customerId: customer.id,
        subject: input.subject, status: "open", priority: "medium",
      }).returning({ id: supportTickets.id });
      return { id: ticket.id, ticketId: ticket.id };
    }),

  publicPackages: publicProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.select().from(packages)
        .where(and(eq(packages.orgId, input.orgId), eq(packages.isActive, true)))
        .orderBy(asc(packages.sortOrder));
    }),

  guestOrder: publicProcedure
    .input(guestOrderSchema)
    .mutation(async ({ ctx, input }) => {
      const [pkg] = await ctx.db.select().from(packages)
        .where(and(eq(packages.id, input.packageId), eq(packages.orgId, input.orgId), eq(packages.isActive, true))).limit(1);
      if (!pkg) throw new TRPCError({ code: "NOT_FOUND", message: "Package not found" });

      if (input.isTrial) {
        let [customer] = await ctx.db.select().from(customers)
          .where(and(eq(customers.phone, input.phone), eq(customers.orgId, input.orgId))).limit(1);
        if (customer) {
          if (!customer.isActive) throw new TRPCError({ code: "UNAUTHORIZED", message: "Account is inactive" });
          if (customer.passwordHash && !(await verifyPassword(input.password, customer.passwordHash))) {
            throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
          }
        } else {
          const code = await nextCustomerCode(ctx.db, input.orgId);
          const passwordHash = await hashPassword(input.password);
          [customer] = await ctx.db.insert(customers).values({
            orgId: input.orgId, customerCode: code, fullName: input.fullName,
            phone: input.phone, passwordHash,
          }).returning();
          await logActivity(ctx.db, input.orgId, undefined, "customer.created", "customer", customer.id, { fullName: input.fullName, phone: input.phone, source: "portal" });
        }
        if (!pkg.isTrial) throw new TRPCError({ code: "BAD_REQUEST", message: "Package is not available as a trial" });
        await assertNoExistingHotspotUser(ctx, input);
        const [r] = await ctx.db.select().from(routers)
          .where(and(eq(routers.orgId, input.orgId), eq(routers.isDefault, true), eq(routers.isActive, true))).limit(1);
        const passwordEncrypted = encryptText(input.password);
        const trialSeconds = packageActivationDurationSeconds(pkg);
        const trialHours = packageLimitUptimeHours(pkg);
        const expiresAt = new Date(Date.now() + trialSeconds * 1000);
        const planComment = hotspotPlanComment(pkg);
        const [sub] = await ctx.db.insert(subscriptions).values({
          orgId: input.orgId, customerId: customer.id, packageId: input.packageId,
          routerId: r?.id ?? null, username: input.phone, passwordEncrypted,
          expiresAt, status: "active",
        }).returning();

        if (r) {
          let client: MikroTikApi | null = null;
          try {
            client = await connectRouter(r);
            if (pkg.type === "pppoe") {
              const addData: Record<string, string> = {
                name: input.phone, password: input.password,
                service: "pppoe", profile: pkg.mikrotikProfileName ?? "default",
              };
              await client.add("/ppp/secret", addData);
            } else {
              const profile = pkg.mikrotikProfileName ?? "default";
              await ensureHotspotProfile(client, profile, pkg);
              await client.add("/ip/hotspot/user", {
                name: input.phone,
                password: input.password,
                profile,
                "limit-uptime": `${trialHours}h`,
                comment: planComment,
              });
              await syncHotspotRadiusUser(ctx.db, input.phone, input.password, pkg, trialSeconds);
            }
          } catch (err) {
            logger.error({ err }, "MikroTik provision error in guestOrder trial");
          } finally {
            await client?.close().catch(() => {});
          }
        }

        const token = await signPortalToken({ customerId: customer.id, orgId: input.orgId, type: "portal" });
        const { passwordHash: _, ...safe } = customer;
        return { token, customer: safe, isTrial: true };
      }

      // Non-trial: validate payment BEFORE creating customer to prevent orphans
      // Rate limit: max 5 payment attempts per phone per hour
      await checkRateLimit(`ratelimit:pay:${input.orgId}:${normalizePhone(input.phone)}`, 5, 3_600, "Too many payment attempts, please try again in 1 hour");
      validatePortalPayment(input, pkg.priceBdt);
      await assertUniqueTransaction(ctx, input);

      let [customer] = await ctx.db.select().from(customers)
        .where(and(eq(customers.phone, input.phone), eq(customers.orgId, input.orgId))).limit(1);
      if (customer) {
        if (!customer.isActive) throw new TRPCError({ code: "UNAUTHORIZED", message: "Account is inactive" });
        if (customer.passwordHash && !(await verifyPassword(input.password, customer.passwordHash))) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
        }
      } else {
        const code = await nextCustomerCode(ctx.db, input.orgId);
        const passwordHash = await hashPassword(input.password);
        [customer] = await ctx.db.insert(customers).values({
          orgId: input.orgId, customerCode: code, fullName: input.fullName,
          phone: input.phone, passwordHash,
        }).returning();
        await logActivity(ctx.db, input.orgId, undefined, "customer.created", "customer", customer.id, { fullName: input.fullName, phone: input.phone, source: "portal" });
      }

      const [order] = await ctx.db.insert(orders).values({
        orgId: input.orgId, customerId: customer.id,
        packageId: input.packageId, amountBdt: pkg.priceBdt,
        paymentMethod: input.paymentMethod, trxId: input.trxId,
        paymentFrom: input.paymentFrom, status: "pending",
      }).returning({ id: orders.id });
      await logActivity(ctx.db, input.orgId, undefined, "order.created", "order", order.id, { amountBdt: pkg.priceBdt, paymentMethod: input.paymentMethod, packageId: pkg.id });

      const [tgConfig] = await ctx.db.select().from(telegramConfigs)
        .where(eq(telegramConfigs.orgId, input.orgId)).limit(1);
      if (tgConfig) {
        await sendOrderNotification(tgConfig.chatId, { ...order, amountBdt: pkg.priceBdt, paymentMethod: input.paymentMethod }, customer, pkg);
      }

      // Real-time notification to admin panel
      emitOrgEvent(input.orgId, "order:new", {
        orgId: input.orgId,
        orderId: order.id,
        customerName: customer.fullName,
        customerPhone: customer.phone ?? "",
        amountBdt: pkg.priceBdt,
        paymentMethod: input.paymentMethod,
        trxId: input.trxId,
      });

      return { orderId: order.id, customerId: customer.id, isTrial: false };
    }),

  checkOrder: publicProcedure
    .input(checkOrderSchema.extend({ orgId: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      const [order] = await ctx.db.select().from(orders)
        .where(input.orgId ? and(eq(orders.id, input.orderId), eq(orders.orgId, input.orgId)) : eq(orders.id, input.orderId))
        .limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
      const [customer] = await ctx.db.select().from(customers)
        .where(and(eq(customers.id, order.customerId), eq(customers.orgId, order.orgId)))
        .limit(1);
      if (!customer || customer.phone !== input.phone) throw new TRPCError({ code: "UNAUTHORIZED", message: "Phone mismatch" });
      if (!order.packageId) throw new TRPCError({ code: "BAD_REQUEST", message: "Order package is missing" });
      const [pkg] = await ctx.db.select().from(packages)
        .where(and(eq(packages.id, order.packageId), eq(packages.orgId, order.orgId)))
        .limit(1);
      const rawCreds = order.status === "approved" && order.subscriptionId
        ? await ctx.db.select({
          username: subscriptions.username,
          passwordEncrypted: subscriptions.passwordEncrypted,
        }).from(subscriptions)
          .where(and(eq(subscriptions.id, order.subscriptionId), eq(subscriptions.orgId, order.orgId)))
          .limit(1)
        : [];
      let resolvedPassword: string | null = null;
      if (rawCreds[0]) {
        try { resolvedPassword = decryptText(rawCreds[0].passwordEncrypted); } catch { /* malformed stored password */ }
      }
      return {
        status: order.status,
        amountBdt: order.amountBdt,
        paymentMethod: order.paymentMethod,
        createdAt: order.createdAt,
        packageName: pkg?.name ?? null,
        credentials: rawCreds[0] ? { username: rawCreds[0].username, password: resolvedPassword } : null,
      };
    }),

  trialRegister: publicProcedure
    .input(trialRegisterSchema.extend({
      macAddress: z.string().max(30).optional(),
      ipAddress: z.string().max(45).optional(),
      userAgent: z.string().max(512).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const phone = normalizePhone(input.phone);
      // Rate limit: max 1 trial per phone per 24h (spam / retry protection)
      await checkRateLimit(`ratelimit:trial:${input.orgId}:${phone}`, 1, 86_400, "Free trial limit: 1 attempt per 24 hours");
      // Global IP-level spam guard: max 20 trial attempts per org per minute
      await checkRateLimit(`ratelimit:trial:global:${input.orgId}`, 20, 60, "Too many requests, please wait a moment");
      const [pkg] = await ctx.db.select().from(packages)
        .where(and(eq(packages.id, input.packageId), eq(packages.orgId, input.orgId), eq(packages.isActive, true))).limit(1);
      if (!pkg) throw new TRPCError({ code: "NOT_FOUND", message: "ট্রায়াল প্যাকেজ পাওয়া যায়নি" });
      if (!pkg.isTrial) throw new TRPCError({ code: "BAD_REQUEST", message: "এই প্যাকেজ ট্রায়াল হিসেবে পাওয়া যাচ্ছে না" });

      // Normalize MAC to canonical lowercase colon-separated format (aa:bb:cc:dd:ee:ff)
      function normalizeMac(raw: string): string | null {
        const hex = raw.toLowerCase().replace(/[^0-9a-f]/g, "");
        if (hex.length !== 12) return null;
        return `${hex.slice(0,2)}:${hex.slice(2,4)}:${hex.slice(4,6)}:${hex.slice(6,8)}:${hex.slice(8,10)}:${hex.slice(10,12)}`;
      }
      const cleanMac = input.macAddress ? normalizeMac(input.macAddress) : null;

      const TRIAL_ABUSE_MSG = "এই ডিভাইস বা মোবাইল নম্বর দিয়ে আগে free trial নেওয়া হয়েছে";

      // Anti-duplicate: subscription already exists for this phone (any status — one trial per lifetime)
      const [existingSub] = await ctx.db.select({ id: subscriptions.id }).from(subscriptions)
        .where(and(eq(subscriptions.orgId, input.orgId), eq(subscriptions.username, phone))).limit(1);
      if (existingSub) {
        throw new TRPCError({ code: "CONFLICT", message: TRIAL_ABUSE_MSG });
      }

      // Anti-duplicate: any free trial order for this phone (pending/approved/expired — not rejected)
      const [existingOrderByPhone] = await ctx.db
        .select({ id: orders.id })
        .from(orders)
        .innerJoin(customers, eq(orders.customerId, customers.id))
        .where(and(
          eq(orders.orgId, input.orgId),
          eq(customers.phone, phone),
          eq(orders.paymentMethod, "free"),
          ne(orders.status, "rejected"),
        )).limit(1);
      if (existingOrderByPhone) {
        throw new TRPCError({ code: "CONFLICT", message: TRIAL_ABUSE_MSG });
      }

      // Anti-duplicate: MAC-based check (normalized format — blocks same device with different phone)
      if (cleanMac) {
        const [existingByMac] = await ctx.db.select({ id: orders.id }).from(orders)
          .where(and(
            eq(orders.orgId, input.orgId),
            eq(orders.paymentFrom, cleanMac),
            eq(orders.paymentMethod, "free"),
            ne(orders.status, "rejected"),
          )).limit(1);
        if (existingByMac) {
          throw new TRPCError({ code: "CONFLICT", message: TRIAL_ABUSE_MSG });
        }
        // Also check hotspotUsers table for this MAC (active subscription on device)
        const [activeDevice] = await ctx.db.select({ id: hotspotUsers.id }).from(hotspotUsers)
          .where(and(eq(hotspotUsers.orgId, input.orgId), eq(hotspotUsers.macAddress, cleanMac), eq(hotspotUsers.isActive, true))).limit(1);
        if (activeDevice) {
          throw new TRPCError({ code: "CONFLICT", message: TRIAL_ABUSE_MSG });
        }
      }

      // Create or find customer
      let [customer] = await ctx.db.select().from(customers)
        .where(and(eq(customers.phone, phone), eq(customers.orgId, input.orgId))).limit(1);
      if (customer) {
        if (!customer.isActive) throw new TRPCError({ code: "UNAUTHORIZED", message: "Account is inactive" });
      } else {
        const code = await nextCustomerCode(ctx.db, input.orgId);
        const passwordHash = await hashPassword(input.password);
        [customer] = await ctx.db.insert(customers).values({
          orgId: input.orgId, customerCode: code, fullName: input.fullName,
          phone, passwordHash,
        }).returning();
      }

      // Encrypt registration password — stored in registrationMeta for MikroTik provisioning on approval
      const ep = encryptText(input.password);
      const meta = JSON.stringify({ ep, ip: input.ipAddress ?? "", ua: (input.userAgent ?? "").slice(0, 300) });

      // Create PENDING ORDER — no subscription, no MikroTik user, no internet access yet
      const [order] = await ctx.db.insert(orders).values({
        orgId: input.orgId,
        customerId: customer.id,
        packageId: pkg.id,
        amountBdt: 0,
        paymentMethod: "free",
        paymentFrom: cleanMac ?? undefined,
        registrationMeta: meta,
        status: "pending",
      }).returning({ id: orders.id });
      await logActivity(ctx.db, input.orgId, undefined, "order.created", "order", order.id, { amountBdt: 0, paymentMethod: "free", packageId: pkg.id, source: "trial" });

      // Non-blocking Telegram notification to all admin chats
      void ctx.db.select({ chatId: telegramConfigs.chatId })
        .from(telegramConfigs)
        .where(eq(telegramConfigs.orgId, input.orgId))
        .then((configs) => {
          for (const cfg of configs) {
            void sendTrialRequestNotification(
              cfg.chatId,
              order.id,
              { fullName: customer.fullName, phone: customer.phone },
              { name: pkg.name, validityDays: pkg.validityDays, durationValue: pkg.durationValue, durationUnit: pkg.durationUnit, isTrial: pkg.isTrial },
              cleanMac ?? "",
              input.ipAddress ?? "",
              input.userAgent ?? "",
            );
          }
        });

      return { orderId: order.id, customerId: customer.id, pending: true };
    }),

  macCheck: publicProcedure
    .input(z.object({ orgId: z.string().uuid(), mac: z.string().min(1).max(30) }))
    .query(async ({ ctx, input }) => {
      const cleanMac = input.mac.toLowerCase().replace(/[^0-9a-f:.-]/g, "");

      // Check hotspot users by MAC
      const [hotspot] = await ctx.db.select({ id: hotspotUsers.id, isActive: hotspotUsers.isActive, name: hotspotUsers.name })
        .from(hotspotUsers)
        .where(and(eq(hotspotUsers.orgId, input.orgId), eq(hotspotUsers.macAddress, cleanMac)))
        .limit(1);

      // Check PPPoE users by MAC (caller-id)
      const [pppoe] = await ctx.db.select({ id: pppoeUsers.id, isActive: pppoeUsers.isActive, name: pppoeUsers.name })
        .from(pppoeUsers)
        .where(and(eq(pppoeUsers.orgId, input.orgId), eq(pppoeUsers.callerId, cleanMac)))
        .limit(1);

      const knownUser = hotspot ?? pppoe;
      const hasActiveSession = !!(knownUser?.isActive);

      // Check subscription status via username
      let hasActiveSubscription = false;
      let hasExpiredSubscription = false;
      let hasTrial = false;

      if (knownUser?.name) {
        const [sub] = await ctx.db.select({ status: subscriptions.status, packageId: subscriptions.packageId })
          .from(subscriptions)
          .where(and(eq(subscriptions.orgId, input.orgId), eq(subscriptions.username, knownUser.name)))
          .orderBy(desc(subscriptions.createdAt))
          .limit(1);

        if (sub) {
          hasActiveSubscription = sub.status === "active";
          hasExpiredSubscription = sub.status === "expired" || sub.status === "suspended";

          // Check if this was a trial package
          if (sub.packageId) {
            const [pkg] = await ctx.db.select({ isTrial: packages.isTrial })
              .from(packages).where(eq(packages.id, sub.packageId)).limit(1);
            hasTrial = pkg?.isTrial ?? false;
          }
        }
      }

      const hasSubscription = !!(knownUser);
      const isNewDevice = !hasSubscription;

      // Check for pending free trial order by MAC
      let hasPendingOrder = false;
      let pendingOrderId: string | null = null;
      const [pendingOrder] = await ctx.db.select({ id: orders.id })
        .from(orders)
        .where(and(
          eq(orders.orgId, input.orgId),
          eq(orders.paymentFrom, cleanMac),
          eq(orders.paymentMethod, "free"),
          eq(orders.status, "pending"),
        )).limit(1);
      if (pendingOrder) {
        hasPendingOrder = true;
        pendingOrderId = pendingOrder.id;
      }

      return {
        hasSubscription,
        isNewDevice,
        hasTrial,
        hasActiveSubscription,
        hasExpiredSubscription,
        hasActiveSession,
        username: knownUser?.name ?? null,
        hasPendingOrder,
        pendingOrderId,
      };
    }),

  redeemVoucher: publicProcedure
    .input(redeemVoucherSchema)
    .mutation(async ({ ctx, input }) => {
      if (!input.orgId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Organisation ID required" });
      }
      const orgId = input.orgId;

      const [voucher] = await ctx.db.select().from(vouchers)
        .where(and(
          eq(vouchers.code, input.code.toUpperCase()),
          eq(vouchers.orgId, orgId),
          eq(vouchers.status, "unused"),
        ))
        .limit(1);

      if (!voucher) {
        throw new TRPCError({ code: "NOT_FOUND", message: "ভাউচার কোড সঠিক নয় বা ব্যবহার করা হয়েছে" });
      }

      if (voucher.expiresAt && voucher.expiresAt < new Date()) {
        // Mark as expired in DB so dashboard shows correct status
        await ctx.db.update(vouchers).set({ status: "expired" }).where(eq(vouchers.id, voucher.id));
        throw new TRPCError({ code: "BAD_REQUEST", message: "ভাউচারের মেয়াদ শেষ হয়ে গেছে" });
      }

      // Atomically claim the voucher before provisioning — prevents double-redeem race condition
      const [claimed] = await ctx.db.update(vouchers)
        .set({ status: "used", usedAt: new Date() })
        .where(and(eq(vouchers.id, voucher.id), eq(vouchers.status, "unused")))
        .returning({ id: vouchers.id });

      if (!claimed) {
        throw new TRPCError({ code: "CONFLICT", message: "ভাউচারটি ইতোমধ্যে ব্যবহার করা হয়েছে" });
      }

      const username = voucher.username || voucher.code;
      const password = voucher.password || voucher.code;

      if (voucher.routerId) {
        const [r] = await ctx.db.select().from(routers)
          .where(and(eq(routers.id, voucher.routerId), eq(routers.isActive, true)))
          .limit(1);

        if (r) {
          let client: MikroTikApi | null = null;
          try {
            client = await connectRouter(r);
            const fields: Record<string, string> = {
              name: username,
              password,
              profile: voucher.profile ?? "default",
              comment: `Voucher:${voucher.code}`,
            };
            if (voucher.timeLimit) fields["limit-uptime"] = voucher.timeLimit;
            if (voucher.dataLimit) fields["limit-bytes-total"] = voucher.dataLimit;
            if (voucher.sharedUsers > 1) fields["shared-users"] = String(voucher.sharedUsers);
            await client.add("/ip/hotspot/user", fields);
          } catch (err) {
            logger.warn({ err, voucherId: voucher.id }, "Voucher MikroTik provisioning failed — credentials still returned");
          } finally {
            await client?.close().catch(() => {});
          }
        }
      }

      return { username, password };
    }),

  // ── Customer self-service (authed) ────────────────────────────────────────

  getDeviceBindings: portalAuthed
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx }) => {
      const customer = (ctx as any).customer;
      const orgId = ctx.orgId as string;
      return ctx.db.select({
        id: deviceBindings.id,
        macAddress: deviceBindings.macAddress,
        ipAddress: deviceBindings.ipAddress,
        description: deviceBindings.description,
        createdAt: deviceBindings.createdAt,
      }).from(deviceBindings)
        .where(and(eq(deviceBindings.customerId, customer.id), eq(deviceBindings.orgId, orgId)));
    }),

  resetDevice: portalAuthed
    .input(z.object({ token: z.string(), bindingId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const customer = (ctx as any).customer;
      const orgId = ctx.orgId as string;
      const [binding] = await ctx.db.select().from(deviceBindings)
        .where(and(eq(deviceBindings.id, input.bindingId), eq(deviceBindings.customerId, customer.id), eq(deviceBindings.orgId, orgId)))
        .limit(1);
      if (!binding) throw new TRPCError({ code: "NOT_FOUND", message: "Device binding not found" });

      // Kick the device from MikroTik hotspot active sessions by MAC
      try {
        const [defaultRouter] = await ctx.db.select().from(routers)
          .where(and(eq(routers.orgId, orgId), eq(routers.isDefault, true), eq(routers.isActive, true))).limit(1);
        if (defaultRouter) {
          const client = await connectRouter(defaultRouter);
          try {
            const active = await client.print("/ip/hotspot/active", { "mac-address": binding.macAddress });
            for (const session of (active as any[])) {
              if (session?.id) await client.remove("/ip/hotspot/active", session.id).catch(() => {});
            }
          } finally {
            await client.close().catch(() => {});
          }
        }
      } catch { /* non-fatal */ }

      await ctx.db.delete(deviceBindings)
        .where(and(eq(deviceBindings.id, input.bindingId), eq(deviceBindings.orgId, orgId)));
      await logActivity(ctx.db, orgId, undefined, "customer.reset_device", "customer", customer.id, { mac: binding.macAddress });
      return { ok: true };
    }),

  logoutAllSessions: portalAuthed
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx }) => {
      const customer = (ctx as any).customer;
      const orgId = ctx.orgId as string;

      // Clear Redis sessions for all subscriptions belonging to this customer
      const subs = await ctx.db.select({ username: subscriptions.username }).from(subscriptions)
        .where(and(eq(subscriptions.customerId, customer.id), eq(subscriptions.orgId, orgId)));

      const redis = getRedis();
      for (const sub of subs) {
        try {
          const phoneKey = `hotspot_phone_sess:${orgId}:${sub.username}`;
          const sessToken = await redis.get(phoneKey);
          if (sessToken) await redis.del(`hotspot_sess:v1:${sessToken}`);
          await redis.del(phoneKey);
        } catch { /* non-fatal */ }
      }

      // Kick from MikroTik active sessions
      try {
        const [defaultRouter] = await ctx.db.select().from(routers)
          .where(and(eq(routers.orgId, orgId), eq(routers.isDefault, true), eq(routers.isActive, true))).limit(1);
        if (defaultRouter) {
          const client = await connectRouter(defaultRouter);
          try {
            for (const sub of subs) {
              const active = await client.print("/ip/hotspot/active", { user: sub.username }).catch(() => []);
              for (const s of (active as any[])) {
                if (s?.id) await client.remove("/ip/hotspot/active", s.id).catch(() => {});
              }
            }
          } finally {
            await client.close().catch(() => {});
          }
        }
      } catch { /* non-fatal */ }

      await logActivity(ctx.db, orgId, undefined, "customer.logout_all", "customer", customer.id, {});
      return { ok: true };
    }),

  getActiveSession: portalAuthed
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx }) => {
      const customer = (ctx as any).customer;
      const orgId = ctx.orgId as string;
      const [activeSub] = await ctx.db.select({ username: subscriptions.username }).from(subscriptions)
        .where(and(eq(subscriptions.customerId, customer.id), eq(subscriptions.orgId, orgId), eq(subscriptions.status, "active")))
        .limit(1);
      if (!activeSub) return null;

      try {
        const [defaultRouter] = await ctx.db.select().from(routers)
          .where(and(eq(routers.orgId, orgId), eq(routers.isDefault, true), eq(routers.isActive, true))).limit(1);
        if (!defaultRouter) return null;
        const client = await connectRouter(defaultRouter);
        try {
          const [session] = await client.print("/ip/hotspot/active", { user: activeSub.username });
          if (!session) return null;
          return {
            ip: (session as any).address ?? null,
            mac: (session as any)["mac-address"] ?? null,
            uptime: (session as any).uptime ?? null,
            bytesIn: (session as any)["bytes-in"] ?? "0",
            bytesOut: (session as any)["bytes-out"] ?? "0",
          };
        } finally {
          await client.close().catch(() => {});
        }
      } catch {
        return null;
      }
    }),

  myTickets: portalAuthed
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx }) => {
      const customer = (ctx as any).customer;
      const orgId = ctx.orgId as string;
      return ctx.db.select({
        id: supportTickets.id,
        subject: supportTickets.subject,
        status: supportTickets.status,
        priority: supportTickets.priority,
        createdAt: supportTickets.createdAt,
      }).from(supportTickets)
        .where(and(eq(supportTickets.customerId, customer.id), eq(supportTickets.orgId, orgId)))
        .orderBy(desc(supportTickets.createdAt))
        .limit(20);
    }),

  addTicketMessage: portalAuthed
    .input(z.object({ token: z.string(), ticketId: z.string().uuid(), message: z.string().min(5).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const customer = (ctx as any).customer;
      const orgId = ctx.orgId as string;
      const [ticket] = await ctx.db.select({ id: supportTickets.id }).from(supportTickets)
        .where(and(eq(supportTickets.id, input.ticketId), eq(supportTickets.customerId, customer.id), eq(supportTickets.orgId, orgId)))
        .limit(1);
      if (!ticket) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db.insert(supportMessages).values({
        ticketId: input.ticketId,
        senderType: "customer",
        senderId: customer.id,
        message: input.message,
      });
      return { ok: true };
    }),

  getSupportInfo: publicProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.select({ key: appSettings.key, value: appSettings.value }).from(appSettings)
        .where(and(
          eq(appSettings.orgId, input.orgId),
          // encrypted=false only (contact info is not encrypted)
        ));
      const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      return {
        whatsappNumber: map["whatsapp_support"] ?? null,
        callNumber: map["support_phone"] ?? null,
        supportEmail: map["support_email"] ?? null,
        faqUrl: map["faq_url"] ?? null,
      };
    }),

  getNotifications: portalAuthed
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx }) => {
      const customer = (ctx as any).customer;
      const orgId = ctx.orgId as string;
      const { getCustomerNotifications } = await import("../services/notifications/customer.js");
      return getCustomerNotifications(orgId, customer.id);
    }),

  markNotificationsRead: portalAuthed
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx }) => {
      const customer = (ctx as any).customer;
      const orgId = ctx.orgId as string;
      const { markAllRead } = await import("../services/notifications/customer.js");
      await markAllRead(orgId, customer.id);
      return { ok: true };
    }),
});
