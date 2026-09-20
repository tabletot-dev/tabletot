import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Sidebar } from '@/components/Sidebar';
import AnchorItems from '@/pages/AnchorItems';
import ItemPairings from '@/pages/ItemPairings';
import CompletionRules from '@/pages/CompletionRules';
import AovView from '@/pages/AovView';
import AdsView from '@/pages/AdsView';
import Login from '@/pages/Login';
import './index.css';

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster richColors position="top-right" />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute requireAdmin>
                <Layout>
                  <Routes>
                    <Route path="/" element={<Navigate to="/curation/anchors" replace />} />
                    <Route path="/curation/anchors" element={<AnchorItems />} />
                    <Route path="/curation/pairings" element={<ItemPairings />} />
                    <Route path="/curation/rules" element={<CompletionRules />} />
                    <Route path="/curation/aov" element={<AovView />} />
                    <Route path="/curation/ads" element={<AdsView />} />
                  </Routes>
                </Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
