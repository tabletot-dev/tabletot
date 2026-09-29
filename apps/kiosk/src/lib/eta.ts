import type { MenuItem } from "@/data/menu";
import { KOT_ACTIVE, type KotTicket } from "@/hooks/useKotTickets";

/**
 * Longest prep time (menu_items.facts.prep_minutes) among items on tickets still
 * cooking. Deliberately a fixed number, not a countdown: it only changes when the
 * kitchen moves a ticket or a new order arrives. null when nothing is cooking or
 * no cooking item has a prep time. Shared by Waiting and the Games screens.
 */
export function computeEta(tickets: KotTicket[], menu: MenuItem[]): number | null {
  const prepById = new Map(menu.map((m) => [m.id, m.prepMinutes]));
  const longest = tickets
    .filter((t) => KOT_ACTIVE.includes(t.status))
    .flatMap((t) => t.items.map((i) => prepById.get(i.id) ?? 0));
  const max = Math.max(0, ...longest);
  return max > 0 ? max : null;
}
