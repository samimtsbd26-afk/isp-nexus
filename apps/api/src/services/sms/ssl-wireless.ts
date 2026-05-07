import type { SmsProvider, SmsResult } from "./provider.js";
import { normalizeBdPhone } from "./provider.js";

export class SslWirelessProvider implements SmsProvider {
  readonly name = "ssl_wireless";

  constructor(
    private readonly apiToken: string,
    private readonly senderId: string,
  ) {}

  async send(to: string, message: string): Promise<SmsResult> {
    const phone = normalizeBdPhone(to).replace("+", "");
    try {
      const res = await fetch("https://globalsms.sslwireless.com/api/v3/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${this.apiToken}` },
        body: JSON.stringify({
          api_token: this.apiToken,
          sid: this.senderId,
          msisdn: phone,
          sms: message,
          csms_id: `ISNX-${Date.now()}`,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.status_code !== 1000) {
        return { success: false, error: data?.status_text ?? `HTTP ${res.status}`, provider: this.name };
      }
      return { success: true, messageId: data?.smslogid ?? undefined, provider: this.name };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error", provider: this.name };
    }
  }
}
