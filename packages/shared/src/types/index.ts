export type UserRole = "superadmin" | "admin" | "reseller" | "viewer";
export type PackageType = "pppoe" | "hotspot" | "static";
export type SubscriptionStatus = "active" | "suspended" | "expired" | "cancelled";
export type OrderStatus = "pending" | "approved" | "rejected" | "refunded";
export type PaymentMethod = "bkash" | "nagad" | "rocket" | "cash" | "bank" | "free";
export type VoucherStatus = "unused" | "used" | "expired" | "revoked";

export interface SessionPayload {
  userId: string;
  orgId: string;
  role: UserRole;
  type: "admin";
}

export interface PortalSessionPayload {
  customerId: string;
  orgId: string;
  type: "portal";
}

export interface SocketEvents {
  "resource:update": { routerId: string; cpuLoadPct: number; freeMemoryMb: number; totalMemoryMb: number; temperatureC?: number; voltageV?: number };
  "bandwidth:update": { routerId: string; interfaces: Array<{ name: string; rxBps: number; txBps: number }> };
  "ping:update": { routerId: string; target: string; avgMs: number; packetLossPct: number };
  "alert:new": { routerId: string; routerName: string; alertType: string; message: string; severity: string };
  "customer:new": { orgId: string; customerId: string; fullName: string; phone: string; packageName?: string | null; pendingApproval?: boolean };
  "order:new": { orgId: string; orderId: string; customerName: string; customerPhone: string; amountBdt: number; paymentMethod: string; trxId?: string };
  "order:approved": { orgId: string; orderId: string; customerName: string; amountBdt: number; packageName: string };
  "order:stats": { orgId: string; pendingCount: number; todayRevenue: number; totalActiveSubscriptions: number };
  "subscription:status": { subscriptionId: string; status: SubscriptionStatus };
  "sms:sent": { orgId: string; phone: string; status: "sent" | "failed" };
}

export interface MikroTikDevice {
  identity: string;
  model: string;
  rosVersion: string;
  serial: string;
  licenseLevel: number;
  uptime: string;
  architecture: string;
  boardName: string;
  cpuLoad: number;
  freeMemory: number;
  totalMemory: number;
  freeDisk: number;
  totalDisk: number;
  temperature?: number;
  voltage?: number;
}

export interface MikroTikInterface {
  id: string;
  name: string;
  type: string;
  mtu: number;
  actualMtu: number;
  macAddress: string;
  running: boolean;
  disabled: boolean;
  rxBytes: number;
  txBytes: number;
  rxPackets: number;
  txPackets: number;
  rxErrors: number;
  txErrors: number;
}

export interface MikroTikPppoeUser {
  id: string;
  name: string;
  password?: string;
  service: string;
  profile: string;
  callerId?: string;
  remoteAddress?: string;
  comment?: string;
  disabled: boolean;
}

export interface MikroTikHotspotUser {
  id: string;
  name: string;
  password?: string;
  profile: string;
  macAddress?: string;
  ipAddress?: string;
  comment?: string;
  disabled: boolean;
  uptime?: string;
  bytesIn?: number;
  bytesOut?: number;
}

export interface MikroTikQueue {
  id: string;
  name: string;
  target: string;
  maxLimit: string;
  burstLimit?: string;
  burstThreshold?: string;
  burstTime?: string;
  parent?: string;
  comment?: string;
  disabled: boolean;
  bytes: string;
  packets: string;
}

export interface MikroTikFirewallRule {
  id: string;
  chain: string;
  action: string;
  protocol?: string;
  srcAddress?: string;
  dstAddress?: string;
  srcPort?: string;
  dstPort?: string;
  inInterface?: string;
  outInterface?: string;
  comment?: string;
  disabled: boolean;
  bytes: number;
  packets: number;
}

export interface MikroTikNeighbor {
  id: string;
  identity: string;
  platform: string;
  version: string;
  interface: string;
  macAddress: string;
  ipAddress?: string;
  uptime: string;
}
