import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

const ORG_ID = import.meta.env.VITE_ORG_ID ?? "";

export default function Register() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", password: "", confirmPassword: "" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirmPassword) { toast.error("Passwords do not match"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/trpc/portal.register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: { orgId: ORG_ID, fullName: form.fullName, phone: form.phone, email: form.email || undefined, username: form.phone, password: form.password } }),
      });
      const data = await res.json();
      const token = data?.result?.data?.json?.token;
      if (token) {
        localStorage.setItem("isp_portal_token", token);
        toast.success("Account created! Welcome.");
        navigate("/");
      } else {
        toast.error(data?.error?.message ?? "Registration failed");
      }
    } catch { toast.error("Network error"); }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-xl p-8">
        <h1 className="text-2xl font-bold text-blue-400 mb-1">Register</h1>
        <p className="text-slate-400 text-sm mb-6">Create your customer account</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          {[
            { key: "fullName", label: "Full Name", type: "text", placeholder: "Your full name" },
            { key: "phone", label: "Phone Number", type: "tel", placeholder: "01XXXXXXXXX" },
            { key: "email", label: "Email (optional)", type: "email", placeholder: "you@example.com" },
            { key: "password", label: "Password", type: "password", placeholder: "Min 6 characters" },
            { key: "confirmPassword", label: "Confirm Password", type: "password", placeholder: "Repeat password" },
          ].map(({ key, label, type, placeholder }) => (
            <div key={key}>
              <label className="block text-xs font-medium mb-1 text-slate-300">{label}</label>
              <input type={type} placeholder={placeholder} value={(form as any)[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                required={key !== "email"}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          ))}
          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors mt-2">
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-slate-400">
          Already have an account? <Link to="/login" className="text-blue-400 hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
