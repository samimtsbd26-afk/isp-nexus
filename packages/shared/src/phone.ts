/**
 * Normalize a Bangladeshi phone number to the canonical 01XXXXXXXXX format.
 *
 * Handles:
 *   +8801700000077  → 01700000077
 *    8801700000077  → 01700000077
 *    01700000077    → 01700000077
 *   spaces, dashes, dots stripped automatically
 */
export function normalizePhone(raw: string): string {
  // Strip whitespace, dashes, dots, parentheses
  let p = raw.replace(/[\s\-.() ]/g, "");

  // +8801XXXXXXXXX → 01XXXXXXXXX
  if (p.startsWith("+880")) return "0" + p.slice(4);

  // 8801XXXXXXXXX (13 chars) → 01XXXXXXXXX
  if (p.startsWith("880") && p.length === 13) return "0" + p.slice(3);

  return p;
}
