import { trpc } from "../lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, StatCard } from "../components/ui/index";
import { Users, TrendingUp, Server, ShoppingCart } from "lucide-react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export default function Analytics() {
  const { data: stats } = trpc.analytics.dashboard.useQuery();
  const { data: revenue } = trpc.analytics.revenue.useQuery();
  const { data: growth } = trpc.analytics.customerGrowth.useQuery();

  const TOOLTIP_STYLE = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Analytics</h1>
        <p className="text-muted-foreground text-sm">Revenue, growth and network statistics</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Customers" value={(stats?.totalCustomers ?? 0).toLocaleString()} icon={<Users size={18} />} gradient="bg-gradient-to-br from-blue-500 to-blue-700" />
        <StatCard label="Active Subscriptions" value={(stats?.activeSubscriptions ?? 0).toLocaleString()} icon={<Server size={18} />} gradient="bg-gradient-to-br from-emerald-500 to-teal-600" />
        <StatCard label="Pending Orders" value={(stats?.pendingOrders ?? 0).toLocaleString()} icon={<ShoppingCart size={18} />} gradient="bg-gradient-to-br from-amber-500 to-orange-600" />
        <StatCard label="Month Revenue" value={`৳${(stats?.monthRevenueBdt ?? 0).toLocaleString()}`} icon={<TrendingUp size={18} />} gradient="bg-gradient-to-br from-purple-500 to-indigo-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>30-Day Revenue (BDT)</CardTitle></CardHeader>
          <CardContent>
            {revenue && revenue.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={revenue}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`৳${Number(v).toLocaleString()}`, "Revenue"]} />
                  <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">No revenue data yet</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Customer Growth (90 days)</CardTitle></CardHeader>
          <CardContent>
            {growth && growth.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={growth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2} dot={false} name="New Customers" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">No growth data yet</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
