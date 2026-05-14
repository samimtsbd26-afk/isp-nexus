import { API_BASE, DEFAULT_ORG_ID } from "./constants";

// ── tRPC wire helpers ─────────────────────────────────────────────────────────

function encodeInput(input: unknown): string {
  return encodeURIComponent(JSON.stringify({ json: input }));
}

async function trpcGet<T>(procedure: string, input: unknown): Promise<T> {
  const url = `${API_BASE}/api/trpc/${procedure}?input=${encodeInput(input)}`;
  const res = await fetch(url, { headers: { "Content-Type": "application/json" } });
  const body = await res.json() as { result?: { data?: { json: T } }; error?: { message: string; data?: { code: string } } };
  if (body.error) throw new ApiError(body.error.message, body.error.data?.code ?? "UNKNOWN", res.status);
  return body.result?.data?.json as T;
}

async function trpcPost<T>(procedure: string, input: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/api/trpc/${procedure}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ json: input }),
  });
  const body = await res.json() as { result?: { data?: { json: T } }; error?: { message: string; data?: { code: string } } };
  if (body.error) throw new ApiError(body.error.message, body.error.data?.code ?? "UNKNOWN", res.status);
  return body.result?.data?.json as T;
}

export class ApiError extends Error {
  constructor(message: string, public code: string, public status: number) {
    super(message);
    this.name = "ApiError";
  }
}

// ── Public endpoints ─────────────────────────────────────────────────────────

export async function getOrgSettings(orgId: string) {
  return trpcGet<OrgSettings>("settings.publicOrgSettings", { orgId });
}

export async function getPackages(orgId: string) {
  return trpcGet<Package[]>("portal.publicPackages", { orgId });
}

export async function getPaymentConfigs(orgId: string) {
  return trpcGet<PaymentConfig[]>("settings.publicPaymentConfigs", { orgId });
}

export async function getSupportInfo(orgId: string) {
  return trpcGet<SupportInfo>("portal.getSupportInfo", { orgId });
}

// ── Auth endpoints ─────────────────────────────────────────────────────────

export async function login(orgId: string, phone: string, password: string) {
  return trpcPost<LoginResult>("portal.login", { orgId, phone, password });
}

export async function register(orgId: string, input: RegisterInput) {
  return trpcPost<LoginResult>("portal.register", { ...input, orgId });
}

export async function checkOrder(orderId: string, phone: string) {
  return trpcGet<{ status: string; packageName: string | null }>(
    "portal.checkOrder", { orderId, phone },
  );
}

// ── Authenticated portal endpoints ─────────────────────────────────────────

export async function getDashboard(token: string) {
  return trpcPost<DashboardData>("portal.dashboard", { token });
}

export async function getMyOrders(token: string) {
  return trpcPost<Order[]>("portal.myOrders", { token });
}

export async function submitOrder(token: string, input: SubmitOrderInput) {
  return trpcPost<{ orderId: string }>("portal.submitOrder", { ...input, token });
}

export async function changePassword(token: string, currentPassword: string, newPassword: string) {
  return trpcPost<{ ok: boolean }>("portal.changePassword", { token, currentPassword, newPassword });
}

export async function getDeviceBindings(token: string) {
  return trpcPost<DeviceBinding[]>("portal.getDeviceBindings", { token });
}

export async function resetDevice(token: string, bindingId: string) {
  return trpcPost<{ ok: boolean }>("portal.resetDevice", { token, bindingId });
}

export async function logoutAllSessions(token: string) {
  return trpcPost<{ ok: boolean }>("portal.logoutAllSessions", { token });
}

export async function getActiveSession(token: string) {
  return trpcPost<ActiveSession | null>("portal.getActiveSession", { token });
}

export async function getNotifications(token: string) {
  return trpcPost<PortalNotification[]>("portal.getNotifications", { token });
}

export async function markNotificationsRead(token: string) {
  return trpcPost<{ ok: boolean }>("portal.markNotificationsRead", { token });
}

export async function openSupportTicket(token: string, subject: string, message: string) {
  return trpcPost<{ id: string }>("portal.openTicket", { token, subject, message });
}

export async function getMyTickets(token: string) {
  return trpcPost<SupportTicket[]>("portal.myTickets", { token });
}

export async function redeemVoucher(orgId: string, code: string) {
  return trpcPost<{ ok: boolean; message: string }>("portal.redeemVoucher", { orgId, code: code.toUpperCase() });
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OrgSettings {
  orgName: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  supportPhone?: string | null;
}

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
  isActive: boolean;
}

export interface PaymentConfig {
  method: string;
  accountNumber: string;
  accountType?: string | null;
  instructions?: string | null;
}

export interface SupportInfo {
  whatsappNumber: string | null;
  callNumber: string | null;
  supportEmail: string | null;
  faqUrl: string | null;
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
  password: string;
  email?: string;
  username?: string;
}

export interface DashboardData {
  customer: {
    id: string;
    fullName: string;
    phone: string;
    customerCode: string;
    email?: string | null;
    address?: string | null;
  };
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
