/**
 * ISP Nexus Production Runtime Validation
 * Run: docker exec -i isp-nexus-api-1 node /app/apps/api/validation.mjs
 */

import { SignJWT } from "jose";
import postgres from "postgres";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
const API_URL = "http://localhost:3001/api/trpc";
const DB_URL = process.env.DATABASE_URL;

const sql = postgres(DB_URL);

const SUPERADMIN_ID = "3b3cf4d5-90dc-432b-b95c-40f2579ef0ce";
const ORG_ID = "212d7393-7375-4321-93f5-4789deb8b317";

const TEST_PHONE = `TEST${Date.now().toString().slice(-8)}`;
const TEST_PHONE_PAID = `PAID${Date.now().toString().slice(-8)}`;

let token;
let routerId;
let trialPkgId;
let paidPkgId;
let testCustomerId;
let testSubscriptionId;
let testOrderId;
let testUsername;

const results = [];

function record(test, status, details) {
  results.push({ test, status, details, time: new Date().toISOString() });
  const icon = status === "PASS" ? "✅" : status === "FAIL" ? "❌" : "ℹ️";
  console.log(`\n${icon} [${test}] ${status}`);
  if (details) console.log(typeof details === "object" ? JSON.stringify(details, null, 2) : details);
}

async function generateToken() {
  token = await new SignJWT({ type: "admin", userId: SUPERADMIN_ID, orgId: ORG_ID, role: "superadmin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(JWT_SECRET);
}

async function trpcQuery(path, input) {
  const url = `${API_URL}/${path}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function trpcMutation(path, input) {
  const res = await fetch(`${API_URL}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ json: input }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function setup() {
  console.log("🔧 SETUP");
  await generateToken();
  const router = await sql`SELECT id, host, port, use_ssl, username, password_encrypted FROM routers WHERE org_id = ${ORG_ID} AND is_active = true LIMIT 1`;
  routerId = router[0]?.id;
  const pkgs = await sql`SELECT id, name, type, price_bdt, is_trial, validity_days, mikrotik_profile_name FROM packages WHERE org_id = ${ORG_ID} AND is_active = true LIMIT 5`;
  trialPkgId = pkgs.find((p) => p.is_trial)?.id;
  paidPkgId = pkgs.find((p) => !p.is_trial && p.price_bdt > 0)?.id || pkgs.find((p) => !p.is_trial)?.id;
  record("Setup", "INFO", { orgId: ORG_ID, routerId, routerHost: router[0]?.host, trialPkgId, paidPkgId });
}

async function testTelegram() {
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  try {
    const res = await fetch(`https://api.telegram.org/bot${tgToken}/getMe`);
    const data = await res.json();
    record("Telegram Bot", data.ok ? "PASS" : "FAIL", data.result);
  } catch (e) {
    record("Telegram Bot", "FAIL", e.message);
  }
}

async function testAdminApi() {
  try {
    const data = await trpcQuery("customer.userList", { limit: 2, offset: 0 });
    const result = data?.result?.data?.json;
    record("Admin Dashboard API", Array.isArray(result?.rows) && typeof result?.total === "number" ? "PASS" : "FAIL", {
      total: result?.total,
      rowCount: result?.rows?.length,
    });
  } catch (e) {
    record("Admin Dashboard API", "FAIL", e.message);
  }
}

async function getRadiusUser(username) {
  const rc = await sql`SELECT 1 FROM radcheck WHERE username = ${username} LIMIT 1`;
  const rr = await sql`SELECT 1 FROM radreply WHERE username = ${username} LIMIT 1`;
  return { radcheck: rc.length > 0, radreply: rr.length > 0 };
}

async function checkMikroTikUser(username) {
  try {
    const data = await trpcQuery("mikrotik.getHotspotUsers", { routerId });
    const hsUsers = data?.result?.data?.json || [];
    const data2 = await trpcQuery("mikrotik.getPppoeUsers", { routerId });
    const pppUsers = data2?.result?.data?.json || [];
    const hs = hsUsers.find((u) => u.name === username);
    const ppp = pppUsers.find((u) => u.name === username);
    return { hotspot: hs || null, pppoe: ppp || null };
  } catch (e) {
    return { hotspot: null, pppoe: null, error: e.message };
  }
}

async function test1_trial() {
  console.log("\n🧪 TEST 1: Trial Approval Flow");
  try {
    const data = await trpcMutation("portal.guestOrder", {
      orgId: ORG_ID,
      packageId: trialPkgId,
      fullName: `Test User ${TEST_PHONE}`,
      phone: TEST_PHONE,
      password: "testpass123",
      paymentMethod: "free",
      isTrial: true,
    });
    const result = data?.result?.data?.json;
    if (!result) throw new Error(`guestOrder failed: ${JSON.stringify(data)}`);

    testCustomerId = result.customer?.id;
    // For trial, subscription is created directly by guestOrder
    const subRows = await sql`SELECT * FROM subscriptions WHERE customer_id = ${testCustomerId} AND org_id = ${ORG_ID} ORDER BY created_at DESC LIMIT 1`;
    testSubscriptionId = subRows[0]?.id;
    testUsername = subRows[0]?.username;

    const radius = testUsername ? await getRadiusUser(testUsername) : { radcheck: false, radreply: false };
    const mkUser = testUsername ? await checkMikroTikUser(testUsername) : { hotspot: null, pppoe: null };

    const dbOk = subRows[0]?.status === "active";
    const mikroOk = !!mkUser.hotspot || !!mkUser.pppoe;
    const radiusOk = radius.radcheck && radius.radreply;

    record("Trial Flow", dbOk && mikroOk && radiusOk ? "PASS" : "FAIL", {
      username: testUsername,
      dbStatus: subRows[0]?.status,
      mikroTikUser: mkUser,
      radius,
      subscriptionId: testSubscriptionId,
    });
  } catch (e) {
    record("Trial Flow", "FAIL", e.message);
  }
}

async function test2_paid() {
  console.log("\n🧪 TEST 2: Paid Package Approval Flow");
  try {
    const data = await trpcMutation("portal.guestOrder", {
      orgId: ORG_ID,
      packageId: paidPkgId,
      fullName: `Paid User ${TEST_PHONE_PAID}`,
      phone: TEST_PHONE_PAID,
      password: "paidpass123",
      paymentMethod: "cash",
      isTrial: false,
    });
    const result = data?.result?.data?.json;
    if (!result) throw new Error(`guestOrder failed: ${JSON.stringify(data)}`);

    testOrderId = result.orderId;
    testCustomerId = result.customerId;

    const approveData = await trpcMutation("order.approve", { id: testOrderId });
    const approveResult = approveData?.result?.data?.json;

    const sub = await sql`SELECT * FROM subscriptions WHERE customer_id = ${testCustomerId} AND org_id = ${ORG_ID} ORDER BY created_at DESC LIMIT 1`;
    testSubscriptionId = sub[0]?.id;
    testUsername = sub[0]?.username;

    const radius = testUsername ? await getRadiusUser(testUsername) : { radcheck: false, radreply: false };
    const mkUser = testUsername ? await checkMikroTikUser(testUsername) : { hotspot: null, pppoe: null };
    const dbOk = sub[0]?.status === "active";
    const mikroOk = !!mkUser.hotspot || !!mkUser.pppoe;
    const radiusOk = radius.radcheck && radius.radreply;

    record("Paid Approval Flow", dbOk && mikroOk && radiusOk ? "PASS" : "FAIL", {
      orderId: testOrderId,
      subscriptionId: testSubscriptionId,
      username: testUsername,
      dbStatus: sub[0]?.status,
      mikroTikUser: mkUser,
      radius,
      approveResult,
    });
  } catch (e) {
    record("Paid Approval Flow", "FAIL", e.message);
  }
}

async function test3_block() {
  console.log("\n🧪 TEST 3: Temporary Block");
  if (!testSubscriptionId) return record("Temp Block", "FAIL", "No subscription");
  try {
    const data = await trpcMutation("customer.userBlock", { subscriptionId: testSubscriptionId, type: "temporary" });
    const result = data?.result?.data?.json;

    const sub = await sql`SELECT status FROM subscriptions WHERE id = ${testSubscriptionId} LIMIT 1`;
    const mkUser = await checkMikroTikUser(testUsername);
    const disabled = mkUser.hotspot?.disabled === "yes" || mkUser.hotspot?.disabled === true || mkUser.pppoe?.disabled === "yes" || mkUser.pppoe?.disabled === true;

    record("Temp Block", sub[0]?.status === "suspended" && disabled ? "PASS" : "FAIL", {
      dbStatus: sub[0]?.status,
      mikroTikDisabled: disabled,
      mikroTikUser: mkUser,
      result,
    });
  } catch (e) {
    record("Temp Block", "FAIL", e.message);
  }
}

async function test4_unblock() {
  console.log("\n🧪 TEST 4: Unblock");
  if (!testSubscriptionId) return record("Unblock", "FAIL", "No subscription");
  try {
    const data = await trpcMutation("customer.userUnblock", { subscriptionId: testSubscriptionId });
    const result = data?.result?.data?.json;

    const sub = await sql`SELECT status FROM subscriptions WHERE id = ${testSubscriptionId} LIMIT 1`;
    const mkUser = await checkMikroTikUser(testUsername);
    const enabled = mkUser.hotspot ? !mkUser.hotspot.disabled : mkUser.pppoe ? !mkUser.pppoe.disabled : false;

    record("Unblock", sub[0]?.status === "active" && enabled ? "PASS" : "FAIL", {
      dbStatus: sub[0]?.status,
      mikroTikEnabled: enabled,
      mikroTikUser: mkUser,
      result,
    });
  } catch (e) {
    record("Unblock", "FAIL", e.message);
  }
}

async function test5_changePackage() {
  console.log("\n🧪 TEST 5: Change Package");
  if (!testSubscriptionId) return record("Change Package", "FAIL", "No subscription");
  try {
    const otherPkg = await sql`SELECT id, mikrotik_profile_name FROM packages WHERE org_id = ${ORG_ID} AND is_active = true AND id != (SELECT package_id FROM subscriptions WHERE id = ${testSubscriptionId}) LIMIT 1`;
    if (!otherPkg.length) return record("Change Package", "FAIL", "No alternative package");

    const data = await trpcMutation("customer.userChangePackage", { subscriptionId: testSubscriptionId, packageId: otherPkg[0].id });
    const result = data?.result?.data?.json;

    const sub = await sql`SELECT package_id FROM subscriptions WHERE id = ${testSubscriptionId} LIMIT 1`;
    const mkUser = await checkMikroTikUser(testUsername);
    const profileUpdated = mkUser.hotspot?.profile === otherPkg[0].mikrotik_profile_name || mkUser.pppoe?.profile === otherPkg[0].mikrotik_profile_name;

    record("Change Package", sub[0]?.package_id === otherPkg[0].id && profileUpdated ? "PASS" : "FAIL", {
      dbPackageId: sub[0]?.package_id,
      expectedPackageId: otherPkg[0].id,
      mikroTikProfile: mkUser.hotspot?.profile || mkUser.pppoe?.profile,
      expectedProfile: otherPkg[0].mikrotik_profile_name,
      result,
    });
  } catch (e) {
    record("Change Package", "FAIL", e.message);
  }
}

async function test6_forceLogout() {
  console.log("\n🧪 TEST 6: Force Logout");
  if (!testSubscriptionId) return record("Force Logout", "FAIL", "No subscription");
  try {
    const data = await trpcMutation("customer.userForceLogout", { subscriptionId: testSubscriptionId });
    const result = data?.result?.data?.json;
    record("Force Logout", result?.ok ? "PASS" : "FAIL", { result });
  } catch (e) {
    record("Force Logout", "FAIL", e.message);
  }
}

async function test7_delete() {
  console.log("\n🧪 TEST 7: Full Delete");
  if (!testSubscriptionId) return record("Full Delete", "FAIL", "No subscription");
  try {
    const username = testUsername;
    const data = await trpcMutation("customer.userDelete", { subscriptionId: testSubscriptionId });
    const result = data?.result?.data?.json;

    const sub = await sql`SELECT 1 FROM subscriptions WHERE id = ${testSubscriptionId} LIMIT 1`;
    const cust = await sql`SELECT 1 FROM customers WHERE id = ${testCustomerId} LIMIT 1`;
    const radius = username ? await getRadiusUser(username) : { radcheck: false, radreply: false };
    const hsDb = username ? await sql`SELECT 1 FROM hotspot_users WHERE org_id = ${ORG_ID} AND name = ${username} LIMIT 1` : [];
    const pppDb = username ? await sql`SELECT 1 FROM pppoe_users WHERE org_id = ${ORG_ID} AND name = ${username} LIMIT 1` : [];
    const mkUser = username ? await checkMikroTikUser(username) : { hotspot: null, pppoe: null };

    const dbOk = sub.length === 0 && cust.length === 0;
    const radiusOk = !radius.radcheck && !radius.radreply;
    const dbUserOk = hsDb.length === 0 && pppDb.length === 0;
    const mikroOk = !mkUser.hotspot && !mkUser.pppoe;

    record("Full Delete", dbOk && radiusOk && dbUserOk && mikroOk && result?.ok ? "PASS" : "FAIL", {
      subscriptionExists: sub.length > 0,
      customerExists: cust.length > 0,
      radius,
      hotspotDbExists: hsDb.length > 0,
      pppoeDbExists: pppDb.length > 0,
      mikroTikUser: mkUser,
      result,
    });
  } catch (e) {
    record("Full Delete", "FAIL", e.message);
  }
}

async function cleanup() {
  console.log("\n🧹 CLEANUP");
  try {
    await sql`DELETE FROM subscriptions WHERE customer_id IN (SELECT id FROM customers WHERE phone LIKE 'TEST%' OR phone LIKE 'PAID%')`;
    await sql`DELETE FROM orders WHERE customer_id IN (SELECT id FROM customers WHERE phone LIKE 'TEST%' OR phone LIKE 'PAID%')`;
    await sql`DELETE FROM customers WHERE phone LIKE 'TEST%' OR phone LIKE 'PAID%'`;
    await sql`DELETE FROM hotspot_users WHERE org_id = ${ORG_ID} AND name LIKE 'TEST%' OR name LIKE 'PAID%'`;
    await sql`DELETE FROM pppoe_users WHERE org_id = ${ORG_ID} AND name LIKE 'TEST%' OR name LIKE 'PAID%'`;
    record("Cleanup", "INFO", "Test data purged");
  } catch (e) {
    record("Cleanup", "FAIL", e.message);
  }
}

async function main() {
  await setup();
  await testTelegram();
  await testAdminApi();
  await test1_trial();
  await test2_paid();
  await test3_block();
  await test4_unblock();
  await test5_changePackage();
  await test6_forceLogout();
  await test7_delete();
  await cleanup();

  console.log("\n" + "=".repeat(60));
  console.log("📋 VALIDATION SUMMARY");
  console.log("=".repeat(60));
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  console.log(`Total: ${results.length} | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);
  console.log("=".repeat(60));

  await sql.end();
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
