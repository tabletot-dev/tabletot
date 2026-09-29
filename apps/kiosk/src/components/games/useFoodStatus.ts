import { useMemo } from "react";
import { useKitchenStatus, STATUS_STAGE } from "@/hooks/useKitchenStatus";
import { useKotTickets } from "@/hooks/useKotTickets";
import { useMenu } from "@/lib/menuStore";
import { computeEta } from "@/lib/eta";

/** Kitchen status for the "while you wait" screens: the pill text and whether the food is ready. */
export function useFoodStatus(orderId: string | null) {
  const { items } = useMenu();
  const kitchen = useKitchenStatus(orderId);
  const tickets = useKotTickets(orderId);
  const eta = useMemo(() => computeEta(tickets, items), [tickets, items]);
  const ready = kitchen === "ready" || kitchen === "served";
  const status =
    orderId && kitchen !== "unknown"
      ? `${STATUS_STAGE[kitchen].label}${eta && !ready ? ` · ~${eta} min` : ""}`
      : null;
  return { status, ready };
}
