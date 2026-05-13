import { trpc } from "../lib/trpc";
import {
  Users, Server, ShoppingCart, TrendingUp, Router,
  Activity, Wifi, Network, AlertTriangle, CheckCircle2,
  XCircle, Clock, Zap, Thermometer, MemoryStick,
  ArrowUpRight, ArrowDownRight, Shield,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, StatCard, Badge } from "../components/ui/index";
import { Link } from "react-router";
import { formatBytes } from "../lib/utils";

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4"];
const DOT_CLASSES = [
  "bg-blue-500", "bg-emerald-500", "bg-amber-500",
  "bg-violet-500", "bg-red-500", "bg-cyan-500",
];

function formatMbps(value: number | undefined | null): string {
  return `${Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} Mbps`;
}

function RouterHealthCard({ router: r }: {
  router: {
    id: string; name: string; host: string; isActive: boolean;
    cpuLoad: number | null; freeMemoryMb: number | null;
    temperatureCelsius: number | null; uptimeSeconds: number | null;
    model: string | null; rosVersion: string | null; lastSeenAt: Date | string | null;
  }
}) {
  const uptime = r.uptimeSeconds
    ? (() => {
        const d = Math.floor(r.uptimeSeconds / 86400);
        const h = Math.floor((r.uptimeSeconds % 86400) / 3600);
        return d > 0 ? `${d}d ${h}h` : `${h}h`;
      })()
    : null;

  const cpuColor = (r.cpuLoad ?? 0) > 80 ? "text-red-400" : (r.cpuLoad ?? 0) > 50 ? "text-amber-400" : "text-emerald-400";
  const tempColor = (r.temperatureCelsius ?? 0) > 70 ? "text-red-400" : (r.temperatureCelsius ?? 0) > 55 ? "text-amber-400" : "text-blue-400";

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg bg-secondary/50 border border-border">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full shrink-0 ${r.isActive ? "bg-emerald-400 shadow-[0_0_6px_#10b981]" : "bg-red-400"}`} />
        <span className="text-sm font-medium flex-1 truncate">{r.name}</span>
        {r.isActive ? (
          <Badge variant="success">Online</Badge>
        ) : (
          <Badge variant="destructive">Offline</Badge>
        )}
      </div>
      <div className="text-xs text-muted-foreground">{r.host}</div>
      {r.isActive && (
        <div className="grid grid-cols-3 gap-2 mt-1">
          <div className="text-center">
            <p className={`text-sm font-bold ${cpuColor}`}>{r.cpuLoad ?? 0}%</p>
            <p className="text-[10px] text-muted-foreground">CPU</p>
          </div>
          <div className="text-center">
            <p className={`text-sm font-bold ${tempColor}`}>
              {r.temperatureCelsius ? `${Math.round(r.temperatureCelsius)}°C` : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">Temp</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-purple-400">{uptime ?? "—"}</p>
            <p className="text-[10px] text-muted-foreground">Uptime</p>
          </div>
        </div>
      )}
      {r.model && (
        <p className="text-[10px] text-muted-foreground border-t border-border pt-1 mt-1">
          {r.model} {r.rosVersion ? `· ROS ${r.rosVersion}` : ""}
        </p>
      )}
    </div>
  );
}

const statusBadge: Record<string, "success" | "warning" | "destructive" | "info"> = {
  approved: "success",
  pending: "warning",
  rejected: "destructive",
  refunded: "info",
};

export default function Dashboard() {
  const { data: stats, isLoading } = trpc.analytics.dashboard.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const { data: revenue } = trpc.analytics.revenue.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const { data: recentOrders } = trpc.analytics.recentOrders.useQuery(undefined, {
    refetchInterval: 15_000,
  });
  const { data: subsByPkg } = trpc.analytics.subscriptionsByPackage.useQuery();

  // Live MikroTik stats for the first active router
  const firstRouterId = stats?.routerList?.find((r) => r.isActive)?.id;
  const {
    data: liveStats,
    isLoading: liveLoading,
    error: liveError,
  } = trpc.mikrotik.getLiveStats.useQuery(
    { routerId: firstRouterId! },
    {
      enabled: !!firstRouterId,
      refetchInterval: 30_000,
      retry: 0,
      staleTime: 25_000,
    }
  );

  const v = (n: number | undefined) => (isLoading ? "—" : (n ?? 0).toLocaleString());

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">ISP network overview and statistics</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Live · auto-refresh 30s
        </div>
      </div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total Customers"
          value={v(stats?.totalCustomers)}
          icon={<Users size={18} />}
          gradient="bg-gradient-to-br from-blue-500 to-blue-700"
        />
        <StatCard
          label="Active Subscriptions"
          value={v(stats?.activeSubscriptions)}
          sub={`PPPoE active: ${stats?.pppoeActive ?? 0} · Hotspot registered: ${stats?.hotspotActive ?? 0}`}
          icon={<Server size={18} />}
          gradient="bg-gradient-to-br from-emerald-500 to-teal-600"
        />
        <StatCard
          label="Pending Orders"
          value={v(stats?.pendingOrders)}
          sub="Awaiting approval"
          icon={<ShoppingCart size={18} />}
          gradient="bg-gradient-to-br from-amber-500 to-orange-600"
        />
        <StatCard
          label="Month Revenue"
          value={isLoading ? "—" : `৳${(stats?.monthRevenueBdt ?? 0).toLocaleString()}`}
          sub={`Total: ৳${(stats?.totalRevenueBdt ?? 0).toLocaleString()}`}
          icon={<TrendingUp size={18} />}
          gradient="bg-gradient-to-br from-purple-500 to-indigo-600"
        />
      </div>

      {/* Network Health Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10">
            <CheckCircle2 size={18} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-2xl font-bold">{stats?.routersOnline ?? 0}</p>
            <p className="text-xs text-muted-foreground">Routers Online</p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-500/10">
            <XCircle size={18} className="text-red-400" />
          </div>
          <div>
            <p className="text-2xl font-bold">{stats?.routersOffline ?? 0}</p>
            <p className="text-xs text-muted-foreground">Routers Offline</p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10">
            <Network size={18} className="text-blue-400" />
          </div>
          <div>
            <p className="text-2xl font-bold">{stats?.pppoeActive ?? 0}</p>
            <p className="text-xs text-muted-foreground">PPPoE Active</p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <Wifi size={18} className="text-amber-400" />
          </div>
          <div>
            <p className="text-2xl font-bold">{liveStats?.hotspotUserCount ?? stats?.hotspotActive ?? 0}</p>
            <p className="text-xs text-muted-foreground">Hotspot Registered</p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10">
            <Wifi size={18} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-2xl font-bold">{liveStats?.activeHotspotCount ?? 0}</p>
            <p className="text-xs text-muted-foreground">Hotspot Active</p>
          </div>
        </div>
      </div>

      {/* MikroTik Live Stats */}
      {firstRouterId && liveLoading && (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground text-sm">
          <Activity size={20} className="mx-auto mb-2 animate-spin text-primary" />
          Loading MikroTik live data…
        </div>
      )}
      {firstRouterId && liveError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 flex items-center gap-3">
          <AlertTriangle size={18} className="text-red-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-300">MikroTik connection failed</p>
            <p className="text-xs text-muted-foreground">
              Could not fetch live data. Check router connectivity in <Link to="/routers" className="underline">Routers</Link>.
            </p>
          </div>
        </div>
      )}
      {!firstRouterId && !isLoading && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-center gap-3">
          <AlertTriangle size={18} className="text-amber-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-300">No active router</p>
            <p className="text-xs text-muted-foreground">
              Add and connect a MikroTik router to see live data. <Link to="/routers" className="underline">Add Router →</Link>
            </p>
          </div>
        </div>
      )}
      {liveStats && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">MikroTik Live — {liveStats.identity}</h2>
              <p className="text-muted-foreground text-xs">ROS {liveStats.rosVersion ?? "—"} · {liveStats.model ?? "—"} · Uptime {liveStats.uptime ?? "—"}</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live · auto-refresh 30s
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {[
              { label: "PPPoE Active", value: liveStats.activePppoeCount, icon: Network, color: "text-blue-400", bg: "bg-blue-500/10" },
              { label: "Hotspot Registered", value: liveStats.hotspotUserCount, icon: Wifi, color: "text-amber-400", bg: "bg-amber-500/10" },
              { label: "Hotspot Active", value: liveStats.activeHotspotCount, icon: Wifi, color: "text-emerald-400", bg: "bg-emerald-500/10" },
              { label: "CPU Load", value: liveStats.cpuLoad != null ? `${liveStats.cpuLoad}%` : "—", icon: Activity, color: "text-emerald-400", bg: "bg-emerald-500/10" },
              { label: "Memory", value: liveStats.totalMemoryMb ? `${Math.round(((liveStats.totalMemoryMb - (liveStats.freeMemoryMb ?? 0)) / liveStats.totalMemoryMb) * 100)}%` : "—", icon: MemoryStick, color: "text-purple-400", bg: "bg-purple-500/10" },
              { label: "Interfaces", value: `${liveStats.runningInterfaceCount}/${liveStats.interfaceCount}`, icon: Router, color: "text-cyan-400", bg: "bg-cyan-500/10" },
              { label: "Queues", value: liveStats.queueCount, icon: Zap, color: "text-pink-400", bg: "bg-pink-500/10" },
              { label: "Firewall", value: liveStats.firewallRuleCount, icon: Shield, color: "text-red-400", bg: "bg-red-500/10" },
              { label: "Routes", value: liveStats.routeCount, icon: TrendingUp, color: "text-violet-400", bg: "bg-violet-500/10" },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className="rounded-xl border border-border bg-card p-3 flex flex-col items-center gap-1.5 text-center">
                <div className={`p-1.5 rounded-lg ${bg}`}>
                  <Icon size={14} className={color} />
                </div>
                <p className="text-lg font-bold">{value ?? "—"}</p>
                <p className="text-[10px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>

          {liveStats.sharedBandwidth && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Shared Bandwidth Pool</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {[
                    { label: "Total Pool", value: formatMbps(liveStats.sharedBandwidth.totalPoolMbps) },
                    { label: "Active Users", value: liveStats.sharedBandwidth.activeUsers },
                    { label: "Current Usage", value: formatMbps(liveStats.sharedBandwidth.currentSharedUsageMbps) },
                    { label: "Burst Users", value: liveStats.sharedBandwidth.burstUsers },
                    { label: "Available Pool", value: formatMbps(liveStats.sharedBandwidth.availablePoolMbps) },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-lg bg-secondary/50 border border-border p-3">
                      <p className="text-base font-bold">{value}</p>
                      <p className="text-[10px] text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>
                {liveStats.sharedBandwidth.packageUtilization.length > 0 ? (
                  <div className="space-y-2">
                    {liveStats.sharedBandwidth.packageUtilization.map((pkg: any) => (
                      <div key={pkg.profile} className="flex items-center gap-3 text-xs">
                        <span className="w-36 truncate font-medium">{pkg.profile}</span>
                        <span className="text-muted-foreground">{pkg.activeUsers} active</span>
                        <span className="ml-auto text-muted-foreground">
                          {formatBytes(pkg.bytesIn + pkg.bytesOut)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No active hotspot sessions in the shared pool.</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Interface traffic mini table */}
          {liveStats.interfaces && liveStats.interfaces.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Active Interfaces — Traffic</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">Interface</th>
                        <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">Type</th>
                        <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">RX</th>
                        <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">TX</th>
                      </tr>
                    </thead>
                    <tbody>
                      {liveStats.interfaces.map((iface: any) => (
                        <tr key={iface.name} className="border-b border-border last:border-0">
                          <td className="px-4 py-2 font-mono text-xs font-medium">{iface.name}</td>
                          <td className="px-4 py-2"><Badge variant="outline">{iface.type}</Badge></td>
                          <td className="px-4 py-2 text-right text-emerald-400 font-medium text-xs">{formatBytes(iface.rxByte)}</td>
                          <td className="px-4 py-2 text-right text-blue-400 font-medium text-xs">{formatBytes(iface.txByte)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Revenue Chart + Routers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>30-Day Revenue (BDT)</CardTitle>
          </CardHeader>
          <CardContent>
            {revenue && revenue.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={revenue}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(d) => {
                      const dt = new Date(d);
                      return `${dt.getDate()}/${dt.getMonth() + 1}`;
                    }}
                  />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [`৳${Number(v).toLocaleString()}`, "Revenue"]}
                    labelFormatter={(d) => new Date(d).toLocaleDateString("en-BD")}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#3b82f6"
                    fill="url(#revGrad)"
                    strokeWidth={2}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
                No revenue data yet — approve some orders first
              </div>
            )}
          </CardContent>
        </Card>

        {/* Router Status */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle>Routers</CardTitle>
            <Link to="/routers" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              View all →
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats?.routerList?.length ? (
                stats.routerList.map((r) => (
                  <RouterHealthCard key={r.id} router={r} />
                ))
              ) : (
                <div className="py-6 text-center">
                  <Router size={32} className="mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">No routers added yet</p>
                  <Link to="/routers" className="text-xs text-primary hover:underline mt-1 inline-block">
                    Add your first router →
                  </Link>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Subscriptions by Package + Recent Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Package Distribution */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Active by Package</CardTitle>
          </CardHeader>
          <CardContent>
            {subsByPkg && subsByPkg.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie
                      data={subsByPkg}
                      dataKey="count"
                      nameKey="packageName"
                      cx="50%"
                      cy="50%"
                      outerRadius={60}
                      strokeWidth={0}
                    >
                      {subsByPkg.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 11,
                      }}
                      formatter={(v: number, _: string, p: any) => [
                        `${v} users`,
                        p?.payload?.packageName,
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-2">
                  {subsByPkg.slice(0, 5).map((pkg, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <div className={`w-2.5 h-2.5 rounded-sm shrink-0 ${DOT_CLASSES[i % DOT_CLASSES.length]}`} />
                      <span className="flex-1 truncate text-muted-foreground">{pkg.packageName}</span>
                      <span className="font-medium">{pkg.count}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                No active subscriptions
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Orders */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle>Recent Orders</CardTitle>
            <Link to="/orders" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              View all →
            </Link>
          </CardHeader>
          <CardContent>
            {recentOrders && recentOrders.length > 0 ? (
              <div className="space-y-2">
                {recentOrders.slice(0, 7).map((o) => (
                  <div key={o.id} className="flex items-center gap-3 py-1.5 border-b border-border last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{o.customerName}</p>
                      <p className="text-xs text-muted-foreground">{o.customerPhone}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold">৳{o.amountBdt.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(o.createdAt).toLocaleDateString("en-BD")}
                      </p>
                    </div>
                    <Badge variant={statusBadge[o.status] ?? "default"}>
                      {o.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                No orders yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Expired Subscriptions Alert */}
      {(stats?.expiredSubs ?? 0) > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/5">
          <AlertTriangle size={18} className="text-amber-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-300">
              {stats?.expiredSubs} expired subscription{(stats?.expiredSubs ?? 0) > 1 ? "s" : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              These customers need renewal. Contact them or send reminder via Telegram.
            </p>
          </div>
          <Link
            to="/subscriptions"
            className="text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors shrink-0"
          >
            View →
          </Link>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Add Router", icon: Router, to: "/routers", color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: "Add Customer", icon: Users, to: "/customers", color: "text-emerald-400", bg: "bg-emerald-500/10" },
          { label: "View Orders", icon: ShoppingCart, to: "/orders", color: "text-amber-400", bg: "bg-amber-500/10" },
          { label: "Monitor", icon: Activity, to: "/monitoring", color: "text-purple-400", bg: "bg-purple-500/10" },
        ].map(({ label, icon: Icon, to, color, bg }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:bg-secondary transition-colors"
          >
            <div className={`p-2 rounded-lg ${bg}`}>
              <Icon size={16} className={color} />
            </div>
            <span className="text-sm font-medium">{label}</span>
            <ArrowUpRight size={14} className="ml-auto text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}
