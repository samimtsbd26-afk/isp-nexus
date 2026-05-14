import { useState, useEffect, useMemo, useRef } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { cn } from "../lib/utils";
import {
  Search, Filter, Wifi, Edit3, Ban, Unlock, LogOut, Trash2,
  ChevronLeft, ChevronRight, RotateCcw, Eye, EyeOff, Package, Clock,
  Router as RouterIcon, ChevronDown, ChevronUp, Users, Activity,
  XCircle, Timer, MoreHorizontal,
} from "lucide-react";
import {
  Card, CardContent, Button, Input, Modal, Badge, Table, TableHeader,
  TableBody, TableRow, TableHead, TableCell, Empty, Dropdown,
  Tabs, TabsList, TabsTrigger, Spinner, ConfirmModal,
} from "../components/ui/index";
import { formatBytes, timeAgo } from "../lib/utils";

const PAGE_SIZE = 50;

const STATUS_BADGE: Record<string, BadgeVariant> = {
  active: "success",
  suspended: "warning",
  expired: "destructive",
  cancelled: "outline",
  pending: "info",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  suspended: "Blocked",
  expired: "Expired",
  cancelled: "Cancelled",
  pending: "Pending",
};

type BadgeVariant = "default" | "success" | "warning" | "destructive" | "info" | "outline";
type QuickFilter = "all" | "active" | "expired" | "blocked" | "online" | "expiring";

interface Filters {
  search: string;
  userType: "all" | "hotspot" | "pppoe";
  status: "all" | "active" | "expired" | "blocked" | "pending";
  packageId: string;
  routerId: string;
  dateFrom: string;
  dateTo: string;
  expiringSoon: boolean;
  onlineOnly: boolean;
}

const EMPTY_FILTERS: Filters = {
  search: "", userType: "all", status: "all", packageId: "",
  routerId: "", dateFrom: "", dateTo: "", expiringSoon: false, onlineOnly: false,
};

export default function Customers() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [page, setPage] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [editRow, setEditRow] = useState<UserRow | null>(null);
  const [extendRow, setExtendRow] = useState<UserRow | null>(null);
  const [changePkgRow, setChangePkgRow] = useState<UserRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<UserRow | null>(null);
  const [blockRow, setBlockRow] = useState<UserRow | null>(null);
  const [blockType, setBlockType] = useState<"temporary" | "permanent">("temporary");
  const [forceLogoutRow, setForceLogoutRow] = useState<UserRow | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [cancelRow, setCancelRow] = useState<UserRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkSuspendConfirm, setBulkSuspendConfirm] = useState(false);

  const [liveStats, setLiveStats] = useState<Record<string, {
    isOnline?: boolean; uptime?: string; bytesIn?: number; bytesOut?: number;
    ipAddress?: string; macAddress?: string;
  }>>({});

  // Map quick filter → API filter values
  const effectiveFilters = useMemo<Filters>(() => {
    const base = { ...filters };
    if (quickFilter === "active") { base.status = "active"; base.expiringSoon = false; base.onlineOnly = false; }
    else if (quickFilter === "expired") { base.status = "expired"; base.onlineOnly = false; }
    else if (quickFilter === "blocked") { base.status = "blocked"; base.onlineOnly = false; }
    else if (quickFilter === "online") { base.onlineOnly = true; }
    else if (quickFilter === "expiring") { base.expiringSoon = true; base.status = "all"; base.onlineOnly = false; }
    return base;
  }, [filters, quickFilter]);

  const { data: listData, isLoading, refetch } = trpc.customer.userList.useQuery({
    search: effectiveFilters.search || undefined,
    userType: effectiveFilters.userType,
    status: effectiveFilters.status,
    packageId: effectiveFilters.packageId || undefined,
    routerId: effectiveFilters.routerId || undefined,
    dateFrom: effectiveFilters.dateFrom || undefined,
    dateTo: effectiveFilters.dateTo || undefined,
    expiringSoon: effectiveFilters.expiringSoon,
    onlineOnly: effectiveFilters.onlineOnly,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const { data: statsData } = trpc.customer.userStats.useQuery(undefined, { refetchInterval: 30000 });
  const { data: liveData, refetch: refetchLive } = trpc.customer.userLiveStats.useQuery(undefined, { refetchInterval: 15000 });
  const { data: routers } = trpc.routerMgmt.list.useQuery();
  const { data: packages } = trpc.package.listAll.useQuery();

  useEffect(() => {
    if (!liveData) return;
    const map: Record<string, { isOnline?: boolean; uptime?: string; bytesIn?: number; bytesOut?: number; ipAddress?: string; macAddress?: string }> = {};
    for (const s of liveData) map[`${s.routerId}:${s.username}`] = s;
    setLiveStats(map);
  }, [liveData]);

  const onlineCount = liveData?.length ?? 0;

  const rows = useMemo(() => {
    if (!listData?.rows) return [];
    return listData.rows.map((r) => {
      const live = liveStats[`${r.routerId ?? "no-router"}:${r.username}`];
      if (!live) return r;
      return { ...r, isOnline: live.isOnline ?? r.isOnline, uptime: live.uptime || r.uptime, bytesIn: live.bytesIn ?? r.bytesIn, bytesOut: live.bytesOut ?? r.bytesOut, ipAddress: live.ipAddress || r.ipAddress, macAddress: live.macAddress || r.macAddress };
    });
  }, [listData, liveStats]);

  const total = listData?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const updateMut = trpc.customer.userUpdate.useMutation({ onSuccess: () => { toast.success("আপডেট হয়েছে"); refetch(); setEditRow(null); }, onError: (e) => toast.error(e.message) });
  const blockMut = trpc.customer.userBlock.useMutation({ onSuccess: () => { toast.success("Block করা হয়েছে"); refetch(); setBlockRow(null); }, onError: (e) => toast.error(e.message) });
  const unblockMut = trpc.customer.userUnblock.useMutation({ onSuccess: () => { toast.success("Unblock হয়েছে"); refetch(); }, onError: (e) => toast.error(e.message) });
  const extendMut = trpc.customer.userExtend.useMutation({ onSuccess: () => { toast.success("মেয়াদ বাড়ানো হয়েছে"); refetch(); setExtendRow(null); }, onError: (e) => toast.error(e.message) });
  const changePkgMut = trpc.customer.userChangePackage.useMutation({ onSuccess: () => { toast.success("প্যাকেজ পরিবর্তন হয়েছে"); refetch(); setChangePkgRow(null); }, onError: (e) => toast.error(e.message) });
  const forceLogoutMut = trpc.customer.userForceLogout.useMutation({ onSuccess: () => { toast.success("Force logout হয়েছে"); refetch(); setForceLogoutRow(null); }, onError: (e) => toast.error(e.message) });
  const deleteMut = trpc.customer.userDelete.useMutation({ onSuccess: () => { toast.success("ডিলিট হয়েছে"); refetch(); setDeleteRow(null); }, onError: (e) => toast.error(e.message) });
  const cancelMut = trpc.subscription.cancel.useMutation({ onSuccess: () => { toast.success("Subscription cancel হয়েছে"); refetch(); setCancelRow(null); }, onError: (e) => toast.error(e.message) });
  const resetDeviceMut = trpc.customer.resetDevice.useMutation({ onSuccess: () => { toast.success("Device reset হয়েছে"); refetch(); }, onError: (e) => toast.error(e.message) });
  const bulkResetMut = trpc.customer.userBulkResetDevice.useMutation({ onSuccess: (d) => { toast.success(`${d.count} টি device reset হয়েছে`); setSelectedIds(new Set()); refetch(); }, onError: (e) => toast.error(e.message) });
  const bulkBlockMut = trpc.customer.userBulkBlock.useMutation({ onSuccess: (d) => { toast.success(`${d.count} টি user block হয়েছে`); setSelectedIds(new Set()); refetch(); setBulkSuspendConfirm(false); }, onError: (e) => toast.error(e.message) });
  const bulkDeleteMut = trpc.customer.userBulkDelete.useMutation({ onSuccess: (d) => { toast.success(`${d.count} টি user delete হয়েছে`); setSelectedIds(new Set()); refetch(); setBulkDeleteConfirm(false); }, onError: (e) => toast.error(e.message) });

  function applyQuickFilter(qf: QuickFilter) {
    setQuickFilter(qf);
    setPage(0);
  }

  const statusOptions = [
    { value: "all", label: "All statuses" },
    { value: "active", label: "Active" },
    { value: "pending", label: "Pending" },
    { value: "blocked", label: "Blocked" },
    { value: "expired", label: "Expired" },
  ] as const;
  const typeOptions = [
    { value: "all", label: "All types" },
    { value: "hotspot", label: "Hotspot" },
    { value: "pppoe", label: "PPPoE" },
  ] as const;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Customers</h1>
          <p className="text-xs text-muted-foreground mt-0.5">ISP user management — hotspot &amp; PPPoE</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { refetch(); refetchLive(); }}>
          <RotateCcw size={13} className="mr-1.5" /> Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatsCard icon={<Users size={16} className="text-primary" />} label="Total" value={statsData?.total ?? 0} color="blue" onClick={() => applyQuickFilter("all")} active={quickFilter === "all"} />
        <StatsCard icon={<Activity size={16} className="text-emerald-400" />} label="Online Now" value={onlineCount} color="emerald" onClick={() => applyQuickFilter("online")} active={quickFilter === "online"} />
        <StatsCard icon={<Wifi size={16} className="text-sky-400" />} label="Active" value={statsData?.active ?? 0} color="sky" onClick={() => applyQuickFilter("active")} active={quickFilter === "active"} />
        <StatsCard icon={<XCircle size={16} className="text-red-400" />} label="Expired" value={statsData?.expired ?? 0} color="red" onClick={() => applyQuickFilter("expired")} active={quickFilter === "expired"} />
        <StatsCard icon={<Timer size={16} className="text-amber-400" />} label="Expiring Soon" value={statsData?.expiringSoon ?? 0} color="amber" onClick={() => applyQuickFilter("expiring")} active={quickFilter === "expiring"} />
      </div>

      {/* Search + Quick Filters + Advanced */}
      <Card>
        <CardContent className="py-3 space-y-3">
          {/* Search row */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Username, phone, MAC, email…"
                value={filters.search}
                onChange={(e) => { setFilters((f) => ({ ...f, search: e.target.value })); setPage(0); }}
                className="pl-8 h-9"
              />
            </div>
            <Button variant="outline" size="sm" className="h-9" onClick={() => setShowAdvanced((s) => !s)}>
              <Filter size={13} className="mr-1.5" />
              {showAdvanced ? "Hide" : "Filter"}
              {showAdvanced ? <ChevronUp size={12} className="ml-1" /> : <ChevronDown size={12} className="ml-1" />}
            </Button>
          </div>

          {/* Quick filter chips */}
          <div className="flex flex-wrap gap-2">
            {([
              { key: "all", label: "All" },
              { key: "active", label: "Active" },
              { key: "expired", label: "Expired" },
              { key: "blocked", label: "Blocked" },
              { key: "online", label: "🟢 Online" },
              { key: "expiring", label: "⚠️ Expiring" },
            ] as { key: QuickFilter; label: string }[]).map((c) => (
              <button
                key={c.key}
                onClick={() => applyQuickFilter(c.key)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  quickFilter === c.key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/40 text-muted-foreground border-border hover:bg-muted"
                }`}
              >
                {c.label}
              </button>
            ))}
            <div className="w-px bg-border mx-1" />
            <div className="w-44">
              <Dropdown
                title="Type"
                value={filters.userType}
                onChange={(value) => { setFilters((f) => ({ ...f, userType: value as Filters["userType"] })); setPage(0); }}
                options={typeOptions as any}
              />
            </div>
            <div className="w-44">
              <Dropdown
                title="Status"
                value={filters.status}
                onChange={(value) => { setFilters((f) => ({ ...f, status: value as Filters["status"] })); setPage(0); }}
                options={statusOptions as any}
              />
            </div>
          </div>

          {/* Advanced filters (collapsible) */}
          {showAdvanced && (
            <div className="pt-1 border-t border-border space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-medium text-label mb-1 block">Package</label>
                  <Dropdown
                    title="Package"
                    value={filters.packageId}
                    onChange={(value) => { setFilters((f) => ({ ...f, packageId: value })); setPage(0); }}
                    className="w-full"
                    options={[
                      { value: "", label: "All Packages" },
                      ...((packages ?? []).map((p) => ({ value: p.id, label: p.name }))),
                    ]}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-label mb-1 block">Router</label>
                  <Dropdown
                    title="Router"
                    value={filters.routerId}
                    onChange={(value) => { setFilters((f) => ({ ...f, routerId: value })); setPage(0); }}
                    className="w-full"
                    options={[
                      { value: "", label: "All Routers" },
                      ...((routers ?? []).map((r) => ({ value: r.id, label: r.name }))),
                    ]}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-label mb-1 block">From Date</label>
                  <Input type="date" value={filters.dateFrom} className="h-9" onChange={(e) => { setFilters((f) => ({ ...f, dateFrom: e.target.value })); setPage(0); }} />
                </div>
                <div>
                  <label className="text-xs font-medium text-label mb-1 block">To Date</label>
                  <Input type="date" value={filters.dateTo} className="h-9" onChange={(e) => { setFilters((f) => ({ ...f, dateTo: e.target.value })); setPage(0); }} />
                </div>
              </div>
              <div className="flex items-center justify-end">
                <Button variant="ghost" size="sm" onClick={() => { setFilters(EMPTY_FILTERS); setQuickFilter("all"); setPage(0); }}>
                  Reset All Filters
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results count */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>{total} user{total !== 1 ? "s" : ""} found{selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ""}</span>
        {total > 0 && <span>Page {page + 1} of {Math.max(1, totalPages)}</span>}
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-primary/30 bg-primary/5">
          <span className="text-xs text-muted-foreground flex-1"><strong>{selectedIds.size}</strong> selected</span>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
            disabled={bulkResetMut.isPending}
            onClick={() => bulkResetMut.mutate({ customerIds: rows.filter((r) => selectedIds.has(r.subscriptionId)).map((r) => r.customerId) })}>
            <RotateCcw size={12} /> Reset Device
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-amber-400 border-amber-500/30"
            onClick={() => setBulkSuspendConfirm(true)}>
            <Ban size={12} /> Suspend
          </Button>
          <Button size="sm" variant="destructive" className="h-7 text-xs gap-1"
            onClick={() => setBulkDeleteConfirm(true)}>
            <Trash2 size={12} /> Delete
          </Button>
          <button type="button" className="text-xs text-muted-foreground hover:text-foreground ml-1" onClick={() => setSelectedIds(new Set())}>✕</button>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading && (
            <div className="py-16 flex items-center justify-center gap-2 text-muted-foreground text-sm">
              <Spinner /> Loading…
            </div>
          )}
          {!isLoading && rows.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-[11px]">
                    <TableHead className="w-8 pl-2 pr-0">
                      <input type="checkbox" className="h-3.5 w-3.5 cursor-pointer accent-primary"
                        checked={rows.length > 0 && rows.every((r) => selectedIds.has(r.subscriptionId))}
                        onChange={(e) => setSelectedIds(e.target.checked ? new Set(rows.map((r) => r.subscriptionId)) : new Set())} />
                    </TableHead>
                    <TableHead className="w-6" />
                    <TableHead className="whitespace-nowrap">Status</TableHead>
                    <TableHead className="whitespace-nowrap">User</TableHead>
                    <TableHead className="whitespace-nowrap">Package</TableHead>
                    <TableHead className="whitespace-nowrap">Expiry</TableHead>
                    <TableHead className="whitespace-nowrap">IP / MAC</TableHead>
                    <TableHead className="whitespace-nowrap">RX / TX</TableHead>
                    <TableHead className="w-36 whitespace-nowrap">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <CompactRow
                      key={r.subscriptionId}
                      row={r}
                      expanded={expandedRow === r.subscriptionId}
                      checked={selectedIds.has(r.subscriptionId)}
                      onCheck={(c) => setSelectedIds((prev) => { const next = new Set(prev); if (c) next.add(r.subscriptionId); else next.delete(r.subscriptionId); return next; })}
                      onToggle={() => setExpandedRow((prev) => prev === r.subscriptionId ? null : r.subscriptionId)}
                      onEdit={() => setEditRow(r)}
                      onResetDevice={() => resetDeviceMut.mutate({ customerId: r.customerId })}
                      onBlock={() => { setBlockRow(r); setBlockType("temporary"); }}
                      onUnblock={() => unblockMut.mutate({ subscriptionId: r.subscriptionId })}
                      onExtend={() => setExtendRow(r)}
                      onChangePackage={() => setChangePkgRow(r)}
                      onForceLogout={() => setForceLogoutRow(r)}
                      onDelete={() => setDeleteRow(r)}
                      onCancel={() => setCancelRow(r)}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {!isLoading && rows.length === 0 && <Empty message="কোনো user পাওয়া যায়নি" />}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{total} total</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              <ChevronLeft size={14} /> Prev
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>
              Next <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* Modals */}
      {editRow && <EditModal row={editRow} onClose={() => setEditRow(null)} onSave={(data) => updateMut.mutate({ subscriptionId: editRow.subscriptionId, ...data })} isPending={updateMut.isPending} />}
      {extendRow && <ExtendModal row={extendRow} onClose={() => setExtendRow(null)} onExtend={(days) => extendMut.mutate({ subscriptionId: extendRow.subscriptionId, days })} isPending={extendMut.isPending} />}
      {changePkgRow && packages && <ChangePackageModal row={changePkgRow} packages={packages} onClose={() => setChangePkgRow(null)} onChange={(packageId) => changePkgMut.mutate({ subscriptionId: changePkgRow.subscriptionId, packageId })} isPending={changePkgMut.isPending} />}
      {blockRow && <BlockModal row={blockRow} type={blockType} setType={setBlockType} onClose={() => setBlockRow(null)} onBlock={() => blockMut.mutate({ subscriptionId: blockRow.subscriptionId, type: blockType })} isPending={blockMut.isPending} />}
      {forceLogoutRow && (
        <ConfirmModal open title="Force Logout" message={`${forceLogoutRow.username} কে এখনই disconnect করবেন?`} confirmLabel="Force Logout"
          onConfirm={() => forceLogoutMut.mutate({ subscriptionId: forceLogoutRow.subscriptionId })} onClose={() => setForceLogoutRow(null)} isPending={forceLogoutMut.isPending} />
      )}
      {deleteRow && (
        <ConfirmModal open title="User Delete করুন" message={`${deleteRow.username} কে স্থায়ীভাবে delete করবেন? MikroTik, RADIUS এবং সব data মুছে যাবে।`}
          confirmLabel="Delete" confirmVariant="destructive" onConfirm={() => deleteMut.mutate({ subscriptionId: deleteRow.subscriptionId })} onClose={() => setDeleteRow(null)} isPending={deleteMut.isPending} />
      )}
      {cancelRow && (
        <ConfirmModal open title="Subscription Cancel করুন" message={`${cancelRow.username} এর subscription cancel করবেন? MikroTik-এ কোনো পরিবর্তন হবে না।`}
          confirmLabel="Cancel Subscription" confirmVariant="destructive" onConfirm={() => cancelMut.mutate({ id: cancelRow.subscriptionId })} onClose={() => setCancelRow(null)} isPending={cancelMut.isPending} />
      )}
      {bulkSuspendConfirm && (
        <ConfirmModal open title={`${selectedIds.size}টি User Block করুন`}
          message={`নির্বাচিত ${selectedIds.size}টি subscription suspend করবেন? MikroTik-এ disable এবং session disconnect হবে।`}
          confirmLabel="Block All" confirmVariant="destructive"
          onConfirm={() => bulkBlockMut.mutate({ subscriptionIds: [...selectedIds] })}
          onClose={() => setBulkSuspendConfirm(false)}
          isPending={bulkBlockMut.isPending} />
      )}
      {bulkDeleteConfirm && (
        <ConfirmModal open title={`${selectedIds.size}টি User Delete করুন`}
          message={`নির্বাচিত ${selectedIds.size}টি user স্থায়ীভাবে delete করবেন? MikroTik, RADIUS এবং সব data মুছে যাবে।`}
          confirmLabel="Delete All" confirmVariant="destructive"
          onConfirm={() => bulkDeleteMut.mutate({ subscriptionIds: [...selectedIds] })}
          onClose={() => setBulkDeleteConfirm(false)}
          isPending={bulkDeleteMut.isPending} />
      )}
    </div>
  );
}

// ─── Stats Card ───────────────────────────────────────────────────────────────

function StatsCard({ icon, label, value, color, onClick, active }: {
  icon: React.ReactNode; label: string; value: number;
  color: "blue" | "emerald" | "sky" | "red" | "amber";
  onClick: () => void; active: boolean;
}) {
  const accent = {
    blue: "border-cyan-500/40",
    emerald: "border-emerald-500/40",
    sky: "border-sky-500/40",
    red: "border-red-500/40",
    amber: "border-amber-500/40",
  }[color];
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-xl border p-3 text-left transition-all hover:border-primary/30",
        "bg-card border-border shadow-sm",
        active && accent
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="h-8 w-8 rounded-lg border border-border bg-muted grid place-items-center text-foreground">
          {icon}
        </div>
        {active && <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />}
      </div>
      <div className="text-2xl font-bold tabular-nums">{value.toLocaleString()}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </button>
  );
}

// ─── Compact Row (expandable) ─────────────────────────────────────────────────

interface UserRow {
  subscriptionId: string; username: string; password: string | null; status: string;
  expiresAt: Date | string | null; createdAt: Date | string | null; customerId: string;
  customerCode: string | null; fullName: string | null; phone: string | null;
  email: string | null; packageId: string | null; packageName: string | null;
  packageType: string | null; speed: string | null; routerId: string | null;
  routerName: string | null; createdByName: string | null; uptime: string | null;
  bytesIn: number | null; bytesOut: number | null; ipAddress: string | null;
  macAddress: string | null; isOnline: boolean; lastSeen: Date | string | null;
}

function CompactRow({ row, expanded, checked, onCheck, onToggle, onEdit, onResetDevice, onBlock, onUnblock, onExtend, onChangePackage, onForceLogout, onDelete, onCancel }: {
  row: UserRow; expanded: boolean;
  checked: boolean; onCheck: (c: boolean) => void;
  onToggle: () => void; onEdit: () => void; onResetDevice: () => void; onBlock: () => void; onUnblock: () => void;
  onExtend: () => void; onChangePackage: () => void; onForceLogout: () => void; onDelete: () => void; onCancel: () => void;
}) {
  const [showPw, setShowPw] = useState(false);
  const status = row.status === "suspended" ? "blocked" : row.status;
  const isExpired = row.expiresAt && new Date(row.expiresAt) < new Date();
  const daysLeft = row.expiresAt ? Math.ceil((new Date(row.expiresAt).getTime() - Date.now()) / 86400000) : null;

  return (
    <>
      <TableRow className={`cursor-pointer hover:bg-muted/30 ${expanded ? "bg-muted/20" : ""}`} onClick={onToggle}>
        {/* Checkbox */}
        <TableCell className="py-2 pl-2 pr-0" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" className="h-3.5 w-3.5 cursor-pointer accent-primary"
            checked={checked} onChange={(e) => onCheck(e.target.checked)} />
        </TableCell>
        {/* Expand toggle */}
        <TableCell className="py-2 pl-3 pr-0">
          {expanded ? <ChevronUp size={12} className="text-muted-foreground" /> : <ChevronDown size={12} className="text-muted-foreground" />}
        </TableCell>

        {/* Status */}
        <TableCell className="py-2">
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${row.isOnline ? "bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.8)]" : "bg-muted-foreground/30"}`} />
            <Badge variant={STATUS_BADGE[status] ?? "default"} className="text-[10px] py-0 px-1.5">
              {STATUS_LABEL[status] ?? status}
            </Badge>
          </div>
        </TableCell>

        {/* User info */}
        <TableCell className="py-2">
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${row.packageType === "pppoe" ? "bg-emerald-500/15 text-emerald-400" : "bg-blue-500/15 text-blue-400"}`}>
              {row.packageType === "pppoe" ? <RouterIcon size={13} /> : <Wifi size={13} />}
            </div>
            <div>
              <div className="font-mono text-xs font-semibold leading-tight">{row.username}</div>
              {row.fullName && <div className="text-[10px] text-muted-foreground leading-tight">{row.fullName}</div>}
              {row.phone && !row.fullName && <div className="text-[10px] text-muted-foreground leading-tight">{row.phone}</div>}
            </div>
          </div>
        </TableCell>

        {/* Package */}
        <TableCell className="py-2">
          <div className="text-xs font-medium">{row.packageName || "—"}</div>
          {row.speed && <div className="text-[10px] text-muted-foreground">{row.speed}</div>}
        </TableCell>

        {/* Expiry */}
        <TableCell className="py-2">
          {row.expiresAt ? (
            <div>
              <div className={`text-xs font-medium ${isExpired ? "text-red-400" : daysLeft !== null && daysLeft <= 3 ? "text-amber-400" : ""}`}>
                {new Date(row.expiresAt).toLocaleDateString("en-BD")}
              </div>
              {daysLeft !== null && !isExpired && (
                <div className={`text-[10px] ${daysLeft <= 3 ? "text-amber-400" : "text-muted-foreground"}`}>
                  {daysLeft}d left
                </div>
              )}
              {isExpired && <div className="text-[10px] text-red-400">Expired</div>}
            </div>
          ) : <span className="text-muted-foreground text-xs">—</span>}
        </TableCell>

        {/* IP / MAC */}
        <TableCell className="py-2">
          {row.ipAddress && <div className="font-mono text-[11px] text-sky-400">{row.ipAddress}</div>}
          {row.macAddress && <div className="font-mono text-[10px] text-muted-foreground">{row.macAddress}</div>}
          {!row.ipAddress && !row.macAddress && <span className="text-muted-foreground text-xs">—</span>}
        </TableCell>

        {/* RX / TX */}
        <TableCell className="py-2">
          {row.bytesIn != null || row.bytesOut != null ? (
            <div>
              <div className="text-[11px] text-emerald-400">↓ {row.bytesIn != null ? formatBytes(row.bytesIn) : "—"}</div>
              <div className="text-[11px] text-blue-400">↑ {row.bytesOut != null ? formatBytes(row.bytesOut) : "—"}</div>
            </div>
          ) : <span className="text-muted-foreground text-xs">—</span>}
        </TableCell>

        {/* Actions */}
        <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
          <div className="flex gap-0.5 items-center">
            <ActionBtn icon={<Edit3 size={11} />} label="Edit" onClick={onEdit} />
            <ActionBtn icon={<RotateCcw size={11} />} label="Reset Device" onClick={onResetDevice} />
            {row.status !== "suspended"
              ? <ActionBtn icon={<Ban size={11} />} label="Block" onClick={onBlock} />
              : <ActionBtn icon={<Unlock size={11} />} label="Unblock" onClick={onUnblock} />
            }
            <ActionBtn icon={<Trash2 size={11} />} label="Delete" variant="destructive" onClick={onDelete} />
            <MoreActionsMenu row={row} onExtend={onExtend} onChangePackage={onChangePackage} onForceLogout={onForceLogout} onCancel={onCancel} />
          </div>
        </TableCell>
      </TableRow>

      {/* Expanded detail row */}
      {expanded && (
        <TableRow className="bg-muted/10 hover:bg-muted/10">
          <TableCell colSpan={9} className="py-3 px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-2 text-xs">
              <DetailItem label="Password">
                {row.password ? (
                  <div className="flex items-center gap-1">
                    <span className="font-mono">{showPw ? row.password : "••••••"}</span>
                    <button onClick={() => setShowPw((s) => !s)} className="text-muted-foreground hover:text-foreground">
                      {showPw ? <EyeOff size={10} /> : <Eye size={10} />}
                    </button>
                  </div>
                ) : "—"}
              </DetailItem>
              <DetailItem label="Phone">{row.phone || "—"}</DetailItem>
              <DetailItem label="Email">{row.email || "—"}</DetailItem>
              <DetailItem label="Router">{row.routerName || "—"}</DetailItem>
              <DetailItem label="Uptime">{row.uptime || "—"}</DetailItem>
              <DetailItem label="Last Seen">{row.lastSeen ? timeAgo(row.lastSeen) : row.isOnline ? "Online now" : "—"}</DetailItem>
              <DetailItem label="Customer Code">{row.customerCode || "—"}</DetailItem>
              <DetailItem label="Created">{row.createdAt ? new Date(row.createdAt).toLocaleDateString("en-BD") : "—"}</DetailItem>
              <DetailItem label="Created By">{row.createdByName || "—"}</DetailItem>
              <DetailItem label="Type"><span className="uppercase">{row.packageType || "—"}</span></DetailItem>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function DetailItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground mb-0.5">{label}</div>
      <div className="font-medium text-foreground/90">{children}</div>
    </div>
  );
}

function ActionBtn({ icon, label, onClick, variant = "ghost" }: {
  icon: React.ReactNode; label: string; onClick: () => void;
  variant?: "ghost" | "destructive" | "outline" | "secondary" | "default";
}) {
  return (
    <Button variant={variant} size="icon" className="h-6 w-6" title={label} onClick={onClick}>
      {icon}
    </Button>
  );
}

function MoreActionsMenu({ row, onExtend, onChangePackage, onForceLogout, onCancel }: {
  row: UserRow; onExtend: () => void; onChangePackage: () => void; onForceLogout: () => void; onCancel: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="icon" className="h-6 w-6" title="More actions" onClick={() => setOpen((s) => !s)}>
        <MoreHorizontal size={11} />
      </Button>
      {open && (
        <div className="absolute right-0 top-7 z-50 w-44 rounded-md border border-border bg-popover shadow-md py-1">
          <DropdownItem icon={<Clock size={12} />} label="Extend" onClick={() => { setOpen(false); onExtend(); }} />
          <DropdownItem icon={<Package size={12} />} label="Change Package" onClick={() => { setOpen(false); onChangePackage(); }} />
          {row.isOnline && <DropdownItem icon={<LogOut size={12} />} label="Force Logout" onClick={() => { setOpen(false); onForceLogout(); }} />}
          {row.status !== "cancelled" && (
            <DropdownItem icon={<XCircle size={12} />} label="Cancel Subscription" className="text-destructive" onClick={() => { setOpen(false); onCancel(); }} />
          )}
        </div>
      )}
    </div>
  );
}

function DropdownItem({ icon, label, onClick, className }: { icon: React.ReactNode; label: string; onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cn("flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors", className)}>
      {icon} {label}
    </button>
  );
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function EditModal({ row, onClose, onSave, isPending }: { row: UserRow; onClose: () => void; onSave: (d: Record<string, unknown>) => void; isPending: boolean }) {
  const [fullName, setFullName] = useState(row.fullName || "");
  const [phone, setPhone] = useState(row.phone || "");
  const [password, setPassword] = useState("");
  const [macAddress, setMacAddress] = useState(row.macAddress || "");
  const [sharedUsers, setSharedUsers] = useState<number | undefined>(undefined);
  const [expiresAt, setExpiresAt] = useState(row.expiresAt ? new Date(row.expiresAt).toISOString().slice(0, 16) : "");

  return (
    <Modal open title={`Edit — ${row.username}`} onClose={onClose} className="max-w-md">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Full Name</label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Phone</label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">New Password</label>
            <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="blank = no change" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">MAC Address</label>
            <Input value={macAddress} onChange={(e) => setMacAddress(e.target.value)} placeholder="00:00:00:00:00:00" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Shared Users</label>
            <Input type="number" value={sharedUsers ?? ""} onChange={(e) => setSharedUsers(e.target.value ? Number(e.target.value) : undefined)} placeholder="1" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Expiry Date</label>
            <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <Button className="flex-1" disabled={isPending} onClick={() => onSave({ fullName, phone, password: password || undefined, macAddress, sharedUsers, expiresAt: expiresAt || undefined })}>
            {isPending ? "Saving…" : "Save Changes"}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

function ExtendModal({ row, onClose, onExtend, isPending }: { row: UserRow; onClose: () => void; onExtend: (days: number) => void; isPending: boolean }) {
  const [days, setDays] = useState(7);
  return (
    <Modal open title="Extend Package" onClose={onClose} className="max-w-sm">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground"><strong>{row.username}</strong> এর মেয়াদ কত দিন বাড়াবেন?</p>
        <div className="flex gap-2">
          {[3, 7, 15, 30].map((d) => (
            <button key={d} onClick={() => setDays(d)} className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${days === d ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>{d}d</button>
          ))}
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Custom Days</label>
          <Input type="number" min={1} value={days} onChange={(e) => setDays(Number(e.target.value))} />
        </div>
        <div className="flex gap-2 pt-1">
          <Button className="flex-1" disabled={isPending || days < 1} onClick={() => onExtend(days)}>{isPending ? "Extending…" : `Extend ${days} Days`}</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

function ChangePackageModal({ row, packages, onClose, onChange, isPending }: {
  row: UserRow; packages: Array<{ id: string; name: string; type: string }>;
  onClose: () => void; onChange: (id: string) => void; isPending: boolean;
}) {
  const [pkgId, setPkgId] = useState(row.packageId || "");
  return (
    <Modal open title="Change Package" onClose={onClose} className="max-w-sm">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground"><strong>{row.username}</strong> এর প্যাকেজ পরিবর্তন:</p>
        <Dropdown
          title="Package"
          value={pkgId}
          onChange={setPkgId}
          className="w-full"
          options={[
            { value: "", label: "Select package…" },
            ...packages.map((p) => ({ value: p.id, label: `${p.name} (${p.type})` })),
          ]}
        />
        <div className="flex gap-2 pt-1">
          <Button className="flex-1" disabled={isPending || !pkgId} onClick={() => onChange(pkgId)}>{isPending ? "Changing…" : "Change Package"}</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

function BlockModal({ row, type, setType, onClose, onBlock, isPending }: {
  row: UserRow; type: "temporary" | "permanent"; setType: (t: "temporary" | "permanent") => void;
  onClose: () => void; onBlock: () => void; isPending: boolean;
}) {
  return (
    <Modal open title="Block User" onClose={onClose} className="max-w-sm">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground"><strong>{row.username}</strong> কে block করবেন?</p>
        <Tabs value={type} onValueChange={(v) => setType(v as "temporary" | "permanent")}>
          <TabsList>
            <TabsTrigger value="temporary" className={type === "temporary" ? "bg-primary text-primary-foreground" : ""}>Temporary</TabsTrigger>
            <TabsTrigger value="permanent" className={type === "permanent" ? "bg-primary text-primary-foreground" : ""}>Permanent</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-xs">
          {type === "temporary" ? "MikroTik-এ disable করবে, subscription data রাখবে।" : "MikroTik disable + active session disconnect + subscription suspend করবে।"}
        </div>
        <div className="flex gap-2 pt-1">
          <Button variant="destructive" className="flex-1" disabled={isPending} onClick={onBlock}>{isPending ? "Blocking…" : "Block"}</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

// satisfy React namespace import for JSX
import React from "react";
void React;
