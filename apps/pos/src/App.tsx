import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { ConfirmDialogHost } from "@/hooks/use-confirm";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Layout } from "@/components/Layout";
import Auth from "./pages/Auth";
import Billing from "./pages/Billing";
import Menu from "./pages/Menu";
import Orders from "./pages/Orders";
import Kitchen from "./pages/Kitchen";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import TableManagement from "./pages/TableManagement";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <ConfirmDialogHost />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />

            {/* / → always redirect to billing */}
            <Route path="/" element={<Navigate to="/billing" replace />} />

            {/* Staff + above */}
            <Route path="/billing" element={
              <ProtectedRoute><Layout><Billing /></Layout></ProtectedRoute>
            } />
            <Route path="/kitchen" element={
              <ProtectedRoute><Layout><Kitchen /></Layout></ProtectedRoute>
            } />
            <Route path="/orders" element={
              <ProtectedRoute><Layout><Orders /></Layout></ProtectedRoute>
            } />

            {/* Manager + above */}
            <Route path="/tables" element={
              <ProtectedRoute allowedRoles={['manager', 'admin']}>
                <Layout><TableManagement /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/reports" element={
              <ProtectedRoute allowedRoles={['manager', 'admin']}>
                <Layout><Reports /></Layout>
              </ProtectedRoute>
            } />

            {/* Admin only */}
            <Route path="/menu" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <Layout><Menu /></Layout>
              </ProtectedRoute>
            } />
            <Route path="/settings" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <Layout><Settings /></Layout>
              </ProtectedRoute>
            } />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
