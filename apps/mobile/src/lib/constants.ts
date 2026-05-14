export const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? "https://api.skynity.org";
export const DEFAULT_ORG_ID = process.env.EXPO_PUBLIC_ORG_ID ?? "";

export const STORAGE_KEYS = {
  TOKEN: "isp_portal_token",
  CUSTOMER: "isp_portal_customer",
  ORG_ID: "isp_portal_org_id",
  BIOMETRIC_ENABLED: "isp_biometric_enabled",
  PUSH_TOKEN: "isp_push_token",
} as const;

export const COLORS = {
  primary: "#3b82f6",
  primaryDark: "#2563eb",
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
  background: "#0f172a",
  surface: "#1e293b",
  border: "#334155",
  text: "#f1f5f9",
  textMuted: "#94a3b8",
} as const;
