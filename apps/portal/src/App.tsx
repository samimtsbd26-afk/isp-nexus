import { useState } from "react";
import { Routes, Route, Navigate } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import PortalPackages from "./pages/Packages";
import Payment from "./pages/Payment";
import Orders from "./pages/Orders";
import Profile from "./pages/Profile";

function RequirePortalAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("isp_portal_token");
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  const [qc] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={qc}>
      <Toaster richColors position="top-right" />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<RequirePortalAuth><Dashboard /></RequirePortalAuth>} />
        <Route path="/packages" element={<RequirePortalAuth><PortalPackages /></RequirePortalAuth>} />
        <Route path="/payment" element={<RequirePortalAuth><Payment /></RequirePortalAuth>} />
        <Route path="/orders" element={<RequirePortalAuth><Orders /></RequirePortalAuth>} />
        <Route path="/profile" element={<RequirePortalAuth><Profile /></RequirePortalAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </QueryClientProvider>
  );
}
