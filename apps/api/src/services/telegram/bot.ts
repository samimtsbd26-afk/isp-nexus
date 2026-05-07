import { Bot } from "grammy";
import { and, eq, sql, gte, lte } from "drizzle-orm";
import {
  createDb,
  customers,
  orders,
  packages,
  radcheck,
  radreply,
  routers,
  subscriptions,
  telegramConfigs,
  users,
} from "@isp-nexus/db";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";
import { decryptText, encryptText } from "../../lib/crypto.js";
import { getMikroTikClient, type MikroTikApi } from "../mikrotik/client.js";

let botInstance: Bot | null = null;
const db = createDb(env.DATABASE_URL);

export function getBot(): Bot | null {
  return botInstance;
}

export async function initBot(): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) { logger.warn("TELEGRAM_BOT_TOKEN not set — bot disabled"); return; }
  await syncConfiguredTelegramAdmins();
  botInstance = new Bot(env.TELEGRAM_BOT_TOKEN);

  botInstance.command("start", (ctx) => ctx.reply(
    "👋 *Welcome to SKYNITY ISP Nexus!*\n\n" +
    "📊 Stats Commands:\n" +
    "/stats — Overall ISP stats\n/revenue — Revenue summary\n/new_users — New user counts\n/trials — Trial users\n/payments — Recent payments\n/router_status — Router health\n\n" +
    "👤 User Commands:\n" +
    "/user <name> <speed> <days> <devices>\n/disable <user>\n/enable <user>\n/delete <user>\n/extend <user> <days>\n\n" +
    "/help — Full command list", { parse_mode: "Markdown" }
  ));

  botInstance.command("help", (ctx) => ctx.reply(
    "📋 *SKYNITY ISP Commands*\n\n" +
    "📊 *Admin Stats:*\n/stats — ISP overview\n/revenue — Revenue\n/new\\_users — New customers\n/trials — Trial users\n/payments — Recent payments\n/router\\_status — Router health\n\n" +
    "👤 *User Management:*\n/user \\<name\\> \\<speed\\> \\<days\\> \\<devices\\>\n/disable \\<user\\>\n/enable \\<user\\>\n/delete \\<user\\>\n/extend \\<user\\> \\<days\\>",
    { parse_mode: "MarkdownV2" }
  ));

  botInstance.command("stats", async (ctx) => {
    try {
      const admin = await requireTelegramAdmin(String(ctx.from?.id ?? ""));
      const { orgId } = admin;
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const [totalCust] = await db.select({ n: sql<number>`count(*)` }).from(customers).where(eq(customers.orgId, orgId));
      const [activeSubs] = await db.select({ n: sql<number>`count(*)` }).from(subscriptions).where(and(eq(subscriptions.orgId, orgId), eq(subscriptions.status, "active")));
      const [trialSubs] = await db.select({ n: sql<number>`count(*)` }).from(subscriptions).innerJoin(packages, eq(subscriptions.packageId, packages.id)).where(and(eq(subscriptions.orgId, orgId), eq(subscriptions.status, "active"), eq(packages.isTrial, true)));
      const [pendingOrds] = await db.select({ n: sql<number>`count(*)` }).from(orders).where(and(eq(orders.orgId, orgId), eq(orders.status, "pending")));
      const [monthRev] = await db.select({ total: sql<number>`coalesce(sum(amount_bdt),0)` }).from(orders).where(and(eq(orders.orgId, orgId), eq(orders.status, "approved"), gte(orders.createdAt, monthStart)));
      const routerList = await db.select({ name: routers.name, isActive: routers.isActive, cpuLoad: routers.cpuLoad }).from(routers).where(eq(routers.orgId, orgId));
      const onlineRouters = routerList.filter((r) => r.isActive).length;
      await ctx.reply(
        `📊 *ISP Stats — ${now.toLocaleDateString("en-BD")}*\n\n` +
        `👥 Customers: *${Number(totalCust?.n ?? 0).toLocaleString()}*\n` +
        `✅ Active Subs: *${Number(activeSubs?.n ?? 0).toLocaleString()}*\n` +
        `🎁 Trials Active: *${Number(trialSubs?.n ?? 0).toLocaleString()}*\n` +
        `📦 Pending Orders: *${Number(pendingOrds?.n ?? 0).toLocaleString()}*\n` +
        `💰 Month Revenue: *৳${Number(monthRev?.total ?? 0).toLocaleString()}*\n` +
        `📡 Routers Online: *${onlineRouters}/${routerList.length}*`,
        { parse_mode: "Markdown" },
      );
    } catch (err) { await ctx.reply(errorMessage(err)); }
  });

  botInstance.command("revenue", async (ctx) => {
    try {
      const admin = await requireTelegramAdmin(String(ctx.from?.id ?? ""));
      const { orgId } = admin;
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const weekStart = new Date(now.getTime() - 7 * 86400000);
      const [todayRev] = await db.select({ total: sql<number>`coalesce(sum(amount_bdt),0)` }).from(orders).where(and(eq(orders.orgId, orgId), eq(orders.status, "approved"), gte(orders.createdAt, todayStart)));
      const [weekRev] = await db.select({ total: sql<number>`coalesce(sum(amount_bdt),0)` }).from(orders).where(and(eq(orders.orgId, orgId), eq(orders.status, "approved"), gte(orders.createdAt, weekStart)));
      const [monthRev] = await db.select({ total: sql<number>`coalesce(sum(amount_bdt),0)` }).from(orders).where(and(eq(orders.orgId, orgId), eq(orders.status, "approved"), gte(orders.createdAt, monthStart)));
      const [totalRev] = await db.select({ total: sql<number>`coalesce(sum(amount_bdt),0)` }).from(orders).where(and(eq(orders.orgId, orgId), eq(orders.status, "approved")));
      await ctx.reply(
        `💰 *Revenue Summary*\n\n` +
        `Today: *৳${Number(todayRev?.total ?? 0).toLocaleString()}*\n` +
        `This Week: *৳${Number(weekRev?.total ?? 0).toLocaleString()}*\n` +
        `This Month: *৳${Number(monthRev?.total ?? 0).toLocaleString()}*\n` +
        `All Time: *৳${Number(totalRev?.total ?? 0).toLocaleString()}*`,
        { parse_mode: "Markdown" },
      );
    } catch (err) { await ctx.reply(errorMessage(err)); }
  });

  botInstance.command("new_users", async (ctx) => {
    try {
      const admin = await requireTelegramAdmin(String(ctx.from?.id ?? ""));
      const { orgId } = admin;
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(now.getTime() - 7 * 86400000);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const [todayN] = await db.select({ n: sql<number>`count(*)` }).from(customers).where(and(eq(customers.orgId, orgId), gte(customers.createdAt, todayStart)));
      const [weekN] = await db.select({ n: sql<number>`count(*)` }).from(customers).where(and(eq(customers.orgId, orgId), gte(customers.createdAt, weekStart)));
      const [monthN] = await db.select({ n: sql<number>`count(*)` }).from(customers).where(and(eq(customers.orgId, orgId), gte(customers.createdAt, monthStart)));
      const [totalN] = await db.select({ n: sql<number>`count(*)` }).from(customers).where(eq(customers.orgId, orgId));
      await ctx.reply(
        `👥 *New Customers*\n\nToday: *${Number(todayN?.n ?? 0)}*\nThis Week: *${Number(weekN?.n ?? 0)}*\nThis Month: *${Number(monthN?.n ?? 0)}*\nTotal: *${Number(totalN?.n ?? 0)}*`,
        { parse_mode: "Markdown" },
      );
    } catch (err) { await ctx.reply(errorMessage(err)); }
  });

  botInstance.command("trials", async (ctx) => {
    try {
      const admin = await requireTelegramAdmin(String(ctx.from?.id ?? ""));
      const { orgId } = admin;
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 86400000);
      const [activeTrials] = await db.select({ n: sql<number>`count(*)` }).from(subscriptions).innerJoin(packages, eq(subscriptions.packageId, packages.id)).where(and(eq(subscriptions.orgId, orgId), eq(subscriptions.status, "active"), eq(packages.isTrial, true)));
      const [expiringToday] = await db.select({ n: sql<number>`count(*)` }).from(subscriptions).innerJoin(packages, eq(subscriptions.packageId, packages.id)).where(and(eq(subscriptions.orgId, orgId), eq(subscriptions.status, "active"), eq(packages.isTrial, true), lte(subscriptions.expiresAt, tomorrow)));
      const [expired] = await db.select({ n: sql<number>`count(*)` }).from(subscriptions).innerJoin(packages, eq(subscriptions.packageId, packages.id)).where(and(eq(subscriptions.orgId, orgId), eq(subscriptions.status, "expired"), eq(packages.isTrial, true)));
      await ctx.reply(
        `🎁 *Trial Users*\n\nActive: *${Number(activeTrials?.n ?? 0)}*\nExpiring Today: *${Number(expiringToday?.n ?? 0)}*\nExpired (not renewed): *${Number(expired?.n ?? 0)}*`,
        { parse_mode: "Markdown" },
      );
    } catch (err) { await ctx.reply(errorMessage(err)); }
  });

  botInstance.command("payments", async (ctx) => {
    try {
      const admin = await requireTelegramAdmin(String(ctx.from?.id ?? ""));
      const { orgId } = admin;
      const recent = await db.select({
        id: orders.id, amountBdt: orders.amountBdt, status: orders.status,
        paymentMethod: orders.paymentMethod, trxId: orders.trxId, createdAt: orders.createdAt,
        customerPhone: customers.phone,
      }).from(orders).innerJoin(customers, eq(orders.customerId, customers.id))
        .where(and(eq(orders.orgId, orgId), eq(orders.status, "approved")))
        .orderBy(sql`orders.created_at desc`).limit(8);
      if (!recent.length) { await ctx.reply("No approved payments yet."); return; }
      const lines = recent.map((o) =>
        `• ৳${o.amountBdt} · ${o.paymentMethod ?? "—"} · ${o.customerPhone ?? "?"}`
      ).join("\n");
      await ctx.reply(`💳 *Recent Payments*\n\n${lines}`, { parse_mode: "Markdown" });
    } catch (err) { await ctx.reply(errorMessage(err)); }
  });

  botInstance.command("router_status", async (ctx) => {
    try {
      const admin = await requireTelegramAdmin(String(ctx.from?.id ?? ""));
      const routerList = await db.select({ name: routers.name, host: routers.host, isActive: routers.isActive, cpuLoad: routers.cpuLoad, freeMemoryMb: routers.freeMemoryMb, temperatureCelsius: routers.temperatureCelsius, lastSeenAt: routers.lastSeenAt }).from(routers).where(eq(routers.orgId, admin.orgId));
      if (!routerList.length) { await ctx.reply("No routers configured."); return; }
      const lines = routerList.map((r) => {
        const status = r.isActive ? "✅ Online" : "❌ Offline";
        const cpu = r.cpuLoad != null ? ` CPU: ${r.cpuLoad}%` : "";
        const temp = r.temperatureCelsius != null ? ` Temp: ${Math.round(r.temperatureCelsius)}°C` : "";
        return `${status} *${r.name}* (${r.host})${cpu}${temp}`;
      }).join("\n");
      await ctx.reply(`📡 *Router Status*\n\n${lines}`, { parse_mode: "Markdown" });
    } catch (err) { await ctx.reply(errorMessage(err)); }
  });

  botInstance.command("status", async (ctx) => {
    await ctx.reply("Use /router\\_status for router health, or /stats for ISP overview.", { parse_mode: "MarkdownV2" });
  });

  botInstance.command("pending", async (ctx) => {
    try {
      const admin = await requireTelegramAdmin(String(ctx.from?.id ?? ""));
      const pending = await db.select({ id: orders.id, amountBdt: orders.amountBdt, paymentMethod: orders.paymentMethod, trxId: orders.trxId, customerPhone: customers.phone, createdAt: orders.createdAt })
        .from(orders).innerJoin(customers, eq(orders.customerId, customers.id))
        .where(and(eq(orders.orgId, admin.orgId), eq(orders.status, "pending")))
        .orderBy(sql`orders.created_at desc`).limit(10);
      if (!pending.length) { await ctx.reply("No pending orders! ✅"); return; }
      const lines = pending.map((o, i) => `${i + 1}. ৳${o.amountBdt} · ${o.paymentMethod ?? "?"} · ${o.customerPhone} · TRX: ${o.trxId ?? "—"}`).join("\n");
      await ctx.reply(`📦 *${pending.length} Pending Orders*\n\n${lines}\n\nGo to admin panel to approve.`, { parse_mode: "Markdown" });
    } catch (err) { await ctx.reply(errorMessage(err)); }
  });

  botInstance.command("user", async (ctx) => {
    try {
      const admin = await requireTelegramAdmin(String(ctx.from?.id ?? ""));
      const parsed = parseUserCommand(ctx.match);
      const result = await provisionHotspotUser(admin, parsed);
      await ctx.reply([
        "User Created Successfully",
        `Name: ${result.name}`,
        `Speed: ${result.speed}`,
        `Expiry: ${result.days} Days`,
        `Devices: ${result.devices}`,
      ].join("\n"));
    } catch (err) {
      logger.warn({ err }, "Telegram /user failed");
      await ctx.reply(errorMessage(err));
    }
  });

  botInstance.command("disable", async (ctx) => {
    await handleUserStateCommand(ctx, "disable", ctx.match);
  });

  botInstance.command("enable", async (ctx) => {
    await handleUserStateCommand(ctx, "enable", ctx.match);
  });

  botInstance.command("delete", async (ctx) => {
    await handleUserStateCommand(ctx, "delete", ctx.match);
  });

  botInstance.command("extend", async (ctx) => {
    try {
      const admin = await requireTelegramAdmin(String(ctx.from?.id ?? ""));
      const [username, daysRaw] = String(ctx.match ?? "").trim().split(/\s+/);
      const days = parseDays(daysRaw);
      if (!username || !days) throw new Error("Usage: /extend <user> <days>");
      const expiresAt = await extendHotspotUser(admin.orgId, username, days);
      await ctx.reply(`User Extended\nName: ${username}\nExpiry: ${expiresAt.toISOString().slice(0, 10)}`);
    } catch (err) {
      logger.warn({ err }, "Telegram /extend failed");
      await ctx.reply(errorMessage(err));
    }
  });

  botInstance.catch((err) => logger.error({ err }, "Telegram bot error"));

  await botInstance.start({ onStart: () => logger.info("Telegram bot started") });
}

export async function stopBot(): Promise<void> {
  if (botInstance) { await botInstance.stop(); botInstance = null; }
}

export async function sendAlert(chatId: string, message: string): Promise<void> {
  if (!botInstance) return;
  try { await botInstance.api.sendMessage(chatId, message, { parse_mode: "Markdown" }); }
  catch (err) { logger.error({ err, chatId }, "Failed to send Telegram alert"); }
}

export async function sendOrderNotification(chatId: string, order: any, customer: any, pkg: any): Promise<void> {
  if (!botInstance) return;
  const message = [
    `🛒 *New Order*`,
    ``,
    `Package: ${pkg?.name ?? "N/A"}`,
    `Amount: ${order?.amountBdt ?? 0} BDT`,
    `Method: ${order?.paymentMethod ?? "N/A"}`,
    `Customer: ${customer?.fullName ?? "N/A"}`,
    `Phone: ${customer?.phone ?? "N/A"}`,
  ].join("\n");
  try { await botInstance.api.sendMessage(chatId, message, { parse_mode: "Markdown" }); }
  catch (err) { logger.error({ err, chatId }, "Failed to send order notification"); }
}

export async function sendApprovalNotification(chatId: string, customer: any, pkg: any): Promise<void> {
  if (!botInstance) return;
  const message = [
    `✅ *Order Approved*`,
    ``,
    `Customer: ${customer?.fullName ?? "N/A"}`,
    `Phone: ${customer?.phone ?? "N/A"}`,
    `Package: ${pkg?.name ?? "N/A"}`,
    `Amount: ৳${pkg?.priceBdt ?? 0}`,
  ].join("\n");
  try { await botInstance.api.sendMessage(chatId, message, { parse_mode: "Markdown" }); }
  catch (err) { logger.error({ err, chatId }, "Failed to send approval notification"); }
}

export async function sendExpiryAlert(chatId: string, customerName: string, packageName: string, daysLeft: number, portalUrl?: string): Promise<void> {
  if (!botInstance) return;
  const urgency = daysLeft === 0 ? "🚨" : daysLeft === 1 ? "⚠️" : "⏰";
  const timeLabel = daysLeft === 0 ? "expired today" : daysLeft === 1 ? "expires tomorrow" : `expires in ${daysLeft} days`;
  const lines = [
    `${urgency} *Package Expiry Alert*`,
    ``,
    `Customer: ${customerName}`,
    `Package: ${packageName}`,
    `Status: ${timeLabel}`,
  ];
  if (portalUrl) lines.push(`\nRenew: ${portalUrl}`);
  try { await botInstance.api.sendMessage(chatId, lines.join("\n"), { parse_mode: "Markdown" }); }
  catch (err) { logger.warn({ err, chatId }, "Failed to send expiry alert"); }
}

export async function sendLoginAlert(orgChatId: string, customerName: string, phone: string): Promise<void> {
  if (!botInstance) return;
  const message = `🔑 *Portal Login*\n\nCustomer: ${customerName}\nPhone: ${phone}\nTime: ${new Date().toLocaleString("en-BD")}`;
  try { await botInstance.api.sendMessage(orgChatId, message, { parse_mode: "Markdown" }); }
  catch (err) { logger.warn({ err }, "Failed to send login alert"); }
}

type TelegramAdmin = { id: string; orgId: string };
type UserCommand = { name: string; speed: string; days: number; devices: number };

async function requireTelegramAdmin(telegramId: string): Promise<TelegramAdmin> {
  if (!telegramId) throw new Error("Telegram admin is not linked");
  const [admin] = await db.select({ id: users.id, orgId: users.orgId }).from(users)
    .where(and(eq(users.telegramId, telegramId), eq(users.isActive, true)))
    .limit(1);
  if (!admin) throw new Error("Unauthorized Telegram admin");
  return admin;
}

export function parseUserCommand(input: unknown): UserCommand {
  const [name, speed, daysRaw, devicesRaw] = String(input ?? "").trim().split(/\s+/);
  if (!name || !speed || !daysRaw || !devicesRaw) {
    throw new Error("Usage: /user <name> <speed> <days> <devices>");
  }
  if (!/^[A-Za-z0-9_.-]{2,64}$/.test(name)) throw new Error("Invalid username");
  if (!/^\d+[kKmMgG]\/\d+[kKmMgG]$/.test(speed)) throw new Error("Invalid speed. Example: 5M/5M");
  const days = parseDays(daysRaw);
  const devices = Number(devicesRaw.toUpperCase().replace("DEVICE", ""));
  if (!days) throw new Error("Invalid expiry. Example: 30D");
  if (!Number.isInteger(devices) || devices < 1 || devices > 100) throw new Error("Invalid device limit");
  return { name, speed: speed.toUpperCase(), days, devices };
}

function parseDays(value: string | undefined): number {
  const match = String(value ?? "").trim().toUpperCase().match(/^(\d+)(D|DAY|DAYS)?$/);
  if (!match) return 0;
  const days = Number(match[1]);
  return Number.isInteger(days) && days > 0 && days <= 3660 ? days : 0;
}

async function provisionHotspotUser(admin: TelegramAdmin, input: UserCommand) {
  const router = await getDefaultRouter(admin.orgId);
  const password = makePassword();
  const expiresAt = new Date(Date.now() + input.days * 24 * 60 * 60 * 1000);
  const profileName = profileNameFor(input.speed, input.devices);

  const [existingSub] = await db.select({ id: subscriptions.id }).from(subscriptions)
    .where(and(eq(subscriptions.orgId, admin.orgId), eq(subscriptions.username, input.name)))
    .limit(1);
  if (existingSub) throw new Error(`User already exists: ${input.name}`);
  await assertRadiusReady();

  const [customer] = await db.insert(customers).values({
    orgId: admin.orgId,
    customerCode: `TG-${Date.now().toString(36).toUpperCase()}`,
    fullName: input.name,
    phone: `tg-${input.name}`.slice(0, 20),
    telegramChatId: undefined,
    createdBy: admin.id,
    notes: `Telegram provisioned hotspot user. Speed ${input.speed}, devices ${input.devices}.`,
  }).returning();

  const pkg = await findOrCreateTelegramPackage(admin.orgId, input);
  const passwordEncrypted = encryptText(password);
  await db.insert(subscriptions).values({
    orgId: admin.orgId,
    customerId: customer.id,
    packageId: pkg.id,
    routerId: router.id,
    username: input.name,
    passwordEncrypted,
    status: "active",
    expiresAt,
    notes: `Provisioned from Telegram. Speed ${input.speed}, devices ${input.devices}.`,
  });

  await syncRadiusUser(input.name, password, input.speed, input.devices, input.days * 86400);
  const client = await connectRouter(router);
  try {
    await ensureHotspotProfile(client, profileName, input.speed, input.devices);
    await upsertHotspotUser(client, input.name, password, profileName, expiresAt, false);
  } finally {
    await client.close();
  }

  return input;
}

async function handleUserStateCommand(ctx: any, command: "disable" | "enable" | "delete", match: unknown) {
  try {
    const admin = await requireTelegramAdmin(String(ctx.from?.id ?? ""));
    const username = String(match ?? "").trim().split(/\s+/)[0];
    if (!username) throw new Error(`Usage: /${command} <user>`);
    await setHotspotUserState(admin.orgId, username, command);
    await ctx.reply(`User ${command === "enable" ? "Enabled" : command === "disable" ? "Disabled" : "Deleted"}\nName: ${username}`);
  } catch (err) {
    logger.warn({ err, command }, `Telegram /${command} failed`);
    await ctx.reply(errorMessage(err));
  }
}

async function getDefaultRouter(orgId: string) {
  const [router] = await db.select().from(routers)
    .where(and(eq(routers.orgId, orgId), eq(routers.isActive, true), eq(routers.isDefault, true)))
    .limit(1);
  if (!router) throw new Error("Default router not found");
  return router;
}

async function connectRouter(router: typeof routers.$inferSelect): Promise<MikroTikApi> {
  const password = decryptText(router.passwordEncrypted);
  const port = router.useSsl ? router.sslPort : router.port;
  return getMikroTikClient({ host: router.host, port, username: router.username, password, useSsl: router.useSsl });
}

async function findOrCreateTelegramPackage(orgId: string, input: UserCommand) {
  const name = `Telegram ${input.speed} ${input.days}D ${input.devices}DEVICE`;
  const [existing] = await db.select().from(packages)
    .where(and(eq(packages.orgId, orgId), eq(packages.name, name)))
    .limit(1);
  if (existing) return existing;
  const [downloadRaw, uploadRaw] = input.speed.split("/");
  const [pkg] = await db.insert(packages).values({
    orgId,
    name,
    type: "hotspot",
    downloadMbps: speedToMbps(downloadRaw),
    uploadMbps: speedToMbps(uploadRaw),
    priceBdt: 0,
    validityDays: input.days,
    radiusGroupName: profileNameFor(input.speed, input.devices),
    mikrotikProfileName: profileNameFor(input.speed, input.devices),
    description: "Created automatically by Telegram provisioning",
    isActive: true,
  }).returning();
  return pkg;
}

async function syncRadiusUser(username: string, password: string, speed: string, devices: number, seconds: number) {
  await db.delete(radcheck).where(eq(radcheck.username, username));
  await db.delete(radreply).where(eq(radreply.username, username));
  await db.insert(radcheck).values([
    { username, attribute: "Cleartext-Password", op: ":=", value: password },
    { username, attribute: "Simultaneous-Use", op: ":=", value: String(devices) },
  ]);
  await db.insert(radreply).values([
    { username, attribute: "Mikrotik-Rate-Limit", op: "=", value: speed },
    { username, attribute: "Session-Timeout", op: "=", value: String(seconds) },
  ]);
}

async function assertRadiusReady() {
  try {
    await db.execute(sql`select 1 from radcheck limit 0`);
    await db.execute(sql`select 1 from radreply limit 0`);
  } catch (err) {
    logger.error({ err }, "RADIUS tables are unavailable");
    throw new Error("RADIUS tables are unavailable");
  }
}

async function ensureHotspotProfile(client: MikroTikApi, name: string, speed: string, devices: number) {
  const [profile] = await client.print("/ip/hotspot/user/profile", { name });
  const data = { name, "rate-limit": speed, "shared-users": String(devices) };
  if (profile?.[".id"]) {
    await client.exec("/ip/hotspot/user/profile", "set", { numbers: profile[".id"], ...data });
    return;
  }
  await client.add("/ip/hotspot/user/profile", data);
}

async function upsertHotspotUser(client: MikroTikApi, username: string, password: string, profile: string, expiresAt: Date, disabled: boolean) {
  const comment = `isp-nexus telegram expiry=${expiresAt.toISOString()}`;
  const [user] = await client.print("/ip/hotspot/user", { name: username });
  const data = { name: username, password, profile, disabled: disabled ? "yes" : "no", comment };
  if (user?.[".id"]) {
    await client.exec("/ip/hotspot/user", "set", { numbers: user[".id"], ...data });
    return;
  }
  await client.add("/ip/hotspot/user", data);
}

async function setHotspotUserState(orgId: string, username: string, command: "disable" | "enable" | "delete") {
  const [subscription] = await db.select().from(subscriptions)
    .where(and(eq(subscriptions.orgId, orgId), eq(subscriptions.username, username)))
    .limit(1);
  if (!subscription) throw new Error(`User not found: ${username}`);
  const router = subscription.routerId
    ? (await db.select().from(routers).where(and(eq(routers.orgId, orgId), eq(routers.id, subscription.routerId))).limit(1))[0]
    : await getDefaultRouter(orgId);
  if (!router) throw new Error("Router not found");

  const client = await connectRouter(router);
  try {
    const [user] = await client.print("/ip/hotspot/user", { name: username });
    if (user?.[".id"]) {
      if (command === "delete") await client.remove("/ip/hotspot/user", user[".id"]);
      else await client.exec("/ip/hotspot/user", "set", { numbers: user[".id"], disabled: command === "disable" ? "yes" : "no" });
    }
  } finally {
    await client.close();
  }

  if (command === "delete") {
    await db.delete(radcheck).where(eq(radcheck.username, username));
    await db.delete(radreply).where(eq(radreply.username, username));
    await db.update(subscriptions).set({ status: "cancelled", updatedAt: new Date() })
      .where(and(eq(subscriptions.orgId, orgId), eq(subscriptions.username, username)));
  } else {
    await db.update(subscriptions).set({ status: command === "disable" ? "suspended" : "active", updatedAt: new Date() })
      .where(and(eq(subscriptions.orgId, orgId), eq(subscriptions.username, username)));
  }
}

async function extendHotspotUser(orgId: string, username: string, days: number) {
  const [subscription] = await db.select().from(subscriptions)
    .where(and(eq(subscriptions.orgId, orgId), eq(subscriptions.username, username)))
    .limit(1);
  if (!subscription) throw new Error(`User not found: ${username}`);
  const base = subscription.expiresAt && subscription.expiresAt > new Date() ? subscription.expiresAt : new Date();
  const expiresAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  await db.update(subscriptions).set({ expiresAt, status: "active", updatedAt: new Date() })
    .where(and(eq(subscriptions.orgId, orgId), eq(subscriptions.username, username)));
  return expiresAt;
}

function profileNameFor(speed: string, devices: number): string {
  return `tg_${speed}_${devices}dev`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
}

function speedToMbps(speed: string): number {
  const match = speed.toUpperCase().match(/^(\d+)([KMG])$/);
  if (!match) return 1;
  const value = Number(match[1]);
  if (match[2] === "K") return Math.max(1, Math.ceil(value / 1024));
  if (match[2] === "G") return value * 1024;
  return value;
}

function makePassword(): string {
  return Math.random().toString(36).slice(2, 10);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Command failed";
}

async function syncConfiguredTelegramAdmins() {
  const ids = (env.TELEGRAM_ADMIN_CHAT_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (!ids.length) return;
  const [primaryAdmin] = await db.select({ id: users.id, orgId: users.orgId }).from(users)
    .where(and(eq(users.isActive, true), eq(users.role, "superadmin")))
    .limit(1);
  if (!primaryAdmin) return;
  await db.update(users).set({ telegramId: ids[0], updatedAt: new Date() }).where(eq(users.id, primaryAdmin.id));
  const [existingConfig] = await db.select({ id: telegramConfigs.id }).from(telegramConfigs)
    .where(and(eq(telegramConfigs.orgId, primaryAdmin.orgId), eq(telegramConfigs.chatId, ids[0])))
    .limit(1);
  if (!existingConfig) {
    await db.insert(telegramConfigs).values({ orgId: primaryAdmin.orgId, chatId: ids[0], alertsEnabled: true });
  }
}
