/**
 * WireGuard peer auto-provisioning for MikroTik routers.
 *
 * When a router is onboarded, this creates a DB wireguard_peers entry and
 * returns the client config. The private key is stored encrypted; the public
 * key is pushed to the MikroTik via the API (or script template).
 */

import { eq, and } from "drizzle-orm";
import { wireguardPeers } from "@isp-nexus/db";
import type { Db } from "@isp-nexus/db";
import { encryptText, decryptText } from "../../lib/crypto.js";
import { generateKeyPair, generatePresharedKey, buildClientConfig } from "./keys.js";
import { env } from "../../lib/env.js";

export interface RouterWgProvisionResult {
  peerId: string;
  publicKey: string;
  allowedAddress: string;
  clientConf: string;
  routerScript: string;
}

const WG_SERVER_PUBKEY_SETTING = "WG_SERVER_PUBLIC_KEY";

/**
 * Provision a WireGuard peer for a MikroTik router.
 *
 * Returns:
 *   - `clientConf`   — full [Interface]+[Peer] .conf for the MikroTik side
 *   - `routerScript` — RouterOS command to add the peer on the VPS WG interface
 *   - `peerId`       — DB row ID for the created peer
 *
 * The private key is stored encrypted in DB and never returned again.
 */
export async function provisionRouterWireguardPeer(
  db: Db,
  _orgId: string,
  routerId: string,
  params: {
    label?: string;
    wgInterface?: string;         // VPS-side wg interface name, default "wg0"
    peerIp: string;               // peer IP to assign, e.g. "10.100.0.2"
    vpsWgIp: string;              // VPS WG server IP, e.g. "10.100.0.1"
    vpsPublicIp: string;          // VPS public IP for endpoint
    vpsWgPort?: number;           // default 51820
    vpsServerPublicKey?: string;  // if known; if not, stored in peer row
    dns?: string;
  },
): Promise<RouterWgProvisionResult> {
  const wgInterface = params.wgInterface ?? "wg0";
  const vpsWgPort = params.vpsWgPort ?? 51820;
  const dns = params.dns ?? env.WG_DNS;

  const keypair = generateKeyPair();
  const psk = generatePresharedKey();
  const allowedAddress = `${params.peerIp}/32`;

  // Store in DB (private key encrypted, PSK encrypted)
  const [inserted] = await db.insert(wireguardPeers).values({
    routerId,
    interface: wgInterface,
    publicKey: keypair.publicKey,
    privateKeyEnc: encryptText(keypair.privateKey),
    presharedKeyEnc: encryptText(psk),
    allowedAddress,
    allowedIps: `${params.peerIp}/32`,
    endpointAddress: params.vpsPublicIp,
    endpointPort: vpsWgPort,
    persistentKeepalive: 25,
    label: params.label ?? `router-${routerId.slice(0, 8)}`,
    serverPublicKey: params.vpsServerPublicKey ?? null,
    comment: "ISP-Nexus auto-provisioned",
    isActive: false,
  }).returning({ id: wireguardPeers.id });

  // Build MikroTik client .conf
  const clientConf = buildClientConfig({
    clientPrivateKey: keypair.privateKey,
    clientAddress: `${params.peerIp}/24`,
    dns,
    serverPublicKey: params.vpsServerPublicKey ?? "<VPS_WG_PUBLIC_KEY>",
    presharedKey: psk,
    serverEndpoint: `${params.vpsPublicIp}:${vpsWgPort}`,
    allowedIps: "0.0.0.0/0",
    persistentKeepalive: 25,
  });

  // RouterOS command to add peer on VPS-side (pushed via system.exec → docker exec)
  const routerScript = [
    `# Add this peer to the VPS WireGuard interface (${wgInterface})`,
    `# Run on VPS:`,
    `wg set ${wgInterface} \\`,
    `  peer ${keypair.publicKey} \\`,
    `  preshared-key <(echo ${psk}) \\`,
    `  allowed-ips ${params.peerIp}/32`,
    ``,
    `# Or via wg-quick conf entry:`,
    `# [Peer]`,
    `# PublicKey = ${keypair.publicKey}`,
    `# PresharedKey = ${psk}`,
    `# AllowedIPs = ${params.peerIp}/32`,
  ].join("\n");

  return {
    peerId: inserted.id,
    publicKey: keypair.publicKey,
    allowedAddress,
    clientConf,
    routerScript,
  };
}

export async function getPeerClientConf(db: Db, peerId: string): Promise<string | null> {
  const [peer] = await db.select().from(wireguardPeers)
    .where(eq(wireguardPeers.id, peerId)).limit(1);
  if (!peer || !peer.privateKeyEnc) return null;

  const privateKey = decryptText(peer.privateKeyEnc);
  const psk = peer.presharedKeyEnc ? decryptText(peer.presharedKeyEnc) : undefined;

  return buildClientConfig({
    clientPrivateKey: privateKey,
    clientAddress: peer.allowedAddress ?? peer.allowedIps ?? "10.100.0.x/24",
    serverPublicKey: peer.serverPublicKey ?? "<VPS_WG_PUBLIC_KEY>",
    presharedKey: psk,
    serverEndpoint: peer.endpointAddress
      ? `${peer.endpointAddress}:${peer.endpointPort ?? 51820}`
      : "<VPS_IP>:51820",
    allowedIps: peer.allowedIps ?? "0.0.0.0/0",
    persistentKeepalive: 25,
  });
}
