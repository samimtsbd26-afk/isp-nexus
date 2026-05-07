import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router";
import { Wifi, Zap, Clock, Shield, ChevronRight, Gift, Star } from "lucide-react";
import { api, type Package } from "../lib/api";

function SkynityLogo() {
  return (
    <div className="flex flex-col items-center gap-3 animate-slide-down">
      <div className="relative animate-float">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30 animate-pulse-glow">
          <Wifi size={38} className="text-white" />
        </div>
        <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
          <Zap size={12} className="text-white" />
        </div>
      </div>
      <div className="text-center">
        <h1 className="text-4xl font-black tracking-tight gradient-text">SKYNITY</h1>
        <p className="text-sm text-cyan-400/80 font-medium mt-1 tracking-widest uppercase">Premium Internet</p>
      </div>
    </div>
  );
}

function PackageSkeleton() {
  return (
    <div className="rounded-2xl skeleton h-52 w-full" />
  );
}

function PackageCard({ pkg, isNew, onSelect }: { pkg: Package; isNew: boolean; onSelect: (p: Package) => void }) {
  const isTrial = pkg.isTrial || pkg.priceBdt === 0;
  const validity = pkg.validityDays === 1 ? "Daily" : pkg.validityDays <= 7 ? `${pkg.validityDays}-Day` : pkg.validityDays <= 14 ? "Weekly" : "Monthly";

  return (
    <div
      className={`rounded-2xl p-5 flex flex-col gap-3 cursor-pointer transition-all duration-200 animate-slide-up ${isTrial ? "pkg-trial relative overflow-hidden" : "pkg-paid"}`}
      onClick={() => onSelect(pkg)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onSelect(pkg)}
    >
      {isTrial && (
        <div className="absolute -top-2 -right-2 bg-gradient-to-br from-cyan-500 to-blue-600 text-white text-[10px] font-black px-3 py-1 rounded-bl-xl rounded-tr-2xl tracking-wide flex items-center gap-1">
          <Gift size={10} /> FREE
        </div>
      )}
      {isNew && isTrial && (
        <div className="flex items-center gap-1.5 text-xs text-cyan-400 font-semibold animate-fade-in">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          New Device Detected!
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-semibold text-cyan-400/80 uppercase tracking-wide">{validity}</span>
          {isTrial && <span className="text-xs bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full font-medium">Trial</span>}
        </div>
        <h3 className="text-lg font-bold text-white">{pkg.name}</h3>
      </div>

      <div className="flex items-center gap-3">
        <div>
          <p className={`text-3xl font-black ${isTrial ? "gradient-text-cyan" : "text-white"}`}>
            {pkg.priceBdt === 0 ? "FREE" : `৳${pkg.priceBdt}`}
          </p>
          <p className="text-xs text-slate-400">for {pkg.validityDays} {pkg.validityDays === 1 ? "day" : "days"}</p>
        </div>
        <div className="ml-auto flex flex-col items-end gap-1">
          <div className="flex items-center gap-1 text-xs text-emerald-400">
            <Zap size={11} /> {pkg.downloadMbps}M/{pkg.uploadMbps}M
          </div>
          {pkg.features?.length > 0 && (
            <div className="text-[10px] text-slate-400">{pkg.features[0]}</div>
          )}
        </div>
      </div>

      <button
        type="button"
        className={`w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${isTrial ? "btn-primary" : "btn-outline-cyan"}`}
        onClick={(e) => { e.stopPropagation(); onSelect(pkg); }}
      >
        {isTrial ? "Start Free Trial" : "Buy Now"}
        <ChevronRight size={15} />
      </button>
    </div>
  );
}

type MacState = { isNewDevice: boolean; hasExpired: boolean; hasActive: boolean; hasTrial: boolean };

export default function Landing() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mac = searchParams.get("mac") ?? searchParams.get("MAC") ?? "";

  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [macState, setMacState] = useState<MacState>({ isNewDevice: true, hasExpired: false, hasActive: false, hasTrial: false });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const pkgsPromise = api.getPackages();
        const macPromise = mac
          ? api.checkMac(mac).then((r) => {
              if (!cancelled) {
                setMacState({
                  isNewDevice: r.isNewDevice,
                  hasExpired: (r as any).hasExpiredSubscription ?? false,
                  hasActive: (r as any).hasActiveSubscription ?? false,
                  hasTrial: r.hasTrial,
                });
                // Active subscriber → redirect to login/dashboard
                if ((r as any).hasActiveSubscription && (r as any).hasActiveSession) {
                  navigate("/login?redirect=dashboard");
                }
              }
            }).catch(() => {})
          : Promise.resolve();
        const [pkgs] = await Promise.all([pkgsPromise, macPromise]);
        if (!cancelled) setPackages(pkgs ?? []);
      } catch {
        // silently ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [mac, navigate]);

  const { isNewDevice, hasExpired: _hasExpired, hasTrial } = macState;

  // Hide trial if the device has already used it or is a known customer
  const trialPkgs = (hasTrial || !isNewDevice) ? [] : packages.filter((p) => p.isTrial || p.priceBdt === 0);
  const paidPkgs = packages.filter((p) => !p.isTrial && p.priceBdt > 0).sort((a, b) => a.sortOrder - b.sortOrder || a.priceBdt - b.priceBdt);

  const handleSelect = (pkg: Package) => {
    if (pkg.isTrial || pkg.priceBdt === 0) {
      navigate(`/register?trial=1&packageId=${pkg.id}&mac=${encodeURIComponent(mac)}`);
    } else {
      navigate(`/register?packageId=${pkg.id}&price=${pkg.priceBdt}&mac=${encodeURIComponent(mac)}`);
    }
  };

  const { hasExpired } = macState;
  const isLoggedIn = !!localStorage.getItem("isp_portal_token");

  return (
    <div className="bg-mesh min-h-screen">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-8">

        {/* Brand header */}
        <SkynityLogo />

        {/* Expired customer banner */}
        {hasExpired && !isNewDevice && (
          <div className="glass rounded-2xl p-4 flex items-center gap-3 border border-amber-500/30 bg-amber-500/5 animate-slide-up">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
              <Clock size={20} className="text-amber-400" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-sm text-white">Your subscription has expired</p>
              <p className="text-xs text-slate-400 mt-0.5">Renew a package to restore your internet access</p>
            </div>
          </div>
        )}

        {/* New device banner */}
        {isNewDevice && trialPkgs.length > 0 && (
          <div className="glass-card rounded-2xl p-4 flex items-center gap-3 animate-slide-up animate-border-glow">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center shrink-0">
              <Gift size={20} className="text-cyan-400" />
            </div>
            <div>
              <p className="font-bold text-sm text-white">Welcome! New Device Detected</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {hasTrial ? "You've used a trial before. Buy a package to continue." : `Claim your free ${trialPkgs[0].validityDays}-day trial below 👇`}
              </p>
            </div>
          </div>
        )}

        {/* Value props */}
        <div className="grid grid-cols-3 gap-3 animate-fade-in delay-200">
          {[
            { icon: Zap, label: "High Speed", sub: "Up to 100Mbps" },
            { icon: Clock, label: "24/7 Online", sub: "Always connected" },
            { icon: Shield, label: "Secure", sub: "Encrypted data" },
          ].map(({ icon: Icon, label, sub }) => (
            <div key={label} className="glass rounded-xl p-3 text-center">
              <Icon size={18} className="text-cyan-400 mx-auto mb-1.5" />
              <p className="text-xs font-semibold text-white">{label}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>

        {/* Trial packages */}
        {(loading || trialPkgs.length > 0) && (
          <section className="space-y-3 animate-slide-up delay-200">
            <div className="flex items-center gap-2">
              <Gift size={15} className="text-cyan-400" />
              <h2 className="text-sm font-bold text-white">Free Trial</h2>
            </div>
            {loading
              ? <PackageSkeleton />
              : trialPkgs.map((p) => <PackageCard key={p.id} pkg={p} isNew={isNewDevice} onSelect={handleSelect} />)
            }
          </section>
        )}

        {/* Paid packages */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 animate-slide-up delay-300">
            <Star size={15} className="text-amber-400" />
            <h2 className="text-sm font-bold text-white">Internet Packages</h2>
          </div>
          {loading
            ? [1, 2, 3].map((i) => <PackageSkeleton key={i} />)
            : paidPkgs.length === 0 && !loading
              ? <p className="text-center text-slate-400 text-sm py-8 glass rounded-2xl">No packages available right now.</p>
              : paidPkgs.map((p, i) => (
                <div key={p.id} className={`delay-${(i + 3) * 100}`}>
                  <PackageCard pkg={p} isNew={false} onSelect={handleSelect} />
                </div>
              ))
          }
        </section>

        {/* Existing customer CTA */}
        <div className="glass rounded-2xl p-5 flex items-center justify-between animate-fade-in delay-500">
          <div>
            <p className="text-sm font-semibold text-white">Already a customer?</p>
            <p className="text-xs text-slate-400 mt-0.5">Login to manage your account</p>
          </div>
          <Link
            to={isLoggedIn ? "/" : "/login"}
            className="btn-outline-cyan px-4 py-2.5 rounded-xl text-sm flex items-center gap-2"
          >
            {isLoggedIn ? "Dashboard" : "Login"} <ChevronRight size={14} />
          </Link>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-slate-500 pb-4">
          Powered by SKYNITY ISP · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
