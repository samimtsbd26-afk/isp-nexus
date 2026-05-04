import { Outlet, NavLink, useNavigate, useLocation } from "react-router";
import {
  LayoutDashboard, Router, Network, Wifi, Cpu, Gauge, Radio,
  Users, Server, Package, ShoppingCart, Ticket, BarChart3,
  Bot, Shield, Antenna, HardDrive, LogOut, Menu, X,
  ChevronDown, ChevronRight, Zap, Globe, Map, GitBranch, MonitorSpeaker,
  ScanLine, ReceiptText, ScrollText, Layers, Key, ActivitySquare, Settings,
} from "lucide-react";
import { useState } from "react";
import { trpc } from "../lib/trpc";
import { cn } from "../lib/utils";

interface NavItem { label: string; to: string; icon: React.ComponentType<{ size?: number; className?: string }> }
interface NavSection { title: string; items: NavItem[] }

const navSections: NavSection[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", to: "/", icon: LayoutDashboard },
      { label: "Routers", to: "/routers", icon: Router },
    ],
  },
  {
    title: "Monitoring",
    items: [
      { label: "Resource", to: "/monitoring", icon: Cpu },
      { label: "Bandwidth", to: "/monitoring/bandwidth", icon: Gauge },
      { label: "Ping", to: "/monitoring/ping", icon: Radio },
      { label: "SFP", to: "/monitoring/sfp", icon: ScanLine },
      { label: "Interfaces", to: "/interfaces", icon: MonitorSpeaker },
      { label: "Neighbors", to: "/neighbors", icon: Map },
    ],
  },
  {
    title: "Users",
    items: [
      { label: "PPPoE", to: "/pppoe", icon: Network },
      { label: "Hotspot", to: "/hotspot", icon: Wifi },
      { label: "DHCP Leases", to: "/dhcp", icon: Globe },
      { label: "Queues", to: "/queues", icon: Layers },
    ],
  },
  {
    title: "Network",
    items: [
      { label: "Firewall", to: "/firewall", icon: Shield },
      { label: "IP Addresses", to: "/ip", icon: Zap },
      { label: "Routes", to: "/routes", icon: GitBranch },
      { label: "WireGuard", to: "/wireguard", icon: Antenna },
    ],
  },
  {
    title: "ISP Portal",
    items: [
      { label: "Customers", to: "/customers", icon: Users },
      { label: "Subscriptions", to: "/subscriptions", icon: Server },
      { label: "Packages", to: "/packages", icon: Package },
      { label: "Orders", to: "/orders", icon: ShoppingCart },
      { label: "Invoices", to: "/invoices", icon: ReceiptText },
      { label: "Vouchers", to: "/vouchers", icon: Ticket },
      { label: "Support", to: "/support", icon: Ticket },
    ],
  },
  {
    title: "Analytics",
    items: [
      { label: "Analytics", to: "/analytics", icon: BarChart3 },
      { label: "Telegram Bot", to: "/telegram", icon: Bot },
    ],
  },
  {
    title: "System",
    items: [
      { label: "System Logs", to: "/system-logs", icon: ScrollText },
      { label: "Backup", to: "/backup", icon: HardDrive },
      { label: "Hotspot Template", to: "/hotspot/templates", icon: Layers },
      { label: "Activity Log", to: "/activity", icon: ActivitySquare },
      { label: "Settings", to: "/settings", icon: Settings },
      { label: "Users", to: "/users", icon: Key },
    ],
  },
];

function NavSectionGroup({ section, collapsed }: Readonly<{ section: NavSection; collapsed: boolean }>) {
  const location = useLocation();
  const hasActive = section.items.some((i) => i.to === "/" ? location.pathname === "/" : location.pathname.startsWith(i.to));
  const [open, setOpen] = useState<boolean>(true);

  if (collapsed) {
    return (
      <div className="py-1">
        {section.items.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === "/"}
            title={item.label}
            className={({ isActive }) =>
              cn("flex items-center justify-center h-9 w-9 mx-auto rounded-md transition-colors mb-0.5",
                isActive ? "bg-[hsl(var(--sidebar-primary))] text-white" : "text-muted-foreground hover:bg-secondary hover:text-foreground")
            }>
            <item.icon size={16} />
          </NavLink>
        ))}
      </div>
    );
  }

  return (
    <div className="py-1">
      <button type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
        <span>{section.title}</span>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
      {open && section.items.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.to === "/"}
          className={({ isActive }) =>
            cn("flex items-center gap-2.5 px-3 py-1.5 text-sm rounded-md mx-2 mb-0.5 transition-colors",
              isActive
                ? "bg-[hsl(var(--sidebar-primary))] text-white font-medium"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground")
          }>
          <item.icon size={15} className="shrink-0" />
          <span className="truncate">{item.label}</span>
        </NavLink>
      ))}
    </div>
  );
}

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();

  const { data: me } = trpc.auth.me.useQuery();
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      localStorage.removeItem("isp_access_token");
      window.location.href = "/login";
    },
    onError: () => {
      // Even if API fails, clear local token and force reload
      localStorage.removeItem("isp_access_token");
      window.location.href = "/login";
    },
  });

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className={cn(
        "flex flex-col border-r border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-background))] transition-all duration-200 shrink-0",
        collapsed ? "w-14" : "w-60"
      )}>
        {/* Logo */}
        <div className={cn("h-14 flex items-center border-b border-[hsl(var(--sidebar-border))]", collapsed ? "justify-center" : "px-3 gap-3")}>
          <button type="button" onClick={() => setCollapsed(!collapsed)}
            className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors shrink-0">
            {collapsed ? <Menu size={18} /> : <X size={18} />}
          </button>
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-cyan-500 to-blue-600 shadow-sm shadow-cyan-500/20 flex items-center justify-center">
                <Wifi size={13} className="text-white" />
              </div>
              <span className="font-extrabold tracking-tight text-[13px]">
                <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">SKY</span>
                <span className="text-white">NITY</span>
              </span>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2">
          {navSections.map((section) => (
            <NavSectionGroup key={section.title} section={section} collapsed={collapsed} />
          ))}
        </nav>

        {/* User */}
        <div className={cn("border-t border-[hsl(var(--sidebar-border))] p-2", collapsed ? "flex justify-center" : "")}>
          {collapsed ? (
            <button type="button" title="Logout" onClick={() => logout.mutate()}
              className="flex items-center justify-center w-9 h-9 rounded-md text-muted-foreground hover:bg-secondary hover:text-red-400 transition-colors">
              <LogOut size={16} />
            </button>
          ) : (
            <div className="flex items-center gap-2 px-2 py-2 rounded-md hover:bg-secondary transition-colors group">
              <div className="w-7 h-7 rounded-full bg-[hsl(var(--sidebar-primary))]/20 flex items-center justify-center text-[hsl(var(--sidebar-primary))] text-xs font-bold shrink-0">
                {me?.name?.[0]?.toUpperCase() ?? "A"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{me?.name ?? "Admin"}</p>
                <p className="text-[10px] text-muted-foreground truncate">{me?.role ?? "admin"}</p>
              </div>
              <button type="button" title="Logout" onClick={() => logout.mutate()}
                className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all">
                <LogOut size={14} />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
