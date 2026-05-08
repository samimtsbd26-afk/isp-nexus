import { useState } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { Plus, RefreshCw, Trash2, UserCheck, UserX, Server, Cookie, Globe, Shield, Network, Layers, Gift } from "lucide-react";
import { Card, CardContent, Button, Input, Modal, Badge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Select, Empty, Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/index";

const EMPTY_USER = { name: "", password: "", profile: "default", comment: "" };
type BindingType = "regular" | "bypassed" | "blocked";
type WalledAction = "allow" | "deny";
const EMPTY_BINDING = { macAddress: "", address: "", toAddress: "", type: "regular" as BindingType, comment: "" };
const EMPTY_WALLED = { dstHost: "", dstPort: "", action: "allow" as WalledAction, comment: "" };

const TABS = [
  { id: "users", label: "Users", icon: UserCheck },
  { id: "active", label: "Active Sessions", icon: UserCheck },
  { id: "hosts", label: "Hosts", icon: Server },
  { id: "cookies", label: "Cookies", icon: Cookie },
  { id: "bindings", label: "IP Bindings", icon: Shield },
  { id: "ports", label: "Service Ports", icon: Network },
  { id: "walled", label: "Walled Garden", icon: Globe },
  { id: "profiles", label: "Server Profiles", icon: Layers },
  { id: "trial", label: "Trial Control", icon: Gift },
];

export default function HotspotControl() {
  const { data: routers } = trpc.routerMgmt.list.useQuery();
  const [routerId, setRouterId] = useState("");
  const selected = routerId || routers?.[0]?.id || "";
  const [activeTab, setActiveTab] = useState("users");
  const [search, setSearch] = useState("");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Hotspot Control Center</h1>
          <p className="text-muted-foreground text-sm">MikroTik hotspot full management</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select title="Select router" value={selected} onChange={(e) => setRouterId(e.target.value)} className="w-44">
            {routers?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-36" />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="flex items-center gap-1.5">
              <t.icon size={14} />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="users">
          <UsersTab routerId={selected} search={search} />
        </TabsContent>
        <TabsContent value="active">
          <ActiveTab routerId={selected} search={search} />
        </TabsContent>
        <TabsContent value="hosts">
          <HostsTab routerId={selected} search={search} />
        </TabsContent>
        <TabsContent value="cookies">
          <CookiesTab routerId={selected} search={search} />
        </TabsContent>
        <TabsContent value="bindings">
          <BindingsTab routerId={selected} search={search} />
        </TabsContent>
        <TabsContent value="ports">
          <PortsTab routerId={selected} search={search} />
        </TabsContent>
        <TabsContent value="walled">
          <WalledGardenTab routerId={selected} search={search} />
        </TabsContent>
        <TabsContent value="profiles">
          <ProfilesTab routerId={selected} search={search} />
        </TabsContent>
        <TabsContent value="trial">
          <TrialTab routerId={selected} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// === USERS TAB ===
function UsersTab({ routerId, search }: { routerId: string; search: string }) {
  const { data: users, refetch, isLoading } = trpc.mikrotik.getHotspotUsers.useQuery({ routerId }, { enabled: !!routerId });
  const { data: active } = trpc.mikrotik.getActiveHotspotSessions.useQuery({ routerId }, { enabled: !!routerId, refetchInterval: 10_000 });
  const { data: profiles } = trpc.mikrotik.getHotspotProfiles.useQuery({ routerId }, { enabled: !!routerId });

  const [showAdd, setShowAdd] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleteStatus, setDeleteStatus] = useState("");
  const [form, setForm] = useState(EMPTY_USER);

  const add = trpc.mikrotik.addHotspotUser.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); setForm(EMPTY_USER); toast.success("Hotspot user added"); },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.mikrotik.removeHotspotUser.useMutation({
    onSuccess: (result) => {
      refetch();
      setDeleteStatus("ইউজার সম্পূর্ণ মুছে ফেলা হয়েছে");
      setTimeout(() => { setShowDelete(false); setDeleteTarget(null); setDeleteStatus(""); }, 1500);
      toast.success("User removed: " + (result.logs?.join(", ") || ""));
    },
    onError: (e) => {
      setDeleteStatus("মুছতে ব্যর্থ: " + e.message);
      toast.error(e.message);
    },
  });

  const activeSessions = active ?? [];
  const activeNames = new Set(activeSessions.map((a: any) => String(a?.user ?? a?.name ?? "")).filter(Boolean));
  const filtered = (users ?? []).filter((u: any) => !search || u.name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw size={14} /></Button>
          <Button size="sm" onClick={() => setShowAdd(true)} disabled={!routerId}><Plus size={14} /> Add User</Button>
        </div>
        <Badge variant="outline">{activeSessions.length} online / {users?.length ?? 0} total</Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && <div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>}
          {!isLoading && filtered.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Profile</TableHead>
                  <TableHead>MAC</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u: any) => {
                  const online = activeNames.has(u.name);
                  return (
                    <TableRow key={u[".id"] ?? u.name}>
                      <TableCell>
                        <Badge variant={online ? "success" : "default"}>
                          {online ? <UserCheck size={11} className="inline mr-1" /> : <UserX size={11} className="inline mr-1" />}
                          {online ? "Online" : "Offline"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm font-medium">{u.name}</TableCell>
                      <TableCell><Badge variant="outline">{u.profile ?? "default"}</Badge></TableCell>
                      <TableCell className="text-muted-foreground text-xs font-mono">{u["mac-address"] ?? "—"}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => { setDeleteTarget(u); setShowDelete(true); setDeleteStatus(""); }}>
                          <Trash2 size={14} className="text-muted-foreground hover:text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {!isLoading && filtered.length === 0 && <Empty message={routerId ? "No hotspot users found" : "Select a router first"} />}
        </CardContent>
      </Card>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Hotspot User">
        <form onSubmit={(e) => { e.preventDefault(); add.mutate({ routerId, ...form }); }} className="space-y-3">
          <div><label className="block text-xs font-medium text-muted-foreground mb-1.5">Username</label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
          <div><label className="block text-xs font-medium text-muted-foreground mb-1.5">Password</label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></div>
          <div><label className="block text-xs font-medium text-muted-foreground mb-1.5">Profile</label><Select title="Profile" value={form.profile} onChange={(e) => setForm({ ...form, profile: e.target.value })} className="w-full">{profiles?.length ? profiles.map((p: any) => <option key={p.name} value={p.name}>{p.name}</option>) : <option value="default">default</option>}</Select></div>
          <div><label className="block text-xs font-medium text-muted-foreground mb-1.5">Comment</label><Input value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} /></div>
          <div className="flex gap-2 pt-1"><Button type="submit" className="flex-1" disabled={add.isPending}>{add.isPending ? "Adding…" : "Add User"}</Button><Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button></div>
        </form>
      </Modal>

      <Modal open={showDelete} onClose={() => { if (!remove.isPending) { setShowDelete(false); setDeleteTarget(null); setDeleteStatus(""); } }} title="হটস্পট ইউজার মুছুন">
        <div className="space-y-4">
          {deleteTarget && (
            <div className="text-center">
              <p className="text-sm text-muted-foreground"><strong className="text-foreground">{deleteTarget.name}</strong> কে সম্পূর্ণ মুছতে চান?</p>
              <p className="text-xs text-muted-foreground mt-1">এটি active session, cookie, host, IP binding এবং DB record সব মুছে দেবে।</p>
            </div>
          )}
          {deleteStatus && <div className={`text-center p-3 rounded-lg text-sm font-medium ${deleteStatus.includes("ব্যর্থ") ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"}`}>{deleteStatus}</div>}
          <div className="flex gap-2 pt-1">
            <Button variant="destructive" className="flex-1" disabled={remove.isPending || deleteStatus.includes("সম্পূর্ণ")} onClick={() => { if (deleteTarget) { setDeleteStatus("ইউজার মুছে ফেলা হচ্ছে..."); remove.mutate({ routerId, name: deleteTarget.name }); } }}>{remove.isPending ? "মুছে ফেলা হচ্ছে..." : "হ্যাঁ, মুছুন"}</Button>
            <Button type="button" variant="outline" onClick={() => { setShowDelete(false); setDeleteTarget(null); setDeleteStatus(""); }} disabled={remove.isPending}>বাতিল</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// === ACTIVE SESSIONS TAB ===
function ActiveTab({ routerId, search }: { routerId: string; search: string }) {
  const { data: active, refetch, isLoading } = trpc.mikrotik.getActiveHotspotSessions.useQuery({ routerId }, { enabled: !!routerId, refetchInterval: 10_000 });
  const filtered = (active ?? []).filter((a: any) => !search || String(a?.user ?? "").toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw size={14} /> Refresh</Button>
        <Badge variant="outline">{active?.length ?? 0} active sessions</Badge>
      </div>
      <Card><CardContent className="p-0">
        {isLoading && <div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>}
        {!isLoading && filtered.length > 0 && (
          <Table>
            <TableHeader><TableRow><TableHead>User</TableHead><TableHead>IP</TableHead><TableHead>MAC</TableHead><TableHead>Uptime</TableHead><TableHead>Bytes</TableHead></TableRow></TableHeader>
            <TableBody>
              {filtered.map((a: any) => (
                <TableRow key={a[".id"]}>
                  <TableCell className="font-mono text-sm">{a.user}</TableCell>
                  <TableCell className="text-muted-foreground text-xs font-mono">{a.address ?? a["ip-address"] ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs font-mono">{a["mac-address"] ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{a.uptime ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{formatBytes(Number(a["bytes-in"] ?? 0) + Number(a["bytes-out"] ?? 0))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {!isLoading && filtered.length === 0 && <Empty message={routerId ? "No active sessions" : "Select a router first"} />}
      </CardContent></Card>
    </div>
  );
}

// === HOSTS TAB ===
function HostsTab({ routerId, search }: { routerId: string; search: string }) {
  const { data: hosts, refetch, isLoading } = trpc.mikrotik.getHotspotHosts.useQuery({ routerId }, { enabled: !!routerId });
  const remove = trpc.mikrotik.removeHotspotHost.useMutation({
    onSuccess: () => { refetch(); toast.success("Host removed"); },
    onError: (e) => toast.error(e.message),
  });
  const filtered = (hosts ?? []).filter((h: any) => !search || String(h?.["mac-address"] ?? "").toLowerCase().includes(search.toLowerCase()) || String(h?.address ?? "").includes(search));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw size={14} /> Refresh</Button>
        <Badge variant="outline">{hosts?.length ?? 0} hosts</Badge>
      </div>
      <Card><CardContent className="p-0">
        {isLoading && <div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>}
        {!isLoading && filtered.length > 0 && (
          <Table>
            <TableHeader><TableRow><TableHead>MAC</TableHead><TableHead>IP</TableHead><TableHead>To IP</TableHead><TableHead>Server</TableHead><TableHead>Uptime</TableHead><TableHead className="w-12"></TableHead></TableRow></TableHeader>
            <TableBody>
              {filtered.map((h: any) => (
                <TableRow key={h[".id"]}>
                  <TableCell className="font-mono text-xs">{h["mac-address"] ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs font-mono">{h.address ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs font-mono">{h["to-address"] ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{h.server ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{h.uptime ?? "—"}</TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => remove.mutate({ routerId, id: h[".id"] })}><Trash2 size={14} className="text-muted-foreground hover:text-destructive" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {!isLoading && filtered.length === 0 && <Empty message={routerId ? "No hosts found" : "Select a router first"} />}
      </CardContent></Card>
    </div>
  );
}

// === COOKIES TAB ===
function CookiesTab({ routerId, search }: { routerId: string; search: string }) {
  const { data: cookies, refetch, isLoading } = trpc.mikrotik.getHotspotCookies.useQuery({ routerId }, { enabled: !!routerId });
  const remove = trpc.mikrotik.removeHotspotCookie.useMutation({
    onSuccess: () => { refetch(); toast.success("Cookie removed"); },
    onError: (e) => toast.error(e.message),
  });
  const filtered = (cookies ?? []).filter((c: any) => !search || String(c?.user ?? "").toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw size={14} /> Refresh</Button>
        <Badge variant="outline">{cookies?.length ?? 0} cookies</Badge>
      </div>
      <Card><CardContent className="p-0">
        {isLoading && <div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>}
        {!isLoading && filtered.length > 0 && (
          <Table>
            <TableHeader><TableRow><TableHead>User</TableHead><TableHead>MAC</TableHead><TableHead>IP</TableHead><TableHead>Uptime</TableHead><TableHead className="w-12"></TableHead></TableRow></TableHeader>
            <TableBody>
              {filtered.map((c: any) => (
                <TableRow key={c[".id"]}>
                  <TableCell className="font-mono text-sm">{c.user ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs font-mono">{c["mac-address"] ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs font-mono">{c.address ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{c.uptime ?? "—"}</TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => remove.mutate({ routerId, id: c[".id"] })}><Trash2 size={14} className="text-muted-foreground hover:text-destructive" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {!isLoading && filtered.length === 0 && <Empty message={routerId ? "No cookies found" : "Select a router first"} />}
      </CardContent></Card>
    </div>
  );
}

// === IP BINDINGS TAB ===
function BindingsTab({ routerId, search }: { routerId: string; search: string }) {
  const { data: bindings, refetch, isLoading } = trpc.mikrotik.getHotspotIpBindings.useQuery({ routerId }, { enabled: !!routerId });
  const remove = trpc.mikrotik.removeHotspotIpBinding.useMutation({
    onSuccess: () => { refetch(); toast.success("IP binding removed"); },
    onError: (e) => toast.error(e.message),
  });
  const add = trpc.mikrotik.addHotspotIpBinding.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); setForm(EMPTY_BINDING); toast.success("IP binding added"); },
    onError: (e) => toast.error(e.message),
  });
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<{ macAddress: string; address: string; toAddress: string; type: BindingType; comment: string }>(EMPTY_BINDING);
  const filtered = (bindings ?? []).filter((b: any) => !search || String(b?.["mac-address"] ?? "").toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw size={14} /> Refresh</Button>
          <Button size="sm" onClick={() => setShowAdd(true)} disabled={!routerId}><Plus size={14} /> Add Binding</Button>
        </div>
        <Badge variant="outline">{bindings?.length ?? 0} bindings</Badge>
      </div>
      <Card><CardContent className="p-0">
        {isLoading && <div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>}
        {!isLoading && filtered.length > 0 && (
          <Table>
            <TableHeader><TableRow><TableHead>MAC</TableHead><TableHead>Address</TableHead><TableHead>To Address</TableHead><TableHead>Type</TableHead><TableHead>Comment</TableHead><TableHead className="w-12"></TableHead></TableRow></TableHeader>
            <TableBody>
              {filtered.map((b: any) => (
                <TableRow key={b[".id"]}>
                  <TableCell className="font-mono text-xs">{b["mac-address"] ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs font-mono">{b.address ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs font-mono">{b["to-address"] ?? "—"}</TableCell>
                  <TableCell><Badge variant={b.type === "bypassed" ? "success" : b.type === "blocked" ? "destructive" : "default"}>{b.type ?? "regular"}</Badge></TableCell>
                  <TableCell className="text-muted-foreground text-sm">{b.comment ?? "—"}</TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => remove.mutate({ routerId, id: b[".id"] })}><Trash2 size={14} className="text-muted-foreground hover:text-destructive" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {!isLoading && filtered.length === 0 && <Empty message={routerId ? "No IP bindings found" : "Select a router first"} />}
      </CardContent></Card>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add IP Binding">
        <form onSubmit={(e) => { e.preventDefault(); add.mutate({ routerId, ...form }); }} className="space-y-3">
          <div><label className="block text-xs font-medium text-muted-foreground mb-1.5">MAC Address</label><Input value={form.macAddress} onChange={(e) => setForm({ ...form, macAddress: e.target.value })} required placeholder="00:11:22:33:44:55" /></div>
          <div><label className="block text-xs font-medium text-muted-foreground mb-1.5">Address (optional)</label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="192.168.1.100" /></div>
          <div><label className="block text-xs font-medium text-muted-foreground mb-1.5">To Address (optional)</label><Input value={form.toAddress} onChange={(e) => setForm({ ...form, toAddress: e.target.value })} /></div>
          <div><label className="block text-xs font-medium text-muted-foreground mb-1.5">Type</label><Select title="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as "regular" | "bypassed" | "blocked" })} className="w-full"><option value="regular">regular</option><option value="bypassed">bypassed</option><option value="blocked">blocked</option></Select></div>
          <div><label className="block text-xs font-medium text-muted-foreground mb-1.5">Comment</label><Input value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} /></div>
          <div className="flex gap-2 pt-1"><Button type="submit" className="flex-1" disabled={add.isPending}>{add.isPending ? "Adding…" : "Add Binding"}</Button><Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button></div>
        </form>
      </Modal>
    </div>
  );
}

// === SERVICE PORTS TAB ===
function PortsTab({ routerId, search }: { routerId: string; search: string }) {
  const { data: ports, refetch, isLoading } = trpc.mikrotik.getHotspotServicePorts.useQuery({ routerId }, { enabled: !!routerId });
  const filtered = (ports ?? []).filter((p: any) => !search || String(p?.name ?? "").toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw size={14} /> Refresh</Button>
        <Badge variant="outline">{ports?.length ?? 0} service ports</Badge>
      </div>
      <Card><CardContent className="p-0">
        {isLoading && <div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>}
        {!isLoading && filtered.length > 0 && (
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Ports</TableHead><TableHead>Disabled</TableHead></TableRow></TableHeader>
            <TableBody>
              {filtered.map((p: any) => (
                <TableRow key={p[".id"]}>
                  <TableCell className="font-mono text-sm">{p.name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{p.ports ?? "—"}</TableCell>
                  <TableCell><Badge variant={p.disabled === "true" ? "destructive" : "success"}>{p.disabled === "true" ? "Yes" : "No"}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {!isLoading && filtered.length === 0 && <Empty message={routerId ? "No service ports found" : "Select a router first"} />}
      </CardContent></Card>
    </div>
  );
}

// === WALLED GARDEN TAB ===
function WalledGardenTab({ routerId, search }: { routerId: string; search: string }) {
  const { data: items, refetch, isLoading } = trpc.mikrotik.getWalledGarden.useQuery({ routerId }, { enabled: !!routerId });
  const remove = trpc.mikrotik.removeWalledGarden.useMutation({
    onSuccess: () => { refetch(); toast.success("Walled garden rule removed"); },
    onError: (e) => toast.error(e.message),
  });
  const add = trpc.mikrotik.addWalledGarden.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); setForm(EMPTY_WALLED); toast.success("Walled garden rule added"); },
    onError: (e) => toast.error(e.message),
  });
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<{ dstHost: string; dstPort: string; action: WalledAction; comment: string }>(EMPTY_WALLED);
  const filtered = (items ?? []).filter((w: any) => !search || String(w?.["dst-host"] ?? "").toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw size={14} /> Refresh</Button>
          <Button size="sm" onClick={() => setShowAdd(true)} disabled={!routerId}><Plus size={14} /> Add Rule</Button>
        </div>
        <Badge variant="outline">{items?.length ?? 0} rules</Badge>
      </div>
      <Card><CardContent className="p-0">
        {isLoading && <div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>}
        {!isLoading && filtered.length > 0 && (
          <Table>
            <TableHeader><TableRow><TableHead>Action</TableHead><TableHead>Dst Host</TableHead><TableHead>Dst Port</TableHead><TableHead>Comment</TableHead><TableHead className="w-12"></TableHead></TableRow></TableHeader>
            <TableBody>
              {filtered.map((w: any) => (
                <TableRow key={w[".id"]}>
                  <TableCell><Badge variant={w.action === "allow" ? "success" : "destructive"}>{w.action ?? "—"}</Badge></TableCell>
                  <TableCell className="font-mono text-sm">{w["dst-host"] ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{w["dst-port"] ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{w.comment ?? "—"}</TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => remove.mutate({ routerId, id: w[".id"] })}><Trash2 size={14} className="text-muted-foreground hover:text-destructive" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {!isLoading && filtered.length === 0 && <Empty message={routerId ? "No walled garden rules" : "Select a router first"} />}
      </CardContent></Card>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Walled Garden Rule">
        <form onSubmit={(e) => { e.preventDefault(); add.mutate({ routerId, ...form }); }} className="space-y-3">
          <div><label className="block text-xs font-medium text-muted-foreground mb-1.5">Destination Host</label><Input value={form.dstHost} onChange={(e) => setForm({ ...form, dstHost: e.target.value })} placeholder="*.google.com" /></div>
          <div><label className="block text-xs font-medium text-muted-foreground mb-1.5">Destination Port</label><Input value={form.dstPort} onChange={(e) => setForm({ ...form, dstPort: e.target.value })} placeholder="443" /></div>
          <div><label className="block text-xs font-medium text-muted-foreground mb-1.5">Action</label><Select title="Action" value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value as "allow" | "deny" })} className="w-full"><option value="allow">allow</option><option value="deny">deny</option></Select></div>
          <div><label className="block text-xs font-medium text-muted-foreground mb-1.5">Comment</label><Input value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} /></div>
          <div className="flex gap-2 pt-1"><Button type="submit" className="flex-1" disabled={add.isPending}>{add.isPending ? "Adding…" : "Add Rule"}</Button><Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button></div>
        </form>
      </Modal>
    </div>
  );
}

// === SERVER PROFILES TAB ===
function ProfilesTab({ routerId, search }: { routerId: string; search: string }) {
  const { data: profiles, refetch, isLoading } = trpc.mikrotik.getHotspotServerProfiles.useQuery({ routerId }, { enabled: !!routerId });
  const filtered = (profiles ?? []).filter((p: any) => !search || String(p?.name ?? "").toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw size={14} /> Refresh</Button>
        <Badge variant="outline">{profiles?.length ?? 0} profiles</Badge>
      </div>
      <Card><CardContent className="p-0">
        {isLoading && <div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>}
        {!isLoading && filtered.length > 0 && (
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Hotspot Address</TableHead><TableHead>DNS</TableHead><TableHead>SMTP</TableHead><TableHead>Disabled</TableHead></TableRow></TableHeader>
            <TableBody>
              {filtered.map((p: any) => (
                <TableRow key={p[".id"]}>
                  <TableCell className="font-mono text-sm font-medium">{p.name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs font-mono">{p["hotspot-address"] ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{p["dns-name"] ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{p["smtp-server"] ?? "—"}</TableCell>
                  <TableCell><Badge variant={p.disabled === "true" ? "destructive" : "success"}>{p.disabled === "true" ? "Yes" : "No"}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {!isLoading && filtered.length === 0 && <Empty message={routerId ? "No server profiles" : "Select a router first"} />}
      </CardContent></Card>
    </div>
  );
}

// === TRIAL CONTROL TAB ===
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
    if (/windows/i.test(ua)) return "🖥️ Windows";
    if (/mac/i.test(ua)) return "🍎 Mac";
    return "💻 " + ua.slice(0, 20);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-1">অনুমোদন বাকি</p>
          <p className="text-2xl font-bold text-yellow-400">{pending.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-1">আজকে অনুমোদিত</p>
          <p className="text-2xl font-bold text-green-400">{approvedToday.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-1">মোট রিকোয়েস্ট</p>
          <p className="text-2xl font-bold">{all.length}</p>
        </CardContent></Card>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">ফ্রি ট্রায়াল রিকোয়েস্ট</h3>
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw size={14} /></Button>
      </div>

      <Card><CardContent className="p-0">
        {isLoading && <div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>}
        {!isLoading && all.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>স্ট্যাটাস</TableHead>
                <TableHead>গ্রাহক</TableHead>
                <TableHead>MAC</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>ডিভাইস</TableHead>
                <TableHead>সময়</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {all.map((t) => {
                const ua = parseUA(t.meta);
                return (
                  <TableRow key={t.id} className={t.status === "pending" ? "bg-yellow-500/5" : ""}>
                    <TableCell>
                      <Badge variant={t.status === "approved" ? "success" : t.status === "rejected" ? "destructive" : "default"}>
                        {t.status === "approved" ? "✅ অনুমোদিত" : t.status === "rejected" ? "❌ বাতিল" : "⏳ অপেক্ষায়"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{t.customerName}</div>
                      <div className="text-xs text-muted-foreground font-mono">{t.customerPhone}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{t.mac ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{t.ip ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{deviceLabel(ua)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(t.createdAt).toLocaleString("en-BD")}
                    </TableCell>
                    <TableCell>
                      {t.status === "pending" && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline"
                            className="text-green-400 border-green-400/30 hover:bg-green-400/10 h-7 px-2 text-xs"
                            disabled={approve.isPending}
                            onClick={() => approve.mutate({ id: t.id })}>
                            ✅ অনুমোদন
                          </Button>
                          <Button size="sm" variant="outline"
                            className="text-red-400 border-red-400/30 hover:bg-red-400/10 h-7 px-2 text-xs"
                            disabled={reject.isPending}
                            onClick={() => reject.mutate({ id: t.id })}>
                            ❌
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {!isLoading && all.length === 0 && <Empty message="এখনও কোনো ফ্রি ট্রায়াল রিকোয়েস্ট আসেনি" />}
      </CardContent></Card>
    </div>
  );
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit += 1; }
  return `${amount.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
