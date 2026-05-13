/**
 * Parse MikroTik RouterOS uptime string (e.g. "2d3h45m12s") to total seconds.
 * Returns 0 for empty / non-string / unparseable values.
 */
export function parseUptimeString(raw: unknown): number {
  if (typeof raw !== "string" || !raw) return 0;
  let seconds = 0;
  const d = raw.match(/(\d+)d/); if (d) seconds += parseInt(d[1], 10) * 86400;
  const h = raw.match(/(\d+)h/); if (h) seconds += parseInt(h[1], 10) * 3600;
  const m = raw.match(/(\d+)m/); if (m) seconds += parseInt(m[1], 10) * 60;
  const s = raw.match(/(\d+)s/); if (s) seconds += parseInt(s[1], 10);
  return seconds;
}

/** Format uptime seconds to human-readable "2d 3h" / "45m" / "—". */
export function formatUptimeSeconds(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
