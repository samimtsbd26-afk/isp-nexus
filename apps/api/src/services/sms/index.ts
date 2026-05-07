import { and, eq } from "drizzle-orm";
import { createDb, smsLogs, appSettings, customers, orders } from "@isp-nexus/db";
import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";
import { isValidBdPhone } from "./provider.js";
import { SslWirelessProvider } from "./ssl-wireless.js";
import { BulkSmsBdProvider } from "./bulksmsbd.js";
import { GreenWebBdProvider } from "./greenwebbd.js";
import type { SmsProvider } from "./provider.js";

const db = createDb(env.DATABASE_URL);

async function getOrgSmsConfig(orgId: string): Promise<{ provider: string; apiKey: string; apiUser: string; senderId: string } | null> {
  const settings = await db.select({ key: appSettings.key, value: appSettings.value })
    .from(appSettings)
    .where(and(eq(appSettings.orgId, orgId)));
  const get = (key: string) => settings.find((s) => s.key === key)?.value ?? "";
  const provider = get("sms_provider");
  if (!provider) return null;
  return { provider, apiKey: get("sms_api_key"), apiUser: get("sms_api_user"), senderId: get("sms_sender_id") || "SKYNITY" };
}

function buildProvider(config: { provider: string; apiKey: string; apiUser: string; senderId: string }): SmsProvider | null {
  switch (config.provider) {
    case "ssl_wireless": return new SslWirelessProvider(config.apiKey, config.senderId);
    case "bulksmsbd":    return new BulkSmsBdProvider(config.apiKey, config.senderId);
    case "greenwebbd":  return new GreenWebBdProvider(config.apiKey, config.senderId);
    default: return null;
  }
}

export async function sendSms(orgId: string, phone: string, message: string, relatedId?: string, relatedType?: string): Promise<boolean> {
  if (!isValidBdPhone(phone)) {
    logger.warn({ phone, orgId }, "SMS skipped — invalid BD phone number");
    return false;
  }

  const config = await getOrgSmsConfig(orgId);
  if (!config) {
    logger.debug({ orgId }, "SMS skipped — no SMS provider configured for org");
    return false;
  }

  const provider = buildProvider(config);
  if (!provider) {
    logger.warn({ provider: config.provider, orgId }, "SMS skipped — unknown provider");
    return false;
  }

  const [logRow] = await db.insert(smsLogs).values({
    orgId, phone, message,
    provider: provider.name,
    status: "pending",
    relatedId: relatedId ?? null,
    relatedType: relatedType ?? null,
  }).returning({ id: smsLogs.id });

  const result = await provider.send(phone, message);

  await db.update(smsLogs).set({
    status: result.success ? "sent" : "failed",
    messageId: result.messageId ?? null,
    error: result.error ?? null,
    updatedAt: new Date(),
  }).where(eq(smsLogs.id, logRow.id));

  if (!result.success) {
    logger.warn({ phone, provider: provider.name, error: result.error, orgId }, "SMS delivery failed");
  } else {
    logger.info({ phone, provider: provider.name, messageId: result.messageId, orgId }, "SMS sent successfully");
  }

  return result.success;
}

// Retry failed SMS (called from a periodic job or manually)
export async function retryFailedSms(orgId: string, maxRetries = 3): Promise<{ retried: number; succeeded: number }> {
  const failed = await db.select().from(smsLogs)
    .where(and(eq(smsLogs.orgId, orgId), eq(smsLogs.status, "failed")))
    .limit(10);

  const config = await getOrgSmsConfig(orgId);
  if (!config) return { retried: 0, succeeded: 0 };
  const provider = buildProvider(config);
  if (!provider) return { retried: 0, succeeded: 0 };

  let succeeded = 0;
  for (const row of failed) {
    if ((row.retryCount ?? 0) >= maxRetries) continue;
    const result = await provider.send(row.phone, row.message);
    await db.update(smsLogs).set({
      status: result.success ? "sent" : "failed",
      messageId: result.messageId ?? null,
      error: result.error ?? null,
      retryCount: (row.retryCount ?? 0) + 1,
      updatedAt: new Date(),
    }).where(eq(smsLogs.id, row.id));
    if (result.success) succeeded++;
  }

  return { retried: failed.length, succeeded };
}

// ── Templated messages ────────────────────────────────────────────────────────

export async function sendPaymentSuccessSms(orgId: string, orderId: string): Promise<void> {
  const [order] = await db.select({ customerId: orders.customerId, amountBdt: orders.amountBdt })
    .from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return;
  const [customer] = await db.select({ phone: customers.phone, fullName: customers.fullName })
    .from(customers).where(eq(customers.id, order.customerId)).limit(1);
  if (!customer?.phone) return;

  const name = customer.fullName.split(" ")[0];
  const message = `SKYNITY: প্রিয় ${name}, আপনার ৳${order.amountBdt} পেমেন্ট সফল হয়েছে। আপনার ইন্টারনেট চালু করা হয়েছে। ধন্যবাদ!`;
  await sendSms(orgId, customer.phone, message, orderId, "order");
}

export async function sendTrialActivationSms(orgId: string, customerId: string, packageName: string): Promise<void> {
  const [customer] = await db.select({ phone: customers.phone, fullName: customers.fullName })
    .from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer?.phone) return;

  const name = customer.fullName.split(" ")[0];
  const message = `SKYNITY: প্রিয় ${name}, আপনার ফ্রি ট্রায়াল ${packageName} সক্রিয় হয়েছে। দ্রুত ব্রাউজিং উপভোগ করুন!`;
  await sendSms(orgId, customer.phone, message, customerId, "customer");
}

export async function sendExpiryWarningSms(orgId: string, customerId: string, daysLeft: number): Promise<void> {
  const [customer] = await db.select({ phone: customers.phone, fullName: customers.fullName })
    .from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer?.phone) return;

  const name = customer.fullName.split(" ")[0];
  const msg = daysLeft === 0
    ? `SKYNITY: প্রিয় ${name}, আপনার প্যাকেজ মেয়াদ শেষ হয়েছে। পুনরায় সংযুক্ত হতে অনুগ্রহ করে রিনিউ করুন।`
    : `SKYNITY: প্রিয় ${name}, আপনার প্যাকেজ ${daysLeft} দিন পরে মেয়াদ শেষ হবে। সময়মতো রিনিউ করুন।`;
  await sendSms(orgId, customer.phone, msg, customerId, "customer");
}
