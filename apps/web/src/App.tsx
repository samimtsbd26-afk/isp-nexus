import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { trpc, createTRPCClient } from "./lib/trpc";
import { getAccessToken, installChunkLoadRetry, restoreSession, subscribeAuthState } from "./lib/auth";

// Auth
import Login from "./pages/auth/Login";
import Setup from "./pages/auth/Setup";
import Layout from "./components/Layout";

// Core
import Dashboard from "./pages/Dashboard";
import Routers from "./pages/Routers";

// Monitoring
import Monitoring from "./pages/monitoring/Monitoring";
import BandwidthMonitor from "./pages/monitoring/Bandwidth";
import PingMonitor from "./pages/monitoring/Ping";
import SfpMonitor from "./pages/monitoring/Sfp";

// Users / Network
import PppoeUsers from "./pages/PppoeUsers";
import HotspotControl from "./pages/HotspotControl";
import DhcpLeases from "./pages/DhcpLeases";
import Queues from "./pages/Queues";

// Network config
import Firewall from "./pages/Firewall";
import WireGuard from "./pages/WireGuard";

// ISP Portal
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import Packages from "./pages/Packages";
import Orders from "./pages/Orders";
import Invoices from "./pages/Invoices";
import Vouchers from "./pages/Vouchers";
import Support from "./pages/Support";

// ISP Scale
import Resellers from "./pages/Resellers";
import BillingAutomation from "./pages/BillingAutomation";
import Performance from "./pages/Performance";

// Analytics & Tools
import TelegramSettings from "./pages/Telegram";

// System
import SystemLogs from "./pages/SystemLogs";
import Backup from "./pages/Backup";
import Users from "./pages/Users";
import Activity from "./pages/Activity";
import Settings from "./pages/Settings";
import HotspotSettings from "./pages/HotspotSettings";
import HotspotDebug from "./pages/HotspotDebug";
import Incidents from "./pages/Incidents";
import WirelessControl from "./pages/monitoring/WirelessControl";
import NetworkMap from "./pages/NetworkMap";
import NocWallboard from "./pages/NocWallboard";

function RequireAuth({ children }: Readonly<{ children: React.ReactNode }>) {
  const location = useLocation();
  const [state, setState] = useState<"checking" | "authed" | "guest">(() => getAccessToken() ? "authed" : "checking");

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const token = await restoreSession();
      if (!cancelled) setState(token ? "authed" : "guest");
    };
    if (getAccessToken()) setState("authed");
    else void check();
    const unsubscribe = subscribeAuthState(() => setState(getAccessToken() ? "authed" : "guest"));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (state === "checking") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground animate-pulse">Loading session…</p>
      </div>
    );
  }
  return state === "authed" ? <>{children}</> : <Navigate to="/login" replace state={{ from: location.pathname }} />;
}

export default function App() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          const message = error instanceof Error ? error.message : String(error ?? "");
          if (/UNAUTHORIZED|401/.test(message)) return false;
          return failureCount < 1;
        },
        // 30s stale window: cached data shows instantly on tab return,
        // background refetch happens silently only after 30s.
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        refetchOnMount: true,
        refetchOnWindowFocus: false,
      },
    },
  }));
  const [trpcClient] = useState(() => createTRPCClient());

  useEffect(() => {
    installChunkLoadRetry();
    const unsubscribe = subscribeAuthState(() => {
      void queryClient.cancelQueries();
      queryClient.clear();
    });
    return unsubscribe;
  }, [queryClient]);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <Toaster richColors theme="light" position="top-right" />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/setup" element={<Setup />} />

          <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
            {/* Overview */}
            <Route index element={<Dashboard />} />
            <Route path="routers" element={<Routers />} />

            {/* Monitoring */}
            <Route path="monitoring" element={<Monitoring />} />
            <Route path="monitoring/bandwidth" element={<BandwidthMonitor />} />
            <Route path="monitoring/ping" element={<PingMonitor />} />
            <Route path="monitoring/sfp" element={<SfpMonitor />} />
            <Route path="monitoring/wireless" element={<WirelessControl />} />
            <Route path="network-map" element={<NetworkMap />} />

            {/* Users */}
            <Route path="pppoe" element={<PppoeUsers />} />
            <Route path="hotspot" element={<HotspotControl />} />
            <Route path="dhcp" element={<DhcpLeases />} />
            <Route path="queues" element={<Queues />} />

            {/* Network */}
            <Route path="firewall" element={<Firewall />} />
            <Route path="ip" element={<Navigate to="/routers" replace />} />
            <Route path="routes" element={<Navigate to="/routers" replace />} />
            <Route path="wireguard" element={<WireGuard />} />
            <Route path="interfaces" element={<Navigate to="/routers" replace />} />
            <Route path="neighbors" element={<Navigate to="/routers" replace />} />

            {/* ISP Portal */}
            <Route path="customers" element={<Customers />} />
            <Route path="customers/:id" element={<CustomerDetail />} />
            <Route path="subscriptions" element={<Navigate to="/customers" replace />} />
            <Route path="packages" element={<Packages />} />
            <Route path="orders" element={<Orders />} />
            <Route path="payments" element={<Navigate to="/orders" replace />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="vouchers" element={<Vouchers />} />
            <Route path="support" element={<Support />} />
            <Route path="resellers" element={<Resellers />} />
            <Route path="billing-automation" element={<BillingAutomation />} />

            {/* Analytics */}
            <Route path="analytics" element={<Navigate to="/" replace />} />
            <Route path="telegram" element={<TelegramSettings />} />

            {/* System */}
            <Route path="system-logs" element={<SystemLogs />} />
            <Route path="backup" element={<Backup />} />
            <Route path="performance" element={<Performance />} />
            <Route path="activity" element={<Activity />} />
            <Route path="settings" element={<Settings />} />
            <Route path="hotspot-settings" element={<HotspotSettings />} />
            <Route path="hotspot-debug" element={<HotspotDebug />} />
            <Route path="incidents" element={<Incidents />} />
            <Route path="users" element={<Users />} />
            <Route path="noc" element={<NocWallboard />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
