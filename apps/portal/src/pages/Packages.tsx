import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router";
import { ArrowLeft, Zap, Clock, Wifi, ChevronRight, Gift, Star } from "lucide-react";
import { api, type Package } from "../lib/api";

function PkgSkeleton() {
  return <div className="skeleton rounded-2xl h-48 w-full" />;
}

function PackageCard({ pkg, onBuy }: { pkg: Package; onBuy: (p: Package) => void }) {
  const isTrial = pkg.isTrial || pkg.priceBdt === 0;
  const isPopular = !isTrial && pkg.validityDays >= 30 && pkg.downloadMbps >= 10;
  const dayLabel = pkg.validityDays === 1 ? "Daily" : pkg.validityDays <= 7 ? `${pkg.validityDays}-Day` : pkg.validityDays <= 14 ? "Weekly" : "Monthly";

  return (
    <div className={`rounded-2xl p-5 flex flex-col gap-3.5 animate-slide-up cursor-pointer transition-all duration-200 ${isTrial ? "pkg-trial" : "pkg-paid"}`} onClick={() => onBuy(pkg)}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-white/5 text-slate-400">{dayLabel}</span>
        {isTrial && <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center gap-1"><Gift size={9} /> Free Trial</span>}
        {isPopular && <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 flex items-center gap-1"><Star size={9} /> Popular</span>}
      </div>
      <div>
        <h3 className="text-lg font-black text-white">{pkg.name}</h3>
        <div className="flex items-baseline gap-1.5 mt-1">
          <span className={`text-3xl font-black ${isTrial ? "gradient-text-cyan" : "text-white"}`}>{pkg.priceBdt === 0 ? "FREE" : `৳${pkg.priceBdt}`}</span>
          <span className="text-xs text-slate-400">/ {pkg.validityDays} {pkg.validityDays === 1 ? "day" : "days"}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="glass rounded-xl p-2.5 flex items-center gap-2">
          <Zap size={13} className="text-cyan-400 shrink-0" />
          <div><p className="text-[10px] text-slate-400">Speed</p><p className="text-xs font-bold text-white">{pkg.downloadMbps}↓ {pkg.uploadMbps}↑ Mbps</p></div>
        </div>
        <div className="glass rounded-xl p-2.5 flex items-center gap-2">
          <Clock size={13} className="text-violet-400 shrink-0" />
          <div><p className="text-[10px] text-slate-400">Validity</p><p className="text-xs font-bold text-white">{pkg.validityDays} {pkg.validityDays === 1 ? "day" : "days"}</p></div>
        </div>
      </div>
      {pkg.description && <p className="text-xs text-slate-400">{pkg.description}</p>}
      {pkg.features?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pkg.features.slice(0, 3).map((f, i) => <span key={i} className="text-[10px] bg-white/5 border border-white/8 px-2 py-0.5 rounded-full text-slate-300">{f}</span>)}
        </div>
      )}
      <button type="button" className={`w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 mt-auto ${isTrial ? "btn-primary" : "btn-outline-cyan"}`} onClick={(e) => { e.stopPropagation(); onBuy(pkg); }}>
        {isTrial ? "Start Free Trial" : "Buy Now"} <ChevronRight size={14} />
      </button>
    </div>
  );
}

export default function Packages() {
  const navigate = useNavigate();
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "trial" | "daily" | "weekly" | "monthly">("all");

  useEffect(() => { api.getPackages().then(setPackages).catch(() => {}).finally(() => setLoading(false)); }, []);

  const handleBuy = (pkg: Package) => {
    const isLoggedIn = !!localStorage.getItem("isp_portal_token");
    if (pkg.isTrial || pkg.priceBdt === 0) {
      navigate(isLoggedIn ? `/payment?packageId=${pkg.id}&trial=1` : `/register?trial=1&packageId=${pkg.id}`);
    } else {
      navigate(isLoggedIn ? `/payment?packageId=${pkg.id}` : `/register?packageId=${pkg.id}&price=${pkg.priceBdt}`);
    }
  };

  const filtered = packages.filter((p) => {
    if (filter === "trial") return p.isTrial || p.priceBdt === 0;
    if (filter === "daily") return !p.isTrial && p.priceBdt > 0 && p.validityDays <= 1;
    if (filter === "weekly") return !p.isTrial && p.priceBdt > 0 && p.validityDays > 1 && p.validityDays <= 7;
    if (filter === "monthly") return !p.isTrial && p.priceBdt > 0 && p.validityDays > 7;
    return true;
  });

  const FILTERS = [ { key: "all" as const, label: "All" }, { key: "trial" as const, label: "Trial", icon: Gift }, { key: "daily" as const, label: "Daily", icon: Zap }, { key: "weekly" as const, label: "Weekly", icon: Wifi }, { key: "monthly" as const, label: "Monthly", icon: Star } ];

  return (
    <div className="bg-mesh min-h-screen pb-8">
      <div className="max-w-lg mx-auto px-4 pt-5 space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-8 h-8 glass rounded-lg flex items-center justify-center text-slate-400 hover:text-white transition-colors"><ArrowLeft size={15} /></button>
          <div><h1 className="text-xl font-black text-white">Internet Packages</h1><p className="text-xs text-slate-400">Choose your plan</p></div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" onClick={() => setFilter(key)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${filter === key ? "btn-primary" : "glass text-slate-400 hover:text-white"}`}>
              {Icon && <Icon size={11} />} {label}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {loading ? [1,2,3].map((i) => <PkgSkeleton key={i} />) : filtered.length === 0 ? <div className="glass rounded-2xl py-12 text-center"><p className="text-slate-400 text-sm">No packages in this category</p></div> : filtered.map((p) => <PackageCard key={p.id} pkg={p} onBuy={handleBuy} />)}
        </div>
        {!localStorage.getItem("isp_portal_token") && (
          <div className="glass rounded-xl p-4 flex items-center justify-between">
            <p className="text-sm text-slate-300">Already have an account?</p>
            <Link to="/login" className="text-cyan-400 text-sm font-semibold flex items-center gap-1 hover:text-cyan-300"><Login size={13} /> Login <ChevronRight size={13} /></Link>
          </div>
        )}
      </div>
    </div>
  );
}

// Import needed for inline usage
function Login({ size }: { size: number }) { return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>; }
