export type PackageDurationUnit = "hour" | "day";

export type PackageDurationSource = {
  durationValue?: number | null;
  durationUnit?: PackageDurationUnit | null;
  validityDays?: number | null;
  isTrial?: boolean | null;
};

/** Wall-clock length of the package (ignores isTrial). Uses duration fields, else legacy validityDays. */
export function packageBaseDurationSeconds(pkg: PackageDurationSource): number {
  const unit = pkg.durationUnit ?? "day";
  const raw = pkg.durationValue ?? pkg.validityDays ?? 30;
  const value = Math.max(1, Math.floor(Number(raw)) || 1);
  return unit === "hour" ? value * 3600 : value * 86400;
}

/** Length applied when activating a subscription (trial packages stay 3h). */
export function packageActivationDurationSeconds(pkg: PackageDurationSource): number {
  if (pkg.isTrial) return 3 * 3600;
  return packageBaseDurationSeconds(pkg);
}

export function packageLimitUptimeHours(pkg: PackageDurationSource): number {
  return Math.max(1, Math.ceil(packageActivationDurationSeconds(pkg) / 3600));
}

export function formatPackageDurationShort(pkg: PackageDurationSource): string {
  const unit = pkg.durationUnit ?? "day";
  const raw = pkg.durationValue ?? pkg.validityDays ?? 1;
  const v = Math.max(1, Math.floor(Number(raw)) || 1);
  return unit === "hour" ? `${v}h` : `${v}d`;
}

export function formatPackageDurationUpper(pkg: PackageDurationSource): string {
  return formatPackageDurationShort(pkg).toUpperCase();
}

/**
 * Append a duration suffix to a plan name only if the name does not already
 * end with that suffix (case-insensitive). Prevents "Free Trial 3H 3H".
 *
 * Examples:
 *   appendDurationSuffix("Free Trial 3H", "3H") → "Free Trial 3H"
 *   appendDurationSuffix("Starter Pack",  "3H") → "Starter Pack 3H"
 */
export function appendDurationSuffix(name: string, suffix: string): string {
  const base = name.trim();
  if (base.toUpperCase().endsWith(suffix.toUpperCase())) return base;
  return `${base} ${suffix}`.trim();
}

/** MikroTik hotspot user `comment` — visible on status.html as the plan label. */
export function hotspotPlanComment(pkg: { name: string } & PackageDurationSource): string {
  const label = formatPackageDurationUpper(pkg);
  return appendDurationSuffix(pkg.name, label);
}

/** Build a human-readable plan display string, avoiding duplicate duration suffixes. */
export function buildPlanDisplay(name: string | null | undefined, pkg: PackageDurationSource): string {
  const suffix = formatPackageDurationUpper(pkg);
  return appendDurationSuffix(name ?? "Plan", suffix);
}

/** Keep legacy validity_days column aligned for reporting and fallbacks. */
export function derivedValidityDays(durationValue: number, durationUnit: PackageDurationUnit): number {
  const v = Math.max(1, Math.floor(Number(durationValue)) || 1);
  return durationUnit === "day" ? v : Math.max(1, Math.ceil(v / 24));
}
