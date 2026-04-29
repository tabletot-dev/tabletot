import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Layout } from "@/components/Layout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import POS from "./pages/POS";
import Billing from "./pages/Billing";
import POSBilling from "./pages/POSBilling";
import Menu from "./pages/Menu";
import Orders from "./pages/Orders";
import Kitchen from "./pages/Kitchen";
import StaffManagement from "./pages/StaffManagement";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import TableManagement from "./pages/TableManagement";
import AdminCategories from "./pages/AdminCategories";
import AdminMenuItems from "./pages/AdminMenuItems";
import RecommendationCuration from "./pages/RecommendationCuration";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Dashboard />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/billing"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Billing />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/pos"
              element={
                <ProtectedRoute>
                  <Layout>
                    <POS />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/pos-billing"
              element={
                <ProtectedRoute>
                  <POSBilling />
                </ProtectedRoute>
              }
            />
            <Route
              path="/menu"
              element={
                <ProtectedRoute allowedRoles={['admin', 'manager']}>
                  <Layout>
                    <Menu />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/orders"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Orders />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/categories"
              element={
                <ProtectedRoute allowedRoles={['admin', 'manager']}>
                  <Layout>
                    <AdminCategories />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/menu-items"
              element={
                <ProtectedRoute allowedRoles={['admin', 'manager']}>
                  <Layout>
                    <AdminMenuItems />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/kitchen"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Kitchen />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/staff"
              element={
                <ProtectedRoute allowedRoles={['admin', 'manager']}>
                  <Layout>
                    <StaffManagement />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports"
              element={
                <ProtectedRoute allowedRoles={['admin', 'manager']}>
                  <Layout>
                    <Reports />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/tables"
              element={
                <ProtectedRoute allowedRoles={['admin', 'manager']}>
                  <Layout>
                    <TableManagement />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute allowedRoles={['admin', 'manager']}>
                  <Layout>
                    <Settings />
                  </Layout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/recommendations"
              element={
                <ProtectedRoute allowedRoles={['admin', 'manager']}>
                  <Layout>
                    <RecommendationCuration />
                  </Layout>
                </ProtectedRoute>
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
