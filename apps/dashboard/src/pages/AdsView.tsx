import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Trash2, ChevronUp, ChevronDown, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { FeatureGate } from '@/components/FeatureGate';

const RESTAURANT_ID = import.meta.env.VITE_RESTAURANT_ID as string;

interface AdRow {
  id: string;
  image_url: string;
  title: string | null;
  sort_order: number;
  active: boolean;
}

// .tt-status-promo-media (apps/kiosk/src/styles/tabletot.css) is flex: 1 1 auto —
// it stretches to fill whatever space is left below the order-status card and
// action buttons, so its real ratio varies with order length, device height, and
// which optional buttons render. This is a live-measured value (760x616.75px,
// via getBoundingClientRect on a real WaitingView render, 2-item order, 800x1280
// reference viewport) — a representative approximation, not an exact bound.
const KIOSK_AD_ASPECT_RATIO = 760 / 616.75;

export default function AdsView() {
  const [ads, setAds] = useState<AdRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clearPending = () => {
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    setPendingFile(null);
    setPendingPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const fetchAds = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('ads')
      .select('id, image_url, title, sort_order, active')
      .eq('restaurant_id', RESTAURANT_ID)
      .order('sort_order');
    if (error) toast.error('Error loading ads');
    if (data) setAds(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAds(); }, [fetchAds]);

  const addAd = async (file: File) => {
    setUploading(true);
    const path = `${RESTAURANT_ID}/${crypto.randomUUID()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from('ads').upload(path, file);
    if (uploadError) {
      toast.error('Upload failed: ' + uploadError.message);
      setUploading(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from('ads').getPublicUrl(path);
    const maxSort = ads.reduce((m, a) => Math.max(m, a.sort_order), -1);
    const { error } = await supabase.from('ads').insert({
      restaurant_id: RESTAURANT_ID,
      image_url: publicUrl,
      title: newTitle || null,
      sort_order: maxSort + 1,
      active: true,
    });
    if (error) toast.error('Failed to add ad: ' + error.message);
    else { toast.success('Ad added'); setNewTitle(''); }
    setUploading(false);
    clearPending();
    fetchAds();
  };

  const toggleActive = async (id: string, active: boolean) => {
    const { error } = await supabase.from('ads').update({ active }).eq('id', id);
    if (error) toast.error('Update failed');
    else fetchAds();
  };

  const deleteAd = async (id: string) => {
    if (!confirm('Delete this ad?')) return;
    const { error } = await supabase.from('ads').delete().eq('id', id);
    if (error) toast.error('Delete failed');
    else fetchAds();
  };

  const moveSortOrder = async (id: string, direction: 'up' | 'down') => {
    const idx = ads.findIndex((a) => a.id === id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= ads.length) return;
    const a = ads[idx];
    const b = ads[swapIdx];
    const [resA, resB] = await Promise.all([
      supabase.from('ads').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('ads').update({ sort_order: a.sort_order }).eq('id', b.id),
    ]);
    if (resA.error || resB.error) {
      toast.error('Failed to reorder — reloading current state.');
    }
    fetchAds();
  };

  return (
    <FeatureGate requiredProvider="tabletot">
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Ads</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Images shown in rotation on the kiosk's waiting screen while a customer's order is being prepared.
          </p>
        </div>

        <Card>
          <CardHeader><CardTitle>Current Ads</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Image</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ads.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-6">
                        No ads yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {ads.map((row, idx) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <img src={row.image_url} alt={row.title ?? 'Ad'} className="h-12 w-20 rounded object-cover" />
                      </TableCell>
                      <TableCell className="font-medium">{row.title ?? '—'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={idx === 0} onClick={() => moveSortOrder(row.id, 'up')}>
                            <ChevronUp className="h-3 w-3" />
                          </Button>
                          <span className="w-6 text-center text-sm">{row.sort_order}</span>
                          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={idx === ads.length - 1} onClick={() => moveSortOrder(row.id, 'down')}>
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Switch checked={row.active} onCheckedChange={(v) => toggleActive(row.id, v)} />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteAd(row.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center gap-2 pt-2">
                <div className="flex-1">
                  <Input
                    placeholder="Title (optional)"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    maxLength={40}
                  />
                  {newTitle && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Preview: <span className="font-medium text-foreground">While you wait — {newTitle}</span>
                    </p>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
                    setPendingFile(file);
                    setPendingPreviewUrl(URL.createObjectURL(file));
                  }}
                />
                <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Upload Image
                </Button>
              </div>

              {pendingPreviewUrl && (
                <div className="space-y-2">
                  <div
                    className="w-full rounded border"
                    style={{
                      aspectRatio: KIOSK_AD_ASPECT_RATIO,
                      backgroundImage: `url(${pendingPreviewUrl})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Approximate crop for a typical order. On shorter waits or larger
                    screens it'll show more of the image; on busier order screens it'll
                    show less, down to a thin banner.
                  </p>
                  <div className="flex gap-2">
                    <Button onClick={() => pendingFile && addAd(pendingFile)} disabled={uploading}>
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Add this ad
                    </Button>
                    <Button variant="outline" onClick={clearPending} disabled={uploading}>
                      Choose a different image
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </FeatureGate>
  );
}
