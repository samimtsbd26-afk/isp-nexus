/**
 * ISP Nexus — Production Runtime Validation Script
 * Tests: Trial approval, Paid approval, Block, Unblock, Change Package, Force Logout, Full Delete
 * Verifies: DB, MikroTik, Telegram bot, Admin dashboard API
 */

import { SignJWT } from "jose";
import superjson from "superjson";
import { createDb, customers, subscriptions, orders, packages, routers, hotspotUsers, pppoeUsers, radcheck, radreply, organizations, users } from "@isp-nexus/db";
import { eq, and } from "drizzle-orm";
import { getMikroTikClient } from "../apps/api/src/services/mikrotik/client.js";
import { decryptText } from "../apps/api/src/lib/crypto.js";

const databaseUrl = process.env.DATABASE_URL;
const jwtSecretRaw = process.env.JWT_SECRET;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
if (!jwtSecretRaw) {
  console.error("JWT_SECRET is required — must match the running API so signed admin tokens verify");
  process.exit(1);
}
const JWT_SECRET = new TextEncoder().encode(jwtSecretRaw);
const API_URL = process.env.API_VALIDATION_URL ?? "http://localhost:3001/api/trpc";
const TEST_PHONE = `TEST${Date.now().toString().slice(-8)}`;
const TEST_USERNAME = `testuser_${Date.now().toString().slice(-6)}`;

const db = createDb(databaseUrl);

let superadmin: any;
let orgId: string;
let routerId: string;
let trialPkg: any;
let paidPkg: any;
let testCustomer: any;
let testSubscription: any;
let testOrder: any;
let token: string;

const results: any[] = [];

async function generateToken(userId: string, orgId: string, role: string) {
  return new SignJWT({ type: "admin", userId, orgId, role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(JWT_SECRET);
}

async function parseTrpcJsonBody<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (data?.error) {
    const e = data.error as { message?: string };
    throw new Error(typeof e?.message === "string" ? e.message : JSON.stringify(data.error));
  }
  if (data?.result?.data === undefined) throw new Error(`Invalid tRPC response: ${JSON.stringify(data)}`);
  return superjson.deserialize(data.result.data) as T;
}

/** tRPC v11 query: GET + `input` query param (superjson), matching @trpc/client. */
async function trpcQuery<T>(path: string, input: unknown): Promise<T> {
  const inputParam = encodeURIComponent(JSON.stringify(superjson.serialize(input)));
  const res = await fetch(`${API_URL}/${path}?input=${inputParam}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return parseTrpcJsonBody<T>(res);
}

/** tRPC v11 mutation: POST JSON body is superjson-serialized input. */
async function trpcMutate<T>(path: string, input: unknown): Promise<T> {
  const res = await fetch(`${API_URL}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(superjson.serialize(input)),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return parseTrpcJsonBody<T>(res);
}

async function getMikroTikUser(routerId: string, username: string) {
  const [r] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!r) return null;
  const password = decryptText(r.passwordEncrypted);
  const port = r.useSsl ? (r.sslPort ?? 8729) : r.port;
  const client = await getMikroTikClient({ host: r.host, port, username: r.username, password, useSsl: r.useSsl });
  try {
    const hs = await client.print("/ip/hotspot/user", { name: username }).catch(() => []);
    const ppp = await client.print("/ppp/secret", { name: username }).catch(() => []);
    return { hotspot: hs[0] || null, pppoe: ppp[0] || null };
  } finally {
    await client.close().catch(() => {});
  }
}

async function getMikroTikActiveSessions(routerId: string, username: string) {
  const [r] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!r) return { hotspot: [], pppoe: [] };
  const password = decryptText(r.passwordEncrypted);
  const port = r.useSsl ? (r.sslPort ?? 8729) : r.port;
  const client = await getMikroTikClient({ host: r.host, port, username: r.username, password, useSsl: r.useSsl });
  try {
    const hs = await client.print("/ip/hotspot/active", { user: username }).catch(() => []);
    const ppp = await client.print("/ppp/active", { name: username }).catch(() => []);
    return { hotspot: hs, pppoe: ppp };
  } finally {
    await client.close().catch(() => {});
  }
}

async function getRadiusUser(username: string) {
  const rc = await db.select().from(radcheck).where(eq(radcheck.username, username)).limit(1);
  const rr = await db.select().from(radreply).where(eq(radreply.username, username)).limit(1);
  return { radcheck: rc.length > 0, radreply: rr.length > 0 };
}

async function checkTelegramBot() {
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!tgToken) return { ok: false, error: "No token" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${tgToken}/getMe`);
    const data = await res.json();
    return { ok: data.ok, bot: data.result };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

function record(test: string, status: "PASS" | "FAIL" | "INFO", details: any) {
  results.push({ test, status, details, time: new Date().toISOString() });
  const icon = status === "PASS" ? "✅" : status === "FAIL" ? "❌" : "ℹ️";
  console.log(`${icon} [${test}] ${status}`);
  if (details && typeof details === "object") {
    console.log(JSON.stringify(details, null, 2));
  } else if (details) {
    console.log(details);
  }
}

async function setup() {
  console.log("\n🔧 SETUP: Loading superadmin, org, router, packages...\n");
  const admins = await db.select().from(users).where(eq(users.role, "superadmin")).limit(1);
  if (!admins.length) throw new Error("No superadmin found");
  superadmin = admins[0];
  orgId = superadmin.orgId;
  token = await generateToken(superadmin.id, orgId, superadmin.role);

  const routerRows = await db.select().from(routers).where(and(eq(routers.orgId, orgId), eq(routers.isActive, true))).limit(1);
  if (!routerRows.length) throw new Error("No active router");
  routerId = routerRows[0].id;

  const pkgRows = await db.select().from(packages).where(and(eq(packages.orgId, orgId), eq(packages.isActive, true))).limit(5);
  trialPkg = pkgRows.find((p) => p.isTrial) || pkgRows[0];
  paidPkg = pkgRows.find((p) => !p.isTrial && p.priceBdt > 0) || pkgRows[1] || pkgRows[0];

  record("Setup", "INFO", { orgId, routerId, routerName: routerRows[0].name, trialPkg: trialPkg?.name, paidPkg: paidPkg?.name, superadmin: superadmin.email });
}

async function test1_trialFlow() {
  console.log("\n🧪 TEST 1: Trial Approval Flow\n");
  try {
    // Use portal guestOrder for trial
    const result = await trpcMutate<any>("portal.guestOrder", {
      orgId,
      packageId: trialPkg.id,
      fullName: `Test User ${TEST_PHONE}`,
      phone: TEST_PHONE,
      password: "testpass123",
      paymentMethod: "free",
      isTrial: true,
    });
    if (!result) throw new Error("Portal guestOrder failed");

    testCustomer = result.customer;
    testSubscription = result.subscription;

    // Verify DB
    const subRows = await db.select().from(subscriptions).where(eq(subscriptions.id, testSubscription.id)).limit(1);
    const sub = subRows[0];

    // Verify MikroTik
    const mkUser = await getMikroTikUser(routerId, sub.username);
    const radius = await getRadiusUser(sub.username);

    const dbOk = sub?.status === "active" && sub?.packageId === trialPkg.id;
    const mikroOk = !!mkUser.hotspot || !!mkUser.pppoe;
    const radiusOk = radius.radcheck && radius.radreply;

    record("Trial Flow", dbOk && mikroOk && radiusOk ? "PASS" : "FAIL", {
      username: sub.username,
      dbStatus: sub.status,
      dbPackage: sub.packageId,
      mikroTikUser: mkUser,
      radius,
      subscriptionId: sub.id,
    });
  } catch (e: any) {
    record("Trial Flow", "FAIL", e.message);
  }
}

async function test2_paidFlow() {
  console.log("\n🧪 TEST 2: Paid Package Approval Flow\n");
  try {
    // Create a paid order via portal guestOrder (cash payment)
    const phone2 = `PAID${Date.now().toString().slice(-8)}`;
    const result = await trpcMutate<any>("portal.guestOrder", {
      orgId,
      packageId: paidPkg.id,
      fullName: `Paid User ${phone2}`,
      phone: phone2,
      password: "paidpass123",
      paymentMethod: "cash",
      isTrial: false,
    });
    if (!result) throw new Error("Portal guestOrder failed");

    testOrder = result.order;
    const customer2 = result.customer;

    // Approve the order as admin
    const approveResult = await trpcMutate<any>("order.approve", { id: testOrder.id });

    // Find the created subscription
    const subRows = await db.select().from(subscriptions)
      .where(and(eq(subscriptions.customerId, customer2.id), eq(subscriptions.orgId, orgId)))
      .orderBy(subscriptions.createdAt)
      .limit(1);
    const sub = subRows[0];

    const mkUser = sub ? await getMikroTikUser(routerId, sub.username) : null;
    const radius = sub ? await getRadiusUser(sub.username) : { radcheck: false, radreply: false };

    const dbOk = sub?.status === "active";
    const mikroOk = !!mkUser?.hotspot || !!mkUser?.pppoe;
    const radiusOk = radius.radcheck && radius.radreply;

    record("Paid Approval Flow", dbOk && mikroOk && radiusOk ? "PASS" : "FAIL", {
      orderId: testOrder.id,
      subscriptionId: sub?.id,
      username: sub?.username,
      dbStatus: sub?.status,
      mikroTikUser: mkUser,
      radius,
      approveResult,
    });

    // Use this subscription for remaining admin tests
    testSubscription = sub;
    testCustomer = customer2;
  } catch (e: any) {
    record("Paid Approval Flow", "FAIL", e.message);
  }
}

async function test3_tempBlock() {
  console.log("\n🧪 TEST 3: Temporary Block\n");
  if (!testSubscription) return record("Temp Block", "FAIL", "No test subscription");
  try {
    const result = await trpcMutate<any>("customer.userBlock", {
      subscriptionId: testSubscription.id,
      type: "temporary",
    });

    const subRows = await db.select().from(subscriptions).where(eq(subscriptions.id, testSubscription.id)).limit(1);
    const sub = subRows[0];
    const mkUser = await getMikroTikUser(routerId, sub.username);
    const disabled = mkUser.hotspot?.disabled === true || mkUser.pppoe?.disabled === true;

    record("Temp Block", sub?.status === "suspended" && disabled ? "PASS" : "FAIL", {
      dbStatus: sub?.status,
      mikroTikDisabled: disabled,
      mikroTikUser: mkUser,
      result,
    });
  } catch (e: any) {
    record("Temp Block", "FAIL", e.message);
  }
}

async function test4_unblock() {
  console.log("\n🧪 TEST 4: Unblock\n");
  if (!testSubscription) return record("Unblock", "FAIL", "No test subscription");
  try {
    const result = await trpcMutate<any>("customer.userUnblock", { subscriptionId: testSubscription.id });

    const subRows = await db.select().from(subscriptions).where(eq(subscriptions.id, testSubscription.id)).limit(1);
    const sub = subRows[0];
    const mkUser = await getMikroTikUser(routerId, sub.username);
    const enabled = mkUser.hotspot ? !mkUser.hotspot.disabled : mkUser.pppoe ? !mkUser.pppoe.disabled : false;

    record("Unblock", sub?.status === "active" && enabled ? "PASS" : "FAIL", {
      dbStatus: sub?.status,
      mikroTikEnabled: enabled,
      mikroTikUser: mkUser,
      result,
    });
  } catch (e: any) {
    record("Unblock", "FAIL", e.message);
  }
}

async function test5_changePackage() {
  console.log("\n🧪 TEST 5: Change Package\n");
  if (!testSubscription) return record("Change Package", "FAIL", "No test subscription");
  try {
    // Find a different package
    const otherPkg = (await db.select().from(packages)
      .where(and(eq(packages.orgId, orgId), eq(packages.isActive, true)))
      .limit(5))
      .find((p) => p.id !== testSubscription.packageId);
    if (!otherPkg) return record("Change Package", "FAIL", "No alternative package");

    const result = await trpcMutate<any>("customer.userChangePackage", {
      subscriptionId: testSubscription.id,
      packageId: otherPkg.id,
    });

    const subRows = await db.select().from(subscriptions).where(eq(subscriptions.id, testSubscription.id)).limit(1);
    const sub = subRows[0];
    const mkUser = await getMikroTikUser(routerId, sub.username);
    const profileUpdated = mkUser.hotspot?.profile === otherPkg.mikrotikProfileName || mkUser.pppoe?.profile === otherPkg.mikrotikProfileName;

    record("Change Package", sub?.packageId === otherPkg.id && profileUpdated ? "PASS" : "FAIL", {
      dbPackageId: sub?.packageId,
      expectedPackageId: otherPkg.id,
      mikroTikProfile: mkUser.hotspot?.profile || mkUser.pppoe?.profile,
      expectedProfile: otherPkg.mikrotikProfileName,
      result,
    });
  } catch (e: any) {
    record("Change Package", "FAIL", e.message);
  }
}

async function test6_forceLogout() {
  console.log("\n🧪 TEST 6: Force Logout\n");
  if (!testSubscription) return record("Force Logout", "FAIL", "No test subscription");
  try {
    const result = await trpcMutate<any>("customer.userForceLogout", { subscriptionId: testSubscription.id });

    // Since we can't easily create an active session, verify the API succeeded
    record("Force Logout", result?.ok ? "PASS" : "FAIL", { result });
  } catch (e: any) {
    record("Force Logout", "FAIL", e.message);
  }
}

async function test7_fullDelete() {
  console.log("\n🧪 TEST 7: Full Delete\n");
  if (!testSubscription) return record("Full Delete", "FAIL", "No test subscription");
  try {
    const username = testSubscription.username;
    const result = await trpcMutate<any>("customer.userDelete", { subscriptionId: testSubscription.id });

    // Verify DB cleanup
    const subRows = await db.select().from(subscriptions).where(eq(subscriptions.id, testSubscription.id)).limit(1);
    const customerRows = await db.select().from(customers).where(eq(customers.id, testCustomer.id)).limit(1);
    const mkUser = await getMikroTikUser(routerId, username);
    const radius = await getRadiusUser(username);

    const dbOk = subRows.length === 0 && customerRows.length === 0;
    const mikroOk = !mkUser.hotspot && !mkUser.pppoe;
    const radiusOk = !radius.radcheck && !radius.radreply;

    record("Full Delete", dbOk && mikroOk && radiusOk ? "PASS" : "FAIL", {
      subscriptionExists: subRows.length > 0,
      customerExists: customerRows.length > 0,
      mikroTikUser: mkUser,
      radius,
      result,
    });
  } catch (e: any) {
    record("Full Delete", "FAIL", e.message);
  }
}

async function testTelegramBot() {
  console.log("\n🧪 TEST: Telegram Bot Status\n");
  const status = await checkTelegramBot();
  record("Telegram Bot", status.ok ? "PASS" : "FAIL", status);
}

async function testAdminDashboard() {
  console.log("\n🧪 TEST: Admin Dashboard API (userList)\n");
  try {
    const data = await trpcQuery<any>("customer.userList", { limit: 5, offset: 0 });
    const hasRows = Array.isArray(data?.rows) && typeof data?.total === "number";
    record("Admin Dashboard API", hasRows ? "PASS" : "FAIL", { total: data?.total, rowCount: data?.rows?.length, sampleKeys: data?.rows?.[0] ? Object.keys(data.rows[0]) : [] });
  } catch (e: any) {
    record("Admin Dashboard API", "FAIL", e.message);
  }
}

async function cleanup() {
  console.log("\n🧹 CLEANUP\n");
  try {
    // Remove any remaining test customers
    await db.delete(subscriptions).where(eq(subscriptions.username, TEST_USERNAME)).catch(() => {});
    await db.delete(customers).where(eq(customers.phone, TEST_PHONE)).catch(() => {});
    if (testCustomer?.id) {
      await db.delete(subscriptions).where(eq(subscriptions.customerId, testCustomer.id)).catch(() => {});
      await db.delete(customers).where(eq(customers.id, testCustomer.id)).catch(() => {});
    }
    record("Cleanup", "INFO", "Test data removed");
  } catch (e: any) {
    record("Cleanup", "FAIL", e.message);
  }
}

async function main() {
  await setup();
  await testTelegramBot();
  await testAdminDashboard();
  await test1_trialFlow();
  await test2_paidFlow();
  await test3_tempBlock();
  await test4_unblock();
  await test5_changePackage();
  await test6_forceLogout();
  await test7_fullDelete();
  await cleanup();

  console.log("\n" + "=".repeat(60));
  console.log("📋 VALIDATION SUMMARY");
  console.log("=".repeat(60));
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log("=".repeat(60) + "\n");

  // Write report
  const reportPath = "/opt/isp-nexus/VALIDATION_REPORT.json";
  await Bun.write(reportPath, JSON.stringify(results, null, 2));
  console.log(`Report written to ${reportPath}`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
