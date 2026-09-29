// Pure helpers for the Completion Rules screen. No imports, so `pnpm test` runs them under node.
// The kiosk (apps/kiosk/src/lib/completionRules.ts) understands exactly two conditions,
// {has_category} and {missing_category}, and a suggestion of {text, item_id}.

export type Kind = 'has_category' | 'missing_category';

export interface RuleForm {
  rule_name: string;
  kind: Kind;
  category: string;
  item_id: string;
  text: string;
  priority: string;
  active: boolean;
}

export interface RuleRow {
  rule_name: string;
  priority: number | null;
  active: boolean | null;
  condition: unknown;
  suggestion: unknown;
}

export const emptyRuleForm = (): RuleForm => ({
  rule_name: '', kind: 'has_category', category: '', item_id: '', text: '', priority: '0', active: true,
});

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

// null = a shape this form can't express (extra keys, unknown condition): those
// rules stay editable only in Supabase Studio, so saving here never drops keys.
export function ruleToForm(r: RuleRow): RuleForm | null {
  const c = obj(r.condition);
  const s = obj(r.suggestion);
  if (!c || !s || Object.keys(c).length !== 1 || Object.keys(s).length !== 2) return null;
  const kind = (['has_category', 'missing_category'] as const).find((k) => typeof c[k] === 'string');
  if (!kind || typeof s.text !== 'string' || typeof s.item_id !== 'string') return null;
  return {
    rule_name: r.rule_name, kind, category: c[kind] as string, item_id: s.item_id,
    text: s.text, priority: String(r.priority ?? 0), active: r.active ?? true,
  };
}

export function formToRule(f: RuleForm) {
  return {
    rule_name: f.rule_name.trim(),
    condition: { [f.kind]: f.category },
    suggestion: { text: f.text.trim(), item_id: f.item_id },
    priority: Number(f.priority),
    active: f.active,
  };
}

export function ruleError(f: RuleForm): string | null {
  if (!f.rule_name.trim()) return 'Give the rule a name';
  if (!f.category) return 'Pick a category';
  if (!f.item_id) return 'Pick the item to suggest';
  if (!f.text.trim()) return 'Write the nudge text';
  if (f.priority.trim() === '' || !Number.isInteger(Number(f.priority))) return 'Priority must be a whole number';
  return null;
}
