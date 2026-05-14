import { trpc } from "../lib/trpc";
import { TrendingUp, TrendingDown, Users, DollarSign, AlertCircle, Percent, CreditCard, UserCheck } from "lucide-react";

function fmt(n: number) { return `৳${n.toLocaleString("en-BD")}`; }

function KpiCard({ label, value, sub, icon: Icon, trend }: {
  label: string; value: string; sub?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  trend?: number | null;
}) {
  return (
    <div className="bg-card border rounded-lg p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon size={16} className="text-muted-foreground" />
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      {trend !== null && trend !== undefined && (
        <div className={`flex items-center gap-1 text-xs font-medium ${trend >= 0 ? "text-green-600" : "text-red-600"}`}>
          {trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {trend >= 0 ? "+" : ""}{trend}% গত মাস থেকে
        </div>
      )}
    </div>
  );
}

export default function FinancialDashboard() {
  const { data, isLoading } = trpc.analytics.businessMetrics.useQuery(undefined, { refetchInterval: 60_000 });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground animate-pulse">লোড হচ্ছে...</div>;
  if (!data) return <div className="p-6 text-sm text-destructive">ডেটা লোড ব্যর্থ হয়েছে</div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Financial Dashboard</h1>
        <p className="text-sm text-muted-foreground">MRR · ARPU · Churn · Unpaid · Reseller Payouts</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="MRR (এই মাস)"
          value={fmt(data.mrr)}
          sub={`গত মাস: ${fmt(data.prevMrr)}`}
          icon={DollarSign}
          trend={data.mrrGrowthPct}
        />
        <KpiCard
          label="ARPU"
          value={fmt(data.arpu)}
          sub={`${data.activeSubscribers} সক্রিয় গ্রাহক`}
          icon={Users}
          trend={null}
        />
        <KpiCard
          label="Churn Rate"
          value={`${data.churnRatePct}%`}
          sub={`${data.churnedThisMonth} জন এই মাসে`}
          icon={Percent}
          trend={null}
        />
        <KpiCard
          label="অপরিশোধিত Invoice"
          value={fmt(data.unpaidTotalBdt)}
          sub={`${data.unpaidCount}টি Invoice বাকি`}
          icon={AlertCircle}
          trend={null}
        />
      </div>

      {/* Unpaid invoices table */}
      {data.unpaidInvoices.length > 0 && (
        <div>
          <h2 className="text-base font-medium mb-3 flex items-center gap-2">
            <CreditCard size={16} /> অপরিশোধিত Invoice ({data.unpaidCount})
            <span className="text-sm text-muted-foreground ml-auto">মোট: {fmt(data.unpaidTotalBdt)}</span>
          </h2>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Invoice নম্বর</th>
                  <th className="text-left p-3 font-medium">গ্রাহক</th>
                  <th className="text-right p-3 font-medium">পরিমাণ</th>
                  <th className="text-left p-3 font-medium">ইস্যু তারিখ</th>
                  <th className="text-left p-3 font-medium">Due Date</th>
                </tr>
              </thead>
              <tbody>
                {data.unpaidInvoices.map((inv) => {
                  const overdue = inv.dueAt && new Date(inv.dueAt) < new Date();
                  return (
                    <tr key={inv.id} className="border-t hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs">{inv.invoiceNumber}</td>
                      <td className="p-3">
                        <div>{inv.customerName}</div>
                        <div className="text-xs text-muted-foreground">{inv.customerPhone}</div>
                      </td>
                      <td className="p-3 text-right font-medium">{fmt(inv.amountBdt ?? 0)}</td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {new Date(inv.issuedAt).toLocaleDateString("bn-BD")}
                      </td>
                      <td className="p-3 text-xs">
                        {inv.dueAt ? (
                          <span className={overdue ? "text-red-600 font-medium" : "text-muted-foreground"}>
                            {overdue ? "⚠ " : ""}{new Date(inv.dueAt).toLocaleDateString("bn-BD")}
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reseller payouts table */}
      {data.resellerPayouts.length > 0 && (
        <div>
          <h2 className="text-base font-medium mb-3 flex items-center gap-2">
            <UserCheck size={16} /> Reseller Payout Summary
            <span className="text-sm text-muted-foreground ml-auto">মোট বকেয়া: {fmt(data.totalPendingPayoutsBdt)}</span>
          </h2>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">রিসেলার</th>
                  <th className="text-right p-3 font-medium">কমিশন %</th>
                  <th className="text-right p-3 font-medium">মোট আয়</th>
                  <th className="text-right p-3 font-medium">বকেয়া</th>
                  <th className="text-right p-3 font-medium">Wallet</th>
                </tr>
              </thead>
              <tbody>
                {data.resellerPayouts.map((r) => (
                  <tr key={r.resellerId} className="border-t hover:bg-muted/30">
                    <td className="p-3">
                      <div>{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.email}</div>
                    </td>
                    <td className="p-3 text-right">{r.commissionPct}%</td>
                    <td className="p-3 text-right">{fmt(r.totalEarnedBdt)}</td>
                    <td className="p-3 text-right">
                      <span className={r.pendingBdt > 0 ? "text-amber-600 font-medium" : "text-muted-foreground"}>
                        {fmt(r.pendingBdt)}
                      </span>
                    </td>
                    <td className="p-3 text-right">{fmt(r.walletBalanceBdt ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.resellerPayouts.length === 0 && data.unpaidInvoices.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          সব পেমেন্ট আপ-টু-ডেট। কোনো বকেয়া নেই।
        </div>
      )}
    </div>
  );
}
