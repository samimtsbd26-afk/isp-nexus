import { eq, and, gte, sql } from "drizzle-orm";
import { createDb } from "@isp-nexus/db";
import { env } from "../../lib/env.js";
import { activityLog, telegramConfigs } from "@isp-nexus/db";
import { sendAlert } from "../telegram/bot.js";
import { logger } from "../../lib/logger.js";

const db = createDb(env.DATABASE_URL);

// In-memory IP blacklist (use Redis for multi-instance)
const ipBlacklist = new Map<string, { until: number; reason: string }>();
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

export function isIpBlacklisted(ip: string): boolean {
  const entry = ipBlacklist.get(ip);
  if (!entry) return false;
  if (entry.until < Date.now()) {
    ipBlacklist.delete(ip);
    return false;
  }
  return true;
}

export function recordFailedLogin(ip: string, username?: string) {
  const now = Date.now();
  const key = `${ip}:${username ?? "unknown"}`;
  const entry = loginAttempts.get(key);
  
  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 }); // 15 min window
    return;
  }
  
  entry.count++;
  
  // Brute force: 10 failed attempts from same IP
  if (entry.count >= 10) {
    ipBlacklist.set(ip, { until: now + 60 * 60 * 1000, reason: "Brute force detected" }); // 1 hour
    logger.warn({ ip, username, count: entry.count }, "IP blacklisted for brute force");
  }
  
  // Account lock: 5 failed attempts for same user
  if (username && entry.count >= 5) {
    logger.warn({ ip, username, count: entry.count }, "Account locked due to failed logins");
  }
}

export async function checkSuspiciousActivity(orgId: string, adminChatId?: string) {
  const now = new Date();
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

  const [deleteCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(activityLog)
    .where(and(
      eq(activityLog.orgId, orgId),
      eq(activityLog.action, "delete"),
      eq(activityLog.entityType, "customer"),
      gte(activityLog.createdAt, tenMinutesAgo)
    ));

  if (deleteCount.count >= 5) {
    const chatId = adminChatId ?? await getOrgAdminChatId(orgId);
    if (chatId) {
      await sendAlert(chatId, `🚨 Suspicious activity: ${deleteCount.count} customers deleted in last 10 minutes`).catch((err) =>
        logger.warn({ err, orgId }, "Failed to send security alert"),
      );
    }
  }

  return {
    suspiciousDeletes: deleteCount.count,
    blacklistedIps: ipBlacklist.size,
  };
}

async function getOrgAdminChatId(orgId: string): Promise<string | null> {
  const [cfg] = await db.select({ chatId: telegramConfigs.chatId })
    .from(telegramConfigs)
    .where(and(eq(telegramConfigs.orgId, orgId), eq(telegramConfigs.alertsEnabled, true)))
    .limit(1);
  return cfg?.chatId ?? null;
}

// Cleanup expired entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipBlacklist) {
    if (entry.until < now) ipBlacklist.delete(ip);
  }
  for (const [key, entry] of loginAttempts) {
    if (entry.resetAt < now) loginAttempts.delete(key);
  }
}, 600000);
