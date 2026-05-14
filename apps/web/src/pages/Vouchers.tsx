import { useState, useRef } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { Plus, RefreshCw, Ban, Printer, QrCode, Search, Trash2, BarChart3 } from "lucide-react";
import { Card, CardContent, Button, Badge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Empty, Modal, Input, Select, Dropdown } from "../components/ui/index";
import QRCode from "qrcode";

const EMPTY = { routerId: "", packageId: "", batchName: "", count: 10, profile: "default", sharedUsers: 1, price: 0, timeLimit: "", dataLimit: "" };

type VoucherRow = {
  id: string;
  code: string;
  batchName: string | null;
  status: string;
  profile: string | null;
  price: number | null;
  createdAt: Date;
  timeLimit: string | null;
  dataLimit: string | null;
};

function voucherVariant(s: string): "success" | "default" | "destructive" | "warning" {
  if (s === "unused") return "success";
  if (s === "used") return "default";
  if (s === "revoked") return "destructive";
  return "warning";
}

async function generateQRDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { margin: 1, width: 140, errorCorrectionLevel: "M" });
}

/** Prevent HTML/script injection when inserting DB-backed fields into a print document. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function printBatch(vouchers: VoucherRow[], batchName: string, orgName = "SKYNITY") {
  const safeOrg = escapeHtml(orgName);
  const safeBatch = escapeHtml(batchName);
  const qrs = await Promise.all(vouchers.map((v) => generateQRDataUrl(v.code)));
  const cards = vouchers.map((v, i) => `
    <div class="card">
      <div class="brand">${safeOrg}</div>
      <img src="${qrs[i]}" width="110" height="110" alt="QR"/>
      <div class="code">${escapeHtml(v.code)}</div>
      ${v.profile ? `<div class="meta">Profile: ${escapeHtml(v.profile)}</div>` : ""}
      ${v.timeLimit ? `<div class="meta">Time: ${escapeHtml(v.timeLimit)}</div>` : ""}
      ${v.price != null ? `<div class="meta price">৳${escapeHtml(String(v.price))}</div>` : ""}
    </div>`).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Voucher Batch: ${safeBatch}</title>
<style>
  @page { margin: 12mm; }
  body { font-family: system-ui, sans-serif; margin: 0; }
  h2 { font-size: 13px; margin: 0 0 10px; color: #555; }
  .grid { display: flex; flex-wrap: wrap; gap: 8px; }
  .card { border: 1.5px solid #222; border-radius: 8px; padding: 10px 12px; width: 140px;
          text-align: center; break-inside: avoid; page-break-inside: avoid; }
  .brand { font-size: 9px; font-weight: 700; letter-spacing: 1px; color: #555; margin-bottom: 4px; text-transform: uppercase; }
  .code { font-family: monospace; font-size: 13px; font-weight: 800; letter-spacing: 1px; margin: 5px 0 3px; }
  .meta { font-size: 9px; color: #666; }
  .price { font-weight: 700; color: #111; font-size: 10px; }
  img { display: block; margin: 0 auto; }
</style>
</head>
<body>
<h2>Batch: ${safeBatch} — ${vouchers.length} vouchers</h2>
<div class="grid">${cards}</div>
<script>window.onload=()=>{window.print();}</script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) { toast.error("Pop-up blocked — allow pop-ups and try again"); return; }
  w.document.write(html);
  w.document.close();
}

export default function Vouchers() {
  const { data: routers } = trpc.routerMgmt.list.useQuery();
  const { data: packages } = trpc.package.list.useQuery({});
  const [filterBatch, setFilterBatch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPackage, setFilterPackage] = useState("");
  const [filterRouter, setFilterRouter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAnalytics, setShowAnalytics] = useState(false);

  const { data, refetch, isLoading } = trpc.voucher.list.useQuery({
    batchName: filterBatch || undefined,
    status: filterStatus || undefined,
    packageId: filterPackage || undefined,
    routerId: filterRouter || undefined,
    search: searchQuery || undefined,
  });

  const { data: analytics } = trpc.voucher.analytics.useQuery(undefined, { enabled: showAnalytics });

  const [showCreate, setShowCreate] = useState(false);
  const [showQR, setShowQR] = useState<VoucherRow | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [form, setForm] = useState(EMPTY);

  const createBatch = trpc.voucher.createBatch.useMutation({
    onSuccess: (d) => { refetch(); setShowCreate(false); setForm(EMPTY); toast.success(`${d.count} vouchers created`); },
    onError: (e) => toast.error(e.message),
  });
  const revoke = trpc.voucher.revoke.useMutation({
    onSuccess: () => { refetch(); toast.success("Voucher revoked"); },
  });
  const bulkRevoke = trpc.voucher.bulkRevoke.useMutation({
    onSuccess: (d) => { refetch(); setSelectedIds(new Set()); toast.success(`${d.count} vouchers revoked`); },
    onError: (e) => toast.error(e.message),
  });
  const bulkDelete = trpc.voucher.bulkDelete.useMutation({
    onSuccess: (d) => { refetch(); setSelectedIds(new Set()); toast.success(`${d.count} vouchers deleted`); },
    onError: (e) => toast.error(e.message),
  });

  function openQR(v: VoucherRow) {
    setShowQR(v);
    generateQRDataUrl(v.code).then(setQrDataUrl);
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  function toggleSelectAll() {
    if (!data) return;
    if (selectedIds.size === data.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.map((v) => v.id)));
    }
  }

  const batches = Array.from(new Set((data ?? []).map((v) => v.batchName).filter(Boolean)));
  const printable = (data ?? []).filter((v) => !filterBatch || v.batchName === filterBatch);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Vouchers</h1>
          <p className="text-muted-foreground text-sm">{data?.length ?? 0} total</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowAnalytics(!showAnalytics)}>
            <BarChart3 size={14} className="mr-1" /> {showAnalytics ? "Hide" : "Analytics"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw size={14} /></Button>
          {printable.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => printBatch(printable as VoucherRow[], filterBatch || "All")}>
              <Printer size={14} className="mr-1" /> Print QR
            </Button>
          )}
          <Button size="sm" onClick={() => setShowCreate(true)}><Plus size={14} /> Create Batch</Button>
        </div>
      </div>

      {/* Analytics Cards */}
      {showAnalytics && analytics && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total</p><p className="text-2xl font-bold">{analytics.total}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Unused</p><p className="text-2xl font-bold text-emerald-600">{analytics.unused}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Used</p><p className="text-2xl font-bold text-blue-600">{analytics.used}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Revoked</p><p className="text-2xl font-bold text-red-600">{analytics.revoked}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Expired</p><p className="text-2xl font-bold text-amber-600">{analytics.expired}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Revenue</p><p className="text-2xl font-bold">৳{analytics.revenue}</p></CardContent></Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search code or batch…" className="pl-8" />
        </div>
        <Dropdown title="Status" value={filterStatus} onChange={setFilterStatus} className="w-32"
          options={[
            { value: "", label: "All statuses" },
            { value: "unused", label: "Unused" },
            { value: "used", label: "Used" },
            { value: "revoked", label: "Revoked" },
            { value: "expired", label: "Expired" },
          ]}
        />
        <Dropdown title="Package" value={filterPackage} onChange={setFilterPackage} className="w-40"
          options={[{ value: "", label: "All packages" }, ...(packages?.map((p) => ({ value: p.id, label: p.name })) ?? [])]}
        />
        <Dropdown title="Router" value={filterRouter} onChange={setFilterRouter} className="w-40"
          options={[{ value: "", label: "All routers" }, ...(routers?.map((r) => ({ value: r.id, label: r.name })) ?? [])]}
        />
        <Dropdown title="Batch" value={filterBatch} onChange={setFilterBatch} className="w-40"
          options={[{ value: "", label: "All batches" }, ...batches.map((b) => ({ value: b!, label: b! }))]}
        />
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Button variant="outline" size="sm" onClick={() => bulkRevoke.mutate({ ids: Array.from(selectedIds) })} disabled={bulkRevoke.isPending}>
            <Ban size={14} className="mr-1" /> Revoke
          </Button>
          <Button variant="destructive" size="sm" onClick={() => { if (confirm(`Delete ${selectedIds.size} vouchers?`)) bulkDelete.mutate({ ids: Array.from(selectedIds) }); }} disabled={bulkDelete.isPending}>
            <Trash2 size={14} className="mr-1" /> Delete
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>Clear</Button>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading && <div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>}
          {!isLoading && data && data.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input type="checkbox" checked={data.length > 0 && selectedIds.size === data.length} onChange={toggleSelectAll} className="w-4 h-4" />
                  </TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Profile</TableHead>
                  <TableHead>Time / Data</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="w-10">
                      <input type="checkbox" checked={selectedIds.has(v.id)} onChange={() => toggleSelect(v.id)} className="w-4 h-4" />
                    </TableCell>
                    <TableCell className="font-mono text-sm font-bold">{v.code}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{v.batchName ?? "—"}</TableCell>
                    <TableCell><Badge variant={voucherVariant(v.status)}>{v.status}</Badge></TableCell>
                    <TableCell className="text-sm">{v.profile ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {[v.timeLimit, v.dataLimit].filter(Boolean).join(" / ") || "—"}
                    </TableCell>
                    <TableCell>{v.price ? `৳${v.price}` : "Free"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(v.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" title="View QR" onClick={() => openQR(v as VoucherRow)}>
                          <QrCode size={14} className="text-muted-foreground" />
                        </Button>
                        {v.status === "unused" && (
                          <Button variant="ghost" size="icon" title="Revoke"
                            onClick={() => { if (globalThis.confirm("Revoke voucher?")) revoke.mutate({ id: v.id }); }}>
                            <Ban size={14} className="text-muted-foreground hover:text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!isLoading && !data?.length && <Empty message="No vouchers — create a batch first" />}
        </CardContent>
      </Card>

      {/* QR Modal */}
      <Modal open={!!showQR} onClose={() => { setShowQR(null); setQrDataUrl(""); }} title="Voucher QR Code">
        {showQR && (
          <div className="flex flex-col items-center gap-4 py-2">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR Code" className="w-40 h-40 rounded border border-border" />
            ) : (
              <div className="w-40 h-40 flex items-center justify-center text-muted-foreground text-sm">Generating…</div>
            )}
            <div className="font-mono text-xl font-bold tracking-widest">{showQR.code}</div>
            {showQR.profile && <p className="text-sm text-muted-foreground">Profile: {showQR.profile}</p>}
            {showQR.timeLimit && <p className="text-sm text-muted-foreground">Time limit: {showQR.timeLimit}</p>}
            <Button variant="outline" onClick={() => printBatch([showQR], showQR.code)}>
              <Printer size={14} className="mr-1" /> Print this voucher
            </Button>
          </div>
        )}
      </Modal>

      {/* Create Batch Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Voucher Batch" className="max-w-lg">
        <form onSubmit={(e) => {
          e.preventDefault();
          if (!form.routerId) { toast.error("Select a router"); return; }
          createBatch.mutate({
            ...form,
            packageId: form.packageId || undefined,
            count: Number(form.count),
            sharedUsers: Number(form.sharedUsers),
            price: Number(form.price),
            timeLimit: form.timeLimit || undefined,
            dataLimit: form.dataLimit || undefined,
          });
        }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Router *</label>
              <Select title="Router" value={form.routerId} onChange={(e) => setForm({ ...form, routerId: e.target.value })} className="w-full" required>
                <option value="">Select router…</option>
                {routers?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Batch Name *</label>
              <Input value={form.batchName} onChange={(e) => setForm({ ...form, batchName: e.target.value })} required />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Count</label>
              <Input type="number" min="1" max="500" value={form.count} onChange={(e) => setForm({ ...form, count: +e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Profile</label>
              <Input value={form.profile} onChange={(e) => setForm({ ...form, profile: e.target.value })} placeholder="default" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Shared Users</label>
              <Input type="number" min="1" value={form.sharedUsers} onChange={(e) => setForm({ ...form, sharedUsers: +e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Time Limit</label>
              <Input value={form.timeLimit} onChange={(e) => setForm({ ...form, timeLimit: e.target.value })} placeholder="e.g. 1h, 30m" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Data Limit</label>
              <Input value={form.dataLimit} onChange={(e) => setForm({ ...form, dataLimit: e.target.value })} placeholder="e.g. 1G" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Price (BDT)</label>
              <Input type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: +e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" className="flex-1" disabled={createBatch.isPending}>{createBatch.isPending ? "Creating…" : `Create ${form.count} Vouchers`}</Button>
            <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
