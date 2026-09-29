import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Save, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface SettingRow {
  key: string;
  value: string;
}

const KEYS = ['restaurant_name', 'gst_rate', 'currency_symbol'] as const;
type SettingKey = typeof KEYS[number];

const DEFAULTS: Record<SettingKey, string> = {
  restaurant_name: '',
  gst_rate: '5',
  currency_symbol: '₹',
};

export default function Settings() {
  const [values, setValues] = useState<Record<SettingKey, string>>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from('restaurant_settings')
      .select('key, value')
      .in('key', [...KEYS])
      .is('restaurant_id', null)
      .then(({ data, error }) => {
        if (error) {
          toast({ title: 'Error loading settings', description: error.message, variant: 'destructive' });
        } else {
          const next = { ...DEFAULTS };
          (data as SettingRow[] || []).forEach(({ key, value }) => {
            if (KEYS.includes(key as SettingKey)) next[key as SettingKey] = value;
          });
          setValues(next);
        }
        setLoading(false);
      });
  }, []);

  const set = (key: SettingKey) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSave = async () => {
    const gstNum = parseFloat(values.gst_rate);
    if (isNaN(gstNum) || gstNum < 0 || gstNum > 100) {
      toast({ title: 'Invalid GST rate', description: 'Must be between 0 and 100', variant: 'destructive' });
      return;
    }
    setSaving(true);
    // Not upsert: the unique index on `key` is partial (WHERE restaurant_id IS NULL),
    // which ON CONFLICT can't target — upsert failed for every save. Update the
    // shared row per key, insert it if missing.
    let error = null;
    for (const key of KEYS) {
      const res = await supabase
        .from('restaurant_settings')
        .update({ value: values[key] })
        .eq('key', key)
        .is('restaurant_id', null)
        .select('id');
      const write = !res.error && res.data.length === 0
        ? await supabase.from('restaurant_settings').insert({ key, value: values[key] })
        : res;
      if (write.error) { error = write.error; break; }
    }

    if (error) {
      toast({ title: 'Error saving settings', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Settings saved' });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">Stored in the database — applies to all devices</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Restaurant</CardTitle>
          <CardDescription>Displayed on receipts and the kiosk</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Restaurant Name</Label>
            <Input value={values.restaurant_name} onChange={set('restaurant_name')} placeholder="Silver Specialty Coffee" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tax & Currency</CardTitle>
          <CardDescription>Applied on every bill across the kiosk and POS</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>GST Rate (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={values.gst_rate}
                onChange={set('gst_rate')}
                placeholder="5"
              />
            </div>
            <div className="space-y-2">
              <Label>Currency Symbol</Label>
              <Input value={values.currency_symbol} onChange={set('currency_symbol')} placeholder="₹" />
            </div>
          </div>
          <Separator />
          <p className="text-xs text-muted-foreground">
            Changes take effect on the next page load in the kiosk and POS billing screen.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
