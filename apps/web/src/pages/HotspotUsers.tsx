import { useState } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { Plus, RefreshCw, Trash2, UserCheck, UserX } from "lucide-react";
import { Card, CardContent, Button, Input, Modal, Badge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Select, Empty } from "../components/ui/index";

const EMPTY = { name: "", password: "", profile: "default", comment: "" };

export default function HotspotUsers() {
  const { data: routers } = trpc.routerMgmt.list.useQuery();
  const [routerId, setRouterId] = useState("");
  const selected = routerId || routers?.[0]?.id || "";

  const { data: users, refetch, isLoading } = trpc.mikrotik.getHotspotUsers.useQuery({ routerId: selected }, { enabled: !!selected });
  const { data: active } = trpc.mikrotik.getActiveHotspotSessions.useQuery({ routerId: selected }, { enabled: !!selected, refetchInterval: 10_000 });
  const { data: profiles } = trpc.mikrotik.getHotspotProfiles.useQuery({ routerId: selected }, { enabled: !!selected });

  const [showAdd, setShowAdd] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleteStatus, setDeleteStatus] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [search, setSearch] = useState("");

  const add = trpc.mikrotik.addHotspotUser.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); setForm(EMPTY); toast.success("Hotspot user added"); },
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
  const activeNames = new Set(activeSessions.map((a: any) => sessionUsername(a)).filter(Boolean));
  const filtered = (users ?? []).filter((u: any) =>
    !search || u.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Hotspot Users</h1>
          <p className="text-muted-foreground text-sm">{activeSessions.length} online / {users?.length ?? 0} total</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select title="Select router" value={selected} onChange={(e) => setRouterId(e.target.value)} className="w-44">
            {routers?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-36" />
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw size={14} /></Button>
          <Button size="sm" onClick={() => setShowAdd(true)} disabled={!selected}><Plus size={14} /> Add</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Hotspot Active</p><p className="text-2xl font-bold">{activeSessions.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Online Users</p><p className="text-2xl font-bold">{activeNames.size}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Sessions</p><p className="text-2xl font-bold">{activeSessions.length}</p></CardContent></Card>
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
                      <TableHead>IP</TableHead>
                      <TableHead>Profile</TableHead>
                      <TableHead>MAC Address</TableHead>
                      <TableHead>Uptime</TableHead>
                      <TableHead>Session Bytes</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((u: any) => {
                      const online = activeNames.has(u.name);
                      const session = activeSessions.find((a: any) => sessionUsername(a) === u.name);
                      return (
                        <TableRow key={u[".id"] ?? u.name}>
                          <TableCell>
                            <Badge variant={online ? "success" : "default"}>
                              {online
                                ? <UserCheck size={11} className="inline mr-1" />
                                : <UserX size={11} className="inline mr-1" />}
                              {online ? "Online" : "Offline"}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm font-medium">{u.name}</TableCell>
                          <TableCell className="text-muted-foreground text-xs font-mono">{sessionIp(session) ?? "—"}</TableCell>
                          <TableCell><Badge variant="outline">{u.profile ?? "default"}</Badge></TableCell>
                          <TableCell className="text-muted-foreground text-xs font-mono">{sessionMac(session) ?? u["mac-address"] ?? "—"}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{session?.uptime ?? "—"}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{sessionBytes(session)}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon"
                              onClick={() => { setDeleteTarget(u); setShowDelete(true); setDeleteStatus(""); }}>
                              <Trash2 size={14} className="text-muted-foreground hover:text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
          )}
          {!isLoading && filtered.length === 0 && (
            <Empty message={selected ? "No hotspot users found" : "Select a router first"} />
          )}
        </CardContent>
      </Card>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Hotspot User">
        <form onSubmit={(e) => { e.preventDefault(); add.mutate({ routerId: selected, ...form }); }} className="space-y-3">
          <div>
            <label htmlFor="hs-name" className="block text-xs font-medium text-muted-foreground mb-1.5">Username</label>
            <Input id="hs-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <label htmlFor="hs-pass" className="block text-xs font-medium text-muted-foreground mb-1.5">Password</label>
            <Input id="hs-pass" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </div>
          <div>
            <label htmlFor="hs-profile" className="block text-xs font-medium text-muted-foreground mb-1.5">Profile</label>
            <Select id="hs-profile" title="Profile" value={form.profile} onChange={(e) => setForm({ ...form, profile: e.target.value })} className="w-full">
              {profiles?.length ? profiles.map((p: any) => <option key={p.name} value={p.name}>{p.name}</option>) : <option value="default">default</option>}
            </Select>
          </div>
          <div>
            <label htmlFor="hs-comment" className="block text-xs font-medium text-muted-foreground mb-1.5">Comment (optional)</label>
            <Input id="hs-comment" value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" className="flex-1" disabled={add.isPending}>{add.isPending ? "Adding…" : "Add User"}</Button>
            <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>

      {/* Delete Modal */}
      <Modal open={showDelete} onClose={() => { if (!remove.isPending) { setShowDelete(false); setDeleteTarget(null); setDeleteStatus(""); } }} title="হটস্পট ইউজার মুছুন">
        <div className="space-y-4">
          {deleteTarget && (
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">{deleteTarget.name}</strong> কে সম্পূর্ণ মুছতে চান?
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                এটি active session, cookie, host, IP binding এবং DB record সব মুছে দেবে।
              </p>
            </div>
          )}
          {deleteStatus && (
            <div className={`text-center p-3 rounded-lg text-sm font-medium ${deleteStatus.includes("ব্যর্থ") ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"}`}>
              {deleteStatus}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <Button
              variant="destructive"
              className="flex-1"
              disabled={remove.isPending || deleteStatus.includes("সম্পূর্ণ")}
              onClick={() => {
                if (deleteTarget) {
                  setDeleteStatus("ইউজার মুছে ফেলা হচ্ছে...");
                  remove.mutate({ routerId: selected, name: deleteTarget.name });
                }
              }}
            >
              {remove.isPending ? "মুছে ফেলা হচ্ছে..." : "হ্যাঁ, মুছুন"}
            </Button>
            <Button type="button" variant="outline" onClick={() => { setShowDelete(false); setDeleteTarget(null); setDeleteStatus(""); }} disabled={remove.isPending}>
              বাতিল
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function sessionUsername(session: any): string {
  return String(session?.user ?? session?.name ?? session?.username ?? "");
}

function sessionIp(session: any): string | null {
  return session?.address ?? session?.["ip-address"] ?? null;
}

function sessionMac(session: any): string | null {
  return session?.["mac-address"] ?? session?.macAddress ?? null;
}

function sessionBytes(session: any): string {
  if (!session) return "—";
  const incoming = Number(session["bytes-in"] ?? session.bytesIn ?? 0);
  const outgoing = Number(session["bytes-out"] ?? session.bytesOut ?? 0);
  const total = incoming + outgoing;
  return total > 0 ? `${formatBytes(total)} (${formatBytes(incoming)} in / ${formatBytes(outgoing)} out)` : "—";
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
