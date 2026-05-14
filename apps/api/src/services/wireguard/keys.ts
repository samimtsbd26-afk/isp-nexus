import { generateKeyPairSync, randomBytes } from "crypto";

export interface WireGuardKeyPair {
  privateKey: string;
  publicKey: string;
}

function b64urlToBase64(b64url: string): string {
  return Buffer.from(b64url, "base64url").toString("base64");
}

/** Generate a WireGuard-compatible X25519 key pair (server-side, never leaves API). */
export function generateKeyPair(): WireGuardKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync("x25519");
  const jwkPriv = privateKey.export({ format: "jwk" }) as { d: string };
  const jwkPub = publicKey.export({ format: "jwk" }) as { x: string };
  return {
    privateKey: b64urlToBase64(jwkPriv.d),
    publicKey: b64urlToBase64(jwkPub.x),
  };
}

/** Generate a WireGuard preshared key (32 random bytes, base64). */
export function generatePresharedKey(): string {
  return randomBytes(32).toString("base64");
}

/** Build a WireGuard client config file (.conf) text. */
export function buildClientConfig(opts: {
  clientPrivateKey: string;
  clientAddress: string;
  serverPublicKey: string;
  serverEndpoint: string;
  presharedKey?: string;
  dns?: string;
  allowedIps?: string;
  persistentKeepalive?: number;
}): string {
  const {
    clientPrivateKey,
    clientAddress,
    serverPublicKey,
    serverEndpoint,
    presharedKey,
    dns = "1.1.1.1,8.8.8.8",
    allowedIps = "0.0.0.0/0",
    persistentKeepalive = 25,
  } = opts;

  const lines = [
    "[Interface]",
    `PrivateKey = ${clientPrivateKey}`,
    `Address = ${clientAddress}`,
    `DNS = ${dns}`,
    "",
    "[Peer]",
    `PublicKey = ${serverPublicKey}`,
    ...(presharedKey ? [`PresharedKey = ${presharedKey}`] : []),
    `Endpoint = ${serverEndpoint}`,
    `AllowedIPs = ${allowedIps}`,
    `PersistentKeepalive = ${persistentKeepalive}`,
  ];
  return lines.join("\n");
}
