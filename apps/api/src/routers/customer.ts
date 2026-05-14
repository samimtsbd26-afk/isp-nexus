import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, like, desc, sql, isNull, or, gte, lte, ne } from "drizzle-orm";
import { router, authedProcedure, adminProcedure } from "../middleware.js";
import { customers, subscriptions, orders, invoices, appSettings, activityLog, routers, hotspotUsers, pppoeUsers, deviceBindings, radacct, packages, users, telegramConfigs } from "@isp-nexus/db";
import { createCustomerSchema, normalizePhone } from "@isp-nexus/shared";
import { hashPassword, decryptText, encryptText } from "../lib/crypto.js";
import { connectRouter, getRouterClient } from "../lib/mikrotik.js";
import { deleteRadiusUser, syncHotspotRadiusUser } from "../services/hotspot/provisioning.js";
import { logActivity } from "../lib/activity.js";
import { emitOrgEvent } from "../boot.js";
import { sendNewUserCreatedNotification } from "../services/telegram/bot.js";

/**
 * Generate the next customer code from the database.
 * Uses an `app_settings` row with key='customer_counter' to persist
 * the counter across server restarts, avoiding ID collisions.
 */
export async function nextCustomerCode(db: any, orgId: string): Promise<string> {
  const key = "customer_counter";

  // Atomically increment the counter using a transaction
  const code = await db.transaction(async (tx: any) => {
    const [existing] = await tx.select().from(appSettings)
      .where(and(eq(appSettings.orgId, orgId), eq(appSettings.key, key))).limit(1);

    let nextVal: number;
    if (existing) {
      nextVal = parseInt(existing.value, 10) + 1;
      await tx.update(appSettings)
        .set({ value: String(nextVal), updatedAt: new Date() })
        .where(eq(appSettings.id, existing.id));
    } else {
      // First customer: count existing customers to avoid collision,
      // then start from 1000 or the count, whichever is higher
      const [{ count }] = await tx.select({ count: sql<number>`count(*)` })
        .from(customers).where(eq(customers.orgId, orgId));
      nextVal = Math.max(Number(count) + 1, 1001);
      await tx.insert(appSettings).values({ orgId, key, value: String(nextVal) });
    }
    return nextVal;
  });

  return `C${String(code).padStart(5, "0")}`;
}

export function hasCustomerPermission(permissions: unknown, required: string): boolean {
  return Array.isArray(permissions) && permissions.includes(required);
}

async function removeMikroTikUser(db: any, routerId: string, username: string): Promise<void> {
  const [r] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!r) return;
  const client = await connectRouter(r);
  try {
    // Hotspot: active sessions
    const actives = await client.print("/ip/hotspot/active", { user: username }).catch(() => []);
    for (const a of actives) if (a?.id) await client.remove("/ip/hotspot/active", a.id).catch(() => {});
    // Hotspot: cookies (remembered login)
    const cookies = await client.print("/ip/hotspot/cookie", { user: username }).catch(() => []);
    for (const c of cookies) if (c?.id) await client.remove("/ip/hotspot/cookie", c.id).catch(() => {});
    // Hotspot: host entries
    const hosts = await client.print("/ip/hotspot/host", { user: username }).catch(() => []);
    for (const h of hosts) if (h?.id) await client.remove("/ip/hotspot/host", h.id).catch(() => {});
    // Hotspot: ip-binding (provisioning sets comment = username)
    const ipBindings = await client.print("/ip/hotspot/ip-binding", { comment: username }).catch(() => []);
    for (const b of ipBindings) if (b?.id) await client.remove("/ip/hotspot/ip-binding", b.id).catch(() => {});
    // Hotspot: user entry
    const hsUsers = await client.print("/ip/hotspot/user", { name: username }).catch(() => []);
    for (const u of hsUsers) if (u?.id) await client.remove("/ip/hotspot/user", u.id).catch(() => {});
    // PPPoE: active sessions
    const pppActives = await client.print("/ppp/active", { name: username }).catch(() => []);
    for (const a of pppActives) if (a?.id) await client.remove("/ppp/active", a.id).catch(() => {});
    // PPPoE: secrets
    const pppSecrets = await client.print("/ppp/secret", { name: username }).catch(() => []);
    for (const u of pppSecrets) if (u?.id) await client.remove("/ppp/secret", u.id).catch(() => {});
  } finally {
    await client.close().catch(() => {});
  }
}

async function clearCustomerRedis(redis: any, orgId: string, phone: string): Promise<void> {
  const phoneKey = `hotspot_phone_sess:${orgId}:${phone}`;
  const token = await redis.get(phoneKey).catch(() => null);
  if (token) {
    await redis.del(`hotspot_sess:v1:${token}`).catch(() => {});
    await redis.del(phoneKey).catch(() => {});
  }
}

async function disableMikroTikUser(db: any, routerId: string, username: string, type: string): Promise<void> {
  const [r] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!r) return;
  const client = await connectRouter(r);
  try {
    if (type === "pppoe") {
      const secrets = await client.print("/ppp/secret", { name: username }).catch(() => []);
      for (const s of secrets) if (s?.id) await client.exec("/ppp/secret", "set", { numbers: s.id, disabled: "yes" }).catch(() => {});
    } else {
      const users = await client.print("/ip/hotspot/user", { name: username }).catch(() => []);
      for (const u of users) if (u?.id) await client.exec("/ip/hotspot/user", "set", { numbers: u.id, disabled: "yes" }).catch(() => {});
    }
  } finally {
    await client.close().catch(() => {});
  }
}

async function enableMikroTikUser(db: any, routerId: string, username: string, type: string): Promise<void> {
  const [r] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!r) return;
  const client = await connectRouter(r);
  try {
    if (type === "pppoe") {
      const secrets = await client.print("/ppp/secret", { name: username }).catch(() => []);
      for (const s of secrets) if (s?.id) await client.exec("/ppp/secret", "set", { numbers: s.id, disabled: "no" }).catch(() => {});
    } else {
      const users = await client.print("/ip/hotspot/user", { name: username }).catch(() => []);
      for (const u of users) if (u?.id) await client.exec("/ip/hotspot/user", "set", { numbers: u.id, disabled: "no" }).catch(() => {});
    }
  } finally {
    await client.close().catch(() => {});
  }
}

async function forceLogoutMikroTikUser(db: any, routerId: string, username: string, type: string): Promise<void> {
  const [r] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!r) return;
  const client = await connectRouter(r);
  try {
    if (type === "pppoe") {
      const actives = await client.print("/ppp/active", { name: username }).catch(() => []);
      for (const a of actives) if (a?.id) await client.remove("/ppp/active", a.id).catch(() => {});
    } else {
      const actives = await client.print("/ip/hotspot/active", { user: username }).catch(() => []);
      for (const a of actives) if (a?.id) await client.remove("/ip/hotspot/active", a.id).catch(() => {});
      const cookies = await client.print("/ip/hotspot/cookie", { user: username }).catch(() => []);
      for (const c of cookies) if (c?.id) await client.remove("/ip/hotspot/cookie", c.id).catch(() => {});
      const hosts = await client.print("/ip/hotspot/host", { user: username }).catch(() => []);
      for (const h of hosts) if (h?.id) await client.remove("/ip/hotspot/host", h.id).catch(() => {});
    }
  } finally {
    await client.close().catch(() => {});
  }
}

async function updateMikroTikUser(db: any, routerId: string, username: string, type: string, data: { password?: string; profile?: string; macAddress?: string; sharedUsers?: number; limitUptime?: string }): Promise<void> {
  const [r] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!r) return;
  const client = await connectRouter(r);
  try {
    if (type === "pppoe") {
      const secrets = await client.print("/ppp/secret", { name: username }).catch(() => []);
      for (const s of secrets) {
        if (s?.id) {
          const updateData: Record<string, string> = { numbers: s.id };
          if (data.password) updateData.password = data.password;
          if (data.profile) updateData.profile = data.profile;
          await client.exec("/ppp/secret", "set", updateData).catch(() => {});
        }
      }
    } else {
      const users = await client.print("/ip/hotspot/user", { name: username }).catch(() => []);
      for (const u of users) {
        if (u?.id) {
          const updateData: Record<string, string> = { numbers: u.id };
          if (data.password) updateData.password = data.password;
          if (data.profile) updateData.profile = data.profile;
          if (data.macAddress) updateData["mac-address"] = data.macAddress;
          if (data.sharedUsers) updateData["shared-users"] = String(data.sharedUsers);
          if (data.limitUptime) updateData["limit-uptime"] = data.limitUptime;
          await client.exec("/ip/hotspot/user", "set", updateData).catch(() => {});
        }
      }
    }
  } finally {
    await client.close().catch(() => {});
  }
}

export const customerRouter = router({
  list: authedProcedure
    .input(z.object({ 
      search: z.string().optional(), 
      limit: z.number().default(50), 
      offset: z.number().default(0),
      filter: z.enum(["active", "suspended", "expired", "deleted", "all"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conditions: any[] = [eq(customers.orgId, ctx.orgId)];
      
      if (input.filter === "deleted") {
        conditions.push(sql`${customers.deletedAt} IS NOT NULL`);
      } else if (input.filter === "active") {
        conditions.push(eq(customers.isActive, true));
        conditions.push(isNull(customers.deletedAt));
      } else if (input.filter === "suspended") {
        conditions.push(eq(customers.isActive, false));
        conditions.push(isNull(customers.deletedAt));
      } else if (input.filter === "all") {
        // no extra filter
      } else {
        // default: show non-deleted
        conditions.push(isNull(customers.deletedAt));
      }
      
      if (input.search) {
        conditions.push(
          sql`(${customers.fullName} ILIKE ${`%${input.search}%`} OR ${customers.phone} ILIKE ${`%${input.search}%`})`
        );
      }
      
      const result = await ctx.db.select({
        id: customers.id, customerCode: customers.customerCode, fullName: customers.fullName,
        phone: customers.phone, email: customers.email, address: customers.address,
        nid: customers.nid, telegramChatId: customers.telegramChatId, referredBy: customers.referredBy,
        createdBy: customers.createdBy, isActive: customers.isActive,
        deletedAt: customers.deletedAt, deletedBy: customers.deletedBy, deleteReason: customers.deleteReason,
        createdAt: customers.createdAt, updatedAt: customers.updatedAt,
      }).from(customers).where(and(...conditions)).limit(input.limit).offset(input.offset);
      return result;
    }),

  get: authedProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ ctx, input }) => {
    const [c] = await ctx.db.select().from(customers)
      .where(and(eq(customers.id, input.id), eq(customers.orgId, ctx.orgId))).limit(1);
    if (!c) throw new TRPCError({ code: "NOT_FOUND" });
    const { passwordHash: _, ...safe } = c;
    const subs = await ctx.db.select().from(subscriptions).where(eq(subscriptions.customerId, c.id));
    const ords = await ctx.db.select().from(orders).where(eq(orders.customerId, c.id)).orderBy(desc(orders.createdAt));
    const logs = await ctx.db.select().from(activityLog)
      .where(and(eq(activityLog.orgId, ctx.orgId), eq(activityLog.entityId, c.id)))
      .orderBy(desc(activityLog.createdAt))
      .limit(50);
    return { ...safe, subscriptions: subs, orders: ords, activityLogs: logs };
  }),

  create: adminProcedure.input(createCustomerSchema).mutation(async ({ ctx, input }) => {
    const phone = normalizePhone(input.phone);
    const [dup] = await ctx.db.select({ id: customers.id }).from(customers)
      .where(and(eq(customers.phone, phone), eq(customers.orgId, ctx.orgId), isNull(customers.deletedAt))).limit(1);
    if (dup) throw new TRPCError({ code: "CONFLICT", message: "এই ফোন নম্বরে একজন customer ইতোমধ্যে আছেন" });
    const code = await nextCustomerCode(ctx.db, ctx.orgId);
    const passwordHash = await hashPassword(phone.slice(-6));
    const [c] = await ctx.db.insert(customers).values({
      orgId: ctx.orgId, customerCode: code, fullName: input.fullName,
      phone, email: input.email, address: input.address,
      nid: input.nid, notes: input.notes, referredBy: input.referredBy,
      passwordHash,
    }).returning({ id: customers.id, customerCode: customers.customerCode, fullName: customers.fullName });

    await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "create", "customer", c.id, { fullName: input.fullName, phone });
    const [tgCfg] = await ctx.db.select({ chatId: telegramConfigs.chatId }).from(telegramConfigs)
      .where(eq(telegramConfigs.orgId, ctx.orgId)).limit(1);
    if (tgCfg?.chatId) {
      await sendNewUserCreatedNotification(tgCfg.chatId, {
        name: input.fullName,
        phone,
        packageName: "—",
      });
    }
    emitOrgEvent(ctx.orgId, "customer:new", {
      orgId: ctx.orgId,
      customerId: c.id,
      fullName: input.fullName,
      phone,
      packageName: null,
      pendingApproval: false,
    });
    return c;
  }),

  update: adminProcedure
    .input(z.object({
      id: z.string().uuid(), fullName: z.string().optional(), phone: z.string().optional(),
      email: z.string().email().optional(), address: z.string().optional(),
      nid: z.string().optional(), notes: z.string().optional(), isActive: z.boolean().optional(),
      telegramChatId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, phone: rawPhone, ...rest } = input;
      const data: Record<string, unknown> = { ...rest };
      if (rawPhone !== undefined) {
        const phone = normalizePhone(rawPhone);
        const [dup] = await ctx.db.select({ id: customers.id }).from(customers)
          .where(and(
            eq(customers.phone, phone),
            eq(customers.orgId, ctx.orgId),
            isNull(customers.deletedAt),
            ne(customers.id, id),
          )).limit(1);
        if (dup) throw new TRPCError({ code: "CONFLICT", message: "এই ফোন নম্বর অন্য একজন customer ব্যবহার করছেন" });
        data.phone = phone;
      }
      await ctx.db.update(customers).set({ ...data, updatedAt: new Date() })
        .where(and(eq(customers.id, id), eq(customers.orgId, ctx.orgId)));
      await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "update", "customer", id, data);
      return { ok: true };
    }),

  delete: adminProcedure.input(z.object({ id: z.string().uuid(), reason: z.string().optional() })).mutation(async ({ ctx, input }) => {
    const [customer] = await ctx.db.select({ id: customers.id, fullName: customers.fullName, phone: customers.phone }).from(customers)
      .where(and(eq(customers.id, input.id), eq(customers.orgId, ctx.orgId))).limit(1);
    if (!customer) throw new TRPCError({ code: "NOT_FOUND" });
    
    await ctx.db.update(customers).set({
      deletedAt: new Date(),
      deletedBy: ctx.user?.id,
      deleteReason: input.reason ?? null,
      isActive: false,
      updatedAt: new Date(),
    }).where(and(eq(customers.id, input.id), eq(customers.orgId, ctx.orgId)));
    
    await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "delete", "customer", input.id, { reason: input.reason, fullName: customer.fullName });
    return { ok: true };
  }),

  restore: adminProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const [customer] = await ctx.db.select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, input.id), eq(customers.orgId, ctx.orgId), sql`${customers.deletedAt} IS NOT NULL`)).limit(1);
    if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found or not deleted" });
    
    await ctx.db.update(customers).set({
      deletedAt: null,
      deletedBy: null,
      deleteReason: null,
      isActive: true,
      updatedAt: new Date(),
    }).where(and(eq(customers.id, input.id), eq(customers.orgId, ctx.orgId)));
    
    await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "restore", "customer", input.id, {});
    return { ok: true };
  }),

  permanentDelete: adminProcedure.input(z.object({ id: z.string().uuid(), confirm: z.literal("PERMANENT_DELETE") })).mutation(async ({ ctx, input }) => {
    const [customer] = await ctx.db.select({ id: customers.id, fullName: customers.fullName, phone: customers.phone }).from(customers)
      .where(and(eq(customers.id, input.id), eq(customers.orgId, ctx.orgId))).limit(1);
    if (!customer) throw new TRPCError({ code: "NOT_FOUND" });

    const subs = await ctx.db.select().from(subscriptions).where(eq(subscriptions.customerId, input.id));

    // Step 1: MikroTik cleanup outside tx — best-effort, fail-safe
    for (const sub of subs) {
      if (sub.routerId) {
        await removeMikroTikUser(ctx.db, sub.routerId, sub.username).catch(() => {});
      }
    }

    // Step 2: Atomic DB transaction
    await ctx.db.transaction(async (tx: any) => {
      for (const sub of subs) {
        await deleteRadiusUser(tx, sub.username).catch(() => {});
        await tx.delete(radacct).where(eq(radacct.username, sub.username)).catch(() => {});
        await tx.delete(hotspotUsers).where(and(eq(hotspotUsers.orgId, ctx.orgId), eq(hotspotUsers.name, sub.username)));
        await tx.delete(pppoeUsers).where(and(eq(pppoeUsers.orgId, ctx.orgId), eq(pppoeUsers.name, sub.username)));
      }
      await tx.delete(orders).where(eq(orders.customerId, input.id));
      await tx.delete(subscriptions).where(eq(subscriptions.customerId, input.id));
      await tx.delete(deviceBindings).where(eq(deviceBindings.customerId, input.id)).catch(() => {});
      await tx.delete(customers).where(and(eq(customers.id, input.id), eq(customers.orgId, ctx.orgId)));
    });

    // Step 3: Redis cleanup post-commit — best-effort
    await clearCustomerRedis(ctx.redis, ctx.orgId, customer.phone).catch(() => {});

    await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "permanent_delete", "customer", input.id, { fullName: customer.fullName });
    return { ok: true };
  }),

  getReferrals: authedProcedure.input(z.object({ customerId: z.string().uuid() })).query(async ({ ctx, input }) => {
    return ctx.db.select({
      id: customers.id, fullName: customers.fullName, phone: customers.phone,
      customerCode: customers.customerCode, createdAt: customers.createdAt,
    }).from(customers).where(and(eq(customers.referredBy, input.customerId), eq(customers.orgId, ctx.orgId), isNull(customers.deletedAt)));
  }),

  // ═══════════════════════════════════════════════════════════════════════════════
  // ISP CUSTOMER USER MANAGEMENT (Network Users)
  // ═══════════════════════════════════════════════════════════════════════════════

  userList: authedProcedure
    .input(z.object({
      search: z.string().optional(),
      userType: z.enum(["all", "hotspot", "pppoe"]).optional(),
      status: z.enum(["all", "active", "expired", "blocked", "pending"]).optional(),
      packageId: z.string().uuid().optional(),
      routerId: z.string().uuid().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      expiringSoon: z.boolean().optional(),
      onlineOnly: z.boolean().optional(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ ctx, input }) => {
      const conditions: any[] = [eq(subscriptions.orgId, ctx.orgId)];

      if (input.userType && input.userType !== "all") {
        conditions.push(eq(packages.type, input.userType));
      }

      if (input.status && input.status !== "all") {
        if (input.status === "expired") {
          conditions.push(or(eq(subscriptions.status, "expired"), lte(subscriptions.expiresAt, new Date())));
        } else if (input.status === "blocked") {
          conditions.push(eq(subscriptions.status, "suspended"));
        } else if (input.status === "pending") {
          conditions.push(eq(customers.isActive, false));
        } else {
          conditions.push(eq(subscriptions.status, input.status));
          conditions.push(gte(subscriptions.expiresAt, new Date()));
        }
      }

      if (input.packageId) {
        conditions.push(eq(subscriptions.packageId, input.packageId));
      }

      if (input.routerId) {
        conditions.push(eq(subscriptions.routerId, input.routerId));
      }

      if (input.dateFrom) {
        conditions.push(gte(subscriptions.createdAt, new Date(input.dateFrom)));
      }

      if (input.dateTo) {
        conditions.push(lte(subscriptions.createdAt, new Date(input.dateTo)));
      }

      if (input.expiringSoon) {
        const threeDaysLater = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        conditions.push(lte(subscriptions.expiresAt, threeDaysLater));
        conditions.push(gte(subscriptions.expiresAt, new Date()));
        conditions.push(eq(subscriptions.status, "active"));
      }

      if (input.onlineOnly) {
        conditions.push(
          or(
            eq(hotspotUsers.isActive, true),
            eq(pppoeUsers.isActive, true)
          )
        );
      }

      if (input.search) {
        const term = `%${input.search}%`;
        conditions.push(
          or(
            like(subscriptions.username, term),
            like(customers.phone, term),
            like(customers.fullName, term),
            like(customers.email, term),
            like(hotspotUsers.macAddress, term),
            like(pppoeUsers.callerId, term)
          )
        );
      }

      const countResult = await ctx.db.select({ count: sql<number>`count(DISTINCT ${subscriptions.id})` })
        .from(subscriptions)
        .innerJoin(customers, eq(subscriptions.customerId, customers.id))
        .leftJoin(packages, eq(subscriptions.packageId, packages.id))
        .leftJoin(routers, eq(subscriptions.routerId, routers.id))
        .leftJoin(users, eq(customers.createdBy, users.id))
        .leftJoin(hotspotUsers, and(
          eq(subscriptions.orgId, hotspotUsers.orgId),
          eq(subscriptions.routerId, hotspotUsers.routerId),
          eq(subscriptions.username, hotspotUsers.name)
        ))
        .leftJoin(pppoeUsers, and(
          eq(subscriptions.orgId, pppoeUsers.orgId),
          eq(subscriptions.routerId, pppoeUsers.routerId),
          eq(subscriptions.username, pppoeUsers.name)
        ))
        .where(and(...conditions));

      const total = Number(countResult[0]?.count ?? 0);

      const rows = await ctx.db.select({
        subscriptionId: subscriptions.id,
        username: subscriptions.username,
        passwordEncrypted: subscriptions.passwordEncrypted,
        expiresAt: subscriptions.expiresAt,
        subscriptionStatus: subscriptions.status,
        subscriptionCreatedAt: subscriptions.createdAt,
        customerId: customers.id,
        customerCode: customers.customerCode,
        fullName: customers.fullName,
        phone: customers.phone,
        email: customers.email,
        packageId: packages.id,
        packageName: packages.name,
        packageType: packages.type,
        downloadMbps: packages.downloadMbps,
        uploadMbps: packages.uploadMbps,
        routerId: routers.id,
        routerName: routers.name,
        createdByName: users.name,
        hsUptime: hotspotUsers.uptime,
        hsBytesIn: hotspotUsers.bytesIn,
        hsBytesOut: hotspotUsers.bytesOut,
        hsIp: hotspotUsers.ipAddress,
        hsMac: hotspotUsers.macAddress,
        hsIsActive: hotspotUsers.isActive,
        pppoeUptime: pppoeUsers.uptime,
        pppoeBytesIn: pppoeUsers.bytesIn,
        pppoeBytesOut: pppoeUsers.bytesOut,
        pppoeIp: pppoeUsers.remoteAddress,
        pppoeMac: pppoeUsers.callerId,
        pppoeIsActive: pppoeUsers.isActive,
        pppoeLastSeen: pppoeUsers.lastSeen,
      }).from(subscriptions)
        .innerJoin(customers, eq(subscriptions.customerId, customers.id))
        .leftJoin(packages, eq(subscriptions.packageId, packages.id))
        .leftJoin(routers, eq(subscriptions.routerId, routers.id))
        .leftJoin(users, eq(customers.createdBy, users.id))
        .leftJoin(hotspotUsers, and(
          eq(subscriptions.orgId, hotspotUsers.orgId),
          eq(subscriptions.routerId, hotspotUsers.routerId),
          eq(subscriptions.username, hotspotUsers.name)
        ))
        .leftJoin(pppoeUsers, and(
          eq(subscriptions.orgId, pppoeUsers.orgId),
          eq(subscriptions.routerId, pppoeUsers.routerId),
          eq(subscriptions.username, pppoeUsers.name)
        ))
        .where(and(...conditions))
        .orderBy(desc(subscriptions.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const mapped = rows.map((r) => {
        const isHotspot = r.packageType === "hotspot";
        const isOnline = isHotspot ? r.hsIsActive : r.pppoeIsActive;
        const uptime = isHotspot ? r.hsUptime : r.pppoeUptime;
        const bytesIn = isHotspot ? r.hsBytesIn : r.pppoeBytesIn;
        const bytesOut = isHotspot ? r.hsBytesOut : r.pppoeBytesOut;
        const ipAddress = isHotspot ? r.hsIp : r.pppoeIp;
        const macAddress = isHotspot ? r.hsMac : r.pppoeMac;
        const lastSeen = isHotspot ? null : r.pppoeLastSeen;
        let resolvedPassword: string | null = null;
        if (r.passwordEncrypted) {
          try { resolvedPassword = decryptText(r.passwordEncrypted); } catch { /* ignore */ }
        }
        return {
          subscriptionId: r.subscriptionId,
          username: r.username,
          password: resolvedPassword,
          status: r.subscriptionStatus,
          expiresAt: r.expiresAt,
          createdAt: r.subscriptionCreatedAt,
          customerId: r.customerId,
          customerCode: r.customerCode,
          fullName: r.fullName,
          phone: r.phone,
          email: r.email,
          packageId: r.packageId,
          packageName: r.packageName,
          packageType: r.packageType,
          speed: r.downloadMbps && r.uploadMbps ? `${r.downloadMbps}M/${r.uploadMbps}M` : null,
          routerId: r.routerId,
          routerName: r.routerName,
          createdByName: r.createdByName,
          uptime,
          bytesIn,
          bytesOut,
          ipAddress,
          macAddress,
          isOnline: !!isOnline,
          lastSeen,
        };
      });

      return { rows: mapped, total };
    }),

  userStats: authedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const [total] = await ctx.db.select({ n: sql<number>`count(*)` }).from(subscriptions).where(eq(subscriptions.orgId, ctx.orgId));
    const [active] = await ctx.db.select({ n: sql<number>`count(*)` }).from(subscriptions).where(and(eq(subscriptions.orgId, ctx.orgId), eq(subscriptions.status, "active"), gte(subscriptions.expiresAt, now)));
    const [expired] = await ctx.db.select({ n: sql<number>`count(*)` }).from(subscriptions).where(and(eq(subscriptions.orgId, ctx.orgId), or(eq(subscriptions.status, "expired"), lte(subscriptions.expiresAt, now))));
    const [suspended] = await ctx.db.select({ n: sql<number>`count(*)` }).from(subscriptions).where(and(eq(subscriptions.orgId, ctx.orgId), eq(subscriptions.status, "suspended")));
    const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const [expiringSoon] = await ctx.db.select({ n: sql<number>`count(*)` }).from(subscriptions).where(and(eq(subscriptions.orgId, ctx.orgId), eq(subscriptions.status, "active"), gte(subscriptions.expiresAt, now), lte(subscriptions.expiresAt, threeDays)));
    return {
      total: Number(total?.n ?? 0),
      active: Number(active?.n ?? 0),
      expired: Number(expired?.n ?? 0),
      suspended: Number(suspended?.n ?? 0),
      expiringSoon: Number(expiringSoon?.n ?? 0),
    };
  }),

  userLiveStats: authedProcedure.query(async ({ ctx }) => {
    const allRouters = await ctx.db.select().from(routers)
      .where(and(eq(routers.orgId, ctx.orgId), eq(routers.isActive, true)));

    const stats: Array<{
      routerId: string;
      username: string;
      uptime: string;
      bytesIn: number;
      bytesOut: number;
      ipAddress: string;
      macAddress: string;
      isOnline: boolean;
    }> = [];

    for (const r of allRouters) {
      const client = await connectRouter(r);
      try {
        const hotspotActives = await client.print("/ip/hotspot/active").catch(() => []);
        for (const a of hotspotActives) {
          stats.push({
            routerId: r.id,
            username: a.user || a.name,
            uptime: a.uptime || "",
            bytesIn: Number(a["bytes-in"] || 0),
            bytesOut: Number(a["bytes-out"] || 0),
            ipAddress: a.address || "",
            macAddress: a["mac-address"] || "",
            isOnline: true,
          });
        }
        const pppoeActives = await client.print("/ppp/active").catch(() => []);
        for (const a of pppoeActives) {
          stats.push({
            routerId: r.id,
            username: a.name,
            uptime: a.uptime || "",
            bytesIn: Number(a["bytes-in"] || 0),
            bytesOut: Number(a["bytes-out"] || 0),
            ipAddress: a.address || "",
            macAddress: a["caller-id"] || "",
            isOnline: true,
          });
        }
      } finally {
        await client.close().catch(() => {});
      }
    }

    return stats;
  }),

  userUpdate: adminProcedure
    .input(z.object({
      subscriptionId: z.string().uuid(),
      fullName: z.string().optional(),
      phone: z.string().optional(),
      password: z.string().optional(),
      packageId: z.string().uuid().optional(),
      expiresAt: z.string().datetime().optional(),
      macAddress: z.string().optional(),
      sharedUsers: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [sub] = await ctx.db.select().from(subscriptions)
        .where(and(eq(subscriptions.id, input.subscriptionId), eq(subscriptions.orgId, ctx.orgId))).limit(1);
      if (!sub) throw new TRPCError({ code: "NOT_FOUND", message: "Subscription not found" });

      const [customer] = await ctx.db.select().from(customers)
        .where(and(eq(customers.id, sub.customerId), eq(customers.orgId, ctx.orgId))).limit(1);
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found" });

      const custData: any = {};
      if (input.fullName) custData.fullName = input.fullName;
      if (input.phone) custData.phone = input.phone;
      if (Object.keys(custData).length > 0) {
        await ctx.db.update(customers).set({ ...custData, updatedAt: new Date() })
          .where(eq(customers.id, customer.id));
      }

      const subData: any = {};
      if (input.packageId) subData.packageId = input.packageId;
      if (input.expiresAt) subData.expiresAt = new Date(input.expiresAt);
      let newPassword = input.password;
      if (newPassword) {
        subData.passwordEncrypted = encryptText(newPassword);
      }
      if (Object.keys(subData).length > 0) {
        await ctx.db.update(subscriptions).set({ ...subData, updatedAt: new Date() })
          .where(eq(subscriptions.id, sub.id));
      }

      if (sub.routerId) {
        const pkgId = input.packageId || sub.packageId;
        if (!pkgId) throw new TRPCError({ code: "BAD_REQUEST", message: "No package assigned" });
        const [pkg] = await ctx.db.select().from(packages)
          .where(and(eq(packages.id, pkgId), eq(packages.orgId, ctx.orgId))).limit(1);
        if (pkg) {
          await updateMikroTikUser(ctx.db, sub.routerId, sub.username, pkg.type, {
            password: newPassword || undefined,
            profile: pkg.mikrotikProfileName || "default",
            macAddress: input.macAddress || undefined,
            sharedUsers: input.sharedUsers,
          });
          if (newPassword) {
            await syncHotspotRadiusUser(ctx.db, sub.username, newPassword, pkg);
          }
        }
      }

      await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "user.updated", "subscription", sub.id, {
        fullName: input.fullName, phone: input.phone, packageId: input.packageId, expiresAt: input.expiresAt,
      });
      return { ok: true };
    }),

  userBlock: adminProcedure
    .input(z.object({ subscriptionId: z.string().uuid(), type: z.enum(["temporary", "permanent"]) }))
    .mutation(async ({ ctx, input }) => {
      const [sub] = await ctx.db.select().from(subscriptions)
        .where(and(eq(subscriptions.id, input.subscriptionId), eq(subscriptions.orgId, ctx.orgId))).limit(1);
      if (!sub) throw new TRPCError({ code: "NOT_FOUND" });

      const newStatus = input.type === "permanent" ? "suspended" : "suspended";
      await ctx.db.update(subscriptions)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(eq(subscriptions.id, sub.id));

      if (sub.routerId && sub.packageId) {
        const [pkg] = await ctx.db.select().from(packages)
          .where(and(eq(packages.id, sub.packageId), eq(packages.orgId, ctx.orgId))).limit(1);
        await disableMikroTikUser(ctx.db, sub.routerId, sub.username, pkg?.type || "hotspot");
        if (input.type === "permanent") {
          await forceLogoutMikroTikUser(ctx.db, sub.routerId, sub.username, pkg?.type || "hotspot");
        }
      }

      await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "user.blocked", "subscription", sub.id, { type: input.type });
      return { ok: true };
    }),

  userUnblock: adminProcedure
    .input(z.object({ subscriptionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [sub] = await ctx.db.select().from(subscriptions)
        .where(and(eq(subscriptions.id, input.subscriptionId), eq(subscriptions.orgId, ctx.orgId))).limit(1);
      if (!sub) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.db.update(subscriptions)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(subscriptions.id, sub.id));

      if (sub.routerId && sub.packageId) {
        const [pkg] = await ctx.db.select().from(packages)
          .where(and(eq(packages.id, sub.packageId), eq(packages.orgId, ctx.orgId))).limit(1);
        await enableMikroTikUser(ctx.db, sub.routerId, sub.username, pkg?.type || "hotspot");
      }

      await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "user.unblocked", "subscription", sub.id, {});
      return { ok: true };
    }),

  userExtend: adminProcedure
    .input(z.object({ subscriptionId: z.string().uuid(), days: z.number().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [sub] = await ctx.db.select().from(subscriptions)
        .where(and(eq(subscriptions.id, input.subscriptionId), eq(subscriptions.orgId, ctx.orgId))).limit(1);
      if (!sub) throw new TRPCError({ code: "NOT_FOUND" });

      const currentExpiry = sub.expiresAt ? new Date(sub.expiresAt) : new Date();
      const newExpiry = new Date(currentExpiry.getTime() + input.days * 24 * 60 * 60 * 1000);
      await ctx.db.update(subscriptions)
        .set({ expiresAt: newExpiry, status: "active", updatedAt: new Date() })
        .where(eq(subscriptions.id, sub.id));

      if (sub.routerId && sub.packageId) {
        const [pkg] = await ctx.db.select().from(packages)
          .where(and(eq(packages.id, sub.packageId), eq(packages.orgId, ctx.orgId))).limit(1);
        if (pkg) {
          const totalHours = Math.floor((newExpiry.getTime() - Date.now()) / (1000 * 60 * 60));
          await updateMikroTikUser(ctx.db, sub.routerId, sub.username, pkg.type, {
            limitUptime: totalHours > 0 ? `${totalHours}h` : undefined,
          });
        }
      }

      await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "user.extended", "subscription", sub.id, { days: input.days, newExpiry });
      return { ok: true, expiresAt: newExpiry };
    }),

  userChangePackage: adminProcedure
    .input(z.object({ subscriptionId: z.string().uuid(), packageId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [sub] = await ctx.db.select().from(subscriptions)
        .where(and(eq(subscriptions.id, input.subscriptionId), eq(subscriptions.orgId, ctx.orgId))).limit(1);
      if (!sub) throw new TRPCError({ code: "NOT_FOUND" });

      const [pkg] = await ctx.db.select().from(packages)
        .where(and(eq(packages.id, input.packageId), eq(packages.orgId, ctx.orgId), eq(packages.isActive, true))).limit(1);
      if (!pkg) throw new TRPCError({ code: "NOT_FOUND", message: "Package not found" });

      await ctx.db.update(subscriptions)
        .set({ packageId: pkg.id, updatedAt: new Date() })
        .where(eq(subscriptions.id, sub.id));

      if (sub.routerId) {
        let resolvedPassword: string | null = null;
        if (sub.passwordEncrypted) {
          try { resolvedPassword = decryptText(sub.passwordEncrypted); } catch { /* ignore */ }
        }
        await updateMikroTikUser(ctx.db, sub.routerId, sub.username, pkg.type, {
          profile: pkg.mikrotikProfileName || "default",
        });
        if (resolvedPassword) {
          await syncHotspotRadiusUser(ctx.db, sub.username, resolvedPassword, pkg);
        }
      }

      await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "user.package_changed", "subscription", sub.id, { packageId: pkg.id, packageName: pkg.name });
      return { ok: true };
    }),

  userForceLogout: adminProcedure
    .input(z.object({ subscriptionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [sub] = await ctx.db.select().from(subscriptions)
        .where(and(eq(subscriptions.id, input.subscriptionId), eq(subscriptions.orgId, ctx.orgId))).limit(1);
      if (!sub) throw new TRPCError({ code: "NOT_FOUND" });

      if (sub.routerId && sub.packageId) {
        const [pkg] = await ctx.db.select().from(packages)
          .where(and(eq(packages.id, sub.packageId), eq(packages.orgId, ctx.orgId))).limit(1);
        await forceLogoutMikroTikUser(ctx.db, sub.routerId, sub.username, pkg?.type || "hotspot");
      }

      await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "user.force_logout", "subscription", sub.id, {});
      return { ok: true };
    }),

  userDelete: adminProcedure
    .input(z.object({ subscriptionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [sub] = await ctx.db.select().from(subscriptions)
        .where(and(eq(subscriptions.id, input.subscriptionId), eq(subscriptions.orgId, ctx.orgId))).limit(1);
      if (!sub) throw new TRPCError({ code: "NOT_FOUND" });

      const [cust] = await ctx.db.select({ phone: customers.phone })
        .from(customers)
        .where(and(eq(customers.id, sub.customerId), eq(customers.orgId, ctx.orgId))).limit(1);

      // Step 1: MikroTik cleanup outside tx — best-effort, fail-safe
      if (sub.routerId) {
        await removeMikroTikUser(ctx.db, sub.routerId, sub.username).catch(() => {});
      }

      // Step 2: Atomic DB transaction
      await ctx.db.transaction(async (tx: any) => {
        await deleteRadiusUser(tx, sub.username).catch(() => {});
        await tx.delete(radacct).where(eq(radacct.username, sub.username)).catch(() => {});
        await tx.delete(hotspotUsers)
          .where(and(eq(hotspotUsers.orgId, ctx.orgId), eq(hotspotUsers.name, sub.username)));
        await tx.delete(pppoeUsers)
          .where(and(eq(pppoeUsers.orgId, ctx.orgId), eq(pppoeUsers.name, sub.username)));
        await tx.delete(subscriptions).where(eq(subscriptions.id, sub.id));

        const [remaining] = await tx.select({ count: sql<number>`count(*)` })
          .from(subscriptions)
          .where(eq(subscriptions.customerId, sub.customerId));
        if (Number(remaining?.count) === 0) {
          await tx.delete(deviceBindings).where(eq(deviceBindings.customerId, sub.customerId)).catch(() => {});
          await tx.delete(customers).where(and(eq(customers.id, sub.customerId), eq(customers.orgId, ctx.orgId)));
        }
      });

      // Step 3: Redis cleanup post-commit — best-effort
      if (cust?.phone) {
        await clearCustomerRedis(ctx.redis, ctx.orgId, cust.phone).catch(() => {});
      }

      await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "user.deleted", "subscription", sub.id, { username: sub.username });
      return { ok: true };
    }),

  resetDevice: adminProcedure
    .input(z.object({ customerId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [customer] = await ctx.db.select({ phone: customers.phone, id: customers.id })
        .from(customers)
        .where(and(eq(customers.id, input.customerId), eq(customers.orgId, ctx.orgId)))
        .limit(1);
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found" });

      // Revoke Redis hotspot session (phone → token index)
      const phoneKey = `hotspot_phone_sess:${ctx.orgId}:${customer.phone}`;
      const token = await ctx.redis.get(phoneKey);
      if (token) {
        await ctx.redis.del(`hotspot_sess:v1:${token}`);
        await ctx.redis.del(phoneKey);
      }

      // Delete device bindings (MAC / fingerprint)
      await ctx.db.delete(deviceBindings).where(eq(deviceBindings.customerId, input.customerId)).catch(() => {});

      // Force-disconnect active hotspot session on all routers
      const activeHs = await ctx.db
        .select({ routerId: hotspotUsers.routerId, name: hotspotUsers.name })
        .from(hotspotUsers)
        .where(and(eq(hotspotUsers.orgId, ctx.orgId), eq(hotspotUsers.name, customer.phone), eq(hotspotUsers.isActive, true)))
        .limit(1);
      for (const hs of activeHs) {
        if (!hs.routerId) continue;
        try {
          const client = await getRouterClient(ctx.db, ctx.orgId, hs.routerId);
          try {
            const actives = await client.print("/ip/hotspot/active", { user: hs.name });
            for (const a of actives) if (a?.id) await client.remove("/ip/hotspot/active", a.id);
            const cookies = await client.print("/ip/hotspot/cookie", { user: hs.name });
            for (const co of cookies) if (co?.id) await client.remove("/ip/hotspot/cookie", co.id);
            const hosts = await client.print("/ip/hotspot/host", { user: hs.name });
            for (const h of hosts) if (h?.id) await client.remove("/ip/hotspot/host", h.id);
          } finally { await client.close(); }
        } catch (_) {}
      }

      await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "user.device_reset", "customer", input.customerId, { phone: customer.phone });
      return { ok: true };
    }),

  userBulkResetDevice: adminProcedure
    .input(z.object({ customerIds: z.array(z.string().uuid()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      let success = 0;
      for (const customerId of input.customerIds) {
        const [customer] = await ctx.db.select({ phone: customers.phone, id: customers.id })
          .from(customers)
          .where(and(eq(customers.id, customerId), eq(customers.orgId, ctx.orgId))).limit(1);
        if (!customer) continue;

        const phoneKey = `hotspot_phone_sess:${ctx.orgId}:${customer.phone}`;
        const token = await ctx.redis.get(phoneKey).catch(() => null);
        if (token) {
          await ctx.redis.del(`hotspot_sess:v1:${token}`).catch(() => {});
          await ctx.redis.del(phoneKey).catch(() => {});
        }
        await ctx.db.delete(deviceBindings).where(eq(deviceBindings.customerId, customerId)).catch(() => {});

        const activeHs = await ctx.db
          .select({ routerId: hotspotUsers.routerId, name: hotspotUsers.name })
          .from(hotspotUsers)
          .where(and(eq(hotspotUsers.orgId, ctx.orgId), eq(hotspotUsers.name, customer.phone), eq(hotspotUsers.isActive, true)))
          .limit(1);
        for (const hs of activeHs) {
          if (!hs.routerId) continue;
          try {
            const client = await getRouterClient(ctx.db, ctx.orgId, hs.routerId);
            try {
              const actives = await client.print("/ip/hotspot/active", { user: hs.name });
              for (const a of actives) if (a?.id) await client.remove("/ip/hotspot/active", a.id);
              const cookies = await client.print("/ip/hotspot/cookie", { user: hs.name });
              for (const co of cookies) if (co?.id) await client.remove("/ip/hotspot/cookie", co.id);
              const hosts = await client.print("/ip/hotspot/host", { user: hs.name });
              for (const h of hosts) if (h?.id) await client.remove("/ip/hotspot/host", h.id);
            } finally { await client.close(); }
          } catch (_) {}
        }

        await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "user.device_reset", "customer", customerId, { phone: customer.phone });
        success++;
      }
      return { ok: true, count: success };
    }),

  userBulkBlock: adminProcedure
    .input(z.object({ subscriptionIds: z.array(z.string().uuid()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      let success = 0;
      for (const subscriptionId of input.subscriptionIds) {
        const [sub] = await ctx.db.select().from(subscriptions)
          .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.orgId, ctx.orgId))).limit(1);
        if (!sub || sub.status === "suspended") continue;

        await ctx.db.update(subscriptions)
          .set({ status: "suspended", updatedAt: new Date() })
          .where(eq(subscriptions.id, sub.id));

        if (sub.routerId && sub.packageId) {
          const [pkg] = await ctx.db.select().from(packages)
            .where(and(eq(packages.id, sub.packageId), eq(packages.orgId, ctx.orgId))).limit(1);
          await disableMikroTikUser(ctx.db, sub.routerId, sub.username, pkg?.type || "hotspot").catch(() => {});
          await forceLogoutMikroTikUser(ctx.db, sub.routerId, sub.username, pkg?.type || "hotspot").catch(() => {});
        }

        await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "user.blocked", "subscription", sub.id, { type: "bulk" });
        success++;
      }
      return { ok: true, count: success };
    }),

  userBulkDelete: adminProcedure
    .input(z.object({ subscriptionIds: z.array(z.string().uuid()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      let success = 0;
      for (const subscriptionId of input.subscriptionIds) {
        const [sub] = await ctx.db.select().from(subscriptions)
          .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.orgId, ctx.orgId))).limit(1);
        if (!sub) continue;

        const [cust] = await ctx.db.select({ phone: customers.phone })
          .from(customers)
          .where(and(eq(customers.id, sub.customerId), eq(customers.orgId, ctx.orgId))).limit(1);

        if (sub.routerId) {
          await removeMikroTikUser(ctx.db, sub.routerId, sub.username).catch(() => {});
        }

        await ctx.db.transaction(async (tx: any) => {
          await deleteRadiusUser(tx, sub.username).catch(() => {});
          await tx.delete(radacct).where(eq(radacct.username, sub.username)).catch(() => {});
          await tx.delete(hotspotUsers)
            .where(and(eq(hotspotUsers.orgId, ctx.orgId), eq(hotspotUsers.name, sub.username)));
          await tx.delete(pppoeUsers)
            .where(and(eq(pppoeUsers.orgId, ctx.orgId), eq(pppoeUsers.name, sub.username)));
          await tx.delete(subscriptions).where(eq(subscriptions.id, sub.id));

          const [remaining] = await tx.select({ count: sql<number>`count(*)` })
            .from(subscriptions)
            .where(eq(subscriptions.customerId, sub.customerId));
          if (Number(remaining?.count) === 0) {
            await tx.delete(deviceBindings).where(eq(deviceBindings.customerId, sub.customerId)).catch(() => {});
            await tx.delete(customers).where(and(eq(customers.id, sub.customerId), eq(customers.orgId, ctx.orgId)));
          }
        });

        if (cust?.phone) {
          await clearCustomerRedis(ctx.redis, ctx.orgId, cust.phone).catch(() => {});
        }

        await logActivity(ctx.db, ctx.orgId, ctx.user?.id, "user.deleted", "subscription", sub.id, { username: sub.username, bulk: true });
        success++;
      }
      return { ok: true, count: success };
    }),
});
