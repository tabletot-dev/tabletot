import { useCallback, useRef, useState } from "react";
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
import { useMenu } from "@/lib/menuStore";
import type { DoneMessage, OrderSnapshot } from "@/lib/voice/types";
import { MenuItem } from "@/data/menu";

const RESTAURANT_ID = import.meta.env.VITE_RESTAURANT_ID as string;
const TABLE_ID = (import.meta.env.VITE_TABLE_ID as string) || "T1";

// Normalize item names for matching: lowercase, collapse dashes/en-dashes to space
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

  const showVoiceButton =
    voiceEnabled && !["idle", "listening", "order-confirmation"].includes(currentScreen);

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
          />
        );
      case "listening":
        return voiceEnabled ? (
          <ListeningScreen onDone={() => setCurrentScreen("menu")} />
        ) : null;
      case "menu":
        return (
          <MenuView
            onSelect={handleSelectItem}
            onAddToCart={handleAddToOrderWithNudge}
            onUpdateQuantity={updateQuantity}
            onGoToCart={() => setCurrentScreen("order-summary")}
            order={order}
          />
        );
      case "item-detail":
        return selectedItem ? (
          <DetailView
            item={selectedItem}
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
            sessionTotal={sessionTotal}
            onContinue={() => setCurrentScreen("menu")}
            onConfirm={handleConfirmOrder}
            onUpdateQuantity={updateQuantity}
            onRemoveItem={removeItem}
          />
        );
      case "order-confirmation":
        return <ConfirmationView onReset={() => setCurrentScreen("session-idle")} />;
      case "session-idle":
        return (
          <WaitingView
            previousOrders={previousOrders}
            onOrderMore={() => setCurrentScreen("menu")}
            onRequestBill={() => setCurrentScreen("bill-summary")}
            onAddToCart={handleAddToOrderWithNudge}
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
        cartCount={cartCount}
        tableId={TABLE_ID}
      >
        <div style={{ position: "relative", height: "100%" }}>
          {renderScreen()}

          {/* Voice PTT button — bottom-right corner */}
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

          {/* Pairing nudge */}
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

          {/* Completion nudge — modal overlay before submit */}
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
      </AppShell>
  );
};

const Index = () => (
  <RestaurantProvider>
    <IndexInner />
  </RestaurantProvider>
);

export default Index;
