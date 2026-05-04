import { radcheck, radreply } from "@isp-nexus/db";
import { eq } from "drizzle-orm";
import type { MikroTikApi } from "../mikrotik/client.js";

type PackageLike = {
  downloadMbps: number;
  uploadMbps: number;
  burstDownloadMbps?: number | null;
  burstUploadMbps?: number | null;
  burstThresholdDown?: number | null;
  burstThresholdUp?: number | null;
  burstTimeSeconds?: number | null;
  validityDays?: number | null;
  radiusGroupName?: string | null;
  features?: unknown;
};

function featureStrings(features: unknown): string[] {
  return Array.isArray(features) ? features.map((feature) => String(feature)) : [];
}

export function packageRateLimit(pkg: PackageLike): string {
  const max = `${pkg.downloadMbps}M/${pkg.uploadMbps}M`;
  const burstDown = pkg.burstDownloadMbps ?? pkg.downloadMbps;
  const burstUp = pkg.burstUploadMbps ?? pkg.uploadMbps;
  const guaranteed = packageGuaranteedLimit(pkg);
  if (burstDown <= pkg.downloadMbps && burstUp <= pkg.uploadMbps && guaranteed === max) return max;
  const burst = `${burstDown}M/${burstUp}M`;
  const threshold = `${pkg.burstThresholdDown ?? parseMbps(guaranteed, 0) ?? pkg.downloadMbps}M/${pkg.burstThresholdUp ?? parseMbps(guaranteed, 1) ?? pkg.uploadMbps}M`;
  const time = `${pkg.burstTimeSeconds ?? 30}/${pkg.burstTimeSeconds ?? 30}`;
  return `${max} ${burst} ${threshold} ${time} 8 ${guaranteed}`;
}

export function packageDeviceLimit(pkg: PackageLike): number {
  const feature = featureStrings(pkg.features).find((item) => /^devices:/i.test(item) || /\bdevices?\b/i.test(item));
  const match = feature?.match(/(\d+)/);
  return Math.max(1, Number(match?.[1] ?? 1));
}

export function packageGuaranteedLimit(pkg: PackageLike): string {
  const feature = featureStrings(pkg.features).find((item) => /^guaranteed:/i.test(item));
  const value = feature?.split(":").slice(1).join(":").trim();
  return value || `${pkg.downloadMbps}M/${pkg.uploadMbps}M`;
}

export function packageAddressList(pkg: PackageLike): string {
  return `skynity-${pkg.radiusGroupName ?? "hotspot"}`;
}

function parseMbps(rate: string, index: 0 | 1): number | null {
  const value = rate.split("/")[index]?.match(/(\d+)/)?.[1];
  return value ? Number(value) : null;
}

export async function syncHotspotRadiusUser(db: any, username: string, password: string, pkg: PackageLike, seconds?: number) {
  const sessionSeconds = seconds ?? (pkg.validityDays ?? 30) * 24 * 60 * 60;
  await db.delete(radcheck).where(eq(radcheck.username, username));
  await db.delete(radreply).where(eq(radreply.username, username));
  await db.insert(radcheck).values([
    { username, attribute: "Cleartext-Password", op: ":=", value: password },
    { username, attribute: "Simultaneous-Use", op: ":=", value: String(packageDeviceLimit(pkg)) },
  ]);
  await db.insert(radreply).values([
    { username, attribute: "Mikrotik-Rate-Limit", op: "=", value: packageRateLimit(pkg) },
    { username, attribute: "Mikrotik-Address-List", op: "=", value: packageAddressList(pkg) },
    { username, attribute: "Session-Timeout", op: "=", value: String(sessionSeconds) },
  ]);
}

export async function ensureHotspotProfile(client: MikroTikApi, name: string, pkg: PackageLike) {
  const data = {
    name,
    "rate-limit": packageRateLimit(pkg),
    "shared-users": String(packageDeviceLimit(pkg)),
    "address-list": packageAddressList(pkg),
  };
  const [profile] = await client.print("/ip/hotspot/user/profile", { name });
  const profileId = profile?.[".id"] ?? profile?.id;
  if (profileId) {
    await client.exec("/ip/hotspot/user/profile", "set", { numbers: profileId, ...data });
    return;
  }
  await client.add("/ip/hotspot/user/profile", data);
}
