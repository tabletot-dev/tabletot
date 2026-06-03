import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDeviceNavigation } from "@/hooks/useDeviceNavigation";
import IdleScreen from "@/components/screens/IdleScreen";
import HomeView from "@/components/screens/HomeView";
import ListeningScreen from "@/components/screens/ListeningScreen";
import MenuView from "@/components/screens/MenuView";
import DetailView from "@/components/screens/DetailView";
import CartView from "@/components/screens/CartView";
import BillView from "@/components/screens/BillView";
import ConfirmationView from "@/components/screens/ConfirmationView";
import WaitingView from "@/components/screens/WaitingView";
import GamesView from "@/components/screens/GamesView";
import ConversationStartersView from "@/components/screens/ConversationStartersView";
import CompletionNudge from "@/components/CompletionNudge";
import VoiceOrderButton from "@/components/VoiceOrderButton";
import MiniCartSidebar from "@/components/MiniCartSidebar";
import VoiceConversationPanel from "@/components/VoiceConversationPanel";
import AppShell from "@/components/AppShell";
import { RestaurantProvider, useRestaurant } from "@/lib/restaurantContext";
import { supabase } from "@/integrations/supabase/client";
import { resolveTableId, startSession } from "@/lib/orderSubmission";
import { findMatchingRule, type CompletionRule, type MatchedSuggestion } from "@/lib/completionRules";
import { useMenu, MenuProvider } from "@/lib/menuStore";
import type { DoneMessage, OrderSnapshot, Turn } from "@/lib/voice/types";
import type { TtsClientHandle } from "@/lib/voice/ttsClient";
import { MenuItem } from "@/data/menu";

const RESTAURANT_ID = import.meta.env.VITE_RESTAURANT_ID as string;
const TABLE_ID =
  new URLSearchParams(window.location.search).get("table") ||
  (import.meta.env.VITE_TABLE_ID as string) ||
  "T1";

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim();
}


function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = window.setTimeout(() => reject(new Error("Timed out")), ms);
    promise.then(
      (value) => {
        window.clearTimeout(id);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(id);
        reject(error);
      },
    );
  });
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

const IndexInner = () => {
  const { voiceEnabled, isTreatment } = useRestaurant();
  const {
    currentScreen,
    setCurrentScreen,
    selectedItem,
    setSelectedItem,
    order,
    addToOrder,
    updateQuantity,
    removeItem,
    confirmOrder,
    endSession,
    totalBill,
    sessionTotal,
    currentRoundOrderId,
    previousOrders,
  } = useDeviceNavigation();

  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [billRequested, setBillRequested] = useState(false);
  const [tableUuid, setTableUuid] = useState<string | null>(null);

  // Resolve the physical table UUID once on mount — stable for the device's lifetime.
  useEffect(() => {
    resolveTableId().then(setTableUuid).catch(() => {});
  }, []);

  // Reset bill-requested flag when the session fully ends.
  useEffect(() => {
    if (currentScreen === "idle") setBillRequested(false);
  }, [currentScreen]);

  // Track current screen in a ref so the Realtime callback below always sees
  // the latest value without needing to re-subscribe on every screen change.
  const currentScreenRef = useRef(currentScreen);
  useEffect(() => { currentScreenRef.current = currentScreen; }, [currentScreen]);

  // When the POS settles the bill, the DB trigger sets restaurant_tables.status →
  // 'available'. Watch for that change to show a closing message then reset.
  // See ADR 0014 for why we watch restaurant_tables rather than sessions.
  useEffect(() => {
    if (!tableUuid) return;
    const channel = supabase
      .channel(`table-status-${tableUuid}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "restaurant_tables",
          filter: `id=eq.${tableUuid}`,
        },
        (payload) => {
          if (
            (payload.new as { status: string }).status === "available" &&
            currentScreenRef.current !== "idle"
          ) {
            setPaymentConfirmed(true);
            window.setTimeout(() => {
              setPaymentConfirmed(false);
              endSession();
              setVoiceTurns([]);
            }, 3000);
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tableUuid, endSession]);

  const { items: menuItems, pairingsByItemId, anchors } = useMenu();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completionSuggestion, setCompletionSuggestion] = useState<MatchedSuggestion | null>(null);
  const [voiceConversationOpen, setVoiceConversationOpen] = useState(false);
  const [voiceSessionId, setVoiceSessionId] = useState<string | null>(null);
  // Voice transcript lives here, not inside VoiceConversationPanel, so it
  // survives the modal closing/reopening. Reset only when the voice session
  // itself changes or ends — see docs/notes/voice-conversation-continuity.md.
  const [voiceTurns, setVoiceTurns] = useState<Turn[]>([]);

  // A new backend session means a fresh thread.
  useEffect(() => {
    setVoiceTurns([]);
  }, [voiceSessionId]);

  const prevVoiceOrderRef = useRef<OrderSnapshot | null>(null);
  const voiceTtsHandleRef = useRef<TtsClientHandle | null>(null);

  const handleAddToOrder = useCallback(
    (item: MenuItem) => {
      addToOrder(item);
    },
    [addToOrder],
  );

  const getDetailPairings = useCallback(
    (item: MenuItem) => {
      const directPairings = pairingsByItemId[item.id] ?? [];
      if (directPairings.length > 0) return directPairings;

      const fallback =
        anchors.find((anchor) => anchor.id !== item.id && anchor.anchorType === "signature") ??
        anchors.find((anchor) => anchor.id !== item.id && anchor.anchorType === "chef_pick") ??
        menuItems.find((entry) => entry.id !== item.id && /coffee|tea|chocolate/i.test(entry.category)) ??
        menuItems.find((entry) => entry.id !== item.id);

      return fallback ? [{ ...fallback, context: "suggested_pairing", priority: 0 }] : [];
    },
    [anchors, menuItems, pairingsByItemId],
  );

  const handleVoiceDone = useCallback(
    (msg: DoneMessage) => {
      // Record the exchange in the persistent thread. Built here (not in the
      // panel) so presses made from the dock while the modal is closed are also
      // captured, and so the thread outlives the modal.
      const matchedNames = msg.resolver
        .filter((r): r is Extract<typeof r, { type: "match" }> => r.type === "match")
        .map((r) => normalizeName(r.item));
      const matchedItems = menuItems.filter((item) =>
        matchedNames.some((n) => n === normalizeName(item.name)),
      );
      setVoiceTurns((prev) => [
        ...prev,
        { role: "user", text: msg.transcript },
        { role: "ai", text: msg.response, matchedItems },
      ]);

      const prev = prevVoiceOrderRef.current;
      const next = msg.order;
      prevVoiceOrderRef.current = next;

      for (const nextItem of next.items) {
        const normalizedNextName = normalizeName(nextItem.item_name);
        // Always use the kiosk touch cart as the quantity baseline, not
        // prevVoiceOrderRef. The kiosk cart is exactly what cart_sync sent to
        // the backend at PTT press time, so (next_qty - kiosk_qty) is the pure
        // voice delta. Using prevVoiceOrderRef instead caused double-counts when
        // items were added via touch between voice turns: prevVoiceOrderRef
        // wouldn't know about the touch add, so prevQty was 0 instead of 1,
        // making delta=2 when it should be 1.
        const prevQty = order.find((o) => {
          const m = menuItems.find((mi) => mi.id === o.id);
          return m !== undefined && normalizeName(m.name) === normalizedNextName;
        })?.quantity ?? 0;
        const delta = nextItem.quantity - prevQty;
        if (delta === 0) continue;

        const kioskItem = menuItems.find((m) => normalizeName(m.name) === normalizedNextName);
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
          // Use item_name matching here too for consistency with the add loop above.
          const normalizedPrevName = normalizeName(prevItem.item_name);
          const stillExists = next.items.find(
            (i) => normalizeName(i.item_name) === normalizedPrevName,
          );
          if (!stillExists) {
            const kioskItem = menuItems.find((m) => normalizeName(m.name) === normalizedPrevName);
            if (kioskItem) removeItem(kioskItem.id);
          }
        }
      }

      // Third sweep: remove any kiosk-cart item absent from the backend snapshot.
      // Catches touch-added items that were removed by voice — they're absent from
      // both next.items (removed) and prevVoiceOrderRef (never voice-added), so
      // neither loop above handles them.
      for (const cartItem of order) {
        const m = menuItems.find((mi) => mi.id === cartItem.id);
        if (!m) continue;
        const inSnapshot = next.items.some(
          (i) => normalizeName(i.item_name) === normalizeName(m.name),
        );
        if (!inSnapshot) {
          removeItem(cartItem.id);
        }
      }
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
    }
  }, [selectedItem, handleAddToOrder]);

  const getOrderQuantity = useCallback(
    (itemId: string) => order.find((item) => item.id === itemId)?.quantity ?? 0,
    [order],
  );

  const handleConfirmOrder = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (isTreatment) {
        try {
          const { data: rules } = await withTimeout(
            supabase
              .from("meal_completion_rules")
              .select("rule_name, condition, suggestion")
              .eq("restaurant_id", RESTAURANT_ID)
              .eq("active", true)
              .order("priority", { ascending: false }),
            700,
          );

          const match = findMatchingRule((rules ?? []) as CompletionRule[], order);
          if (match) {
            setCompletionSuggestion(match);
            return;
          }
        } catch {
          // DB error — fall through to submit
        }
      }
      await wait(1150);
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

  const renderScreen = () => {
    switch (currentScreen) {
      case "idle":
        return <IdleScreen onActivate={() => setCurrentScreen("home")} />;
      case "home":
        return (
          <HomeView
            onStartOrdering={async () => {
              await startSession();
              setCurrentScreen("menu");
            }}
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
                  voiceDock={
                    voiceEnabled ? (
                      <VoiceOrderButton
                        onDone={handleVoiceDone}
                        order={order}
                        restaurantId={RESTAURANT_ID}
                        tableId={TABLE_ID}
                        onOpenConversation={() => setVoiceConversationOpen(true)}
                        onSessionReady={setVoiceSessionId}
                        onTtsReady={(h) => { voiceTtsHandleRef.current = h; }}
                      />
                    ) : null
                  }
                  voicePanel={
                    voiceEnabled && voiceConversationOpen ? (
                      <VoiceConversationPanel
                        sessionId={voiceSessionId}
                        turns={voiceTurns}
                        order={order}
                        getQuantity={getOrderQuantity}
                        onClose={() => setVoiceConversationOpen(false)}
                        onDone={handleVoiceDone}
                        onAddItem={handleAddToOrder}
                        onUpdateQuantity={updateQuantity}
                        onSelectItem={handleSelectItem}
                        ttsHandle={voiceTtsHandleRef}
                      />
                    ) : null
                  }
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
                          pairings={getDetailPairings(selectedItem)}
                          onAdd={handleAddFromDetail}
                          onAddItem={handleAddToOrder}
                          onUpdateQuantity={updateQuantity}
                          getQuantity={getOrderQuantity}
                          onBack={() => setCurrentScreen("menu")}
                          onSelectPairing={handleSelectItem}
                          onOpenVoice={() => {
                            setCurrentScreen("menu");
                            setVoiceConversationOpen(true);
                          }}
                        />
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>


              </div>

              <MiniCartSidebar
                order={order}
                previousOrders={previousOrders}
                onAddToCart={handleAddToOrder}
                onUpdateQuantity={updateQuantity}
                onSelect={handleSelectItem}
                onGoToCart={() => setCurrentScreen("order-summary")}
              />
            </div>
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
          />
        );
      case "session-idle":
        return (
          <WaitingView
            previousOrders={previousOrders}
            currentRoundOrderId={currentRoundOrderId}
            billRequested={billRequested}
            onOrderMore={() => setCurrentScreen("menu")}
            onRequestBill={() => setCurrentScreen("bill-summary")}
            onGames={() => setCurrentScreen("games")}
            onConversationStarters={() => setCurrentScreen("conversation-starters")}
            onRequestWater={async () => {
              try {
                const tableUuid = await resolveTableId();
                await supabase.from("table_requests").insert({
                  table_id: tableUuid,
                  request_type: "water",
                  status: "pending",
                });
              } catch {
                // non-blocking — toast still shows
              }
              setToast("Water requested");
            }}
          />
        );
      case "games":
        return <GamesView onBack={() => setCurrentScreen("session-idle")} />;
      case "conversation-starters":
        return <ConversationStartersView onBack={() => setCurrentScreen("session-idle")} />;
      case "bill-summary":
        return (
          <BillView
            previousOrders={previousOrders}
            sessionTotal={sessionTotal}
            alreadyRequested={billRequested}
            onBillSubmitted={() => setBillRequested(true)}
            onClose={() => {
              endSession();
              setVoiceTurns([]);
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
      showStatusReturn={previousOrders.length > 0 && currentScreen !== "session-idle"}
    >
      <div style={{ position: "relative", height: "100%" }}>
        {renderScreen()}

        {paymentConfirmed && (
          <div style={{
            position: "fixed",
            inset: 0,
            background: "var(--color-bg, #fff)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            zIndex: 9999,
          }}>
            <p className="eyebrow">Payment Confirmed</p>
            <h1>Thank you!</h1>
            <p>See you again soon.</p>
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
