import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const registerSchema = z.object({
  name: z.string().min(2).max(255),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["superadmin", "admin", "reseller", "viewer"]).default("admin"),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(8),
});

export const createOrgSchema = z.object({
  name: z.string().min(2).max(255),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9-]+$/),
});

export const createRouterSchema = z.object({
  name: z.string().min(1).max(255),
  host: z.string().min(1),
  port: z.number().int().default(8728),
  sslPort: z.number().int().default(8729),
  username: z.string().min(1),
  password: z.string().min(1),
  useSsl: z.boolean().default(false),
  wireguardPeerIp: z.string().optional(),
  isDefault: z.boolean().default(false),
});

export const createCustomerSchema = z.object({
  fullName: z.string().min(2).max(255),
  phone: z.string().min(10).max(20),
  email: z.string().email().optional(),
  address: z.string().optional(),
  nid: z.string().optional(),
  notes: z.string().optional(),
  referredBy: z.string().uuid().optional(),
});

export const createPackageSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(["pppoe", "hotspot", "static"]).default("pppoe"),
  downloadMbps: z.number().int().positive(),
  uploadMbps: z.number().int().positive(),
  burstDownloadMbps: z.number().int().positive().optional(),
  burstUploadMbps: z.number().int().positive().optional(),
  burstThresholdDown: z.number().int().optional(),
  burstThresholdUp: z.number().int().optional(),
  burstTimeSeconds: z.number().int().optional(),
  priceBdt: z.number().int().nonnegative(),
  validityDays: z.number().int().positive().default(30),
  radiusGroupName: z.string().optional(),
  mikrotikProfileName: z.string().optional(),
  description: z.string().optional(),
  features: z.array(z.string()).default([]),
  paymentNumber: z.string().optional(),
  isTrial: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

export const createSubscriptionSchema = z.object({
  customerId: z.string().uuid(),
  packageId: z.string().uuid(),
  routerId: z.string().uuid(),
  username: z.string().min(1).max(100),
  password: z.string().min(6),
  ipAddress: z.string().optional(),
  macAddress: z.string().optional(),
  notes: z.string().optional(),
});

export const submitOrderSchema = z.object({
  packageId: z.string().uuid(),
  amountBdt: z.number().int().positive(),
  paymentMethod: z.enum(["bkash", "nagad", "rocket", "cash", "bank", "free"]),
  trxId: z.string().optional(),
  paymentFrom: z.string().optional(),
  screenshotUrl: z.string().url().optional(),
});

export const createVoucherBatchSchema = z.object({
  routerId: z.string().uuid(),
  packageId: z.string().uuid().optional(),
  batchName: z.string().min(1),
  count: z.number().int().min(1).max(500),
  profile: z.string().optional(),
  timeLimit: z.string().optional(),
  dataLimit: z.string().optional(),
  sharedUsers: z.number().int().min(1).default(1),
  price: z.number().int().nonnegative().optional(),
  expiresAt: z.string().datetime().optional(),
});

export const portalRegisterSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(6),
  fullName: z.string().min(2).max(255),
  phone: z.string().min(10).max(20),
  email: z.string().email().optional(),
});

export const createHotspotTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  title: z.string().optional(),
  companyName: z.string().optional(),
  logoUrl: z.string().url().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  htmlContent: z.string().optional(),
  cssContent: z.string().optional(),
  isDefault: z.boolean().default(false),
});

export const pingTargetSchema = z.object({
  routerId: z.string().uuid(),
  name: z.string().min(1).max(100),
  target: z.string().min(1),
  intervalSeconds: z.number().int().min(10).default(60),
  count: z.number().int().min(1).max(20).default(5),
});

export const telegramConfigSchema = z.object({
  chatId: z.string().min(1),
  routerId: z.string().uuid().optional(),
  alertsEnabled: z.boolean().default(true),
  cpuThreshold: z.number().int().min(0).max(100).default(80),
  memoryThreshold: z.number().int().min(0).max(100).default(80),
});

export const createTicketSchema = z.object({
  subject: z.string().min(5).max(255),
  message: z.string().min(10),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
});

export const paymentConfigSchema = z.object({
  method: z.enum(["bkash", "nagad", "rocket", "cash", "bank", "free"]),
  accountNumber: z.string().min(1).max(20),
  accountType: z.string().optional(),
  instructions: z.string().optional(),
});
