import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Sidebar } from '@/components/Sidebar';
import AnchorItems from '@/pages/AnchorItems';
import ItemPairings from '@/pages/ItemPairings';
import CompletionRules from '@/pages/CompletionRules';
import AovView from '@/pages/AovView';
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
      <Toaster richColors position="top-right" />
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/curation/anchors" replace />} />
          <Route path="/curation/anchors" element={<AnchorItems />} />
          <Route path="/curation/pairings" element={<ItemPairings />} />
          <Route path="/curation/rules" element={<CompletionRules />} />
          <Route path="/curation/aov" element={<AovView />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
