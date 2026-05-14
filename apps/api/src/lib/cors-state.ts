/** Mutable CORS origin set — seeded from env at boot, updatable via admin panel without restart. */
export const allowedCorsOrigins = new Set<string>();

export function refreshCorsOrigins(origins: string[]): void {
  allowedCorsOrigins.clear();
  for (const o of origins) {
    const trimmed = o.trim();
    if (trimmed) allowedCorsOrigins.add(trimmed);
  }
}
