import type { SmsProvider, SmsResult } from "./provider.js";
import { normalizeBdPhone } from "./provider.js";

export class BulkSmsBdProvider implements SmsProvider {
  readonly name = "bulksmsbd";

  constructor(
    private readonly apiKey: string,
    private readonly senderId: string,
  ) {}

  async send(to: string, message: string): Promise<SmsResult> {
    const phone = normalizeBdPhone(to).replace("+", "");
    try {
      const params = new URLSearchParams({
        api_key: this.apiKey,
        type: "text",
        number: phone,
        senderid: this.senderId,
        message,
      });
      const res = await fetch(`https://bulksmsbd.net/api/smsapi?${params}`, {
        signal: AbortSignal.timeout(10_000),
      });
      const text = await res.text();
      const json = JSON.parse(text).catch?.(() => ({})) ?? {};
      // BulkSMSBD returns "1701" on success
      const responseCode = String(json?.response_code ?? json?.code ?? text).trim();
      if (responseCode === "1701" || responseCode === "200") {
        return { success: true, messageId: json?.id ?? undefined, provider: this.name };
      }
      return { success: false, error: `Response: ${responseCode}`, provider: this.name };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error", provider: this.name };
    }
  }
}
