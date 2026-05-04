import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  integer,
  smallint,
  bigint,
  boolean,
  timestamp,
  jsonb,
  real,
  serial,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", [
  "superadmin",
  "admin",
  "reseller",
  "viewer",
]);

export const packageTypeEnum = pgEnum("package_type", [
  "pppoe",
  "hotspot",
  "static",
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "suspended",
  "expired",
  "cancelled",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "bkash",
  "nagad",
  "rocket",
  "cash",
  "bank",
  "free",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "approved",
  "rejected",
  "refunded",
]);

export const voucherStatusEnum = pgEnum("voucher_status", [
  "unused",
  "used",
  "expired",
  "revoked",
]);

export const portalUserStatusEnum = pgEnum("portal_user_status", [
  "trial",
  "active",
  "expired",
  "suspended",
]);

export const ruleTypeEnum = pgEnum("rule_type", [
  "filter",
  "nat",
  "mangle",
  "raw",
]);

export const backupTypeEnum = pgEnum("backup_type", ["backup", "export"]);

export const logSeverityEnum = pgEnum("log_severity", [
  "debug",
  "info",
  "warning",
  "error",
  "critical",
]);

export const ticketStatusEnum = pgEnum("ticket_status", [
  "open",
  "in_progress",
  "resolved",
  "closed",
]);

export const ticketPriorityEnum = pgEnum("ticket_priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);

export const nmsDeviceTypeEnum = pgEnum("nms_device_type", [
  "router",
  "switch",
  "ap",
  "olt",
  "camera",
  "other",
]);

// ─── Core / Auth ──────────────────────────────────────────────────────────────

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  logoUrl: text("logo_url"),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("admin"),
  telegramId: varchar("telegram_id", { length: 50 }),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Router / Network ─────────────────────────────────────────────────────────

export const routers = pgTable("routers", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  vendor: varchar("vendor", { length: 50 }).notNull().default("mikrotik"),
  host: varchar("host", { length: 255 }).notNull(),
  port: integer("port").notNull().default(8728),
  sslPort: integer("ssl_port").notNull().default(8729),
  username: varchar("username", { length: 100 }).notNull(),
  passwordEncrypted: text("password_encrypted").notNull(),
  useSsl: boolean("use_ssl").notNull().default(false),
  wireguardPeerIp: varchar("wireguard_peer_ip", { length: 45 }),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  identity: varchar("identity", { length: 255 }),
  model: varchar("model", { length: 255 }),
  rosVersion: varchar("ros_version", { length: 50 }),
  serial: varchar("serial", { length: 100 }),
  licenseLevel: smallint("license_level"),
  uptimeSeconds: bigint("uptime_seconds", { mode: "number" }),
  cpuLoad: smallint("cpu_load"),
  freeMemoryMb: integer("free_memory_mb"),
  temperatureCelsius: real("temperature_celsius"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const wireguardPeers = pgTable("wireguard_peers", {
  id: uuid("id").primaryKey().defaultRandom(),
  routerId: uuid("router_id")
    .notNull()
    .references(() => routers.id, { onDelete: "cascade" }),
  mikrotikId: varchar("mikrotik_id", { length: 100 }),
  interface: varchar("interface", { length: 100 }).notNull().default("wg0"),
  publicKey: text("public_key").notNull(),
  presharedKeyEnc: text("preshared_key_enc"),
  allowedAddress: text("allowed_address"),
  allowedIps: text("allowed_ips"),
  endpointAddress: varchar("endpoint_address", { length: 255 }),
  endpointPort: integer("endpoint_port"),
  currentEndpoint: varchar("current_endpoint", { length: 255 }),
  persistentKeepalive: integer("persistent_keepalive").default(25),
  lastHandshakeAt: timestamp("last_handshake_at", { withTimezone: true }),
  rxBytes: bigint("rx_bytes", { mode: "number" }),
  txBytes: bigint("tx_bytes", { mode: "number" }),
  comment: text("comment"),
  disabled: boolean("disabled").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const ipAddresses = pgTable("ip_addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  routerId: uuid("router_id")
    .notNull()
    .references(() => routers.id, { onDelete: "cascade" }),
  mikrotikId: varchar("mikrotik_id", { length: 100 }),
  address: varchar("address", { length: 50 }).notNull(),
  network: varchar("network", { length: 50 }),
  interface: varchar("interface", { length: 100 }),
  comment: text("comment"),
  disabled: boolean("disabled").notNull().default(false),
  dynamic: boolean("dynamic").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const routeEntries = pgTable("route_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  routerId: uuid("router_id")
    .notNull()
    .references(() => routers.id, { onDelete: "cascade" }),
  mikrotikId: varchar("mikrotik_id", { length: 100 }),
  dstAddress: varchar("dst_address", { length: 50 }),
  gateway: varchar("gateway", { length: 100 }),
  interface: varchar("interface", { length: 100 }),
  distance: smallint("distance").default(1),
  scope: smallint("scope").default(30),
  targetScope: smallint("target_scope"),
  routingMark: varchar("routing_mark", { length: 100 }),
  prefSrc: varchar("pref_src", { length: 50 }),
  comment: text("comment"),
  disabled: boolean("disabled").notNull().default(false),
  active: boolean("active").notNull().default(true),
  dynamic: boolean("dynamic").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const firewallRules = pgTable("firewall_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  routerId: uuid("router_id")
    .notNull()
    .references(() => routers.id, { onDelete: "cascade" }),
  mikrotikId: varchar("mikrotik_id", { length: 100 }),
  ruleType: ruleTypeEnum("rule_type").notNull().default("filter"),
  chain: varchar("chain", { length: 100 }),
  action: varchar("action", { length: 100 }),
  protocol: varchar("protocol", { length: 20 }),
  srcAddress: varchar("src_address", { length: 100 }),
  dstAddress: varchar("dst_address", { length: 100 }),
  srcPort: varchar("src_port", { length: 50 }),
  dstPort: varchar("dst_port", { length: 50 }),
  inInterface: varchar("in_interface", { length: 100 }),
  outInterface: varchar("out_interface", { length: 100 }),
  comment: text("comment"),
  disabled: boolean("disabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const dhcpLeases = pgTable("dhcp_leases", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  routerId: uuid("router_id")
    .notNull()
    .references(() => routers.id, { onDelete: "cascade" }),
  mikrotikId: varchar("mikrotik_id", { length: 100 }),
  address: varchar("address", { length: 50 }),
  macAddress: varchar("mac_address", { length: 17 }),
  clientId: varchar("client_id", { length: 100 }),
  hostName: varchar("host_name", { length: 255 }),
  server: varchar("server", { length: 100 }),
  comment: text("comment"),
  status: varchar("status", { length: 50 }),
  lastSeen: timestamp("last_seen", { withTimezone: true }),
  expiresAfter: varchar("expires_after", { length: 50 }),
  dynamic: boolean("dynamic").notNull().default(true),
  blocked: boolean("blocked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const systemLogs = pgTable("system_logs", {
  id: serial("id").primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  routerId: uuid("router_id")
    .notNull()
    .references(() => routers.id, { onDelete: "cascade" }),
  topics: text("topics"),
  message: text("message").notNull(),
  severity: logSeverityEnum("severity").notNull().default("info"),
  time: varchar("time", { length: 50 }),
  logId: varchar("log_id", { length: 100 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Customer / Business ──────────────────────────────────────────────────────

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  customerCode: varchar("customer_code", { length: 50 }).notNull(),
  fullName: varchar("full_name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  email: varchar("email", { length: 255 }),
  address: text("address"),
  nid: varchar("nid", { length: 50 }),
  telegramChatId: varchar("telegram_chat_id", { length: 50 }),
  referredBy: uuid("referred_by"),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  passwordHash: text("password_hash"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const packages = pgTable("packages", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  type: packageTypeEnum("type").notNull().default("pppoe"),
  downloadMbps: integer("download_mbps").notNull(),
  uploadMbps: integer("upload_mbps").notNull(),
  burstDownloadMbps: integer("burst_download_mbps"),
  burstUploadMbps: integer("burst_upload_mbps"),
  burstThresholdDown: integer("burst_threshold_down"),
  burstThresholdUp: integer("burst_threshold_up"),
  burstTimeSeconds: integer("burst_time_seconds"),
  priceBdt: integer("price_bdt").notNull(),
  validityDays: integer("validity_days").notNull().default(30),
  radiusGroupName: varchar("radius_group_name", { length: 100 }),
  mikrotikProfileName: varchar("mikrotik_profile_name", { length: 100 }).default("default"),
  description: text("description"),
  features: jsonb("features").default([]),
  paymentNumber: varchar("payment_number", { length: 20 }),
  isTrial: boolean("is_trial").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  packageId: uuid("package_id").references(() => packages.id, {
    onDelete: "set null",
  }),
  routerId: uuid("router_id").references(() => routers.id, {
    onDelete: "set null",
  }),
  username: varchar("username", { length: 100 }).notNull().unique(),
  passwordEncrypted: text("password_encrypted").notNull(),
  ipAddress: varchar("ip_address", { length: 50 }),
  macAddress: varchar("mac_address", { length: 17 }),
  status: subscriptionStatusEnum("status").notNull().default("active"),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  autoRenew: boolean("auto_renew").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  packageId: uuid("package_id").references(() => packages.id, {
    onDelete: "set null",
  }),
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
    onDelete: "set null",
  }),
  amountBdt: integer("amount_bdt").notNull(),
  paymentMethod: paymentMethodEnum("payment_method"),
  trxId: varchar("trx_id", { length: 100 }),
  paymentFrom: varchar("payment_from", { length: 20 }),
  screenshotUrl: text("screenshot_url"),
  status: orderStatusEnum("status").notNull().default("pending"),
  reviewedBy: uuid("reviewed_by").references(() => users.id, {
    onDelete: "set null",
  }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewNote: text("review_note"),
  telegramMessageId: varchar("telegram_message_id", { length: 100 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" })
    .unique(),
  invoiceNumber: varchar("invoice_number", { length: 50 }).notNull().unique(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  amountBdt: integer("amount_bdt").notNull(),
  taxBdt: integer("tax_bdt").notNull().default(0),
  totalBdt: integer("total_bdt").notNull(),
  pdfUrl: text("pdf_url"),
  issuedAt: timestamp("issued_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  dueAt: timestamp("due_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  notes: text("notes"),
});

export const vouchers = pgTable("vouchers", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  routerId: uuid("router_id").references(() => routers.id, {
    onDelete: "set null",
  }),
  code: varchar("code", { length: 50 }).notNull().unique(),
  packageId: uuid("package_id").references(() => packages.id, {
    onDelete: "set null",
  }),
  batchName: varchar("batch_name", { length: 100 }),
  username: varchar("username", { length: 100 }),
  password: varchar("password", { length: 100 }),
  profile: varchar("profile", { length: 100 }),
  timeLimit: varchar("time_limit", { length: 50 }),
  dataLimit: varchar("data_limit", { length: 50 }),
  sharedUsers: smallint("shared_users").notNull().default(1),
  price: integer("price"),
  currency: varchar("currency", { length: 10 }).notNull().default("BDT"),
  status: voucherStatusEnum("status").notNull().default("unused"),
  usedBy: uuid("used_by").references(() => customers.id, {
    onDelete: "set null",
  }),
  usedAt: timestamp("used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  comment: text("comment"),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const paymentConfigs = pgTable("payment_configs", {
  id: serial("id").primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  method: paymentMethodEnum("method").notNull(),
  accountNumber: varchar("account_number", { length: 20 }).notNull(),
  accountType: varchar("account_type", { length: 50 }),
  instructions: text("instructions"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Support ──────────────────────────────────────────────────────────────────

export const supportTickets = pgTable("support_tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  subject: varchar("subject", { length: 255 }).notNull(),
  status: ticketStatusEnum("status").notNull().default("open"),
  priority: ticketPriorityEnum("priority").notNull().default("medium"),
  assignedTo: uuid("assigned_to").references(() => users.id, {
    onDelete: "set null",
  }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const supportMessages = pgTable("support_messages", {
  id: serial("id").primaryKey(),
  ticketId: uuid("ticket_id")
    .notNull()
    .references(() => supportTickets.id, { onDelete: "cascade" }),
  senderType: varchar("sender_type", { length: 20 }).notNull(), // "admin" | "customer"
  senderId: uuid("sender_id").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Monitoring (Time-Series) ─────────────────────────────────────────────────

export const resourceSnapshots = pgTable("resource_snapshots", {
  id: serial("id").primaryKey(),
  routerId: uuid("router_id")
    .notNull()
    .references(() => routers.id, { onDelete: "cascade" }),
  cpuLoadPct: smallint("cpu_load_pct"),
  freeMemoryMb: integer("free_memory_mb"),
  totalMemoryMb: integer("total_memory_mb"),
  temperatureC: real("temperature_c"),
  voltageV: real("voltage_v"),
  uptimeSeconds: bigint("uptime_seconds", { mode: "number" }),
  capturedAt: timestamp("captured_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const bandwidthSnapshots = pgTable("bandwidth_snapshots", {
  id: serial("id").primaryKey(),
  routerId: uuid("router_id")
    .notNull()
    .references(() => routers.id, { onDelete: "cascade" }),
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
    onDelete: "set null",
  }),
  interfaceName: varchar("interface_name", { length: 100 }),
  rxBytes: bigint("rx_bytes", { mode: "number" }),
  txBytes: bigint("tx_bytes", { mode: "number" }),
  rxRateBps: bigint("rx_rate_bps", { mode: "number" }),
  txRateBps: bigint("tx_rate_bps", { mode: "number" }),
  capturedAt: timestamp("captured_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pingSnapshots = pgTable("ping_snapshots", {
  id: serial("id").primaryKey(),
  routerId: uuid("router_id")
    .notNull()
    .references(() => routers.id, { onDelete: "cascade" }),
  targetHost: varchar("target_host", { length: 255 }).notNull(),
  avgMs: real("avg_ms"),
  minMs: real("min_ms"),
  maxMs: real("max_ms"),
  packetLossPct: real("packet_loss_pct"),
  capturedAt: timestamp("captured_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sfpSnapshots = pgTable("sfp_snapshots", {
  id: serial("id").primaryKey(),
  routerId: uuid("router_id")
    .notNull()
    .references(() => routers.id, { onDelete: "cascade" }),
  interfaceName: varchar("interface_name", { length: 100 }).notNull(),
  txPowerDbm: real("tx_power_dbm"),
  rxPowerDbm: real("rx_power_dbm"),
  temperatureC: real("temperature_c"),
  voltageV: real("voltage_v"),
  currentMa: real("current_ma"),
  wavelengthNm: integer("wavelength_nm"),
  capturedAt: timestamp("captured_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pingTargets = pgTable("ping_targets", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  routerId: uuid("router_id")
    .notNull()
    .references(() => routers.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  target: varchar("target", { length: 255 }).notNull(),
  intervalSeconds: integer("interval_seconds").notNull().default(60),
  count: smallint("count").notNull().default(5),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Hotspot / MikroTik ───────────────────────────────────────────────────────

export const hotspotTemplates = pgTable("hotspot_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  title: varchar("title", { length: 255 }),
  companyName: varchar("company_name", { length: 255 }),
  logoUrl: text("logo_url"),
  primaryColor: varchar("primary_color", { length: 7 }),
  backgroundColor: varchar("background_color", { length: 7 }),
  htmlContent: text("html_content"),
  cssContent: text("css_content"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const hotspotUsers = pgTable("hotspot_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  routerId: uuid("router_id")
    .notNull()
    .references(() => routers.id, { onDelete: "cascade" }),
  mikrotikId: varchar("mikrotik_id", { length: 100 }),
  name: varchar("name", { length: 100 }).notNull(),
  password: varchar("password", { length: 100 }),
  profile: varchar("profile", { length: 100 }),
  macAddress: varchar("mac_address", { length: 17 }),
  ipAddress: varchar("ip_address", { length: 50 }),
  comment: text("comment"),
  disabled: boolean("disabled").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  uptime: varchar("uptime", { length: 50 }),
  bytesIn: bigint("bytes_in", { mode: "number" }),
  bytesOut: bigint("bytes_out", { mode: "number" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pppoeUsers = pgTable("pppoe_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  routerId: uuid("router_id")
    .notNull()
    .references(() => routers.id, { onDelete: "cascade" }),
  mikrotikId: varchar("mikrotik_id", { length: 100 }),
  name: varchar("name", { length: 100 }).notNull(),
  password: varchar("password", { length: 100 }),
  service: varchar("service", { length: 50 }).default("pppoe"),
  profile: varchar("profile", { length: 100 }),
  callerId: varchar("caller_id", { length: 50 }),
  remoteAddress: varchar("remote_address", { length: 50 }),
  comment: text("comment"),
  disabled: boolean("disabled").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  lastSeen: timestamp("last_seen", { withTimezone: true }),
  uptime: varchar("uptime", { length: 50 }),
  bytesIn: bigint("bytes_in", { mode: "number" }),
  bytesOut: bigint("bytes_out", { mode: "number" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const backupConfigs = pgTable("backup_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  routerId: uuid("router_id")
    .notNull()
    .references(() => routers.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  configData: text("config_data").notNull(),
  fileName: varchar("file_name", { length: 255 }),
  fileSize: integer("file_size"),
  backupType: backupTypeEnum("backup_type").notNull().default("export"),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Notifications / Audit ────────────────────────────────────────────────────

export const telegramConfigs = pgTable("telegram_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  chatId: varchar("chat_id", { length: 50 }).notNull(),
  routerId: uuid("router_id").references(() => routers.id, {
    onDelete: "set null",
  }),
  alertsEnabled: boolean("alerts_enabled").notNull().default(true),
  cpuThreshold: smallint("cpu_threshold").notNull().default(80),
  memoryThreshold: smallint("memory_threshold").notNull().default(80),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const alertLogs = pgTable("alert_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  routerId: uuid("router_id").references(() => routers.id, {
    onDelete: "set null",
  }),
  chatId: varchar("chat_id", { length: 50 }),
  alertType: varchar("alert_type", { length: 100 }),
  message: text("message").notNull(),
  severity: logSeverityEnum("severity").notNull().default("warning"),
  resolved: boolean("resolved").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const activityLog = pgTable("activity_log", {
  id: serial("id").primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 100 }),
  entityId: varchar("entity_id", { length: 100 }),
  changes: jsonb("changes"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const appSettings = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  key: varchar("key", { length: 100 }).notNull(),
  value: text("value"),
  type: varchar("type", { length: 20 }).notNull().default("string"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const nmsDevices = pgTable("nms_devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }),
  ip: varchar("ip", { length: 50 }).notNull(),
  type: nmsDeviceTypeEnum("type").notNull().default("other"),
  community: varchar("community", { length: 100 }).default("public"),
  status: varchar("status", { length: 20 }).notNull().default("unknown"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  snmpData: jsonb("snmp_data"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Relations ────────────────────────────────────────────────────────────────

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  routers: many(routers),
  customers: many(customers),
  packages: many(packages),
  orders: many(orders),
  vouchers: many(vouchers),
  supportTickets: many(supportTickets),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  org: one(organizations, { fields: [users.orgId], references: [organizations.id] }),
  refreshTokens: many(refreshTokens),
}));

export const routersRelations = relations(routers, ({ one, many }) => ({
  org: one(organizations, { fields: [routers.orgId], references: [organizations.id] }),
  wireguardPeers: many(wireguardPeers),
  pingTargets: many(pingTargets),
  resourceSnapshots: many(resourceSnapshots),
  bandwidthSnapshots: many(bandwidthSnapshots),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  org: one(organizations, { fields: [customers.orgId], references: [organizations.id] }),
  subscriptions: many(subscriptions),
  orders: many(orders),
  supportTickets: many(supportTickets),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  customer: one(customers, { fields: [subscriptions.customerId], references: [customers.id] }),
  package: one(packages, { fields: [subscriptions.packageId], references: [packages.id] }),
  router: one(routers, { fields: [subscriptions.routerId], references: [routers.id] }),
}));

export const ordersRelations = relations(orders, ({ one }) => ({
  org: one(organizations, { fields: [orders.orgId], references: [organizations.id] }),
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  package: one(packages, { fields: [orders.packageId], references: [packages.id] }),
  subscription: one(subscriptions, { fields: [orders.subscriptionId], references: [subscriptions.id] }),
  reviewer: one(users, { fields: [orders.reviewedBy], references: [users.id] }),
  invoice: one(invoices, { fields: [orders.id], references: [invoices.orderId] }),
}));

export const invoicesRelations = relations(invoices, ({ one }) => ({
  order: one(orders, { fields: [invoices.orderId], references: [orders.id] }),
  customer: one(customers, { fields: [invoices.customerId], references: [customers.id] }),
}));

// ─── Type Exports ─────────────────────────────────────────────────────────────

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = typeof organizations.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type Router = typeof routers.$inferSelect;
export type InsertRouter = typeof routers.$inferInsert;
export type WireguardPeer = typeof wireguardPeers.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = typeof customers.$inferInsert;
export type Package = typeof packages.$inferSelect;
export type InsertPackage = typeof packages.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type Voucher = typeof vouchers.$inferSelect;
export type InsertVoucher = typeof vouchers.$inferInsert;
export type HotspotTemplate = typeof hotspotTemplates.$inferSelect;
export type InsertHotspotTemplate = typeof hotspotTemplates.$inferInsert;
export type SupportTicket = typeof supportTickets.$inferSelect;
export type SupportMessage = typeof supportMessages.$inferSelect;
export type ResourceSnapshot = typeof resourceSnapshots.$inferSelect;
export type BandwidthSnapshot = typeof bandwidthSnapshots.$inferSelect;
export type PingSnapshot = typeof pingSnapshots.$inferSelect;
export type SfpSnapshot = typeof sfpSnapshots.$inferSelect;
export type PingTarget = typeof pingTargets.$inferSelect;
export type TelegramConfig = typeof telegramConfigs.$inferSelect;
export type AlertLog = typeof alertLogs.$inferSelect;
export type ActivityLog = typeof activityLog.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;
export type NmsDevice = typeof nmsDevices.$inferSelect;
export type PppoeUser = typeof pppoeUsers.$inferSelect;
export type HotspotUser = typeof hotspotUsers.$inferSelect;
export type BackupConfig = typeof backupConfigs.$inferSelect;
export type FirewallRule = typeof firewallRules.$inferSelect;
export type DhcpLease = typeof dhcpLeases.$inferSelect;
export type RouteEntry = typeof routeEntries.$inferSelect;
export type PaymentConfig = typeof paymentConfigs.$inferSelect;
