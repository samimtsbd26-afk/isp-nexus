import type { SmsProvider, SmsResult } from "./provider.js";
import { normalizeBdPhone } from "./provider.js";

export class GreenWebBdProvider implements SmsProvider {
  readonly name = "greenwebbd";

  constructor(
    private readonly token: string,
    private readonly senderId: string,
  ) {}

  async send(to: string, message: string): Promise<SmsResult> {
    const phone = normalizeBdPhone(to).replace("+", "");
    try {
      const res = await fetch("http://api.greenweb.com.bd/api.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: this.token, to: phone, message }).toString(),
        signal: AbortSignal.timeout(10_000),
      });
      const text = await res.text().catch(() => "");
      if (res.ok && text.includes("200")) {
        return { success: true, provider: this.name };
      }
      return { success: false, error: `Response: ${text.slice(0, 100)}`, provider: this.name };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error", provider: this.name };
    }
  }
}
