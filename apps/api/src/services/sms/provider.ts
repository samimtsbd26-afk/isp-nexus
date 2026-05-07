// SMS provider abstraction — safe to add new providers without touching existing logic.

export interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider: string;
}

export interface SmsProvider {
  readonly name: string;
  send(to: string, message: string): Promise<SmsResult>;
}

// Normalize BD phone: 01XXXXXXXXX → +8801XXXXXXXXX
export function normalizeBdPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("880")) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `+88${digits}`;
  if (digits.length === 10) return `+880${digits}`;
  return `+${digits}`;
}

export function isValidBdPhone(phone: string): boolean {
  const normalized = normalizeBdPhone(phone);
  return /^\+8801[3-9]\d{8}$/.test(normalized);
}
