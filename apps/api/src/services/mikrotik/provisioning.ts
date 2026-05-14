/**
 * MikroTik provisioning engine.
 *
 * Two delivery mechanisms:
 *   1. API push  — uploads script via /system/script, runs it, cleans up (primary)
 *   2. SSH push  — connects on port 22, sends commands line-by-line (fallback)
 *
 * The router never receives arbitrary user input — only the pre-built script
 * produced by templates.ts.
 */

import type { MikroTikApi } from "./client.js";
import { Client as SshClient } from "ssh2";
import { logger } from "../../lib/logger.js";

export interface ProvisionResult {
  ok: boolean;
  method: "api" | "ssh";
  output: string;
  error?: string;
}

// ─── API-based push (primary) ─────────────────────────────────────────────────

const SCRIPT_NAME = "isp-nexus-provision";

export async function pushScriptViaApi(
  client: MikroTikApi,
  scriptBody: string,
): Promise<ProvisionResult> {
  // Remove stale copy if present
  try {
    const existing = await client.print("/system/script", { name: SCRIPT_NAME });
    if (existing.length > 0 && existing[0]?.id) {
      await client.remove("/system/script", existing[0].id);
    }
  } catch {}

  // Upload
  await client.add("/system/script", {
    name: SCRIPT_NAME,
    source: scriptBody,
    comment: "ISP-Nexus auto-provisioning — safe to delete",
  });

  // Execute
  let output = "";
  let ok = true;
  try {
    const result = await client.exec("/system/script", "run", { number: SCRIPT_NAME });
    output = Array.isArray(result) ? result.map((r) => JSON.stringify(r)).join("\n") : String(result);
  } catch (err: any) {
    ok = false;
    output = err?.message ?? String(err);
    logger.warn({ err }, "Provisioning script run returned error");
  }

  // Clean up regardless
  try {
    const existing = await client.print("/system/script", { name: SCRIPT_NAME });
    if (existing.length > 0 && existing[0]?.id) {
      await client.remove("/system/script", existing[0].id);
    }
  } catch {}

  return { ok, method: "api", output };
}

// ─── SSH-based push (fallback / export) ──────────────────────────────────────

export interface MikroTikSshOpts {
  host: string;
  port?: number;       // default 22
  username: string;
  password?: string;
  privateKey?: string;
  timeoutMs?: number;
}

export function pushScriptViaSsh(
  opts: MikroTikSshOpts,
  scriptLines: string[],
): Promise<ProvisionResult> {
  return new Promise((resolve) => {
    const client = new SshClient();
    const timeoutMs = opts.timeoutMs ?? 30_000;
    let output = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      client.destroy();
      resolve({ ok: false, method: "ssh", output, error: "SSH connection timed out" });
    }, timeoutMs);

    client.on("ready", () => {
      // MikroTik SSH: open a shell and send commands
      client.shell((err, stream) => {
        if (err) {
          clearTimeout(timer);
          client.end();
          return resolve({ ok: false, method: "ssh", output, error: err.message });
        }

        stream.on("data", (chunk: Buffer) => { output += chunk.toString(); });
        stream.stderr?.on("data", (chunk: Buffer) => { output += chunk.toString(); });

        stream.on("close", () => {
          clearTimeout(timer);
          client.end();
          if (!timedOut) resolve({ ok: true, method: "ssh", output });
        });

        // Send each line with a small delay to avoid flooding the shell buffer
        let i = 0;
        function sendNext() {
          if (i >= scriptLines.length) {
            setTimeout(() => stream.end(), 500);
            return;
          }
          const line = scriptLines[i++];
          // Skip comment lines (RouterOS shell ignores them but let's be safe)
          if (!line.startsWith("#")) {
            stream.write(line + "\n");
          }
          setTimeout(sendNext, 100);
        }
        // Give the shell a moment to initialize
        setTimeout(sendNext, 800);
      });
    });

    client.on("error", (err) => {
      if (!timedOut) {
        clearTimeout(timer);
        resolve({ ok: false, method: "ssh", output, error: err.message });
      }
    });

    const connectOpts: Parameters<SshClient["connect"]>[0] = {
      host: opts.host,
      port: opts.port ?? 22,
      username: opts.username,
      readyTimeout: timeoutMs,
    };
    if (opts.privateKey) connectOpts.privateKey = opts.privateKey;
    else if (opts.password) connectOpts.password = opts.password;

    client.connect(connectOpts);
  });
}

// ─── Export (full config backup) ─────────────────────────────────────────────

export async function exportRouterConfig(client: MikroTikApi): Promise<string> {
  // RouterOS /export via script: create script that writes export to log
  // The cleanest way via API is to use /system/script with :put [/export compact]
  const exportScript = `:put [/export compact]`;
  try {
    await client.add("/system/script", { name: "isp-nexus-export", source: exportScript });
    const result = await client.exec("/system/script", "run", { number: "isp-nexus-export" });
    await client.print("/system/script", { name: "isp-nexus-export" })
      .then(async (rows) => {
        if (rows[0]?.id) await client.remove("/system/script", rows[0].id);
      })
      .catch(() => {});
    return Array.isArray(result) ? result.map((r: any) => r.ret ?? "").join("\n") : String(result);
  } catch {
    // Fallback: collect individual sections
    const sections = await Promise.allSettled([
      client.print("/system/identity"),
      client.print("/ip/address"),
      client.print("/ip/route"),
      client.print("/ip/firewall/filter"),
      client.print("/ip/firewall/nat"),
      client.print("/queue/simple"),
      client.print("/queue/tree"),
      client.print("/ip/hotspot/user/profile"),
      client.print("/ppp/profile"),
    ]);
    return sections
      .map((r) => (r.status === "fulfilled" ? JSON.stringify(r.value, null, 2) : ""))
      .join("\n\n");
  }
}
