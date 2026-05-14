import { getRedis } from "../../lib/redis.js";

export type CustomerNotifType =
  | "trial_approved"
  | "payment_approved"
  | "package_expiring"
  | "device_blocked"
  | "login_detected"
  | "trial_rejected"
  | "payment_rejected";

export interface CustomerNotification {
  id: string;
  type: CustomerNotifType;
  title: string;
  message: string;
  read: boolean;
  ts: string;
}

const NOTIF_KEY = (orgId: string, customerId: string) => `customer:notif:${orgId}:${customerId}`;
const MAX_NOTIFS = 50;

export async function pushCustomerNotification(
  orgId: string,
  customerId: string,
  type: CustomerNotifType,
  title: string,
  message: string,
): Promise<void> {
  try {
    const redis = getRedis();
    const notif: CustomerNotification = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      title,
      message,
      read: false,
      ts: new Date().toISOString(),
    };
    await redis.zadd(NOTIF_KEY(orgId, customerId), Date.now(), JSON.stringify(notif));
    await redis.zremrangebyrank(NOTIF_KEY(orgId, customerId), 0, -(MAX_NOTIFS + 1));
    await redis.expire(NOTIF_KEY(orgId, customerId), 30 * 86_400); // 30-day TTL
  } catch { /* non-fatal */ }
}

export async function getCustomerNotifications(orgId: string, customerId: string): Promise<CustomerNotification[]> {
  try {
    const redis = getRedis();
    const raw = await redis.zrevrange(NOTIF_KEY(orgId, customerId), 0, MAX_NOTIFS - 1);
    return raw
      .map((r) => { try { return JSON.parse(r) as CustomerNotification; } catch { return null; } })
      .filter((x): x is CustomerNotification => x !== null);
  } catch {
    return [];
  }
}

export async function markAllRead(orgId: string, customerId: string): Promise<void> {
  try {
    const redis = getRedis();
    const key = NOTIF_KEY(orgId, customerId);
    const raw = await redis.zrange(key, 0, -1, "WITHSCORES");
    if (!raw.length) return;
    const pipeline = redis.pipeline();
    for (let i = 0; i < raw.length; i += 2) {
      const json = raw[i];
      const score = raw[i + 1];
      try {
        const notif = JSON.parse(json) as CustomerNotification;
        if (!notif.read) {
          notif.read = true;
          pipeline.zremrangebyscore(key, Number(score), Number(score));
          pipeline.zadd(key, Number(score), JSON.stringify(notif));
        }
      } catch { /* skip */ }
    }
    await pipeline.exec();
  } catch { /* non-fatal */ }
}

export async function unreadCount(orgId: string, customerId: string): Promise<number> {
  try {
    const notifs = await getCustomerNotifications(orgId, customerId);
    return notifs.filter((n) => !n.read).length;
  } catch {
    return 0;
  }
}
