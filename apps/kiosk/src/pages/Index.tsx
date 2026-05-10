import { useCallback, useEffect, useRef, useState } from "react";
import { useDeviceNavigation } from "@/hooks/useDeviceNavigation";
import HomeView from "@/components/screens/HomeView";
import ListeningScreen from "@/components/screens/ListeningScreen";
import MenuView from "@/components/screens/MenuView";
import DetailView from "@/components/screens/DetailView";
import CartView from "@/components/screens/CartView";
import BillView from "@/components/screens/BillView";
import ConfirmationView from "@/components/screens/ConfirmationView";
import WaitingView from "@/components/screens/WaitingView";
import PairingNudge from "@/components/PairingNudge";
import CompletionNudge from "@/components/CompletionNudge";
import VoiceOrderButton from "@/components/VoiceOrderButton";
import AppShell from "@/components/AppShell";
import { RestaurantProvider, useRestaurant } from "@/lib/restaurantContext";
import { supabase } from "@/integrations/supabase/client";
import { findMatchingRule, type CompletionRule, type MatchedSuggestion } from "@/lib/completionRules";
import { useMenu, MenuProvider } from "@/lib/menuStore";
import type { DoneMessage, OrderSnapshot } from "@/lib/voice/types";
import { MenuItem } from "@/data/menu";

const RESTAURANT_ID = import.meta.env.VITE_RESTAURANT_ID as string;
const TABLE_ID = (import.meta.env.VITE_TABLE_ID as string) || "T1";

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim();
}

interface NudgeState {
  itemId: string;
  itemName: string;
  cartValueAtShow: number;
}

const IndexInner = () => {
  const { voiceEnabled } = useRestaurant();
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
    endSession,
    totalBill,
    sessionTotal,
    currentRoundOrderId,
    previousOrders,
    setPreviousOrders,
  } = useDeviceNavigation();

  const { items: menuItems, pairingsByItemId } = useMenu();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nudge, setNudge] = useState<NudgeState | null>(null);
  const [completionSuggestion, setCompletionSuggestion] = useState<MatchedSuggestion | null>(null);

  const prevVoiceOrderRef = useRef<OrderSnapshot | null>(null);

  const handleAddToOrderWithNudge = useCallback(
    (item: MenuItem) => {
      const cartValueAtShow = order.reduce((s, o) => s + o.price * o.quantity, 0);
      addToOrder(item);
      setNudge({ itemId: item.id, itemName: item.name, cartValueAtShow });
    },
    [order, addToOrder],
  );

  // Shared handler: reconcile voice backend order snapshot with kiosk cart
  const handleVoiceDone = useCallback(
    (msg: DoneMessage) => {
      const prev = prevVoiceOrderRef.current;
      const next = msg.order;
      prevVoiceOrderRef.current = next;

      for (const nextItem of next.items) {
        const prevQty = prev?.items.find((i) => i.item_id === nextItem.item_id)?.quantity ?? 0;
        const delta = nextItem.quantity - prevQty;
        if (delta === 0) continue;

        const normalized = normalizeName(nextItem.item_name);
        const kioskItem = menuItems.find((m) => normalizeName(m.name) === normalized);
        if (!kioskItem) continue;

        if (delta > 0) {
          const cartValueAtShow = order.reduce((s, o) => s + o.price * o.quantity, 0);
          addToOrder(kioskItem, delta);
          setNudge({ itemId: kioskItem.id, itemName: kioskItem.name, cartValueAtShow });
        } else {
          const newQty = (order.find((o) => o.id === kioskItem.id)?.quantity ?? 0) + delta;
          if (newQty <= 0) {
            removeItem(kioskItem.id);
          } else {
            updateQuantity(kioskItem.id, delta);
          }
        }
      }

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

      if (
        msg.resolver.some((r) => r.type === "match") &&
        (currentScreen === "menu" || currentScreen === "item-detail")
      ) {
        setCurrentScreen("order-summary");
      }
    },
    [menuItems, order, addToOrder, updateQuantity, removeItem, currentScreen, setCurrentScreen],
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
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
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
      await confirmOrder();
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, order, confirmOrder]);

  const showVoiceButton =
    voiceEnabled && !["idle", "listening", "order-confirmation", "session-idle"].includes(currentScreen);

  const askWaiter = voiceEnabled ? () => setCurrentScreen("listening") : undefined;

  const [toast, setToast] = useState<string>("");
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  const renderScreen = () => {
    switch (currentScreen) {
      case "idle":
        return (
          <HomeView
            onStartOrdering={() => setCurrentScreen("menu")}
            onSelectItem={(item) => {
              setSelectedItem(item);
              setCurrentScreen("item-detail");
            }}
            onAskWaiter={askWaiter}
            onInfoToast={(msg) => setToast(msg)}
            tableId={TABLE_ID}
          />
        );
      case "listening":
        return voiceEnabled ? (
          <ListeningScreen
            order={order}
            restaurantId={RESTAURANT_ID}
            tableId={TABLE_ID}
            onVoiceDone={handleVoiceDone}
            onDone={() => setCurrentScreen("menu")}
          />
        ) : null;
      case "menu":
        return (
          <MenuView
            onSelect={handleSelectItem}
            onAddToCart={handleAddToOrderWithNudge}
            onUpdateQuantity={updateQuantity}
            onAskWaiter={askWaiter}
            order={order}
          />
        );
      case "item-detail":
        return selectedItem ? (
          <DetailView
            item={selectedItem}
            pairings={pairingsByItemId[selectedItem.id] ?? []}
            onAdd={handleAddToOrder}
            onBack={() => setCurrentScreen("menu")}
            onSelectPairing={handleSelectItem}
          />
        ) : null;
      case "order-summary":
        return (
          <CartView
            order={order}
            totalBill={totalBill}
            previousOrders={previousOrders}
            isSubmitting={isSubmitting}
            onContinue={() => setCurrentScreen("menu")}
            onConfirm={handleConfirmOrder}
            onUpdateQuantity={updateQuantity}
          />
        );
      case "order-confirmation":
        return (
          <ConfirmationView
            onReset={() => setCurrentScreen("session-idle")}
            onOrderMore={() => setCurrentScreen("menu")}
          />
        );
      case "session-idle":
        return (
          <WaitingView
            previousOrders={previousOrders}
            currentRoundOrderId={currentRoundOrderId}
            onOrderMore={() => setCurrentScreen("menu")}
            onRequestBill={() => setCurrentScreen("bill-summary")}
            onEndSession={endSession}
            onRequestWater={() => setToast("Water requested")}
          />
        );
      case "bill-summary":
        return (
          <BillView
            previousOrders={previousOrders}
            sessionTotal={sessionTotal}
            onClose={() => {
              setOrder([]);
              setPreviousOrders([]);
              setCurrentScreen("idle");
            }}
            onContinueOrdering={() => setCurrentScreen("menu")}
          />
        );
      default:
        return null;
    }
  };

  const cartCount = order.reduce((s, o) => s + o.quantity, 0);

  return (
    <AppShell
      currentScreen={currentScreen}
      onNavigate={setCurrentScreen}
      onAskWaiter={askWaiter}
      cartCount={cartCount}
      tableId={TABLE_ID}
    >
      <div style={{ position: "relative", height: "100%" }}>
        {renderScreen()}

        {/* Voice PTT button — bottom-right corner, hidden on idle/listening/confirmation/session-idle */}
        {showVoiceButton && (
          <div style={{ position: "absolute", bottom: 16, right: 16, zIndex: 40 }}>
            <VoiceOrderButton
              onDone={handleVoiceDone}
              order={order}
              restaurantId={RESTAURANT_ID}
              tableId={TABLE_ID}
            />
          </div>
        )}

        {nudge && (
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 30, paddingBottom: 8 }}>
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

        {toast && <div className="toast">{toast}</div>}
      </div>
    </AppShell>
  );
};

const Index = () => (
  <RestaurantProvider>
    <MenuProvider>
      <IndexInner />
    </MenuProvider>
  </RestaurantProvider>
);

export default Index;
