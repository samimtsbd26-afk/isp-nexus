import { SignJWT, jwtVerify } from "jose";
import { randomBytes, createHash } from "crypto";
import { env } from "../lib/env.js";
import type { SessionPayload, PortalSessionPayload } from "@isp-nexus/shared";

const ACCESS_SECRET = new TextEncoder().encode(env.JWT_SECRET);
const PORTAL_SECRET = new TextEncoder().encode(env.PORTAL_JWT_SECRET);

export async function signAccessToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(env.JWT_ACCESS_EXPIRES)
    .sign(ACCESS_SECRET);
}

export async function verifyAccessToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, ACCESS_SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export function generateRefreshToken(): string {
  return randomBytes(48).toString("hex");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function signPortalToken(payload: PortalSessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(PORTAL_SECRET);
}

export async function verifyPortalToken(token: string): Promise<PortalSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, PORTAL_SECRET);
    return payload as unknown as PortalSessionPayload;
  } catch {
    return null;
  }
}

export function buildSessionCookie(refreshToken: string, secure: boolean = true): string {
  const maxAge = 30 * 24 * 60 * 60;
  return `isp_refresh=${refreshToken}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Strict${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(): string {
  return "isp_refresh=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict";
}
