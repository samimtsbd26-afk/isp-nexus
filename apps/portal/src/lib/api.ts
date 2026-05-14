// Typed API helpers for the portal — all calls go through the API proxy.

import { trpcEncodeQueryInput, trpcSerializeWire, trpcParseResponse } from "./trpc-wire";

const ORG_ID = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_ORG_ID ?? "212d7393-7375-4321-93f5-4789deb8b317";

async function trpc<T>(procedure: string, input: unknown, method: "GET" | "POST" = "POST"): Promise<T> {
  if (method === "GET") {
    const inputParam = trpcEncodeQueryInput(input ?? null);
    const res = await fetch(`/api/trpc/${procedure}?input=${inputParam}`, { credentials: "include" });
    const data = (await res.json()) as Record<string, unknown>;
    return trpcParseResponse<T>(data);
  }
  const res = await fetch(`/api/trpc/${procedure}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: trpcSerializeWire(input ?? null),
  });
  const data = (await res.json()) as Record<string, unknown>;
  return trpcParseResponse<T>(data);
}

export const api = {
  orgId: ORG_ID,

  // ── Public ────────────────────────────────────────────────────────────────
  async getPackages() {
    return trpc<Package[]>("portal.publicPackages", { orgId: ORG_ID }, "GET");
  },

  async checkMac(mac: string) {
    return trpc<{ hasSubscription: boolean; isNewDevice: boolean; hasTrial: boolean }>(
      "portal.macCheck", { orgId: ORG_ID, mac }, "GET",
    );
  },

  async getPaymentConfigs() {
    return trpc<Array<{ method: string; accountNumber: string; accountType?: string | null; instructions?: string | null }>>(
      "settings.publicPaymentConfigs", { orgId: ORG_ID }, "GET",
    );
  },

  async trialStatus() {
    const res = await fetch(`/api/portal/trial/status?orgId=${encodeURIComponent(ORG_ID)}`, { credentials: "include" });
    const json = (await res.json()) as { data?: { available: boolean; packageId: string | null }; error?: string };
    if (!res.ok || json.error) throw new Error(json.error ?? "Trial status failed");
    const data = json.data;
    if (!data) throw new Error("Invalid trial status response");
    return data;
  },

  // ── Auth ──────────────────────────────────────────────────────────────────
  async login(phone: string, password: string) {
    return trpc<LoginResult>("portal.login", { orgId: ORG_ID, phone, password });
  },

  async register(input: RegisterInput) {
    return trpc<LoginResult>("portal.register", { ...input, orgId: ORG_ID });
  },

  async trialRegister(input: TrialRegisterInput) {
    return trpc<TrialRegisterResult>("portal.trialRegister", {
      ...input,
      orgId: ORG_ID,
    });
  },

  async getOrderStatus(orderId: string, phone: string) {
    return trpc<{ status: string; packageName: string | null }>(
      "portal.checkOrder", { orderId, phone }, "GET",
    );
  },

  async approvalStatus(phone: string) {
    const res = await fetch(
      `/api/portal/approval-status?orgId=${encodeURIComponent(ORG_ID)}&phone=${encodeURIComponent(phone)}`,
      { credentials: "include" },
    );
    const json = (await res.json()) as { data?: ApprovalStatusResult; error?: string };
    return json.data ?? null;
  },

  async guestOrder(input: GuestOrderInput) {
    const res = await fetch("/api/portal/payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, orgId: ORG_ID }),
    });
    const data = await res.json();
    if (data?.error) throw new Error(data.error ?? "Order failed");
    return data.data as GuestOrderResult;
  },

  // ── Authed ────────────────────────────────────────────────────────────────
  async getDashboard(token: string) {
    return trpc<DashboardData>("portal.dashboard", { token });
  },

  async getMyOrders(token: string) {
    return trpc<Order[]>("portal.myOrders", { token });
  },

  async submitOrder(token: string, input: SubmitOrderInput) {
    return trpc<{ orderId: string }>("portal.submitOrder", { ...input, token });
  },

  async changePassword(token: string, currentPassword: string, newPassword: string) {
    return trpc<{ ok: boolean }>("portal.changePassword", { token, currentPassword, newPassword });
  },

  async getDeviceBindings(token: string) {
    return trpc<DeviceBinding[]>("portal.getDeviceBindings", { token });
  },

  async resetDevice(token: string, bindingId: string) {
    return trpc<{ ok: boolean }>("portal.resetDevice", { token, bindingId });
  },

  async logoutAllSessions(token: string) {
    return trpc<{ ok: boolean }>("portal.logoutAllSessions", { token });
  },

  async getActiveSession(token: string) {
    return trpc<ActiveSession | null>("portal.getActiveSession", { token });
  },

  async getNotifications(token: string) {
    return trpc<PortalNotification[]>("portal.getNotifications", { token });
  },

  async markNotificationsRead(token: string) {
    return trpc<{ ok: boolean }>("portal.markNotificationsRead", { token });
  },

  async openSupportTicket(token: string, subject: string, message: string) {
    return trpc<{ id: string }>("portal.openTicket", { token, subject, message });
  },

  async getMyTickets(token: string) {
    return trpc<SupportTicket[]>("portal.myTickets", { token });
  },

  async getSupportInfo(orgId: string) {
    return trpc<SupportInfo>("portal.getSupportInfo", { orgId }, "GET");
  },
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Package {
  id: string;
  name: string;
  type: "pppoe" | "hotspot" | "static";
  downloadMbps: number;
  uploadMbps: number;
  priceBdt: number;
  validityDays: number;
  isTrial: boolean;
  description?: string | null;
  features: string[];
  sortOrder: number;
  isActive: boolean;
}

export interface LoginResult {
  token: string;
  customer: { id: string; fullName: string; phone: string; customerCode: string };
  username?: string;
  password?: string;
}

export interface RegisterInput {
  fullName: string;
  phone: string;
  email?: string;
  password: string;
  username?: string;
}

export interface TrialRegisterInput {
  fullName: string;
  phone: string;
  password: string;
  packageId: string;
  macAddress?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface TrialRegisterResult {
  orderId: string;
  customerId: string;
  pending: true;
}

export interface GuestOrderInput {
  fullName: string;
  phone: string;
  password: string;
  packageId: string;
  paymentMethod: "bkash" | "nagad" | "rocket" | "cash" | "bank" | "free";
  trxId?: string;
  paymentFrom?: string;
  isTrial: boolean;
}

export interface GuestOrderResult {
  orderId?: string;
  customerId?: string;
  username?: string;
  password?: string;
  isTrial?: boolean;
  token?: string;
  customer?: { id: string; fullName: string; phone: string };
}

export interface DashboardData {
  customer: { id: string; fullName: string; phone: string; customerCode: string; email?: string | null; address?: string | null };
  subscriptions: Subscription[];
  recentOrders: Order[];
  packages: Package[];
}

export interface Subscription {
  id: string;
  username: string;
  status: "active" | "suspended" | "expired" | "cancelled";
  startedAt?: string | null;
  expiresAt?: string | null;
  packageId?: string | null;
}

export interface Order {
  id: string;
  amountBdt: number;
  status: "pending" | "approved" | "rejected" | "refunded";
  paymentMethod?: string | null;
  trxId?: string | null;
  createdAt: string;
  packageId?: string | null;
}

export interface SubmitOrderInput {
  packageId: string;
  amountBdt: number;
  paymentMethod: "bkash" | "nagad" | "rocket" | "cash" | "bank" | "free";
  trxId?: string;
  paymentFrom?: string;
}

export interface ApprovalStatusResult {
  approved: boolean;
  status: string;
  hotspotUsername?: string | null;
  hotspotPassword?: string | null;
  customerName?: string | null;
  phone?: string | null;
  packageName?: string | null;
  expiresAt?: string | null;
}

export interface DeviceBinding {
  id: string;
  macAddress: string | null;
  ipAddress: string | null;
  description: string | null;
  createdAt: string;
}

export interface ActiveSession {
  username: string;
  address: string;
  uptime: string;
  rxBytes: number;
  txBytes: number;
}

export interface PortalNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
}

export interface SupportInfo {
  whatsappNumber: string | null;
  callNumber: string | null;
  supportEmail: string | null;
  faqUrl: string | null;
}

// ── Auth helpers ─────────────────────────────────────────────────────────────
export const auth = {
  getToken: () => localStorage.getItem("isp_portal_token"),
  setToken: (token: string) => localStorage.setItem("isp_portal_token", token),
  clear: () => localStorage.removeItem("isp_portal_token"),
  isLoggedIn: () => !!localStorage.getItem("isp_portal_token"),
};
