import { useState } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import {
  Plus, RefreshCw, Trash2, UserCheck, UserX, Server, Cookie,
  Globe, Shield, Network, Layers, Gift, Wifi, Activity,
  Clock, CheckCircle2, XCircle, AlertCircle, Search, Layout,
} from "lucide-react";
import HotspotTemplates from "./HotspotTemplates";
import {
  Card, CardContent, Button, Input, Modal, Badge,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  Select, Empty,
} from "../components/ui/index";
import { formatBytes } from "../lib/utils";

const EMPTY_USER = { name: "", password: "", profile: "default", comment: "" };
type BindingType = "regular" | "bypassed" | "blocked";
type WalledAction = "allow" | "deny";
const EMPTY_BINDING = { macAddress: "", address: "", toAddress: "", type: "regular" as BindingType, comment: "" };
const EMPTY_WALLED = { dstHost: "", dstPort: "", action: "allow" as WalledAction, comment: "" };

const TABS = [
  { id: "users",    label: "Users",          icon: UserCheck,  color: "text-blue-400" },
  { id: "active",   label: "Active",          icon: Activity,   color: "text-green-400" },
  { id: "hosts",    label: "Hosts",           icon: Server,     color: "text-purple-400" },
  { id: "cookies",  label: "Cookies",         icon: Cookie,     color: "text-yellow-400" },
  { id: "bindings", label: "IP Bindings",     icon: Shield,     color: "text-red-400" },
  { id: "ports",    label: "Ports",           icon: Network,    color: "text-cyan-400" },
  { id: "walled",   label: "Walled Garden",   icon: Globe,      color: "text-orange-400" },
  { id: "profiles", label: "Profiles",        icon: Layers,     color: "text-pink-400" },
  { id: "trial",    label: "Trial Control",   icon: Gift,       color: "text-emerald-400" },
  { id: "templates",label: "Templates",        icon: Layout,     color: "text-violet-400"  },
];

export default function HotspotControl() {
  const { data: routers } = trpc.routerMgmt.list.useQuery();
  const [routerId, setRouterId] = useState("");
  const [activeTab, setActiveTab] = useState("users");
  const [search, setSearch] = useState("");
  const selected = routerId || routers?.[0]?.id || "";

  const activeTab_ = TABS.find((t) => t.id === activeTab);

  return (
    <div className="space-y-4 p-1">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <Wifi className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Hotspot Control</h1>
            <p className="text-xs text-muted-foreground">MikroTik hotspot management</p>
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 w-36 text-sm"
            />
          </div>
          <Select
            title="Select router"
            value={selected}
            onChange={(e) => setRouterId(e.target.value)}
            className="h-8 text-sm w-44"
          >
            {routers?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </div>
      </div>

      {/* ── Tab Bar (horizontal scroll on mobile) ── */}
      <div className="overflow-x-auto -mx-1 px-1 pb-1">
        <div className="flex gap-1 min-w-max">
          {TABS.map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap border
                  ${active
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted hover:text-foreground"
                  }`}
              >
                <t.icon size={12} className={active ? "" : t.color} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Active Tab Label ── */}
      {activeTab_ && (
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground pb-1 border-b">
          <activeTab_.icon size={14} className={activeTab_.color} />
          <span>{activeTab_.label}</span>
        </div>
      )}

      {/* ── Tab Content ── */}
      {activeTab === "users"    && <UsersTab    routerId={selected} search={search} />}
      {activeTab === "active"   && <ActiveTab   routerId={selected} search={search} />}
      {activeTab === "hosts"    && <HostsTab    routerId={selected} search={search} />}
      {activeTab === "cookies"  && <CookiesTab  routerId={selected} search={search} />}
      {activeTab === "bindings" && <BindingsTab routerId={selected} search={search} />}
      {activeTab === "ports"    && <PortsTab    routerId={selected} search={search} />}
      {activeTab === "walled"   && <WalledGardenTab routerId={selected} search={search} />}
      {activeTab === "profiles" && <ProfilesTab routerId={selected} search={search} />}
      {activeTab === "trial"    && <TrialTab    routerId={selected} />}
      {activeTab === "templates" && <HotspotTemplates routerId={selected} embedded />}
    </div>
  );
}

/* ──────────────────────────────────────────────
   SHARED: Stat pill
────────────────────────────────────────────── */
function StatPill({ label, value, color = "text-foreground" }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 border text-sm">
      <span className={`font-bold ${color}`}>{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  );
}

/* ──────────────────────────────────────────────
   SHARED: TabToolbar
────────────────────────────────────────────── */
function TabToolbar({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <div className="flex items-center gap-2">{children}</div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

/* ──────────────────────────────────────────────
   SHARED: DataCard wrapper
────────────────────────────────────────────── */
function DataCard({ children, loading, empty, emptyMsg }: {
  children: React.ReactNode; loading: boolean; empty: boolean; emptyMsg: string;
}) {
  if (loading) return (
    <Card>
      <CardContent className="py-16 text-center">
        <div className="inline-flex items-center gap-2 text-muted-foreground text-sm">
          <RefreshCw size={14} className="animate-spin" /> Loading…
        </div>
      </CardContent>
    </Card>
  );
  if (empty) return <Card><CardContent className="p-0"><Empty message={emptyMsg} /></CardContent></Card>;
  return <Card><CardContent className="p-0">{children}</CardContent></Card>;
}

/* ──────────────────────────────────────────────
   USERS TAB
────────────────────────────────────────────── */
function UsersTab({ routerId, search }: { routerId: string; search: string }) {
  const { data: users, refetch, isLoading } = trpc.mikrotik.getHotspotUsers.useQuery(
    { routerId }, { enabled: !!routerId }
  );
  const { data: active } = trpc.mikrotik.getActiveHotspotSessions.useQuery(
    { routerId }, { enabled: !!routerId, refetchInterval: 10_000 }
  );
  const { data: profiles } = trpc.mikrotik.getHotspotProfiles.useQuery(
    { routerId }, { enabled: !!routerId }
  );
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleteStatus, setDeleteStatus] = useState("");
  const [form, setForm] = useState(EMPTY_USER);

  const add = trpc.mikrotik.addHotspotUser.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); setForm(EMPTY_USER); toast.success("User added"); },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.mikrotik.removeHotspotUser.useMutation({
    onSuccess: (r) => {
      refetch();
      setDeleteStatus("সম্পূর্ণ মুছে ফেলা হয়েছে ✓");
      setTimeout(() => { setDeleteTarget(null); setDeleteStatus(""); }, 1400);
      toast.success("Removed: " + (r.logs?.join(", ") || "ok"));
    },
    onError: (e) => { setDeleteStatus("ব্যর্থ: " + e.message); toast.error(e.message); },
  });

  const activeNames = new Set((active ?? []).map((a: any) => String(a?.user ?? a?.name ?? "")).filter(Boolean));
  const filtered = (users ?? []).filter((u: any) => !search || u.name?.toLowerCase().includes(search.toLowerCase()));
  const onlineCount = filtered.filter((u: any) => activeNames.has(u.name)).length;

  return (
    <div className="space-y-3">
      <TabToolbar
        right={<StatPill label="online" value={onlineCount} color="text-green-400" />}
      >
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw size={13} />
        </Button>
        <Button size="sm" onClick={() => setShowAdd(true)} disabled={!routerId}>
          <Plus size={13} className="mr-1" /> Add User
        </Button>
        <StatPill label="total" value={users?.length ?? 0} />
      </TabToolbar>

      <DataCard
        loading={isLoading}
        empty={filtered.length === 0}
        emptyMsg={routerId ? "No hotspot users" : "Select a router first"}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Status</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Profile</TableHead>
              <TableHead>MAC</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((u: any) => {
              const online = activeNames.has(u.name);
              return (
                <TableRow key={u[".id"] ?? u.name} className={online ? "bg-green-500/3" : ""}>
                  <TableCell>
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                      online ? "bg-green-500/15 text-green-400" : "bg-muted text-muted-foreground"
                    }`}>
                      {online ? <UserCheck size={10} /> : <UserX size={10} />}
                      {online ? "Online" : "Offline"}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-sm font-semibold">{u.name}</TableCell>
                  <TableCell>
                    <span className="text-xs px-2 py-0.5 rounded border bg-muted/50 text-muted-foreground font-mono">
                      {u.profile ?? "default"}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs font-mono">{u["mac-address"] ?? "—"}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => { setDeleteTarget(u); setDeleteStatus(""); }}
                      className="h-7 w-7 hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Trash2 size={13} />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </DataCard>

      {/* Add Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Hotspot User">
        <form onSubmit={(e) => { e.preventDefault(); add.mutate({ routerId, ...form }); }} className="space-y-3">
          <FormField label="Username">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
          </FormField>
          <FormField label="Password">
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </FormField>
          <FormField label="Profile">
            <Select title="Profile" value={form.profile} onChange={(e) => setForm({ ...form, profile: e.target.value })} className="w-full">
              {profiles?.length ? profiles.map((p: any) => <option key={p.name} value={p.name}>{p.name}</option>) : <option value="default">default</option>}
            </Select>
          </FormField>
          <FormField label="Comment (optional)">
            <Input value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
          </FormField>
          <ModalActions onCancel={() => setShowAdd(false)} loading={add.isPending} confirmText="Add User" />
        </form>
      </Modal>

      {/* Delete Modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => { if (!remove.isPending) { setDeleteTarget(null); setDeleteStatus(""); } }}
        title="ইউজার মুছুন"
      >
        <div className="space-y-4">
          {deleteTarget && !deleteStatus && (
            <div className="p-4 rounded-xl bg-red-500/8 border border-red-500/20 text-center">
              <p className="font-bold text-lg font-mono text-red-400">{deleteTarget.name}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Active session, cookie, host, IP binding এবং DB record সব মুছে যাবে।
              </p>
            </div>
          )}
          {deleteStatus && (
            <div className={`p-3 rounded-xl text-sm font-semibold text-center ${
              deleteStatus.includes("ব্যর্থ") ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"
            }`}>
              {deleteStatus}
            </div>
          )}
          {!deleteStatus?.includes("সম্পূর্ণ") && (
            <ModalActions
              onCancel={() => { setDeleteTarget(null); setDeleteStatus(""); }}
              onConfirm={() => { if (deleteTarget) { setDeleteStatus("মুছে ফেলা হচ্ছে…"); remove.mutate({ routerId, name: deleteTarget.name }); } }}
              loading={remove.isPending}
              confirmText="হ্যাঁ, মুছুন"
              danger
            />
          )}
        </div>
      </Modal>
    </div>
  );
}

/* ──────────────────────────────────────────────
   ACTIVE SESSIONS TAB
────────────────────────────────────────────── */
function ActiveTab({ routerId, search }: { routerId: string; search: string }) {
  const { data: active, refetch, isLoading } = trpc.mikrotik.getActiveHotspotSessions.useQuery(
    { routerId }, { enabled: !!routerId, refetchInterval: 10_000 }
  );
  const filtered = (active ?? []).filter((a: any) =>
    !search || String(a?.user ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-3">
      <TabToolbar right={<StatPill label="active" value={active?.length ?? 0} color="text-green-400" />}>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw size={13} className="mr-1" /> Refresh
        </Button>
        <span className="text-xs text-green-400 flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          auto-refresh 10s
        </span>
      </TabToolbar>

      <DataCard loading={isLoading} empty={filtered.length === 0} emptyMsg={routerId ? "No active sessions" : "Select a router first"}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>MAC</TableHead>
              <TableHead>Uptime</TableHead>
              <TableHead>Data Used</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((a: any) => (
              <TableRow key={a[".id"]}>
                <TableCell className="font-mono text-sm font-semibold">{a.user}</TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground">{a.address ?? a["ip-address"] ?? "—"}</TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground">{a["mac-address"] ?? "—"}</TableCell>
                <TableCell>
                  <span className="text-xs flex items-center gap-1 text-muted-foreground">
                    <Clock size={10} /> {a.uptime ?? "—"}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatBytes(Number(a["bytes-in"] ?? 0) + Number(a["bytes-out"] ?? 0))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataCard>
    </div>
  );
}

/* ──────────────────────────────────────────────
   HOSTS TAB
────────────────────────────────────────────── */
function HostsTab({ routerId, search }: { routerId: string; search: string }) {
  const { data: hosts, refetch, isLoading } = trpc.mikrotik.getHotspotHosts.useQuery({ routerId }, { enabled: !!routerId });
  const remove = trpc.mikrotik.removeHotspotHost.useMutation({
    onSuccess: () => { refetch(); toast.success("Host removed"); },
    onError: (e) => toast.error(e.message),
  });
  const filtered = (hosts ?? []).filter((h: any) =>
    !search || String(h?.["mac-address"] ?? "").toLowerCase().includes(search.toLowerCase()) || String(h?.address ?? "").includes(search)
  );

  return (
    <div className="space-y-3">
      <TabToolbar right={<StatPill label="hosts" value={hosts?.length ?? 0} />}>
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw size={13} /></Button>
      </TabToolbar>
      <DataCard loading={isLoading} empty={filtered.length === 0} emptyMsg={routerId ? "No hosts found" : "Select a router first"}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>MAC</TableHead><TableHead>IP</TableHead><TableHead>To IP</TableHead><TableHead>Server</TableHead><TableHead>Uptime</TableHead><TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((h: any) => (
              <TableRow key={h[".id"]}>
                <TableCell className="font-mono text-xs">{h["mac-address"] ?? "—"}</TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground">{h.address ?? "—"}</TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground">{h["to-address"] ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{h.server ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{h.uptime ?? "—"}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-red-500/10 hover:text-red-400" onClick={() => remove.mutate({ routerId, id: h[".id"] })}>
                    <Trash2 size={13} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataCard>
    </div>
  );
}

/* ──────────────────────────────────────────────
   COOKIES TAB
────────────────────────────────────────────── */
function CookiesTab({ routerId, search }: { routerId: string; search: string }) {
  const { data: cookies, refetch, isLoading } = trpc.mikrotik.getHotspotCookies.useQuery({ routerId }, { enabled: !!routerId });
  const remove = trpc.mikrotik.removeHotspotCookie.useMutation({
    onSuccess: () => { refetch(); toast.success("Cookie removed"); },
    onError: (e) => toast.error(e.message),
  });
  const filtered = (cookies ?? []).filter((c: any) =>
    !search || String(c?.user ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-3">
      <TabToolbar right={<StatPill label="cookies" value={cookies?.length ?? 0} />}>
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw size={13} /></Button>
      </TabToolbar>
      <DataCard loading={isLoading} empty={filtered.length === 0} emptyMsg={routerId ? "No cookies" : "Select a router first"}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead><TableHead>MAC</TableHead><TableHead>IP</TableHead><TableHead>Uptime</TableHead><TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c: any) => (
              <TableRow key={c[".id"]}>
                <TableCell className="font-mono text-sm">{c.user ?? "—"}</TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground">{c["mac-address"] ?? "—"}</TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground">{c.address ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{c.uptime ?? "—"}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-red-500/10 hover:text-red-400" onClick={() => remove.mutate({ routerId, id: c[".id"] })}>
                    <Trash2 size={13} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataCard>
    </div>
  );
}

/* ──────────────────────────────────────────────
   IP BINDINGS TAB
────────────────────────────────────────────── */
function BindingsTab({ routerId, search }: { routerId: string; search: string }) {
  const { data: bindings, refetch, isLoading } = trpc.mikrotik.getHotspotIpBindings.useQuery({ routerId }, { enabled: !!routerId });
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<typeof EMPTY_BINDING>(EMPTY_BINDING);

  const remove = trpc.mikrotik.removeHotspotIpBinding.useMutation({
    onSuccess: () => { refetch(); toast.success("Binding removed"); },
    onError: (e) => toast.error(e.message),
  });
  const add = trpc.mikrotik.addHotspotIpBinding.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); setForm(EMPTY_BINDING); toast.success("Binding added"); },
    onError: (e) => toast.error(e.message),
  });

  const filtered = (bindings ?? []).filter((b: any) =>
    !search || String(b?.["mac-address"] ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const BINDING_VARIANT: Record<string, "success" | "destructive" | "default"> = {
    bypassed: "success", blocked: "destructive", regular: "default",
  };

  return (
    <div className="space-y-3">
      <TabToolbar right={<StatPill label="bindings" value={bindings?.length ?? 0} />}>
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw size={13} /></Button>
        <Button size="sm" onClick={() => setShowAdd(true)} disabled={!routerId}><Plus size={13} className="mr-1" />Add</Button>
      </TabToolbar>
      <DataCard loading={isLoading} empty={filtered.length === 0} emptyMsg={routerId ? "No IP bindings" : "Select a router first"}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>MAC</TableHead><TableHead>Address</TableHead><TableHead>To Address</TableHead><TableHead>Type</TableHead><TableHead>Comment</TableHead><TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((b: any) => (
              <TableRow key={b[".id"]}>
                <TableCell className="font-mono text-xs">{b["mac-address"] ?? "—"}</TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground">{b.address ?? "—"}</TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground">{b["to-address"] ?? "—"}</TableCell>
                <TableCell><Badge variant={BINDING_VARIANT[b.type ?? "regular"] ?? "default"}>{b.type ?? "regular"}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">{b.comment ?? "—"}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-red-500/10 hover:text-red-400" onClick={() => remove.mutate({ routerId, id: b[".id"] })}>
                    <Trash2 size={13} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataCard>
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add IP Binding">
        <form onSubmit={(e) => { e.preventDefault(); add.mutate({ routerId, ...form }); }} className="space-y-3">
          <FormField label="MAC Address"><Input value={form.macAddress} onChange={(e) => setForm({ ...form, macAddress: e.target.value })} required placeholder="00:11:22:33:44:55" /></FormField>
          <FormField label="Address (optional)"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="192.168.1.100" /></FormField>
          <FormField label="To Address (optional)"><Input value={form.toAddress} onChange={(e) => setForm({ ...form, toAddress: e.target.value })} /></FormField>
          <FormField label="Type">
            <Select title="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as BindingType })} className="w-full">
              <option value="regular">regular</option>
              <option value="bypassed">bypassed</option>
              <option value="blocked">blocked</option>
            </Select>
          </FormField>
          <FormField label="Comment"><Input value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} /></FormField>
          <ModalActions onCancel={() => setShowAdd(false)} loading={add.isPending} confirmText="Add Binding" />
        </form>
      </Modal>
    </div>
  );
}

/* ──────────────────────────────────────────────
   SERVICE PORTS TAB
────────────────────────────────────────────── */
function PortsTab({ routerId, search }: { routerId: string; search: string }) {
  const { data: ports, refetch, isLoading } = trpc.mikrotik.getHotspotServicePorts.useQuery({ routerId }, { enabled: !!routerId });
  const filtered = (ports ?? []).filter((p: any) =>
    !search || String(p?.name ?? "").toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div className="space-y-3">
      <TabToolbar right={<StatPill label="ports" value={ports?.length ?? 0} />}>
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw size={13} /></Button>
      </TabToolbar>
      <DataCard loading={isLoading} empty={filtered.length === 0} emptyMsg={routerId ? "No service ports" : "Select a router first"}>
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Ports</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {filtered.map((p: any) => (
              <TableRow key={p[".id"]}>
                <TableCell className="font-mono text-sm">{p.name ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{p.ports ?? "—"}</TableCell>
                <TableCell><Badge variant={p.disabled === "true" ? "destructive" : "success"}>{p.disabled === "true" ? "Disabled" : "Enabled"}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataCard>
    </div>
  );
}

/* ──────────────────────────────────────────────
   WALLED GARDEN TAB
────────────────────────────────────────────── */
function WalledGardenTab({ routerId, search }: { routerId: string; search: string }) {
  const { data: items, refetch, isLoading } = trpc.mikrotik.getWalledGarden.useQuery({ routerId }, { enabled: !!routerId });
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<typeof EMPTY_WALLED>(EMPTY_WALLED);

  const remove = trpc.mikrotik.removeWalledGarden.useMutation({
    onSuccess: () => { refetch(); toast.success("Rule removed"); },
    onError: (e) => toast.error(e.message),
  });
  const add = trpc.mikrotik.addWalledGarden.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); setForm(EMPTY_WALLED); toast.success("Rule added"); },
    onError: (e) => toast.error(e.message),
  });
  const filtered = (items ?? []).filter((w: any) =>
    !search || String(w?.["dst-host"] ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-3">
      <TabToolbar right={<StatPill label="rules" value={items?.length ?? 0} />}>
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw size={13} /></Button>
        <Button size="sm" onClick={() => setShowAdd(true)} disabled={!routerId}><Plus size={13} className="mr-1" />Add Rule</Button>
      </TabToolbar>
      <DataCard loading={isLoading} empty={filtered.length === 0} emptyMsg={routerId ? "No walled garden rules" : "Select a router first"}>
        <Table>
          <TableHeader><TableRow><TableHead>Action</TableHead><TableHead>Dst Host</TableHead><TableHead>Port</TableHead><TableHead>Comment</TableHead><TableHead className="w-10" /></TableRow></TableHeader>
          <TableBody>
            {filtered.map((w: any) => (
              <TableRow key={w[".id"]}>
                <TableCell><Badge variant={w.action === "allow" ? "success" : "destructive"}>{w.action ?? "—"}</Badge></TableCell>
                <TableCell className="font-mono text-sm">{w["dst-host"] ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{w["dst-port"] ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{w.comment ?? "—"}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-red-500/10 hover:text-red-400" onClick={() => remove.mutate({ routerId, id: w[".id"] })}>
                    <Trash2 size={13} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataCard>
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Walled Garden Rule">
        <form onSubmit={(e) => { e.preventDefault(); add.mutate({ routerId, ...form }); }} className="space-y-3">
          <FormField label="Destination Host"><Input value={form.dstHost} onChange={(e) => setForm({ ...form, dstHost: e.target.value })} placeholder="*.google.com" /></FormField>
          <FormField label="Destination Port"><Input value={form.dstPort} onChange={(e) => setForm({ ...form, dstPort: e.target.value })} placeholder="443" /></FormField>
          <FormField label="Action">
            <Select title="Action" value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value as WalledAction })} className="w-full">
              <option value="allow">allow</option>
              <option value="deny">deny</option>
            </Select>
          </FormField>
          <FormField label="Comment"><Input value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} /></FormField>
          <ModalActions onCancel={() => setShowAdd(false)} loading={add.isPending} confirmText="Add Rule" />
        </form>
      </Modal>
    </div>
  );
}

/* ──────────────────────────────────────────────
   SERVER PROFILES TAB
────────────────────────────────────────────── */
function ProfilesTab({ routerId, search }: { routerId: string; search: string }) {
  const { data: profiles, refetch, isLoading } = trpc.mikrotik.getHotspotServerProfiles.useQuery({ routerId }, { enabled: !!routerId });
  const filtered = (profiles ?? []).filter((p: any) =>
    !search || String(p?.name ?? "").toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div className="space-y-3">
      <TabToolbar right={<StatPill label="profiles" value={profiles?.length ?? 0} />}>
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw size={13} /></Button>
      </TabToolbar>
      <DataCard loading={isLoading} empty={filtered.length === 0} emptyMsg={routerId ? "No server profiles" : "Select a router first"}>
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Hotspot Address</TableHead><TableHead>DNS Name</TableHead><TableHead>SMTP</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {filtered.map((p: any) => (
              <TableRow key={p[".id"]}>
                <TableCell className="font-mono text-sm font-semibold">{p.name ?? "—"}</TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground">{p["hotspot-address"] ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{p["dns-name"] ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{p["smtp-server"] ?? "—"}</TableCell>
                <TableCell><Badge variant={p.disabled === "true" ? "destructive" : "success"}>{p.disabled === "true" ? "Disabled" : "Active"}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataCard>
    </div>
  );
}

/* ──────────────────────────────────────────────
   TRIAL CONTROL TAB
────────────────────────────────────────────── */
function TrialTab({ routerId: _ }: { routerId: string }) {
  const { data: trials, refetch, isLoading } = trpc.order.trialRequests.useQuery({ limit: 200 }, { refetchInterval: 30_000 });
  const approve = trpc.order.approve.useMutation({
    onSuccess: () => { refetch(); toast.success("ট্রায়াল অনুমোদিত — MikroTik user তৈরি হয়েছে"); },
    onError: (e) => toast.error(e.message),
  });
  const reject = trpc.order.reject.useMutation({
    onSuccess: () => { refetch(); toast.success("ট্রায়াল বাতিল করা হয়েছে"); },
    onError: (e) => toast.error(e.message),
  });

  const all = trials ?? [];
  const pending = all.filter((t) => t.status === "pending");
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const approvedToday = all.filter((t) => t.status === "approved" && new Date(t.reviewedAt ?? 0) >= todayStart);

  function parseUA(meta: string | null): string {
    try { return (JSON.parse(meta ?? "{}") as { ua?: string }).ua ?? ""; } catch { return ""; }
  }
  function deviceLabel(ua: string): string {
    if (!ua) return "—";
    if (/android/i.test(ua)) return "🤖 Android";
    if (/iphone|ipad/i.test(ua)) return "🍎 iOS";
    if (/windows/i.test(ua)) return "🖥 Windows";
    if (/mac/i.test(ua)) return "🍎 Mac";
    return "💻 " + ua.slice(0, 18);
  }

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-yellow-500/5 border-yellow-500/20 p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle size={14} className="text-yellow-400" />
            <span className="text-xs text-muted-foreground font-medium">অনুমোদন বাকি</span>
          </div>
          <p className="text-2xl font-bold text-yellow-400">{pending.length}</p>
        </div>
        <div className="rounded-xl border bg-green-500/5 border-green-500/20 p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 size={14} className="text-green-400" />
            <span className="text-xs text-muted-foreground font-medium">আজকে অনুমোদিত</span>
          </div>
          <p className="text-2xl font-bold text-green-400">{approvedToday.length}</p>
        </div>
        <div className="rounded-xl border bg-muted/40 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Gift size={14} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-medium">মোট রিকোয়েস্ট</span>
          </div>
          <p className="text-2xl font-bold">{all.length}</p>
        </div>
      </div>

      <TabToolbar right={
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground animate-pulse" />
          auto-refresh 30s
        </span>
      }>
        <h3 className="text-sm font-semibold">ফ্রি ট্রায়াল রিকোয়েস্ট</h3>
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw size={13} /></Button>
      </TabToolbar>

      <DataCard loading={isLoading} empty={all.length === 0} emptyMsg="এখনও কোনো ট্রায়াল রিকোয়েস্ট আসেনি">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>স্ট্যাটাস</TableHead>
              <TableHead>গ্রাহক</TableHead>
              <TableHead>MAC / IP</TableHead>
              <TableHead>ডিভাইস</TableHead>
              <TableHead>সময়</TableHead>
              <TableHead className="w-28"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {all.map((t) => {
              const ua = parseUA(t.meta);
              const isPending = t.status === "pending";
              return (
                <TableRow key={t.id} className={isPending ? "bg-yellow-500/4" : ""}>
                  <TableCell>
                    {t.status === "approved"
                      ? <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400"><CheckCircle2 size={10} /> অনুমোদিত</span>
                      : t.status === "rejected"
                      ? <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400"><XCircle size={10} /> বাতিল</span>
                      : <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400"><AlertCircle size={10} /> অপেক্ষায়</span>
                    }
                  </TableCell>
                  <TableCell>
                    <div className="font-semibold text-sm">{t.customerName}</div>
                    <div className="text-xs text-muted-foreground font-mono">{t.customerPhone}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs font-mono text-muted-foreground">{t.mac ?? "—"}</div>
                    <div className="text-xs font-mono text-muted-foreground">{t.ip ?? "—"}</div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{deviceLabel(ua)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(t.createdAt).toLocaleString("en-BD")}
                  </TableCell>
                  <TableCell>
                    {isPending && (
                      <div className="flex gap-1">
                        <button
                          className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                          disabled={approve.isPending}
                          onClick={() => approve.mutate({ id: t.id })}
                        >
                          <CheckCircle2 size={11} /> Approve
                        </button>
                        <button
                          className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                          disabled={reject.isPending}
                          onClick={() => reject.mutate({ id: t.id })}
                        >
                          <XCircle size={11} />
                        </button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </DataCard>
    </div>
  );
}

/* ──────────────────────────────────────────────
   MICRO COMPONENTS
────────────────────────────────────────────── */
function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-muted-foreground mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function ModalActions({
  onCancel, onConfirm, loading, confirmText = "Confirm", danger = false,
}: {
  onCancel: () => void;
  onConfirm?: () => void;
  loading?: boolean;
  confirmText?: string;
  danger?: boolean;
}) {
  return (
    <div className="flex gap-2 pt-1">
      <Button
        type={onConfirm ? "button" : "submit"}
        onClick={onConfirm}
        className={`flex-1 ${danger ? "bg-red-600 hover:bg-red-700 text-white" : ""}`}
        disabled={loading}
      >
        {loading ? <><RefreshCw size={13} className="animate-spin mr-1.5" />Processing…</> : confirmText}
      </Button>
      <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
        Cancel
      </Button>
    </div>
  );
}

