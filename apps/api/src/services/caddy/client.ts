import { env } from "../../lib/env.js";
import { logger } from "../../lib/logger.js";

const BASE = env.CADDY_ADMIN_URL;

async function caddyFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Caddy Admin API ${init?.method ?? "GET"} ${path} → ${res.status}: ${body}`);
  }
  return res;
}

export async function getCaddyConfig(): Promise<unknown> {
  const res = await caddyFetch("/config/");
  return res.json();
}

export async function applyCaddyConfig(config: unknown): Promise<void> {
  await caddyFetch("/load", {
    method: "POST",
    body: JSON.stringify(config),
  });
  logger.info("Caddy config applied via Admin API");
}

export async function getCaddyStatus(): Promise<{ running: boolean; version?: string }> {
  try {
    const res = await caddyFetch("/reverse_proxy/upstreams");
    await res.json();
    return { running: true };
  } catch {
    // Fall back to root config check
    try {
      await caddyFetch("/config/");
      return { running: true };
    } catch {
      return { running: false };
    }
  }
}
