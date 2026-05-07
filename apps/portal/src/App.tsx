import { useState } from "react";
import { Routes, Route, Navigate } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Packages from "./pages/Packages";
import Payment from "./pages/Payment";
import Orders from "./pages/Orders";
import Profile from "./pages/Profile";

function RequirePortalAuth({ children }: Readonly<{ children: React.ReactNode }>) {
  const token = localStorage.getItem("isp_portal_token");
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  const [qc] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: 1 } },
  }));

  return (
    <QueryClientProvider client={qc}>
      <Toaster richColors position="top-center" toastOptions={{ style: { background: "rgba(15,23,42,0.95)", border: "1px solid rgba(6,182,212,0.2)", color: "#e2e8f0" } }} />
      <Routes>
        <Route path="/welcome" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/packages" element={<Packages />} />
        <Route path="/" element={<RequirePortalAuth><Dashboard /></RequirePortalAuth>} />
        <Route path="/payment" element={<RequirePortalAuth><Payment /></RequirePortalAuth>} />
        <Route path="/orders" element={<RequirePortalAuth><Orders /></RequirePortalAuth>} />
        <Route path="/profile" element={<RequirePortalAuth><Profile /></RequirePortalAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </QueryClientProvider>
  );
}
