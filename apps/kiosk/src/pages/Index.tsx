import { useCallback, useRef, useState } from "react";
import { useDeviceNavigation } from "@/hooks/useDeviceNavigation";
import IdleScreen from "@/components/screens/IdleScreen";
import ListeningScreen from "@/components/screens/ListeningScreen";
import MenuScreen from "@/components/screens/MenuScreen";
import ItemDetailScreen from "@/components/screens/ItemDetailScreen";
import OrderSummaryScreen from "@/components/screens/OrderSummaryScreen";
import BillSummaryScreen from "@/components/screens/BillSummaryScreen";
import OrderConfirmationScreen from "@/components/screens/OrderConfirmationScreen";
import SessionIdleScreen from "@/components/screens/SessionIdleScreen";
import PairingNudge from "@/components/PairingNudge";
import CompletionNudge from "@/components/CompletionNudge";
import VoiceOrderButton from "@/components/VoiceOrderButton";
import { supabase } from "@/integrations/supabase/client";
import { findMatchingRule, type CompletionRule, type MatchedSuggestion } from "@/lib/completionRules";
import { useMenu } from "@/lib/menuStore";
import type { DoneMessage, OrderSnapshot } from "@/lib/voice/types";
import { MenuItem } from "@/data/menu";

// TODO: set to Silver Specialty Coffee UUID — run: SELECT id FROM restaurants WHERE name = 'Silver Specialty Coffee';
const RESTAURANT_ID = import.meta.env.VITE_RESTAURANT_ID as string;
// One tablet = one table. Matches restaurant_tables.table_number used in order submission.
const TABLE_ID = "T1";

// Normalize item names for matching: lowercase, collapse dashes/en-dashes to space
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim();
}

interface NudgeState {
  itemId: string;
  itemName: string;
  cartValueAtShow: number;
}

const Index = () => {
  const {
    currentScreen,
    setCurrentScreen,
    selectedItem,
    setSelectedItem,
    order,
    setOrder,
    addToOrder,
    updateQuantity,
    removeItem,
    confirmOrder,
    totalBill,
    sessionTotal,
    previousOrders,
    setPreviousOrders,
  } = useDeviceNavigation();

  // Menu items for voice → cart matching
  const { items: menuItems } = useMenu();

  const [nudge, setNudge] = useState<NudgeState | null>(null);
  const [completionSuggestion, setCompletionSuggestion] = useState<MatchedSuggestion | null>(null);

  // Track backend order snapshot to diff additions/removals per voice turn
  const prevVoiceOrderRef = useRef<OrderSnapshot | null>(null);

  const handleAddToOrderWithNudge = useCallback(
    (item: MenuItem) => {
      const cartValueAtShow = order.reduce((s, o) => s + o.price * o.quantity, 0);
      addToOrder(item);
      setNudge({ itemId: item.id, itemName: item.name, cartValueAtShow });
    },
    [order, addToOrder],
  );

  // Reconcile kiosk cart with backend voice order snapshot after each turn
  const handleVoiceDone = useCallback(
    (msg: DoneMessage) => {
      const prev = prevVoiceOrderRef.current;
      const next = msg.order;
      prevVoiceOrderRef.current = next;

      for (const nextItem of next.items) {
        const prevQty = prev?.items.find((i) => i.item_id === nextItem.item_id)?.quantity ?? 0;
        const delta = nextItem.quantity - prevQty;
        if (delta === 0) continue;

        // Find kiosk MenuItem by normalized name
        const normalized = normalizeName(nextItem.item_name);
        const kioskItem = menuItems.find((m) => normalizeName(m.name) === normalized);
        if (!kioskItem) continue;

        if (delta > 0) {
          // Item added or quantity increased via voice
          const cartValueAtShow = order.reduce((s, o) => s + o.price * o.quantity, 0);
          addToOrder(kioskItem, delta);
          setNudge({ itemId: kioskItem.id, itemName: kioskItem.name, cartValueAtShow });
        } else {
          // Item removed or quantity decreased via voice
          const newQty = (order.find((o) => o.id === kioskItem.id)?.quantity ?? 0) + delta;
          if (newQty <= 0) {
            removeItem(kioskItem.id);
          } else {
            updateQuantity(kioskItem.id, delta);
          }
        }
      }

      // Items present in prev but absent from next → removed by voice
      if (prev) {
        for (const prevItem of prev.items) {
          const stillExists = next.items.find((i) => i.item_id === prevItem.item_id);
          if (!stillExists) {
            const normalized = normalizeName(prevItem.item_name);
            const kioskItem = menuItems.find((m) => normalizeName(m.name) === normalized);
            if (kioskItem) removeItem(kioskItem.id);
          }
        }
      }

      // Navigate to order-summary if items were added and user is on menu/item-detail
      if (
        msg.resolver.some((r) => r.type === "match") &&
        (currentScreen === "menu" || currentScreen === "item-detail")
      ) {
        setCurrentScreen("order-summary");
      }
    },
    [
      menuItems,
      order,
      addToOrder,
      updateQuantity,
      removeItem,
      currentScreen,
      setCurrentScreen,
    ],
  );

  const handleSelectItem = useCallback(
    (item: MenuItem) => {
      setSelectedItem(item);
      setCurrentScreen("item-detail");
    },
    [setSelectedItem, setCurrentScreen],
  );

  const handleAddToOrder = useCallback(() => {
    if (selectedItem) {
      handleAddToOrderWithNudge(selectedItem);
      setCurrentScreen("order-summary");
    }
  }, [selectedItem, handleAddToOrderWithNudge, setCurrentScreen]);

  const handleConfirmOrder = useCallback(async () => {
    try {
      const { data: rules } = await supabase
        .from("meal_completion_rules")
        .select("rule_name, condition, suggestion")
        .eq("restaurant_id", RESTAURANT_ID)
        .eq("active", true)
        .order("priority", { ascending: false });

      const match = findMatchingRule((rules ?? []) as CompletionRule[], order);
      if (match) {
        setCompletionSuggestion(match);
        return;
      }
    } catch {
      // DB error — fall through to submit
    }
    confirmOrder();
  }, [order, confirmOrder]);

  const showVoiceButton = !["idle", "listening", "order-confirmation"].includes(currentScreen);

  const renderScreen = () => {
    switch (currentScreen) {
      case "idle":
        return <IdleScreen onActivate={() => setCurrentScreen("menu")} />;
      case "listening":
        return <ListeningScreen onDone={() => setCurrentScreen("menu")} />;
      case "menu":
        return (
          <MenuScreen
            onSelect={handleSelectItem}
            onAddToCart={handleAddToOrderWithNudge}
            onUpdateQuantity={updateQuantity}
            order={order}
          />
        );
      case "item-detail":
        return selectedItem ? (
          <ItemDetailScreen
            item={selectedItem}
            onAdd={handleAddToOrder}
            onBack={() => setCurrentScreen("menu")}
          />
        ) : null;
      case "order-summary":
        return (
          <OrderSummaryScreen
            order={order}
            totalBill={totalBill}
            previousOrders={previousOrders}
            sessionTotal={sessionTotal}
            onContinue={() => setCurrentScreen("menu")}
            onConfirm={handleConfirmOrder}
            onUpdateQuantity={updateQuantity}
            onRemoveItem={removeItem}
          />
        );
      case "order-confirmation":
        return <OrderConfirmationScreen onReset={() => setCurrentScreen("session-idle")} />;
      case "session-idle":
        return (
          <SessionIdleScreen
            onOrderMore={() => setCurrentScreen("menu")}
            onRequestBill={() => setCurrentScreen("bill-summary")}
          />
        );
      case "bill-summary":
        return (
          <BillSummaryScreen
            previousOrders={previousOrders}
            sessionTotal={sessionTotal}
            onClose={() => {
              setOrder([]);
              setPreviousOrders([]);
              setCurrentScreen("idle");
            }}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Device frame - 7" portrait display simulation */}
      <div className="relative w-[360px] h-[640px] bg-background border border-border overflow-hidden flex flex-col">
        {/* Status bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-background">
          <span className="font-display text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
            Table-Tot
          </span>
          {order.length > 0 &&
            currentScreen !== "order-summary" &&
            currentScreen !== "order-confirmation" && (
              <button
                onClick={() => setCurrentScreen("order-summary")}
                className="text-[10px] tracking-wider uppercase text-primary border border-primary px-3 py-1 cursor-pointer active:bg-primary/10"
              >
                Cart ({order.reduce((s, o) => s + o.quantity, 0)})
              </button>
            )}
          <span className="text-[10px] font-mono text-muted-foreground">
            {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>

        {/* Screen content */}
        <div className="flex-1 overflow-hidden relative">
          {renderScreen()}

          {/* Voice PTT button — bottom-right, visible on all active screens */}
          {showVoiceButton && (
            <div className="absolute bottom-4 right-4 z-40">
              <VoiceOrderButton
                onDone={handleVoiceDone}
                order={order}
                restaurantId={RESTAURANT_ID}
                tableId={TABLE_ID}
              />
            </div>
          )}

          {/* Pairing nudge — floats above screen content, below voice button */}
          {nudge && (
            <div className="absolute bottom-0 left-0 right-0 z-30 pb-2">
              <PairingNudge
                key={nudge.itemId}
                addedItemId={nudge.itemId}
                addedItemName={nudge.itemName}
                cartValueAtShow={nudge.cartValueAtShow}
                onAddPairing={(item) => {
                  handleAddToOrderWithNudge(item);
                  setNudge(null);
                }}
                onDismiss={() => setNudge(null)}
              />
            </div>
          )}

          {/* Completion nudge — modal overlay, shown before submit when a rule matches */}
          {completionSuggestion && (
            <CompletionNudge
              suggestionText={completionSuggestion.text}
              suggestedItemId={completionSuggestion.itemId}
              cartValueAtShow={totalBill}
              onAdd={(item) => {
                handleAddToOrderWithNudge(item);
                setCompletionSuggestion(null);
                setCurrentScreen("order-summary");
              }}
              onSkip={() => {
                setCompletionSuggestion(null);
                confirmOrder();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default Index;
