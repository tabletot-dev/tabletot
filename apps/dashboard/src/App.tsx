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
import MenuItems from '@/pages/MenuItems';
import Venue from '@/pages/Venue';
import Login from '@/pages/Login';
import { useReloadOnDeploy } from '@/lib/reloadOnDeploy';
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
  // Never auto-reloads (forms may have unsaved edits); offers a refresh instead.
  const updateAvailable = useReloadOnDeploy();
  return (
    <BrowserRouter>
      {updateAvailable && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md bg-black px-4 py-2 text-sm text-white shadow-lg">
          A new version is available.{' '}
          <button className="underline" onClick={() => window.location.reload()}>Refresh</button>
        </div>
      )}
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
                    <Route path="/menu" element={<MenuItems />} />
                    <Route path="/venue" element={<Venue />} />
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
