import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { FeatureGate } from '@/components/FeatureGate';

const RESTAURANT_ID = import.meta.env.VITE_RESTAURANT_ID as string;

type DateRange = '7d' | '14d' | 'all';

interface CohortRow {
  treatment_n: number | null;
  treatment_avg_total: number | null;
  treatment_stddev: number | null;
  control_n: number | null;
  control_avg_total: number | null;
  control_stddev: number | null;
  delta: number | null;
  t_stat: number | null;
  p_value: number | null;
}

function dateRangeParams(range: DateRange): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString();
  if (range === '7d') {
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    return { start, end };
  }
  if (range === '14d') {
    const start = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    return { start, end };
  }
  // all time — use epoch start
  return { start: '2000-01-01T00:00:00Z', end };
}

export default function AovView() {
  const [data, setData] = useState<CohortRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<DateRange>('7d');

  const fetchCohort = useCallback(async (r: DateRange) => {
    setLoading(true);
    const { start, end } = dateRangeParams(r);
    const { data: rows } = await supabase.rpc('recommendation_aov_lift_cohort', {
      p_restaurant_id: RESTAURANT_ID,
      p_start_at: start,
      p_end_at: end,
    });
    setData((rows as CohortRow[] | null)?.[0] ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCohort(range);
  }, [range, fetchCohort]);

  const bothOver30 =
    (data?.treatment_n ?? 0) > 30 && (data?.control_n ?? 0) > 30;

  const fmt = (v: number | null, prefix = '', suffix = '') =>
    v == null ? '—' : `${prefix}${v}${suffix}`;

  return (
    <FeatureGate requiredProvider="tabletot">
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">A/B AOV Lift</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Treatment vs. control cohort comparison (Welch's t). Treatment tables see recommendations; control tables don't.
            </p>
          </div>
          <div className="flex gap-2">
            {(['7d', '14d', 'all'] as DateRange[]).map((r) => (
              <Button
                key={r}
                variant={range === r ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRange(r)}
              >
                {r === '7d' ? 'Last 7d' : r === '14d' ? 'Last 14d' : 'All time'}
              </Button>
            ))}
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle>Cohort Summary</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : !data || (data.treatment_n === 0 && data.control_n === 0) ? (
              <p className="text-muted-foreground text-sm py-4 text-center">
                No orders yet in this date range.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg border p-4 space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Treatment</p>
                    <p className="text-2xl font-bold">{fmt(data.treatment_n)}</p>
                    <p className="text-sm text-muted-foreground">tickets</p>
                    <p className="text-lg font-semibold mt-2">{fmt(data.treatment_avg_total, '₹')}</p>
                    <p className="text-xs text-muted-foreground">avg order value</p>
                    {data.treatment_stddev != null && (
                      <p className="text-xs text-muted-foreground">σ = ₹{data.treatment_stddev}</p>
                    )}
                  </div>
                  <div className="rounded-lg border p-4 space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Control</p>
                    <p className="text-2xl font-bold">{fmt(data.control_n)}</p>
                    <p className="text-sm text-muted-foreground">tickets</p>
                    <p className="text-lg font-semibold mt-2">{fmt(data.control_avg_total, '₹')}</p>
                    <p className="text-xs text-muted-foreground">avg order value</p>
                    {data.control_stddev != null && (
                      <p className="text-xs text-muted-foreground">σ = ₹{data.control_stddev}</p>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border p-4 grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Delta</p>
                    <p className={`text-xl font-bold ${(data.delta ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {data.delta != null ? `${data.delta >= 0 ? '+' : ''}₹${data.delta}` : '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">treatment − control</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">t-statistic</p>
                    <p className="text-xl font-bold">{fmt(data.t_stat)}</p>
                    <p className="text-xs text-muted-foreground">Welch's t</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">p-value</p>
                    {bothOver30 ? (
                      <>
                        <p className="text-xl font-bold">{fmt(data.p_value)}</p>
                        <p className="text-xs text-muted-foreground">two-tailed</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-muted-foreground">—</p>
                        <p className="text-xs text-muted-foreground">
                          Too few tickets for reliable p-value — use t-stat direction only.
                          (n&gt;30 required; treatment={data.treatment_n ?? 0}, control={data.control_n ?? 0})
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </FeatureGate>
  );
}
