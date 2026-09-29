import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { FeatureGate } from '@/components/FeatureGate';
import { configToForm, formToConfig, parseGst, type Config, type VenueForm } from '@/lib/venueForm';

const RESTAURANT_ID = import.meta.env.VITE_RESTAURANT_ID as string;
const textarea = 'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const readConfig = () =>
  supabase.from('restaurants').select('config').eq('id', RESTAURANT_ID).single();

export default function Venue() {
  const [form, setForm] = useState<VenueForm>(configToForm(null));
  const [gst, setGst] = useState('5');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      // GST is the same shared row POS → Settings edits (restaurant_id null).
      const [cfg, gstRow] = await Promise.all([
        readConfig(),
        supabase.from('restaurant_settings').select('value').eq('key', 'gst_rate').is('restaurant_id', null).maybeSingle(),
      ]);
      if (cfg.error) toast.error('Error loading venue settings');
      else setForm(configToForm(cfg.data.config as Config | null));
      if (gstRow.data?.value) setGst(gstRow.data.value);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    const gstNum = parseGst(gst);
    if (gstNum === null) { toast.error('GST rate must be a number from 0 to 100'); return; }
    setSaving(true);
    // Re-read just before writing so a change made elsewhere isn't overwritten.
    const { data, error: readError } = await readConfig();
    if (readError) { toast.error('Save failed: ' + readError.message); setSaving(false); return; }
    const cfgWrite = await supabase.from('restaurants')
      .update({ config: formToConfig(data.config as Config | null, form) as never })
      .eq('id', RESTAURANT_ID);
    // Not upsert: the unique index on `key` is partial (WHERE restaurant_id IS NULL),
    // which ON CONFLICT can't target. Update the shared row, insert it if missing.
    const value = String(gstNum);
    let gstWrite = await supabase.from('restaurant_settings')
      .update({ value }).eq('key', 'gst_rate').is('restaurant_id', null).select('id');
    if (!gstWrite.error && gstWrite.data.length === 0) {
      gstWrite = await supabase.from('restaurant_settings').insert({ key: 'gst_rate', value }).select('id');
    }
    setSaving(false);
    const err = cfgWrite.error ?? gstWrite.error;
    if (err) toast.error('Save failed: ' + err.message);
    else toast.success('Saved — the kiosk picks this up the next time it reloads');
  };

  const text = (key: keyof VenueForm) => ({
    id: key,
    value: form[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [key]: e.target.value }),
  });

  return (
    <FeatureGate requiredProvider="tabletot">
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Venue</h1>
          <p className="text-muted-foreground text-sm mt-1">
            The About screen, the Wi-Fi QR, and a few kiosk switches. Blank fields fall back to the kiosk's default or are hidden.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : (
          <>
            <Card>
              <CardHeader><CardTitle>Venue details</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5"><Label htmlFor="hours">Opening hours</Label><Input placeholder="11 AM - 11 PM, every day" {...text('hours')} /></div>
                <div className="space-y-1.5"><Label htmlFor="chef_name">Chef name</Label><Input {...text('chef_name')} /></div>
                <div className="space-y-1.5"><Label htmlFor="chef_note">Chef note</Label><textarea rows={3} className={textarea} {...text('chef_note')} /></div>
                <div className="space-y-1.5"><Label htmlFor="address">Street address</Label><Input {...text('address')} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5"><Label htmlFor="wifi_ssid">Wi-Fi name</Label><Input {...text('wifi_ssid')} /></div>
                  <div className="space-y-1.5">
                    <Label htmlFor="wifi_password">Wi-Fi password</Label>
                    <Input placeholder="blank = open network" {...text('wifi_password')} />
                  </div>
                </div>
                <div className="space-y-1.5 max-w-[200px]">
                  <Label htmlFor="gst">GST rate (%)</Label>
                  <Input id="gst" type="number" min="0" max="100" step="any" value={gst} onChange={(e) => setGst(e.target.value)} />
                  <p className="text-xs text-muted-foreground">Same setting as POS → Settings.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Kiosk switches</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="voice_enabled">Voice ordering</Label>
                  <Switch id="voice_enabled" checked={form.voice_enabled} onCheckedChange={(v) => setForm({ ...form, voice_enabled: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="prompt_for_identity">Ask for a name on the order</Label>
                  <Switch id="prompt_for_identity" checked={form.prompt_for_identity} onCheckedChange={(v) => setForm({ ...form, prompt_for_identity: v })} />
                </div>
              </CardContent>
            </Card>

            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button>
          </>
        )}
      </div>
    </FeatureGate>
  );
}
