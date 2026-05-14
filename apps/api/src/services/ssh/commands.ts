/**
 * Approved SSH command templates.
 * All user-supplied values are allowlisted — NO shell interpolation of arbitrary input.
 *
 * Rule: if a command needs a user-supplied argument, it must be checked against
 * a strict allowlist before being included in the final command string.
 */

export const ALLOWED_SERVICES = new Set([
  "api", "web", "portal", "caddy", "postgres", "redis", "freeradius", "db-migrator",
]);

const ALLOWED_LOG_LINES = new Set([20, 50, 100, 200, 500]);

export type CommandKey =
  | "system:info"
  | "system:disk"
  | "system:uptime"
  | "docker:ps"
  | "docker:logs"
  | "docker:restart"
  | "docker:pull"
  | "caddy:reload"
  | "caddy:validate";

export interface CommandSpec {
  label: string;
  dangerous: boolean;
}

export const COMMAND_SPECS: Record<CommandKey, CommandSpec> = {
  "system:info": { label: "System info (CPU/memory)", dangerous: false },
  "system:disk": { label: "Disk usage", dangerous: false },
  "system:uptime": { label: "System uptime", dangerous: false },
  "docker:ps": { label: "Docker service status", dangerous: false },
  "docker:logs": { label: "Docker service logs", dangerous: false },
  "docker:restart": { label: "Restart Docker service", dangerous: true },
  "docker:pull": { label: "Pull latest Docker images", dangerous: true },
  "caddy:reload": { label: "Reload Caddy config", dangerous: false },
  "caddy:validate": { label: "Validate Caddy config", dangerous: false },
};

export function buildCommand(
  key: CommandKey,
  params: { service?: string; lines?: number } = {},
): string {
  const { service, lines = 50 } = params;

  // Validate service name against allowlist
  if (service !== undefined && !ALLOWED_SERVICES.has(service)) {
    throw new Error(`Service "${service}" is not in the allowed list`);
  }

  // Validate lines count
  const safeLines = ALLOWED_LOG_LINES.has(lines) ? lines : 50;

  switch (key) {
    case "system:info":
      return "free -h && echo '---' && cat /proc/loadavg";
    case "system:disk":
      return "df -h --output=source,size,used,avail,pcent,target | head -20";
    case "system:uptime":
      return "uptime && echo '---' && cat /proc/uptime";
    case "docker:ps":
      return "docker compose ps --format 'table {{.Name}}\\t{{.Status}}\\t{{.Ports}}'";
    case "docker:logs":
      if (!service) throw new Error("docker:logs requires a service name");
      return `docker compose logs --tail=${safeLines} --no-color ${service}`;
    case "docker:restart":
      if (!service) throw new Error("docker:restart requires a service name");
      return `docker compose restart ${service}`;
    case "docker:pull":
      return "docker compose pull";
    case "caddy:reload":
      return "docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile";
    case "caddy:validate":
      return "docker compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile";
    default:
      throw new Error(`Unknown command key: ${key}`);
  }
}
