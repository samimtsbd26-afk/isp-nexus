import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import { Wifi, Clock, CheckCircle, XCircle } from "lucide-react";
import { api } from "../lib/api";

async function logAutoLogin(phone: string, loginUrl: string, success: boolean, reason: string) {
  try {
    const approval = await api.approvalStatus(phone).catch(() => null);
    await fetch("/api/portal/autologin-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgId: api.orgId,
        username: approval?.hotspotUsername ?? phone,
        phone,
        loginUrl,
        success,
        reason,
      }),
    });
  } catch { /* non-fatal */ }
}

interface PendingState {
  orderId: string;
  phone: string;
}

export default function Pending() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [dots, setDots] = useState(".");
  const [pendingState, setPendingState] = useState<PendingState | null>(null);

  // Animate waiting dots
  useEffect(() => {
    const t = setInterval(() => setDots((d) => d.length >= 3 ? "." : d + "."), 600);
    return () => clearInterval(t);
  }, []);

  // Load pending state from localStorage
  useEffect(() => {
    const raw = localStorage.getItem("isp_pending_order");
    if (!raw) { navigate("/welcome", { replace: true }); return; }
    try {
      const parsed = JSON.parse(raw) as PendingState;
      if (parsed.orderId && parsed.phone) setPendingState(parsed);
      else navigate("/welcome", { replace: true });
    } catch {
      navigate("/welcome", { replace: true });
    }
  }, [navigate]);

  // Poll order status every 8 seconds
  const checkStatus = useCallback(async (state: PendingState) => {
    try {
      const result = await api.getOrderStatus(state.orderId, state.phone);
      if (result?.status === "approved") {
        localStorage.removeItem("isp_pending_order");
        setStatus("approved");

        // Attempt MikroTik auto-login using the stored link-login-only URL
        const linkLoginUrl = sessionStorage.getItem("isp_link_login");
        if (linkLoginUrl) {
          try {
            const approval = await api.approvalStatus(state.phone);
            if (approval?.approved && approval.hotspotUsername && approval.hotspotPassword) {
              const form = document.createElement("form");
              form.method = "post";
              form.action = linkLoginUrl;
              const addField = (name: string, value: string) => {
                const el = document.createElement("input");
                el.type = "hidden";
                el.name = name;
                el.value = value;
                form.appendChild(el);
              };
              addField("username", approval.hotspotUsername);
              addField("password", approval.hotspotPassword);
              document.body.appendChild(form);
              // Log success then submit
              void logAutoLogin(state.phone, linkLoginUrl, true, "credentials_submitted");
              setTimeout(() => form.submit(), 1500);
              return;
            }
          } catch {
            // fall through to manual login redirect
          }
          void logAutoLogin(state.phone, linkLoginUrl, false, "no_credentials_or_api_error");
        }

        setTimeout(() => navigate("/login?approved=1"), 2500);
      } else if (result?.status === "rejected") {
        localStorage.removeItem("isp_pending_order");
        setStatus("rejected");
      }
    } catch {
      // ignore network errors — keep polling
    }
  }, [navigate]);

  useEffect(() => {
    if (!pendingState) return;
    void checkStatus(pendingState);
    const t = setInterval(() => { void checkStatus(pendingState); }, 8000);
    return () => clearInterval(t);
  }, [pendingState, checkStatus]);

  if (status === "approved") {
    return (
      <div className="bg-mesh min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center space-y-6 animate-slide-up">
          <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
            <CheckCircle size={40} className="text-green-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-green-400">অনুমোদিত হয়েছে!</h1>
            <p className="text-slate-400 mt-2">আপনার সংযোগ সক্রিয় হচ্ছে…</p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="bg-mesh min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center space-y-6 animate-slide-up">
          <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mx-auto">
            <XCircle size={40} className="text-red-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-red-400">আবেদন বাতিল হয়েছে</h1>
            <p className="text-slate-400 mt-2">আপনার আবেদন Admin কর্তৃক বাতিল করা হয়েছে।</p>
          </div>
          <button
            onClick={() => navigate("/welcome")}
            className="btn-primary px-6 py-3 rounded-xl text-sm"
          >
            আবার চেষ্টা করুন
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-mesh min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8 animate-slide-up">
        {/* Icon */}
        <div className="text-center">
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center mx-auto shadow-lg shadow-cyan-500/10 animate-pulse-glow">
            <Wifi size={42} className="text-cyan-400" />
          </div>
        </div>

        {/* Main message */}
        <div className="glass-strong rounded-2xl p-6 text-center space-y-4">
          <div className="flex items-center justify-center gap-2 text-cyan-400">
            <Clock size={18} className="animate-spin" style={{ animationDuration: "3s" }} />
            <span className="text-sm font-semibold uppercase tracking-wider">অপেক্ষায় আছেন</span>
          </div>

          <h1 className="text-xl font-black text-white leading-snug">
            আপনার আবেদন গ্রহণ করা হয়েছে।
          </h1>

          <p className="text-slate-400 text-sm leading-relaxed">
            Admin approval এর জন্য অপেক্ষা করুন।
            <br />
            অনুমোদিত হলে স্বয়ংক্রিয়ভাবে সংযোগ চালু হবে।
          </p>

          {/* Animated waiting indicator */}
          <div className="flex items-center justify-center gap-1.5 pt-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-cyan-500 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
          <p className="text-slate-500 text-xs">স্বয়ংক্রিয়ভাবে check হচ্ছে{dots}</p>
        </div>

        {/* Info card */}
        <div className="glass-card rounded-xl p-4 space-y-2 text-sm text-slate-400">
          <p>• আপনার আবেদন Admin-এর কাছে পাঠানো হয়েছে</p>
          <p>• সাধারণত ৫–১৫ মিনিটের মধ্যে approve হয়</p>
          <p>• Approve হলে এই পেজ স্বয়ংক্রিয়ভাবে আপডেট হবে</p>
        </div>
      </div>
    </div>
  );
}
