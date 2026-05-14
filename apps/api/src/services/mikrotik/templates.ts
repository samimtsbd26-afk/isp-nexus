/**
 * RouterOS script template generators.
 * All functions return plain RouterOS script strings safe to push via
 * /system/script or paste into a terminal.
 *
 * Design rules:
 *  - No shell interpolation — params are typed, not user strings
 *  - Each section is independent and idempotent where RouterOS allows
 *  - Heavy logic runs on VPS; router only executes the generated script
 */

export interface PortPlan {
  wan: string;      // e.g. "ether1"
  hotspot: string;  // e.g. "ether2"
  pppoe: string;    // e.g. "ether3"
  lan: string;      // e.g. "ether4"
  admin: string;    // e.g. "ether5"
}

export interface IpPlan {
  hotspotSubnet: string;   // e.g. "192.168.88.0/24"
  hotspotPool: string;     // e.g. "192.168.88.10-192.168.88.254"
  hotspotGateway: string;  // e.g. "192.168.88.1"
  pppoeLocalPool: string;  // e.g. "10.10.0.0/24"
  lanSubnet: string;       // e.g. "192.168.1.0/24"
  lanGateway: string;      // e.g. "192.168.1.1"
}

export interface RadiusParams {
  vpsIp: string;
  secret: string;
  authPort: number;
  acctPort: number;
}

export interface ProvisionParams {
  routerName: string;
  ports: PortPlan;
  ip: IpPlan;
  radius: RadiusParams;
  hotspotDnsName: string;
  hotspotLoginUrl: string;
  ntpServer?: string;
  timezone?: string;
}

// ─── Section builders ─────────────────────────────────────────────────────────

export function buildSystemScript(p: ProvisionParams): string {
  const tz = p.timezone ?? "Asia/Dhaka";
  const ntp = p.ntpServer ?? "time.cloudflare.com";
  return [
    "# ── System identity & time ──",
    `/system identity set name="${esc(p.routerName)}"`,
    `/system clock set time-zone-name=${esc(tz)}`,
    `/system ntp client set enabled=yes`,
    `/system ntp client servers add address=${esc(ntp)}`,
  ].join("\n");
}

export function buildInterfaceCommentScript(ports: PortPlan): string {
  return [
    "# ── Interface labels ──",
    `/interface set [find name="${esc(ports.wan)}"]     comment="WAN-Starlink"`,
    `/interface set [find name="${esc(ports.hotspot)}"] comment="Hotspot"`,
    `/interface set [find name="${esc(ports.pppoe)}"]   comment="PPPoE"`,
    `/interface set [find name="${esc(ports.lan)}"]     comment="Office-LAN"`,
    `/interface set [find name="${esc(ports.admin)}"]   comment="Admin-PC"`,
  ].join("\n");
}

export function buildIpAddressingScript(ports: PortPlan, ip: IpPlan): string {
  const hotspotMask = subnetBits(ip.hotspotSubnet);
  const lanMask = subnetBits(ip.lanSubnet);
  return [
    "# ── IP addressing ──",
    "/ip address",
    `:do { add address=${esc(ip.hotspotGateway)}/${hotspotMask} interface=${esc(ports.hotspot)} comment="Hotspot-GW" } on-error={}`,
    `:do { add address=${esc(ip.lanGateway)}/${lanMask} interface=${esc(ports.lan)} comment="Office-LAN" } on-error={}`,
    "",
    "# ── IP pools ──",
    "/ip pool",
    `:do { add name="hotspot-pool" ranges=${esc(ip.hotspotPool)} } on-error={}`,
    `:do { add name="pppoe-pool"   ranges=${esc(poolFromSubnet(ip.pppoeLocalPool))} } on-error={}`,
    "",
    "# ── DHCP for hotspot interface ──",
    "/ip dhcp-server",
    `:do { add name="hotspot-dhcp" interface=${esc(ports.hotspot)} address-pool="hotspot-pool" disabled=no } on-error={}`,
    "/ip dhcp-server network",
    `:do { add address=${esc(ip.hotspotSubnet)} gateway=${esc(ip.hotspotGateway)} dns-server=1.1.1.1,8.8.8.8 comment="Hotspot" } on-error={}`,
  ].join("\n");
}

export function buildRadiusScript(r: RadiusParams): string {
  return [
    "# ── RADIUS client ──",
    "/radius",
    `:do { add address=${esc(r.vpsIp)} secret="${esc(r.secret)}" service=hotspot,ppp authentication-port=${r.authPort} accounting-port=${r.acctPort} timeout=3000 comment="ISP-Nexus" } on-error={}`,
    `/radius incoming set accept=yes port=3799`,
  ].join("\n");
}

export function buildHotspotScript(
  ports: PortPlan,
  ip: IpPlan,
  hotspotDns: string,
  vpsIp: string,
): string {
  return [
    "# ── Hotspot server profile ──",
    "/ip hotspot profile",
    `:do { add name="isp-nexus-profile" hotspot-address=${esc(ip.hotspotGateway)} dns-name="${esc(hotspotDns)}" login-by=http-chap,http-pap use-radius=yes radius-accounting=yes html-directory=hotspot http-cookie-lifetime=1d } on-error={}`,
    "",
    `# ── Hotspot server on ${ports.hotspot} ──`,
    "/ip hotspot",
    `:do { add name="hotspot1" interface=${esc(ports.hotspot)} profile="isp-nexus-profile" address-pool="hotspot-pool" idle-timeout=none keepalive-timeout=2m login-timeout=5m disabled=no } on-error={}`,
    "",
    "# ── Walled garden (allow captive portal) ──",
    "/ip hotspot walled-garden",
    `:do { add dst-host="${esc(hotspotDns)}" action=allow comment="Portal-Domain" } on-error={}`,
    "/ip hotspot walled-garden ip",
    `:do { add dst-address=${esc(vpsIp)} action=accept comment="Portal-VPS-IP" } on-error={}`,
  ].join("\n");
}

export function buildPppoeScript(ports: PortPlan): string {
  return [
    "# ── PPPoE server ──",
    "/interface pppoe-server server",
    `:do { add service-name="isp-nexus-pppoe" interface=${esc(ports.pppoe)} default-profile=default authentication=chap,mschap2 keepalive-timeout=30 max-mru=1480 max-mtu=1480 one-session-per-host=yes disabled=no } on-error={}`,
  ].join("\n");
}

export function buildQueueTreeScript(sharedPoolMbps: number): string {
  const kbps = sharedPoolMbps * 1000;
  return [
    "# ── Queue tree — shared bandwidth pool ──",
    "/queue type",
    `:do { add name="pcq-download" kind=pcq pcq-classifier=dst-address pcq-rate=0 pcq-limit=100KiB } on-error={}`,
    `:do { add name="pcq-upload"   kind=pcq pcq-classifier=src-address pcq-rate=0 pcq-limit=100KiB } on-error={}`,
    "",
    "/queue tree",
    `:do { add name="isp-nexus-shared-down" parent=global max-limit=${kbps}k comment="Shared-Pool-Down" } on-error={}`,
    `:do { add name="isp-nexus-shared-up"   parent=global max-limit=${kbps}k comment="Shared-Pool-Up"   } on-error={}`,
  ].join("\n");
}

export function buildFirewallBaselineScript(ports: PortPlan): string {
  return [
    "# ── Firewall baseline ──",
    "/ip firewall filter",
    `:do { add chain=input   action=drop connection-state=invalid comment="Drop-Invalid-In"  } on-error={}`,
    `:do { add chain=forward action=drop connection-state=invalid comment="Drop-Invalid-Fwd" } on-error={}`,
    `:do { add chain=input   action=accept connection-state=established,related comment="Allow-Est-In"  } on-error={}`,
    `:do { add chain=forward action=accept connection-state=established,related comment="Allow-Est-Fwd" } on-error={}`,
    `:do { add chain=input   action=accept protocol=icmp comment="Allow-ICMP" } on-error={}`,
    `# API (8728/8729) — admin interface only`,
    `:do { add chain=input action=accept protocol=tcp dst-port=8728,8729 in-interface=${esc(ports.admin)} comment="API-Admin-Only" } on-error={}`,
    `:do { add chain=input action=drop   protocol=tcp dst-port=8728,8729 comment="API-Drop-Other"  } on-error={}`,
    `# Winbox — admin interface only`,
    `:do { add chain=input action=accept protocol=tcp dst-port=8291 in-interface=${esc(ports.admin)} comment="Winbox-Admin-Only" } on-error={}`,
    `:do { add chain=input action=drop   protocol=tcp dst-port=8291 comment="Winbox-Drop-Other"  } on-error={}`,
    `# SSH — admin interface only`,
    `:do { add chain=input action=accept protocol=tcp dst-port=22 in-interface=${esc(ports.admin)} comment="SSH-Admin-Only" } on-error={}`,
    `:do { add chain=input action=drop   protocol=tcp dst-port=22 comment="SSH-Drop-Other" } on-error={}`,
    "",
    "/ip firewall nat",
    `:do { add chain=srcnat action=masquerade out-interface=${esc(ports.wan)} comment="NAT-WAN" } on-error={}`,
  ].join("\n");
}

export function buildDnsScript(): string {
  return `/ip dns set servers=1.1.1.1,8.8.8.8 allow-remote-requests=yes`;
}

// ─── Full provisioning script ─────────────────────────────────────────────────

export function buildFullProvisioningScript(
  p: ProvisionParams,
  sharedPoolMbps = 450,
): string {
  const ts = new Date().toISOString();
  return [
    `# ISP Nexus Auto-Provisioning — ${ts}`,
    `# Router: ${p.routerName}`,
    `# Idempotent: safe to re-run. Existing entries are preserved via :on-error={}`,
    "",
    buildSystemScript(p),
    "",
    buildInterfaceCommentScript(p.ports),
    "",
    buildIpAddressingScript(p.ports, p.ip),
    "",
    buildRadiusScript(p.radius),
    "",
    buildHotspotScript(p.ports, p.ip, p.hotspotDnsName, p.radius.vpsIp),
    "",
    buildPppoeScript(p.ports),
    "",
    buildQueueTreeScript(sharedPoolMbps),
    "",
    buildFirewallBaselineScript(p.ports),
    "",
    buildDnsScript(),
    "",
    `:log info message="ISP-Nexus provisioning complete"`,
  ].join("\n");
}

// ─── IP block/unblock fragments ───────────────────────────────────────────────

export function buildBlockIpScript(ip: string, comment: string): string {
  return `/ip firewall filter add chain=forward action=drop src-address=${esc(ip)} comment="${esc(comment)}"`;
}

export function buildUnblockIpScript(comment: string): string {
  return `/ip firewall filter :do { remove [find comment="${esc(comment)}"] } on-error={}`;
}

// ─── WireGuard peer script ────────────────────────────────────────────────────

export function buildWireguardPeerScript(params: {
  interfaceName: string;
  publicKey: string;
  allowedAddress: string;
  presharedKey?: string;
  comment?: string;
}): string {
  const psk = params.presharedKey ? ` preshared-key="${esc(params.presharedKey)}"` : "";
  const cmt = params.comment ? ` comment="${esc(params.comment)}"` : "";
  return `/interface wireguard peers add interface=${esc(params.interfaceName)} public-key="${esc(params.publicKey)}" allowed-address=${esc(params.allowedAddress)}${psk}${cmt}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esc(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function subnetBits(cidr: string): string {
  return cidr.split("/")[1] ?? "24";
}

function poolFromSubnet(cidr: string): string {
  // "10.10.0.0/24" → "10.10.0.2-10.10.0.254"
  const base = cidr.split("/")[0] ?? "10.10.0.0";
  const prefix = base.split(".").slice(0, 3).join(".");
  return `${prefix}.2-${prefix}.254`;
}
