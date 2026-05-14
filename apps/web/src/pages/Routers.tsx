import { useState } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import {
  Plus, Wifi, WifiOff, TestTube2, Trash2, Cpu, MemoryStick,
  Thermometer, RefreshCw, Network,
} from "lucide-react";
import {
  Card, CardContent, CardHeader, Button, Input, Modal, Badge,
  RouterSelect, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Empty,
} from "../components/ui/index";
import { formatBytes } from "../lib/utils";

type RouterTab = "manage" | "routes" | "interfaces" | "neighbors" | "ip";

const TABS: { key: RouterTab; label: string }[] = [
  { key: "manage", label: "Routers" },
  { key: "routes", label: "Routes" },
  { key: "interfaces", label: "Interfaces" },
  { key: "neighbors", label: "Neighbors" },
  { key: "ip", label: "IP Addresses" },
];

const EMPTY_FORM = {
  name: "", host: "", port: 8728, sslPort: 8729,
  username: "admin", password: "", useSsl: false, isDefault: false,
};

function isTruthy(val: unknown) { return val === true || val === "true"; }

export default function Routers() {
  const [tab, setTab] = useState<RouterTab>("manage");
  const [routerId, setRouterId] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [testingId, setTestingId] = useState<string | null>(null);

  const { data: routers, refetch: refetchRouters, isLoading: routersLoading } =
    trpc.routerMgmt.list.useQuery();
  const selected = routerId || routers?.[0]?.id || "";

  const create = trpc.routerMgmt.create.useMutation({
    onSuccess: () => { refetchRouters(); setShowAdd(false); setForm(EMPTY_FORM); toast.success("Router added successfully"); },
    onError: (e) => toast.error(e.message),
  });
  const test = trpc.routerMgmt.testConnection.useMutation({
    onMutate: (v) => setTestingId(v.id),
    onSettled: () => setTestingId(null),
    onSuccess: (d) => d.ok ? toast.success(`Connected! Identity: ${d.identity}`) : toast.error(`Connection failed: ${d.error}`),
  });
  const del = trpc.routerMgmt.delete.useMutation({
    onSuccess: () => { refetchRouters(); toast.success("Router removed"); },
    onError: (e) => toast.error(e.message),
  });

  const { data: routes, refetch: refetchRoutes, isLoading: routesLoading } =
    trpc.mikrotik.getRoutes.useQuery(
      { routerId: selected },
      { enabled: tab === "routes" && !!selected },
    );
  const { data: ifaces, refetch: refetchIfaces, isLoading: ifacesLoading } =
    trpc.mikrotik.getInterfaces.useQuery(
      { routerId: selected },
      { enabled: tab === "interfaces" && !!selected, refetchInterval: tab === "interfaces" ? 10_000 : false },
    );
  const { data: neighbors, refetch: refetchNeighbors, isLoading: neighborsLoading } =
    trpc.mikrotik.getNeighbors.useQuery(
      { routerId: selected },
      { enabled: tab === "neighbors" && !!selected, refetchInterval: tab === "neighbors" ? 30_000 : false },
    );
  const { data: addresses, refetch: refetchAddresses, isLoading: addressesLoading } =
    trpc.mikrotik.getIpAddresses.useQuery(
      { routerId: selected },
      { enabled: tab === "ip" && !!selected },
    );

  function refetchCurrent() {
    if (tab === "manage") refetchRouters();
    else if (tab === "routes") refetchRoutes();
    else if (tab === "interfaces") refetchIfaces();
    else if (tab === "neighbors") refetchNeighbors();
    else refetchAddresses();
  }

  const subtitles: Record<RouterTab, string> = {
    manage: `${routers?.length ?? 0} router${(routers?.length ?? 0) !== 1 ? "s" : ""} configured`,
    routes: `${routes?.length ?? 0} routes`,
    interfaces: `${ifaces?.length ?? 0} interfaces`,
    neighbors: `${neighbors?.length ?? 0} neighbors discovered`,
    ip: `${addresses?.length ?? 0} addresses`,
  };

  const isDataLoading =
    tab === "manage" ? routersLoading :
    tab === "routes" ? routesLoading :
    tab === "interfaces" ? ifacesLoading :
    tab === "neighbors" ? neighborsLoading :
    addressesLoading;

  function field(key: keyof typeof form, label: string, type = "text") {
    return (
      <div key={key}>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
        <Input
          type={type}
          value={(form as Record<string, unknown>)[key] as string}
          onChange={(e) => setForm({ ...form, [key]: type === "number" ? +e.target.value : e.target.value })}
          placeholder={key === "host" ? "192.168.88.1" : undefined}
          required
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Routers</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{subtitles[tab]}</p>
        </div>
        <div className="flex gap-2">
          {tab !== "manage" && (
            <RouterSelect routers={routers} value={selected} onChange={setRouterId} />
          )}
          <Button variant="outline" size="sm" onClick={refetchCurrent} disabled={isDataLoading}>
            <RefreshCw size={14} className={isDataLoading ? "animate-spin" : ""} />
          </Button>
          {tab === "manage" && (
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus size={14} /> Add Router
            </Button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 flex-wrap border-b border-border pb-0.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 text-sm font-medium rounded-t-md transition-colors ${
              tab === t.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Manage Routers ─────────────────────────────────────────────── */}
      {tab === "manage" && (
        routersLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2].map((i) => <div key={i} className="h-36 rounded-xl bg-card border border-border animate-pulse" />)}
          </div>
        ) : routers?.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {routers.map((r) => (
              <Card key={r.id} className="relative overflow-hidden">
                <div className={`absolute top-0 left-0 right-0 h-0.5 ${r.isActive ? "bg-emerald-500" : "bg-red-500"}`} />
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`p-2 rounded-lg shrink-0 ${r.isActive ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
                        {r.isActive
                          ? <Wifi size={16} className="text-emerald-400" />
                          : <WifiOff size={16} className="text-red-400" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{r.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{r.host}:{r.port}</p>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {r.isDefault ? <Badge variant="info">Default</Badge> : null}
                      <Badge variant={r.isActive ? "success" : "destructive"}>
                        {r.isActive ? "Online" : "Offline"}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { icon: Cpu, label: "CPU", value: r.cpuLoad !== null ? `${r.cpuLoad}%` : "—", color: (r.cpuLoad ?? 0) > 80 ? "text-red-400" as const : "text-emerald-400" as const },
                      { icon: MemoryStick, label: "RAM", value: r.freeMemoryMb ? `${r.freeMemoryMb}M` : "—", color: "text-blue-400" as const },
                      { icon: Thermometer, label: "Temp", value: r.temperatureCelsius ? `${r.temperatureCelsius}°` : "—", color: (r.temperatureCelsius ?? 0) > 70 ? "text-red-400" as const : "text-amber-400" as const },
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
              <Button size="sm" className="mt-4" onClick={() => setShowAdd(true)}>
                <Plus size={14} /> Add Your First Router
              </Button>
            </CardContent>
          </Card>
        )
      )}

      {/* ── Tab: Routes ─────────────────────────────────────────────────────── */}
      {tab === "routes" && (
        <Card>
          <CardContent className="p-0">
            {routesLoading && <div className="py-16 text-center text-muted-foreground text-sm">Loading routes…</div>}
            {!routesLoading && routes && routes.length > 0 && (
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Destination</TableHead>
                    <TableHead>Gateway</TableHead>
                    <TableHead>Interface</TableHead>
                    <TableHead>Distance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Comment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(routes as any[]).map((r, i) => (
                    <TableRow key={r[".id"] ?? i}>
                      <TableCell className="font-mono text-sm font-medium">{r["dst-address"] ?? "—"}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">{r.gateway ?? "—"}</TableCell>
                      <TableCell><Badge variant="outline">{r.interface ?? "—"}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.distance ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {isTruthy(r.active) && <Badge variant="success">Active</Badge>}
                          {isTruthy(r.dynamic) && <Badge variant="warning">Dynamic</Badge>}
                          {isTruthy(r.disabled) && <Badge variant="destructive">Disabled</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[140px] truncate">{r.comment ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            )}
            {!routesLoading && (!routes || routes.length === 0) && (
              <Empty message={selected ? "No routes found" : "Select a router first"} />
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Tab: Interfaces ──────────────────────────────────────────────────── */}
      {tab === "interfaces" && (
        <Card>
          <CardContent className="p-0">
            {ifacesLoading && <div className="py-16 text-center text-muted-foreground text-sm">Loading interfaces…</div>}
            {!ifacesLoading && ifaces && ifaces.length > 0 && (
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>MAC Address</TableHead>
                    <TableHead>MTU</TableHead>
                    <TableHead>RX Bytes</TableHead>
                    <TableHead>TX Bytes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(ifaces as any[]).map((i) => (
                    <TableRow key={i[".id"] ?? i.name}>
                      <TableCell>
                        <div className={`w-2 h-2 rounded-full ${isTruthy(i.running) ? "bg-emerald-400" : "bg-red-400"}`} />
                      </TableCell>
                      <TableCell className="font-mono text-sm font-medium">{i.name}</TableCell>
                      <TableCell><Badge variant="outline">{i.type ?? "ether"}</Badge></TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{i["mac-address"] ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{i.mtu ?? "1500"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{i["rx-byte"] ? formatBytes(Number(i["rx-byte"])) : "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{i["tx-byte"] ? formatBytes(Number(i["tx-byte"])) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            )}
            {!ifacesLoading && (!ifaces || ifaces.length === 0) && (
              <Empty message={selected ? "No interfaces found" : "Select a router first"} />
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Tab: Neighbors ───────────────────────────────────────────────────── */}
      {tab === "neighbors" && (
        <Card>
          <CardContent className="p-0">
            {neighborsLoading && <div className="py-16 text-center text-muted-foreground text-sm">Loading neighbors…</div>}
            {!neighborsLoading && neighbors && neighbors.length > 0 && (
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Identity</TableHead>
                    <TableHead>Platform</TableHead>
                    <TableHead>Interface</TableHead>
                    <TableHead>IP Address</TableHead>
                    <TableHead>MAC Address</TableHead>
                    <TableHead>Uptime</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(neighbors as any[]).map((n, i) => (
                    <TableRow key={n[".id"] ?? i}>
                      <TableCell className="font-medium">{n.identity ?? "—"}</TableCell>
                      <TableCell><Badge variant="outline">{n.platform ?? "Unknown"}</Badge></TableCell>
                      <TableCell className="font-mono text-sm">{n.interface ?? "—"}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">{n.address ?? n["ip-address"] ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{n["mac-address"] ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{n.uptime ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            )}
            {!neighborsLoading && (!neighbors || neighbors.length === 0) && (
              <div className="py-16 text-center space-y-2">
                <Network size={40} className="mx-auto text-muted-foreground opacity-40" />
                <p className="text-muted-foreground text-sm">
                  {selected ? "No neighbors discovered" : "Select a router first"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Tab: IP Addresses ────────────────────────────────────────────────── */}
      {tab === "ip" && (
        <Card>
          <CardContent className="p-0">
            {addressesLoading && <div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>}
            {!addressesLoading && addresses && addresses.length > 0 && (
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Address</TableHead>
                    <TableHead>Network</TableHead>
                    <TableHead>Interface</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Comment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(addresses as any[]).map((a, i) => (
                    <TableRow key={a[".id"] ?? i}>
                      <TableCell className="font-mono text-sm font-medium">{a.address}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{a.network ?? "—"}</TableCell>
                      <TableCell><Badge variant="outline">{a.interface ?? "—"}</Badge></TableCell>
                      <TableCell>
                        <Badge variant={isTruthy(a.disabled) ? "destructive" : isTruthy(a.dynamic) ? "warning" : "success"}>
                          {isTruthy(a.disabled) ? "Disabled" : isTruthy(a.dynamic) ? "Dynamic" : "Static"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.comment ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            )}
            {!addressesLoading && (!addresses || addresses.length === 0) && (
              <Empty message={selected ? "No IP addresses found" : "Select a router first"} />
            )}
          </CardContent>
        </Card>
      )}

      {/* Add Router Modal */}
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
