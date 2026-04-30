import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';
import { FeatureGate } from '@/components/FeatureGate';

const RESTAURANT_ID = import.meta.env.VITE_RESTAURANT_ID as string;

interface MealRuleRow {
  id: string;
  rule_name: string;
  priority: number | null;
  active: boolean | null;
  condition: unknown;
  suggestion: unknown;
}

export default function CompletionRules() {
  const [rules, setRules] = useState<MealRuleRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('meal_completion_rules')
      .select('id, rule_name, priority, active, condition, suggestion')
      .eq('restaurant_id', RESTAURANT_ID)
      .order('priority', { ascending: false });
    if (data) setRules(data as MealRuleRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  return (
    <FeatureGate requiredProvider="tabletot">
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Meal Completion Rules</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Rules that suggest an upsell item when a customer is about to place their order.
            Edit rules directly in Supabase Studio for now — a rule editor UI is planned.
          </p>
        </div>

        <Card>
          <CardHeader><CardTitle>Rules</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rule name</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead>Suggestion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-6">
                        No meal completion rules yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {rules.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.rule_name}</TableCell>
                      <TableCell>{row.priority ?? 0}</TableCell>
                      <TableCell>
                        <Badge variant={row.active ? 'default' : 'secondary'}>
                          {row.active ? 'active' : 'inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <pre className="text-xs text-muted-foreground max-w-[200px] truncate">
                          {row.condition ? JSON.stringify(row.condition) : '—'}
                        </pre>
                      </TableCell>
                      <TableCell>
                        <pre className="text-xs text-muted-foreground max-w-[200px] truncate">
                          {row.suggestion ? JSON.stringify(row.suggestion) : '—'}
                        </pre>
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
