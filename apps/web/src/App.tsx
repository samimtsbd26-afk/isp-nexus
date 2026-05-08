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
import Interfaces from "./pages/Interfaces";
import Neighbors from "./pages/Neighbors";

// Users / Network
import PppoeUsers from "./pages/PppoeUsers";
import HotspotControl from "./pages/HotspotControl";
import DhcpLeases from "./pages/DhcpLeases";
import Queues from "./pages/Queues";

// Network config
import Firewall from "./pages/Firewall";
import IpAddresses from "./pages/IpAddresses";
import RoutesPage from "./pages/Routes";
import WireGuard from "./pages/WireGuard";

// ISP Portal
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import Subscriptions from "./pages/Subscriptions";
import Packages from "./pages/Packages";
import Orders from "./pages/Orders";
import Invoices from "./pages/Invoices";
import Vouchers from "./pages/Vouchers";
import Support from "./pages/Support";

// Analytics & Tools
import Analytics from "./pages/Analytics";
import TelegramSettings from "./pages/Telegram";

// System
import SystemLogs from "./pages/SystemLogs";
import Backup from "./pages/Backup";
import HotspotTemplates from "./pages/HotspotTemplates";
import Users from "./pages/Users";
import Activity from "./pages/Activity";
import Settings from "./pages/Settings";
import WirelessControl from "./pages/monitoring/WirelessControl";

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
    return <div className="min-h-screen bg-background" />;
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
        <Toaster richColors theme="dark" position="top-right" />
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
            <Route path="interfaces" element={<Interfaces />} />
            <Route path="neighbors" element={<Neighbors />} />

            {/* Users */}
            <Route path="pppoe" element={<PppoeUsers />} />
            <Route path="hotspot" element={<HotspotControl />} />
            <Route path="dhcp" element={<DhcpLeases />} />
            <Route path="queues" element={<Queues />} />

            {/* Network */}
            <Route path="firewall" element={<Firewall />} />
            <Route path="ip" element={<IpAddresses />} />
            <Route path="routes" element={<RoutesPage />} />
            <Route path="wireguard" element={<WireGuard />} />

            {/* ISP Portal */}
            <Route path="customers" element={<Customers />} />
            <Route path="customers/:id" element={<CustomerDetail />} />
            <Route path="subscriptions" element={<Subscriptions />} />
            <Route path="packages" element={<Packages />} />
            <Route path="orders" element={<Orders />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="vouchers" element={<Vouchers />} />
            <Route path="support" element={<Support />} />

            {/* Analytics */}
            <Route path="analytics" element={<Analytics />} />
            <Route path="telegram" element={<TelegramSettings />} />

            {/* System */}
            <Route path="system-logs" element={<SystemLogs />} />
            <Route path="backup" element={<Backup />} />
            <Route path="hotspot/templates" element={<HotspotTemplates />} />
            <Route path="activity" element={<Activity />} />
            <Route path="settings" element={<Settings />} />
            <Route path="users" element={<Users />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
