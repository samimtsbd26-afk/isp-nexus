import { useState } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import {
  AlertCircle, RefreshCw, Play, Bell, Ban, Settings2,
  Clock, DollarSign, CheckCircle,
} from "lucide-react";
import {
  Card, CardContent, CardHeader, CardTitle,
  Button, Badge, Table, TableHeader, TableBody,
  TableRow, TableHead, TableCell, Empty, Input,
} from "../components/ui/index";

export default function BillingAutomation() {
  const { data: overdue, refetch: refetchOverdue, isLoading } = trpc.billing.overdueCustomers.useQuery();
  const { data: settings, refetch: refetchSettings } = trpc.billing.getSettings.useQuery();
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const currentForm = form ?? settings;

  const runReminders = trpc.billing.runReminders.useMutation({
    onSuccess: (d) => { toast.success(`Reminders sent for ${d.count} overdue customer(s)`); },
    onError: (e) => toast.error(e.message),
  });
  const runLateFees = trpc.billing.runLateFees.useMutation({
    onSuccess: (d) => { toast.success(`Late fees applied to ${d.count} invoice(s)`); refetchOverdue(); },
    onError: (e) => toast.error(e.message),
  });
  const runSuspend = trpc.billing.runSuspend.useMutation({
    onSuccess: (d) => { toast.success(`${d.count} customer(s) suspended`); refetchOverdue(); },
    onError: (e) => toast.error(e.message),
  });
  const runAll = trpc.billing.runAll.useMutation({
    onSuccess: (d) => {
      toast.success(`Billing cycle: ${d.overdueSent} reminders, ${d.lateFeesApplied} fees, ${d.suspended} suspended`);
      refetchOverdue();
    },
    onError: (e) => toast.error(e.message),
  });
  const saveSettings = trpc.billing.saveSettings.useMutation({
    onSuccess: () => { refetchSettings(); setForm(null); toast.success("Billing settings saved"); },
    onError: (e) => toast.error(e.message),
  });

  const isBusy = runReminders.isPending || runLateFees.isPending || runSuspend.isPending || runAll.isPending;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Billing Automation</h1>
          <p className="text-muted-foreground text-sm">Overdue detection, late fees, and payment reminders</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetchOverdue(); refetchSettings(); }}>
            <RefreshCw size={14} />
          </Button>
          <Button size="sm" disabled={isBusy} onClick={() => runAll.mutate()}>
            <Play size={14} /> Run Billing Cycle
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle size={22} className="text-red-500 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Overdue Customers</p>
              <p className="text-2xl font-bold text-red-500">{overdue?.length ?? "—"}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock size={22} className="text-amber-500 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Grace Period</p>
              <p className="text-2xl font-bold">{settings?.billing_grace_days ?? "—"} days</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <DollarSign size={22} className="text-blue-500 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Late Fee</p>
              <p className="text-2xl font-bold">{settings?.billing_late_fee_pct ?? "0"}%</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-blue-500" />
              <p className="font-semibold text-sm">Send Reminders</p>
            </div>
            <p className="text-xs text-muted-foreground">Send Telegram alert to admin listing overdue customers.</p>
            <Button variant="outline" size="sm" className="w-full" disabled={isBusy} onClick={() => runReminders.mutate()}>
              {runReminders.isPending ? "Sending…" : "Send Now"}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <DollarSign size={16} className="text-amber-500" />
              <p className="font-semibold text-sm">Apply Late Fees</p>
            </div>
            <p className="text-xs text-muted-foreground">Add configured late fee % to unpaid overdue invoices.</p>
            <Button variant="outline" size="sm" className="w-full" disabled={isBusy} onClick={() => runLateFees.mutate()}>
              {runLateFees.isPending ? "Applying…" : "Apply Fees"}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Ban size={16} className="text-red-500" />
              <p className="font-semibold text-sm">Suspend Unpaid</p>
            </div>
            <p className="text-xs text-muted-foreground">Suspend customers overdue beyond grace period.</p>
            <Button variant="destructive" size="sm" className="w-full" disabled={isBusy}
              onClick={() => { if (confirm("Suspend all unpaid customers past grace period?")) runSuspend.mutate({ graceDays: parseInt(settings?.billing_grace_days ?? "7", 10) }); }}>
              {runSuspend.isPending ? "Suspending…" : "Suspend Now"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Overdue table */}
      <Card>
        <CardHeader>
          <CardTitle>Overdue Customers ({overdue?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading && <div className="py-10 text-center text-muted-foreground text-sm">Loading…</div>}
          {!isLoading && (!overdue || overdue.length === 0) && <Empty message="No overdue customers — billing is healthy" />}
          {!isLoading && overdue && overdue.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Expired</TableHead>
                  <TableHead>Days Overdue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overdue.map((c) => (
                  <TableRow key={c.subscriptionId}>
                    <TableCell className="font-medium text-sm">{c.fullName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.phone}</TableCell>
                    <TableCell className="font-mono text-sm">@{c.username}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(c.expiredAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Badge variant={c.daysOverdue >= 7 ? "destructive" : c.daysOverdue >= 3 ? "warning" : "default"}>
                        {c.daysOverdue}d
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Settings2 size={16} /> Automation Settings</CardTitle>
            {form && (
              <div className="flex gap-2">
                <Button size="sm" disabled={saveSettings.isPending}
                  onClick={() => saveSettings.mutate(form)}>
                  <CheckCircle size={13} /> {saveSettings.isPending ? "Saving…" : "Save"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {currentForm && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { key: "billing_grace_days", label: "Grace Period (days)", hint: "Days after expiry before suspension" },
                { key: "billing_late_fee_pct", label: "Late Fee %", hint: "Percentage of invoice added as late fee" },
                { key: "billing_reminder_days", label: "Reminder Lead Days", hint: "Days before expiry to send renewal reminders" },
              ].map(({ key, label, hint }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
                  <Input
                    type="number" min="0"
                    value={currentForm[key] ?? ""}
                    onChange={(e) => setForm((prev) => ({ ...(prev ?? currentForm), [key]: e.target.value }))}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
