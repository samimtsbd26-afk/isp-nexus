import { useState } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { Plus, Upload, Trash2, Eye } from "lucide-react";
import { Card, CardContent, Button, Badge, Modal, Input, Empty } from "../components/ui/index";

const EMPTY = { name: "", title: "", companyName: "", primaryColor: "#3b82f6", backgroundColor: "#0f172a", htmlContent: "", cssContent: "", isDefault: false };

export default function HotspotTemplates() {
  const { data, refetch, isLoading } = trpc.hotspot.listTemplates.useQuery();
  const [showAdd, setShowAdd] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);

  const create = trpc.hotspot.createTemplate.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); setForm(EMPTY); toast.success("Template created"); },
    onError: (e) => toast.error(e.message),
  });
  const deploy = trpc.hotspot.deployTemplate.useMutation({
    onSuccess: (d) => toast.success(`Deployed to ${d.path}`),
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.hotspot.deleteTemplate.useMutation({
    onSuccess: () => { refetch(); toast.success("Template deleted"); },
  });

  const previewTmpl = data?.find((t) => t.id === previewId);

  function field(key: keyof typeof form, label: string, id: string) {
    return (
      <div>
        <label htmlFor={id} className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
        <Input id={id} value={String(form[key])} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Hotspot Templates</h1>
          <p className="text-muted-foreground text-sm">Custom WiFi login page designs</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}><Plus size={14} /> New Template</Button>
      </div>

      {isLoading && <div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.map((t) => (
          <Card key={t.id} className={t.isDefault ? "border-blue-500/40" : ""}>
            {/* Color preview bar */}
            <div className="h-2 rounded-t-xl" style={{ background: `linear-gradient(to right, ${t.primaryColor ?? "#3b82f6"}, ${t.backgroundColor ?? "#0f172a"})` }} />
            <CardContent className="p-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.companyName ?? "No company name"}</p>
                </div>
                {t.isDefault ? <Badge variant="info">Default</Badge> : null}
              </div>

              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded border border-border" style={{ background: t.primaryColor ?? "#3b82f6" }} />
                <span className="text-xs text-muted-foreground">{t.primaryColor}</span>
                <div className="w-5 h-5 rounded border border-border ml-2" style={{ background: t.backgroundColor ?? "#0f172a" }} />
                <span className="text-xs text-muted-foreground">{t.backgroundColor}</span>
              </div>

              <div className="flex gap-2 pt-1 border-t border-border">
                <Button size="sm" variant="outline" className="flex-1"
                  onClick={() => setPreviewId(t.id)}>
                  <Eye size={13} /> Preview
                </Button>
                <Button size="sm" variant="secondary"
                  disabled={deploy.isPending}
                  onClick={() => deploy.mutate({ id: t.id })}
                  title="Deploy to hotspot">
                  <Upload size={13} />
                </Button>
                <Button size="sm" variant="ghost"
                  onClick={() => { if (globalThis.confirm(`Delete "${t.name}"?`)) del.mutate({ id: t.id }); }}>
                  <Trash2 size={13} className="text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!isLoading && !data?.length && (
          <div className="col-span-3">
            <Card><CardContent className="py-16"><Empty message="No templates — create your first hotspot login page" /></CardContent></Card>
          </div>
        )}
      </div>

      {/* Create Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Create Hotspot Template" className="max-w-lg">
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(form); }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {field("name", "Template Name *", "ht-name")}
            {field("companyName", "Company Name", "ht-company")}
          </div>
          {field("title", "Page Title", "ht-title")}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ht-primary" className="block text-xs font-medium text-muted-foreground mb-1.5">Primary Color</label>
              <div className="flex gap-2">
                <input id="ht-primary" type="color" value={form.primaryColor}
                  onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                  className="h-9 w-12 rounded border border-input bg-transparent cursor-pointer" />
                <Input value={form.primaryColor} onChange={(e) => setForm({ ...form, primaryColor: e.target.value })} className="flex-1" />
              </div>
            </div>
            <div>
              <label htmlFor="ht-bg" className="block text-xs font-medium text-muted-foreground mb-1.5">Background Color</label>
              <div className="flex gap-2">
                <input id="ht-bg" type="color" value={form.backgroundColor}
                  onChange={(e) => setForm({ ...form, backgroundColor: e.target.value })}
                  className="h-9 w-12 rounded border border-input bg-transparent cursor-pointer" />
                <Input value={form.backgroundColor} onChange={(e) => setForm({ ...form, backgroundColor: e.target.value })} className="flex-1" />
              </div>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="accent-blue-500" checked={form.isDefault}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
            <span>Set as default template</span>
          </label>
          <div className="flex gap-2 pt-1">
            <Button type="submit" className="flex-1" disabled={create.isPending}>{create.isPending ? "Creating…" : "Create Template"}</Button>
            <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>

      {/* Preview Modal */}
      <Modal open={!!previewId} onClose={() => setPreviewId(null)} title={`Preview: ${previewTmpl?.name}`} className="max-w-sm">
        {previewTmpl && (
          <div className="rounded-xl overflow-hidden border border-border"
            style={{ background: `linear-gradient(135deg, ${previewTmpl.backgroundColor ?? "#0f172a"} 0%, ${previewTmpl.primaryColor ?? "#3b82f6"}22 100%)` }}>
            <div className="p-8 text-center">
              <p className="text-2xl font-bold mb-1" style={{ color: previewTmpl.primaryColor ?? "#3b82f6" }}>
                🌐 {previewTmpl.companyName ?? "WiFi Login"}
              </p>
              <p className="text-white/60 text-sm mb-6">{previewTmpl.title ?? "Connect to Internet"}</p>
              <div className="space-y-2 text-left">
                <input readOnly placeholder="Username" className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
                <input readOnly placeholder="Password" type="password" className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
                <button type="button" className="w-full py-2 rounded-lg text-white text-sm font-semibold" style={{ background: previewTmpl.primaryColor ?? "#3b82f6" }}>
                  Connect
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
