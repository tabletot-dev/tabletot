import type { Json } from "@/integrations/supabase/types";
import type { OrderItem } from "@/data/menu";

export interface CompletionRule {
  rule_name: string;
  condition: Json | null;
  suggestion: Json | null;
}

export interface MatchedSuggestion {
  text: string;
  itemId: string;
}

function evalCondition(condition: Json, order: OrderItem[]): boolean {
  if (!condition || typeof condition !== "object" || Array.isArray(condition)) return false;
  const c = condition as Record<string, unknown>;
  if (typeof c.has_category === "string") {
    return order.some((item) => item.category === c.has_category);
  }
  if (typeof c.missing_category === "string") {
    return !order.some((item) => item.category === c.missing_category);
  }
  return false;
}

export function findMatchingRule(
  rules: CompletionRule[],
  order: OrderItem[]
): MatchedSuggestion | null {
  for (const rule of rules) {
    if (!rule.condition || !rule.suggestion) continue;
    if (!evalCondition(rule.condition, order)) continue;

    const s = rule.suggestion as Record<string, unknown>;
    if (typeof s.text !== "string" || typeof s.item_id !== "string") continue;

    return { text: s.text, itemId: s.item_id };
  }
  return null;
}
