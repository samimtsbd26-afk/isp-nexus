import { createCipheriv, createDecipheriv, randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { env } from "./env.js";

const scryptAsync = promisify(scrypt);

const ALGORITHM = "aes-256-gcm";
const KEY = Buffer.from(env.ENCRYPTION_KEY.padEnd(64, "0").slice(0, 64), "hex");

export function encryptText(plaintext: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(":");
}

export function decryptText(ciphertext: string): string {
  if (typeof ciphertext !== "string" || !ciphertext) {
    throw new Error("এনক্রিপ্টেড ভ্যালু পাওয়া যায়নি — রাউটার পাসওয়ার্ড পুনরায় সেট করুন");
  }
  const parts = ciphertext.split(":");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new Error("এনক্রিপ্টেড ভ্যালু ফরম্যাট সঠিক নয় — রাউটার পাসওয়ার্ড পুনরায় সেট করুন");
  }
  const iv = Buffer.from(parts[0], "hex");
  const tag = Buffer.from(parts[1], "hex");
  const data = Buffer.from(parts[2], "hex");
  const decipher = createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [salt, key] = hash.split(":");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return timingSafeEqual(Buffer.from(key, "hex"), derivedKey);
}
