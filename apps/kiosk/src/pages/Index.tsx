import { useCallback, useEffect, useRef, useState, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDeviceNavigation } from "@/hooks/useDeviceNavigation";
import IdleScreen from "@/components/screens/IdleScreen";
import HomeView from "@/components/screens/HomeView";
import ListeningScreen from "@/components/screens/ListeningScreen";
import MenuView from "@/components/screens/MenuView";
import DetailView from "@/components/screens/DetailView";
import CartView from "@/components/screens/CartView";
import SentView from "@/components/screens/SentView";
import CancelConfirm from "@/components/screens/CancelConfirm";
import ConfirmationView from "@/components/screens/ConfirmationView";
import WaitingView from "@/components/screens/WaitingView";
import IdentityView from "@/components/screens/IdentityView";
const BillView = lazy(() => import("@/components/screens/BillView"));
const GamesView = lazy(() => import("@/components/screens/GamesView"));
const ConversationStartersView = lazy(() => import("@/components/screens/ConversationStartersView"));
import CompletionNudge from "@/components/CompletionNudge";
import VoiceOrderButton from "@/components/VoiceOrderButton";
import VoiceConversationPanel from "@/components/VoiceConversationPanel";
import AppShell from "@/components/AppShell";
import OrderBar from "@/components/OrderBar";
import StatusStrip from "@/components/StatusStrip";
import { useRoundHold } from "@/hooks/useRoundHold";
import { RestaurantProvider, useRestaurant } from "@/lib/restaurantContext";
import { supabase } from "@/integrations/supabase/client";
import {
  resolveTableId,
  startSession,
  isIdentityResolved,
  markIdentityResolved,
  setSessionDisplayName,
} from "@/lib/orderSubmission";
import { getTableState, subscribeTableState } from "@/lib/ledger";
import { findMatchingRule, type MatchedSuggestion } from "@/lib/completionRules";
import { useMenu, MenuProvider } from "@/lib/menuStore";
import type { DoneMessage, OrderSnapshot, Turn } from "@/lib/voice/types";
import type { TtsClientHandle } from "@/lib/voice/ttsClient";
import type { Source } from "@/lib/eventBus";
import { MenuItem } from "@/data/menu";
import { RESTAURANT_ID, TABLE_NUMBER as TABLE_ID } from "@/lib/config";

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim();
}



function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

// Pre-submit browsing screens only — session-idle/games/conversation-starters
// are static screens where no activity is expected by design (see
// docs/plans/2026-08-03-idle-table-notification.md).
const NUDGE_ELIGIBLE_SCREENS = new Set(["home", "menu", "item-detail", "order-summary", "identity"]);
const NUDGE_THRESHOLD_MS = 3.5 * 60 * 1000;

const IndexInner = () => {
  const { voiceEnabled, promptForIdentity, venueName } = useRestaurant();
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
    hydrateFromTableState,
    totalBill,
    sessionTotal,
    currentRoundOrderId,
    previousOrders,
  } = useDeviceNavigation();

  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  // The hold's expiry is the ONLY path that reaches submitOrder. Pressing
  // "Send to kitchen" starts the countdown; it does not submit.
  const hold = useRoundHold(
    useCallback(async () => {
      try {
        await confirmOrder();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setToast(`Order could not be sent: ${msg}`);
        setCurrentScreen("order-summary");
      }
    }, [confirmOrder, setCurrentScreen]),
  );

  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [billRequested, setBillRequested] = useState(false);
  const [tableUuid, setTableUuid] = useState<string | null>(null);

  // Resolve the physical table UUID once on mount — stable for the device's lifetime.
  // Then hydrate from the ledger: a reloaded/woken kiosk mid-session rebuilds its
  // order history from server truth and lands back on WaitingView (audit M5).
  useEffect(() => {
    resolveTableId().then(setTableUuid).catch(() => {});
    getTableState()
      .then((state) => {
        if (state.state !== "idle" && state.rounds.length > 0) {
          hydrateFromTableState(state);
          if (state.state === "bill_requested") setBillRequested(true);
          setCurrentScreen("session-idle");
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset bill-requested flag when the session fully ends.
  useEffect(() => {
    if (currentScreen === "idle") setBillRequested(false);
  }, [currentScreen]);

  // Track current screen in a ref so the Realtime callback below always sees
  // the latest value without needing to re-subscribe on every screen change.
  const currentScreenRef = useRef(currentScreen);
  useEffect(() => { currentScreenRef.current = currentScreen; }, [currentScreen]);

  // "Still there?" nudge: pure client-side UX, nothing written to the ledger.
  // Separate from the POS idle badge (longer threshold, DB-backed) — the two
  // don't coordinate (docs/plans/2026-08-03-idle-table-notification.md).
  const lastTouchRef = useRef(Date.now());
  const [showIdleNudge, setShowIdleNudge] = useState(false);
  useEffect(() => {
    const onTouch = () => {
      lastTouchRef.current = Date.now();
      setShowIdleNudge(false);
    };
    document.addEventListener("pointerdown", onTouch);
    return () => document.removeEventListener("pointerdown", onTouch);
  }, []);
  // A customer moving between screens (e.g. menu -> cart) is obviously present.
  useEffect(() => {
    lastTouchRef.current = Date.now();
    setShowIdleNudge(false);
  }, [currentScreen]);
  useEffect(() => {
    const id = window.setInterval(() => {
      const eligible = NUDGE_ELIGIBLE_SCREENS.has(currentScreenRef.current) && previousOrders.length === 0;
      setShowIdleNudge(eligible && Date.now() - lastTouchRef.current > NUDGE_THRESHOLD_MS);
    }, 30_000);
    return () => window.clearInterval(id);
  }, [previousOrders.length]);

  const { items: menuItems, pairingsByItemId, anchors, completionRules } = useMenu();

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

  const handleEndSession = useCallback(() => {
    prevVoiceOrderRef.current = null;
    endSession();
  }, [endSession]);

  // The ledger's table_state row is the single truth. Any change → refetch.
  // The settle overlay fires only when OUR known span settles (audit C3): a
  // brand-new customer opening a fresh span must not trigger this device's
  // "Payment Confirmed" screen.
  const spanIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!tableUuid) return;
    const refetch = async () => {
      try {
        const st = await getTableState();
        if (st.state === "idle" && spanIdRef.current !== null && currentScreenRef.current !== "idle") {
          setPaymentConfirmed(true);
          window.setTimeout(() => {
            setPaymentConfirmed(false);
            handleEndSession();
            setVoiceTurns([]);
          }, 3000);
        }
        spanIdRef.current = st.span_id;
      } catch { /* next poke retries */ }
    };
    refetch();
    const unsubscribe = subscribeTableState(refetch);

    // Realtime is a poke, not a guarantee (ADR 0019). If the settle poke lands
    // during a network gap, the kiosk never resets — the next customer sits
    // down to the previous party's waiting screen. A 30s fallback poll plus a
    // refetch on wake bound how long a missed poke can go unnoticed.
    const pollId = window.setInterval(refetch, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refetch();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      unsubscribe();
      window.clearInterval(pollId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tableUuid, handleEndSession]);

  // Source defaults to "main_menu" so cart-side surfaces (OrderBar,
  // CartView) can call without thinking about attribution. High-stakes
  // attribution paths — pairing chip, completion nudge, detail view, voice —
  // pass their source explicitly.
  const handleAddToOrder = useCallback(
    (item: MenuItem, source: Source = "main_menu") => {
      addToOrder(item, source);
    },
    [addToOrder],
  );

  const handleUpdateQuantity = useCallback(
    (itemId: string, delta: number, source: Source = "main_menu") => {
      updateQuantity(itemId, delta, source);
    },
    [updateQuantity],
  );

  // Used to fabricate a fallback pairing (signature anchor → chef's pick →
  // any coffee/tea item → any menu item at all) when nothing was curated,
  // rendered under "Pairs well with" as if it were. An uncurated suggestion
  // presented as curated is worse than showing nothing — no panel now if
  // there's no real pairing (audit M6).
  const getDetailPairings = useCallback(
    (item: MenuItem) => pairingsByItemId[item.id] ?? [],
    [pairingsByItemId],
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
          addToOrder(kioskItem, "voice", delta);
        } else {
          const newQty = (order.find((o) => o.id === kioskItem.id)?.quantity ?? 0) + delta;
          if (newQty <= 0) {
            removeItem(kioskItem.id);
          } else {
            updateQuantity(kioskItem.id, delta, "voice");
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
      handleAddToOrder(selectedItem, "detail_view");
    }
  }, [selectedItem, handleAddToOrder]);

  const handleCompletionSkip = useCallback(async () => {
    setCompletionSuggestion(null);
    if (isSubmitting) return;
    hold.startHold(order);
    setCurrentScreen("sent");
  }, [hold, order, setCurrentScreen, isSubmitting]);

  const getOrderQuantity = useCallback(
    (itemId: string) => order.find((item) => item.id === itemId)?.quantity ?? 0,
    [order],
  );

  const handleConfirmOrder = useCallback(async () => {
    if (isSubmitting) return;
    if (promptForIdentity && !isIdentityResolved()) {
      setCurrentScreen("identity");
      return;
    }
    setIsSubmitting(true);
    try {
      {
        // completionRules are pre-loaded by menuStore at startup — no fetch needed here.
        const match = findMatchingRule(completionRules, order);
        if (match) {
          setCompletionSuggestion(match);
          return;
        }
      }
      await wait(1150);
      hold.startHold(order);
      setCurrentScreen("sent");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setToast(`Order could not be sent: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, order, hold, promptForIdentity, setCurrentScreen]);

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
            onSelectItem={async (item) => {
              // Mirrors "Start Ordering": append_event writes span_id = NULL
              // for analytics fired while idle, so a hero-dish tap that skips
              // straight to item-detail had every item_added/recommendation
              // event on that path (including pairing_chip adds) landing
              // unattributed — get_aov_summary joins on span_id, which NULL
              // never matches. session_started is idempotent for an
              // already-open span, so this is a no-op if the customer later
              // also taps "Start Ordering".
              await startSession();
              setSelectedItem(item);
              setCurrentScreen("item-detail");
            }}
            onInfoToast={(msg) => setToast(msg)}
            tableId={TABLE_ID}
          />
        );
      case "identity":
        return (
          <IdentityView
            onContinue={async (displayName) => {
              if (displayName) {
                await setSessionDisplayName(displayName);
              }
              markIdentityResolved();
              setCurrentScreen("order-summary");
              await handleConfirmOrder();
            }}
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
            onAddToCart={handleAddToOrder}
            onUpdateQuantity={handleUpdateQuantity}
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
                  onUpdateQuantity={handleUpdateQuantity}
                  onSelectItem={handleSelectItem}
                  ttsHandle={voiceTtsHandleRef}
                />
              ) : null
            }
          />
        );
      case "item-detail":
        return selectedItem ? (
          <DetailView
            item={selectedItem}
            pairings={getDetailPairings(selectedItem)}
            onAdd={handleAddFromDetail}
            onAddItem={(i) => handleAddToOrder(i, "pairing_chip")}
            onUpdateQuantity={handleUpdateQuantity}
            getQuantity={getOrderQuantity}
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
            onUpdateQuantity={handleUpdateQuantity}
          />
        );
      case "sent":
        return (
          <SentView
            items={hold.heldItems ?? order}
            roundNumber={previousOrders.length + 1}
            secondsLeft={hold.secondsLeft}
            onEdit={() => { hold.cancelHold(); setCurrentScreen("order-summary"); }}
            onCancel={() => setCancelConfirmOpen(true)}
            onSendNow={hold.sendNow}
            onOrderMore={() => setCurrentScreen("menu")}
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
                const { error } = await supabase.from("table_requests").insert({
                  table_id: tableUuid,
                  request_type: "water",
                  status: "pending",
                });
                if (error) throw error;
                setToast("Water requested");
              } catch {
                // Previously showed "Water requested" even when the insert
                // failed (audit M2) — staff never got the request either way.
                setToast("Couldn't request water — please ask a server");
              }
            }}
          />
        );
      case "games":
        return (
          <Suspense fallback={null}>
            <GamesView onBack={() => setCurrentScreen("session-idle")} />
          </Suspense>
        );
      case "conversation-starters":
        return (
          <Suspense fallback={null}>
            <ConversationStartersView onBack={() => setCurrentScreen("session-idle")} />
          </Suspense>
        );
      case "bill-summary":
        return (
          <Suspense fallback={null}>
            <BillView
              previousOrders={previousOrders}
              sessionTotal={sessionTotal}
              alreadyRequested={billRequested}
              onBillSubmitted={() => setBillRequested(true)}
              onClose={() => {
                handleEndSession();
                setVoiceTurns([]);
              }}
              onContinueOrdering={() => setCurrentScreen("menu")}
              onBackToStatus={() => setCurrentScreen("session-idle")}
            />
          </Suspense>
        );
      default:
        return null;
    }
  };

  return (
    <AppShell
      currentScreen={currentScreen}
      tableId={TABLE_ID}
      venueName={venueName || "Tabletot"}
      orderBar={
        currentScreen === "menu" ? (
          <OrderBar
            itemCount={order.reduce((s, o) => s + o.quantity, 0)}
            total={totalBill}
            roundNumber={previousOrders.length + 1}
            disabled={isSubmitting}
            onReview={() => setCurrentScreen("order-summary")}
          />
        ) : null
      }
      statusStrip={
        hold.isHolding && currentScreen !== "sent" ? (
          <StatusStrip
            label={`Round ${previousOrders.length + 1} → kitchen`}
            detail={`${hold.secondsLeft}s · tap to change`}
            onTap={() => setCurrentScreen("sent")}
          />
        ) : null
      }
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

        {showIdleNudge && (
          <div
            style={{
              position: "fixed",
              top: "1.25rem",
              left: "50%",
              transform: "translateX(-50%)",
              background: "var(--color-surface, #fff)",
              border: "1px solid var(--color-border, #ddd)",
              borderRadius: "999px",
              padding: "0.75rem 1.5rem",
              boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
              fontWeight: 600,
              zIndex: 9990,
            }}
          >
            Still there? Tap anywhere to continue.
          </div>
        )}

        {completionSuggestion && (
          <CompletionNudge
            suggestionText={completionSuggestion.text}
            suggestedItemId={completionSuggestion.itemId}
            cartValueAtShow={totalBill}
            onAdd={(item) => {
              handleAddToOrder(item, "completion_nudge");
              setCompletionSuggestion(null);
              setCurrentScreen("order-summary");
            }}
            onSkip={handleCompletionSkip}
          />
        )}

        {cancelConfirmOpen && (
          <CancelConfirm
            itemCount={order.reduce((s, o) => s + o.quantity, 0)}
            hasCookingRounds={previousOrders.length > 0}
            onKeep={() => setCancelConfirmOpen(false)}
            onCancel={() => {
              hold.cancelHold();
              setOrder([]);
              setCancelConfirmOpen(false);
              setCurrentScreen(previousOrders.length > 0 ? "session-idle" : "menu");
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
