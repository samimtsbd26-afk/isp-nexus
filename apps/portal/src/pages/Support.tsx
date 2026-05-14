import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ArrowLeft, MessageCircle, Phone, Mail, ChevronDown, ChevronRight, Plus, Ticket, Send, ExternalLink } from "lucide-react";

const ORG_ID = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_ORG_ID ?? "212d7393-7375-4321-93f5-4789deb8b317";

type SupportTicket = { id: string; subject: string; status: string; priority: string; createdAt: string };
type SupportInfo = { whatsappNumber: string | null; callNumber: string | null; supportEmail: string | null; faqUrl: string | null };

const FAQ = [
  { q: "How do I connect to the internet?", a: "Open your device's WiFi settings, connect to the hotspot network, and browse to any website. You will be redirected to the login page. Enter your username and password to start browsing." },
  { q: "I forgot my password. What do I do?", a: "Contact support via WhatsApp or call us. We can reset your password. In future versions, self-service password reset will be available." },
  { q: "Why is my internet slow?", a: "Speed depends on your package plan and current network load. If you're experiencing slower than usual speeds, please contact support with your username." },
  { q: "How do I renew my package?", a: "Go to your Dashboard and click 'Renew Plan', or visit the Packages page to choose a new plan. Pay via bKash, Nagad, or Rocket and submit the transaction ID." },
  { q: "Can I use my account on multiple devices?", a: "It depends on your package. Some packages allow multiple simultaneous connections. Check your package details or contact support." },
  { q: "What happens when my trial expires?", a: "Your internet access will be disconnected. You can renew by purchasing a regular package through the portal." },
  { q: "How do I check my data usage?", a: "Login to your portal dashboard to see your active session details including data used and uptime." },
  { q: "My device is blocked. How do I unblock it?", a: "Login to your portal and go to Device Bindings in your profile. You can reset your device binding there, or contact support." },
];

async function portalGet<T>(procedure: string, input: unknown): Promise<T> {
  const encoded = encodeURIComponent(JSON.stringify({ "0": { json: input } }));
  const res = await fetch(`/api/trpc/${procedure}?input=${encoded}`, { credentials: "include" });
  const d = await res.json() as any;
  const val = d?.["0"]?.result?.data?.json ?? d?.result?.data?.json ?? d?.result?.data;
  if (d?.["0"]?.error || d?.error) throw new Error(d?.["0"]?.error?.message ?? "Request failed");
  return val as T;
}

async function portalPost<T>(procedure: string, input: unknown): Promise<T> {
  const res = await fetch(`/api/trpc/${procedure}`, {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ "0": { json: input } }),
  });
  const d = await res.json() as any;
  const val = d?.["0"]?.result?.data?.json ?? d?.result?.data?.json ?? d?.result?.data;
  if (d?.["0"]?.error || d?.error) throw new Error(d?.["0"]?.error?.message ?? "Request failed");
  return val as T;
}

export default function Support() {
  const navigate = useNavigate();
  const token = localStorage.getItem("isp_portal_token");
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [supportInfo, setSupportInfo] = useState<SupportInfo | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    portalGet<SupportInfo>("portal.getSupportInfo", { orgId: ORG_ID }).then(setSupportInfo).catch(() => {});
    if (token) {
      portalPost<SupportTicket[]>("portal.myTickets", { token }).then(setTickets).catch(() => {});
    }
  }, [token]);

  async function submitTicket() {
    if (!token) { navigate("/login"); return; }
    if (!subject.trim() || !message.trim()) { toast.error("Please fill in subject and message"); return; }
    setSubmitting(true);
    try {
      await portalPost("portal.openTicket", { token, subject: subject.trim(), message: message.trim() });
      toast.success("Support ticket submitted!");
      setShowNewTicket(false);
      setSubject(""); setMessage("");
      const updated = await portalPost<SupportTicket[]>("portal.myTickets", { token });
      setTickets(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit ticket");
    } finally {
      setSubmitting(false);
    }
  }

  const wa = supportInfo?.whatsappNumber?.replace(/\D/g, "");
  const waLink = wa ? `https://wa.me/${wa}?text=Hello%2C%20I%20need%20support` : null;

  return (
    <div className="bg-mesh min-h-screen pb-8">
      <div className="max-w-lg mx-auto px-4 pt-5 space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-8 h-8 glass rounded-lg flex items-center justify-center text-slate-400 hover:text-white transition-colors">
            <ArrowLeft size={15} />
          </button>
          <div>
            <h1 className="text-xl font-black text-white">Support</h1>
            <p className="text-xs text-slate-400">Get help & open tickets</p>
          </div>
        </div>

        {/* Contact Buttons */}
        <div className="space-y-2 animate-slide-up">
          {waLink && (
            <a href={waLink} target="_blank" rel="noopener noreferrer"
              className="glass-card rounded-2xl p-4 flex items-center gap-4 hover:bg-white/5 transition-colors border border-emerald-500/20">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                <MessageCircle size={20} className="text-emerald-400" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-sm text-white">WhatsApp Support</p>
                <p className="text-xs text-slate-400">Chat with us instantly</p>
              </div>
              <ExternalLink size={14} className="text-emerald-400 shrink-0" />
            </a>
          )}
          {supportInfo?.callNumber && (
            <a href={`tel:${supportInfo.callNumber}`}
              className="glass-card rounded-2xl p-4 flex items-center gap-4 hover:bg-white/5 transition-colors border border-blue-500/20">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0">
                <Phone size={20} className="text-blue-400" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-sm text-white">Call Support</p>
                <p className="text-xs text-slate-400">{supportInfo.callNumber}</p>
              </div>
            </a>
          )}
          {supportInfo?.supportEmail && (
            <a href={`mailto:${supportInfo.supportEmail}`}
              className="glass-card rounded-2xl p-4 flex items-center gap-4 hover:bg-white/5 transition-colors border border-violet-500/20">
              <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center shrink-0">
                <Mail size={20} className="text-violet-400" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-sm text-white">Email Support</p>
                <p className="text-xs text-slate-400">{supportInfo.supportEmail}</p>
              </div>
            </a>
          )}
          {!waLink && !supportInfo?.callNumber && !supportInfo?.supportEmail && (
            <div className="glass rounded-xl p-4 text-center">
              <p className="text-xs text-slate-400">Contact your ISP directly for support.</p>
            </div>
          )}
        </div>

        {/* Support Tickets */}
        {token && (
          <div className="animate-slide-up delay-100">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Ticket size={14} className="text-slate-400" />
                <p className="text-sm font-semibold text-slate-200">My Tickets</p>
              </div>
              <button type="button" onClick={() => setShowNewTicket(!showNewTicket)}
                className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition-colors">
                <Plus size={12} /> New Ticket
              </button>
            </div>

            {showNewTicket && (
              <div className="glass-card rounded-2xl p-4 mb-3 space-y-3 border border-cyan-500/20 animate-slide-up">
                <p className="text-sm font-semibold text-white">Open Support Ticket</p>
                <input
                  type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject (e.g., Internet not working)"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
                />
                <textarea
                  value={message} onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe your issue in detail..."
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 resize-none"
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowNewTicket(false)}
                    className="flex-1 btn-outline-cyan py-2.5 rounded-xl text-xs">Cancel</button>
                  <button type="button" onClick={submitTicket} disabled={submitting}
                    className="flex-1 btn-primary py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5">
                    <Send size={12} /> {submitting ? "Submitting..." : "Submit"}
                  </button>
                </div>
              </div>
            )}

            {tickets.length === 0 ? (
              <div className="glass rounded-xl p-4 text-center">
                <p className="text-xs text-slate-400">No support tickets yet.</p>
              </div>
            ) : (
              <div className="glass rounded-xl overflow-hidden">
                <div className="divide-y divide-white/5">
                  {tickets.map((t) => (
                    <div key={t.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-white">{t.subject}</p>
                        <p className="text-xs text-slate-400">{new Date(t.createdAt).toLocaleDateString("en-BD")}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                        t.status === "open" ? "bg-blue-500/20 text-blue-400" :
                        t.status === "resolved" ? "bg-emerald-500/20 text-emerald-400" :
                        "bg-slate-500/20 text-slate-400"
                      }`}>{t.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* FAQ */}
        <div className="animate-slide-up delay-200">
          <p className="text-sm font-semibold text-slate-200 mb-2">Frequently Asked Questions</p>
          <div className="glass rounded-xl overflow-hidden divide-y divide-white/5">
            {FAQ.map((item, i) => (
              <div key={i}>
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-white/3 transition-colors"
                >
                  <span className="text-sm text-slate-200 pr-4">{item.q}</span>
                  {openFaq === i
                    ? <ChevronDown size={14} className="text-cyan-400 shrink-0" />
                    : <ChevronRight size={14} className="text-slate-500 shrink-0" />}
                </button>
                {openFaq === i && (
                  <div className="px-4 pb-4">
                    <p className="text-xs text-slate-400 leading-relaxed">{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="text-center pt-2 pb-4">
          <p className="text-xs text-slate-600 font-medium">Powered by <span className="gradient-text-cyan font-bold">SKYNITY</span></p>
        </div>
      </div>
    </div>
  );
}
