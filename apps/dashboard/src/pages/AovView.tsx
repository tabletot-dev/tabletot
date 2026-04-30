import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';
import { FeatureGate } from '@/components/FeatureGate';

interface AovLiftRow {
  pattern_type: string | null;
  total_shown: number | null;
  accepted: number | null;
  acceptance_rate_pct: number | null;
  avg_cart_when_accepted: number | null;
  avg_cart_when_rejected: number | null;
  aov_lift_estimate: number | null;
}

export default function AovView() {
  const [rows, setRows] = useState<AovLiftRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const { data } = await supabase.from('recommendation_aov_lift').select('*');
    setRows((data as AovLiftRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch();
    const interval = setInterval(fetch, 30_000);
    return () => clearInterval(interval);
  }, [fetch]);

  return (
    <FeatureGate requiredProvider="tabletot">
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">AOV Lift</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Recommendation effectiveness — acceptance rates and estimated AOV lift per pattern. Refreshes every 30 s.
          </p>
        </div>

        <Card>
          <CardHeader><CardTitle>Measurement</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : rows.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">
                No data yet. Data appears after the first recommendation is shown on the kiosk.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pattern</TableHead>
                    <TableHead className="text-right">Shown</TableHead>
                    <TableHead className="text-right">Accepted</TableHead>
                    <TableHead className="text-right">Acceptance rate</TableHead>
                    <TableHead className="text-right">AOV lift estimate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.pattern_type ?? 'null'}>
                      <TableCell className="font-medium">{row.pattern_type ?? '—'}</TableCell>
                      <TableCell className="text-right">{row.total_shown ?? 0}</TableCell>
                      <TableCell className="text-right">{row.accepted ?? 0}</TableCell>
                      <TableCell className="text-right">
                        {row.acceptance_rate_pct != null ? `${row.acceptance_rate_pct}%` : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.aov_lift_estimate != null ? `₹${row.aov_lift_estimate}` : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </FeatureGate>
  );
}
