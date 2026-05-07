// Typed API helpers for the portal — all calls go through the API proxy.

const ORG_ID = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_ORG_ID ?? "212d7393-7375-4321-93f5-4789deb8b317";

async function trpc<T>(procedure: string, input: unknown, method: "GET" | "POST" = "POST"): Promise<T> {
  if (method === "GET") {
    const params = new URLSearchParams({ input: JSON.stringify({ json: input }) });
    const res = await fetch(`/api/trpc/${procedure}?${params}`, { credentials: "include" });
    const data = await res.json();
    if (data?.error) throw new Error(data.error.message ?? "Request failed");
    return data?.result?.data?.json as T;
  }
  const res = await fetch(`/api/trpc/${procedure}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ json: input }),
  });
  const data = await res.json();
  if (data?.error) throw new Error(data.error.message ?? "Request failed");
  return data?.result?.data?.json as T;
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
    return trpc<{ available: boolean; packageId: string | null }>(
      "api/portal/trial/status" as never, undefined, "GET",
    );
  },

  // ── Auth ──────────────────────────────────────────────────────────────────
  async login(phone: string, password: string) {
    return trpc<LoginResult>("portal.login", { orgId: ORG_ID, phone, password });
  },

  async register(input: RegisterInput) {
    return trpc<LoginResult>("portal.register", { ...input, orgId: ORG_ID });
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

// ── Auth helpers ─────────────────────────────────────────────────────────────
export const auth = {
  getToken: () => localStorage.getItem("isp_portal_token"),
  setToken: (token: string) => localStorage.setItem("isp_portal_token", token),
  clear: () => localStorage.removeItem("isp_portal_token"),
  isLoggedIn: () => !!localStorage.getItem("isp_portal_token"),
};
