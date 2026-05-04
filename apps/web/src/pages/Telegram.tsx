import { useState } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { Bot, Send, Plus, Trash2, Bell, BellOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Button, Badge, Input, Modal, Empty } from "../components/ui/index";

const EMPTY = { chatId: "", alertsEnabled: true, cpuThreshold: 80, memoryThreshold: 80 };

export default function TelegramSettings() {
  const { data: configs, refetch, isLoading } = trpc.telegram.listConfigs.useQuery();
  const { data: botStatus } = trpc.telegram.getBotStatus.useQuery();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [testChatId, setTestChatId] = useState("");

  const upsert = trpc.telegram.upsertConfig.useMutation({
    onSuccess: () => { refetch(); setShowAdd(false); setForm(EMPTY); toast.success("Config saved"); },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.telegram.deleteConfig.useMutation({
    onSuccess: () => { refetch(); toast.success("Config removed"); },
  });
  const test = trpc.telegram.testAlert.useMutation({
    onSuccess: (d) => d.ok ? toast.success("Test message sent!") : toast.error(d.error ?? "Failed"),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Telegram Bot</h1>
          <p className="text-muted-foreground text-sm">Alert notifications and commands</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}><Plus size={14} /> Add Chat</Button>
      </div>

      {/* Bot status */}
      <Card className={botStatus?.running ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}>
        <CardContent className="flex items-center gap-4 p-5">
          <div className={`p-3 rounded-xl ${botStatus?.running ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
            <Bot size={24} className={botStatus?.running ? "text-emerald-400" : "text-red-400"} />
          </div>
          <div className="flex-1">
            <p className="font-semibold">Telegram Bot</p>
            <p className="text-sm text-muted-foreground">
              {botStatus?.running ? "Bot is running and receiving commands" : "Bot is offline — check TELEGRAM_BOT_TOKEN in .env"}
            </p>
          </div>
          <Badge variant={botStatus?.running ? "success" : "destructive"}>
            {botStatus?.running ? "Online" : "Offline"}
          </Badge>
        </CardContent>
      </Card>

      {/* Test alert */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Send Test Alert</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input placeholder="Chat ID (e.g. 123456789)" value={testChatId}
              onChange={(e) => setTestChatId(e.target.value)} className="flex-1" />
            <Button size="sm" disabled={!testChatId || test.isPending}
              onClick={() => test.mutate({ chatId: testChatId })}>
              <Send size={14} /> Test
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Send /start to your bot first to get the Chat ID</p>
        </CardContent>
      </Card>

      {/* Configs */}
      <div className="space-y-3">
        {isLoading && <div className="py-8 text-center text-muted-foreground text-sm">Loading…</div>}
        {configs?.map((c) => (
          <Card key={c.id}>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="p-2 rounded-lg bg-secondary">
                {c.alertsEnabled ? <Bell size={16} className="text-blue-400" /> : <BellOff size={16} className="text-muted-foreground" />}
              </div>
              <div className="flex-1">
                <p className="font-mono text-sm font-medium">Chat ID: {c.chatId}</p>
                <p className="text-xs text-muted-foreground">
                  CPU &gt; {c.cpuThreshold}% · RAM &gt; {c.memoryThreshold}%
                </p>
              </div>
              <Badge variant={c.alertsEnabled ? "success" : "default"}>
                {c.alertsEnabled ? "Enabled" : "Disabled"}
              </Badge>
              <Button variant="ghost" size="icon"
                onClick={() => { if (globalThis.confirm("Remove this config?")) del.mutate({ id: c.id }); }}>
                <Trash2 size={14} className="text-muted-foreground hover:text-destructive" />
              </Button>
            </CardContent>
          </Card>
        ))}
        {!isLoading && !configs?.length && (
          <Card><CardContent className="py-12"><Empty message="No Telegram configs — add a chat ID to receive alerts" /></CardContent></Card>
        )}
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Telegram Alert Config">
        <form onSubmit={(e) => { e.preventDefault(); upsert.mutate(form); }} className="space-y-4">
          <div>
            <label htmlFor="tg-chat" className="block text-xs font-medium text-muted-foreground mb-1.5">Chat ID</label>
            <Input id="tg-chat" placeholder="e.g. 123456789 or -100123456789" value={form.chatId}
              onChange={(e) => setForm({ ...form, chatId: e.target.value })} required />
            <p className="text-xs text-muted-foreground mt-1">Send /start to the bot to get your Chat ID</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="tg-cpu" className="block text-xs font-medium text-muted-foreground mb-1.5">CPU Threshold (%)</label>
              <Input id="tg-cpu" type="number" min="10" max="100" value={form.cpuThreshold}
                onChange={(e) => setForm({ ...form, cpuThreshold: +e.target.value })} />
            </div>
            <div>
              <label htmlFor="tg-mem" className="block text-xs font-medium text-muted-foreground mb-1.5">Memory Threshold (%)</label>
              <Input id="tg-mem" type="number" min="10" max="100" value={form.memoryThreshold}
                onChange={(e) => setForm({ ...form, memoryThreshold: +e.target.value })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="accent-blue-500" checked={form.alertsEnabled}
              onChange={(e) => setForm({ ...form, alertsEnabled: e.target.checked })} />
            <span>Enable alerts</span>
          </label>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={upsert.isPending}>{upsert.isPending ? "Saving…" : "Save Config"}</Button>
            <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
