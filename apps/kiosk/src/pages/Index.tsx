import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDeviceNavigation } from "@/hooks/useDeviceNavigation";
import HomeView from "@/components/screens/HomeView";
import ListeningScreen from "@/components/screens/ListeningScreen";
import MenuView from "@/components/screens/MenuView";
import DetailView from "@/components/screens/DetailView";
import CartView from "@/components/screens/CartView";
import BillView from "@/components/screens/BillView";
import ConfirmationView from "@/components/screens/ConfirmationView";
import WaitingView from "@/components/screens/WaitingView";
import CompletionNudge from "@/components/CompletionNudge";
import VoiceOrderButton, { type PressStatus } from "@/components/VoiceOrderButton";
import VoiceModal from "@/components/VoiceModal";
import MiniCartSidebar from "@/components/MiniCartSidebar";
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

interface VoiceModalState {
  transcript: string;
  response: string;
  resolvedItems: Array<{ name: string; applied: boolean }>;
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
  const [completionSuggestion, setCompletionSuggestion] = useState<MatchedSuggestion | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<PressStatus>("idle");
  const [voiceModalData, setVoiceModalData] = useState<VoiceModalState>({
    transcript: "",
    response: "",
    resolvedItems: [],
  });

  const prevVoiceOrderRef = useRef<OrderSnapshot | null>(null);

  const handleAddToOrder = useCallback(
    (item: MenuItem) => {
      addToOrder(item);
    },
    [addToOrder],
  );

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
          addToOrder(kioskItem, delta);
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

      // Populate voice modal with results
      const resolved = msg.resolver
        .filter((r): r is Extract<typeof r, { type: "match" | "no_match" }> =>
          r.type === "match" || r.type === "no_match"
        )
        .map((r) => ({
          name: r.type === "match" ? (r as { type: "match"; item: string }).item : (r as { type: "no_match"; raw: string }).raw,
          applied: r.type === "match",
        }));

      setVoiceModalData({
        transcript: msg.transcript,
        response: msg.response,
        resolvedItems: resolved,
      });
    },
    [menuItems, order, addToOrder, updateQuantity, removeItem],
  );

  const handleSelectItem = useCallback(
    (item: MenuItem) => {
      setSelectedItem(item);
      setCurrentScreen("item-detail");
    },
    [setSelectedItem, setCurrentScreen],
  );

  const handleAddFromDetail = useCallback(() => {
    if (selectedItem) {
      handleAddToOrder(selectedItem);
      setCurrentScreen("menu");
    }
  }, [selectedItem, handleAddToOrder, setCurrentScreen]);

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

  const [toast, setToast] = useState<string>("");
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  const isBrowsing = currentScreen === "menu" || currentScreen === "item-detail";

  const showFloatingPtt =
    voiceEnabled &&
    !isBrowsing &&
    !["idle", "listening", "order-confirmation", "session-idle"].includes(currentScreen);

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

      // Browse layout: menu + mini cart sidebar + item detail modal
      case "menu":
      case "item-detail":
        return (
          <div className="browse-layout">
            <div className="browse-main">
              <div className="browse-content">
                <MenuView
                  onSelect={handleSelectItem}
                  onAddToCart={handleAddToOrder}
                  onUpdateQuantity={updateQuantity}
                  order={order}
                />
                <AnimatePresence>
                  {currentScreen === "item-detail" && selectedItem && (
                    <motion.div
                      className="item-modal-backdrop"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      onClick={() => setCurrentScreen("menu")}
                    >
                      <motion.div
                        className="item-modal-panel"
                        initial={{ y: 28, opacity: 0, scale: 0.98 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: 28, opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DetailView
                          item={selectedItem}
                          pairings={pairingsByItemId[selectedItem.id] ?? []}
                          onAdd={handleAddFromDetail}
                          onBack={() => setCurrentScreen("menu")}
                          onSelectPairing={handleSelectItem}
                        />
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Voice modal — overlays the browse area */}
                {voiceEnabled && (
                  <VoiceModal
                    status={voiceStatus}
                    transcript={voiceModalData.transcript}
                    response={voiceModalData.response}
                    resolvedItems={voiceModalData.resolvedItems}
                    onDismiss={() => setVoiceModalData({ transcript: "", response: "", resolvedItems: [] })}
                  />
                )}
              </div>

              <MiniCartSidebar
                order={order}
                onUpdateQuantity={updateQuantity}
                onGoToCart={() => setCurrentScreen("order-summary")}
              />
            </div>

            {voiceEnabled && (
              <div className="browse-footer">
                <VoiceOrderButton
                  onDone={handleVoiceDone}
                  order={order}
                  restaurantId={RESTAURANT_ID}
                  tableId={TABLE_ID}
                  onStatusChange={setVoiceStatus}
                />
              </div>
            )}
          </div>
        );

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

  return (
    <AppShell
      currentScreen={currentScreen}
      onNavigate={setCurrentScreen}
      tableId={TABLE_ID}
    >
      <div style={{ position: "relative", height: "100%" }}>
        {renderScreen()}

        {/* Floating PTT only for non-browse voice-enabled screens */}
        {showFloatingPtt && (
          <div style={{ position: "absolute", bottom: 16, right: 16, zIndex: 40 }}>
            <VoiceOrderButton
              onDone={handleVoiceDone}
              order={order}
              restaurantId={RESTAURANT_ID}
              tableId={TABLE_ID}
              onStatusChange={setVoiceStatus}
            />
          </div>
        )}

        {completionSuggestion && (
          <CompletionNudge
            suggestionText={completionSuggestion.text}
            suggestedItemId={completionSuggestion.itemId}
            cartValueAtShow={totalBill}
            onAdd={(item) => {
              handleAddToOrder(item);
              setCompletionSuggestion(null);
              setCurrentScreen("order-summary");
            }}
            onSkip={() => {
              setCompletionSuggestion(null);
              confirmOrder();
            }}
          />
        )}

        <AnimatePresence>
          {toast && (
            <motion.div
              className="toast"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
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
