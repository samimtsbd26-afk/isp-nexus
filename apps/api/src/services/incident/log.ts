import { getRedis } from "../../lib/redis.js";

export type IncidentType =
  | "router_disconnect"
  | "redis_failure"
  | "postgres_failure"
  | "tls_failure"
  | "payment_mismatch"
  | "login_failure"
  | "expiry_failure"
  | "fraud_detected"
  | "health_degraded";

export interface Incident {
  type: IncidentType;
  orgId: string;
  message: string;
  meta?: Record<string, unknown>;
  ts: string;
}

const INCIDENT_KEY = (orgId: string) => `incident:log:${orgId}`;
const MAX_INCIDENTS = 200;

export async function logIncident(
  orgId: string,
  type: IncidentType,
  message: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    const redis = getRedis();
    const entry: Incident = { type, orgId, message, ...(meta ? { meta } : {}), ts: new Date().toISOString() };
    const score = Date.now();
    await redis.zadd(INCIDENT_KEY(orgId), score, JSON.stringify(entry));
    await redis.zremrangebyrank(INCIDENT_KEY(orgId), 0, -(MAX_INCIDENTS + 1));
  } catch { /* non-fatal */ }
}

export async function getIncidents(orgId: string, limit = 100): Promise<Incident[]> {
  try {
    const redis = getRedis();
    const raw = await redis.zrevrange(INCIDENT_KEY(orgId), 0, limit - 1);
    return raw
      .map((r) => { try { return JSON.parse(r) as Incident; } catch { return null; } })
      .filter((x): x is Incident => x !== null);
  } catch {
    return [];
  }
}

export async function clearIncidents(orgId: string): Promise<void> {
  try {
    await getRedis().del(INCIDENT_KEY(orgId));
  } catch { /* non-fatal */ }
}
