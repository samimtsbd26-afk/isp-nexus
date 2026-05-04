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
  const [form, setForm] = useState(EMPTY);
  const [search, setSearch] = useState("");

  const add = trpc.mikrotik.addHotspotUser.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); setForm(EMPTY); toast.success("Hotspot user added"); },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.mikrotik.removeHotspotUser.useMutation({
    onSuccess: () => { refetch(); toast.success("User removed"); },
    onError: (e) => toast.error(e.message),
  });

  const activeNames = new Set((active ?? []).map((a: any) => a.user));
  const filtered = (users ?? []).filter((u: any) =>
    !search || u.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Hotspot Users</h1>
          <p className="text-muted-foreground text-sm">{active?.length ?? 0} online / {users?.length ?? 0} total</p>
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
                      <TableHead>MAC Address</TableHead>
                      <TableHead>Uptime</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((u: any) => {
                      const online = activeNames.has(u.name);
                      const session = (active ?? []).find((a: any) => a.user === u.name);
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
                          <TableCell><Badge variant="outline">{u.profile ?? "default"}</Badge></TableCell>
                          <TableCell className="text-muted-foreground text-xs font-mono">{u["mac-address"] ?? "—"}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{session?.uptime ?? "—"}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon"
                              onClick={() => { if (globalThis.confirm(`Delete "${u.name}"?`)) remove.mutate({ routerId: selected, name: u.name }); }}>
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
    </div>
  );
}
