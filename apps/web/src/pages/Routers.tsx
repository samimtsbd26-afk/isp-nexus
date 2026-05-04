import { useState } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { Plus, Wifi, WifiOff, TestTube2, Trash2, Cpu, MemoryStick, Thermometer, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, Button, Input, Modal, Badge } from "../components/ui/index";

const EMPTY_FORM = { name: "", host: "", port: 8728, sslPort: 8729, username: "admin", password: "", useSsl: false, isDefault: false };

export default function Routers() {
  const { data: routers, refetch, isLoading } = trpc.routerMgmt.list.useQuery();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [testingId, setTestingId] = useState<string | null>(null);

  const create = trpc.routerMgmt.create.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); setForm(EMPTY_FORM); toast.success("Router added successfully"); },
    onError: (e) => toast.error(e.message),
  });
  const test = trpc.routerMgmt.testConnection.useMutation({
    onMutate: (v) => setTestingId(v.id),
    onSettled: () => setTestingId(null),
    onSuccess: (d) => d.ok ? toast.success(`Connected! Identity: ${d.identity}`) : toast.error(`Connection failed: ${d.error}`),
  });
  const del = trpc.routerMgmt.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Router removed"); },
    onError: (e) => toast.error(e.message),
  });

  function field(key: keyof typeof form, label: string, type = "text") {
    return (
      <div key={key}>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
        <Input type={type} value={(form as any)[key]}
          onChange={(e) => setForm({ ...form, [key]: type === "number" ? +e.target.value : e.target.value })}
          placeholder={key === "host" ? "192.168.88.1" : undefined} required />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Routers</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage MikroTik router connections</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw size={14} /></Button>
          <Button size="sm" onClick={() => setShowAdd(true)}><Plus size={14} /> Add Router</Button>
        </div>
      </div>

      {/* Router grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2].map((i) => <div key={i} className="h-36 rounded-xl bg-card border border-border animate-pulse" />)}
        </div>
      ) : routers?.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {routers.map((r) => (
            <Card key={r.id} className="relative overflow-hidden">
              {/* Status bar */}
              <div className={`absolute top-0 left-0 right-0 h-0.5 ${r.isActive ? "bg-emerald-500" : "bg-red-500"}`} />
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`p-2 rounded-lg shrink-0 ${r.isActive ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
                      {r.isActive ? <Wifi size={16} className="text-emerald-400" /> : <WifiOff size={16} className="text-red-400" />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{r.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{r.host}:{r.port}</p>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {r.isDefault ? <Badge variant="info">Default</Badge> : null}
                    <Badge variant={r.isActive ? "success" : "destructive"}>{r.isActive ? "Online" : "Offline"}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {/* Stats row */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { icon: Cpu, label: "CPU", value: r.cpuLoad !== null ? `${r.cpuLoad}%` : "—", color: (r.cpuLoad ?? 0) > 80 ? "text-red-400" as const : "text-emerald-400" as const },
                    { icon: MemoryStick, label: "RAM", value: r.freeMemoryMb ? `${r.freeMemoryMb}M` : "—", color: "text-blue-400" },
                    { icon: Thermometer, label: "Temp", value: r.temperatureCelsius ? `${r.temperatureCelsius}°` : "—", color: (r.temperatureCelsius ?? 0) > 70 ? "text-red-400" : "text-amber-400" },
                  ].map(({ icon: Icon, label, value, color }) => (
                    <div key={label} className="text-center p-2 rounded-lg bg-secondary/50">
                      <Icon size={12} className={`${color} mx-auto mb-0.5`} />
                      <p className={`text-xs font-bold ${color}`}>{value}</p>
                      <p className="text-[10px] text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>

                {r.identity && (
                  <p className="text-xs text-muted-foreground truncate">
                    {r.identity} {r.rosVersion && `· ROS ${r.rosVersion}`}
                  </p>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" className="flex-1"
                    disabled={testingId === r.id}
                    onClick={() => test.mutate({ id: r.id })}>
                    <TestTube2 size={13} />
                    {testingId === r.id ? "Testing…" : "Test"}
                  </Button>
                  <Button variant="destructive" size="icon"
                    onClick={() => { if (confirm(`Delete "${r.name}"?`)) del.mutate({ id: r.id }); }}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-16 text-center">
            <Wifi size={40} className="mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-muted-foreground text-sm">No routers configured yet</p>
            <Button size="sm" className="mt-4" onClick={() => setShowAdd(true)}><Plus size={14} /> Add Your First Router</Button>
          </CardContent>
        </Card>
      )}

      {/* Add Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add MikroTik Router" className="max-w-lg">
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(form as any); }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {field("name", "Router Name")}
            {field("host", "Host / IP Address")}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field("port", "API Port", "number")}
            {field("sslPort", "SSL Port", "number")}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field("username", "Username")}
            {field("password", "Password", "password")}
          </div>
          <div className="flex gap-6 py-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="accent-blue-500" checked={form.useSsl}
                onChange={(e) => setForm({ ...form, useSsl: e.target.checked })} />
              Use SSL
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="accent-blue-500" checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
              Set as Default
            </label>
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" className="flex-1" disabled={create.isPending}>
              {create.isPending ? "Adding…" : "Add Router"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
