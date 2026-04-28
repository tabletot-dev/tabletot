import { useCallback, useState, useEffect } from "react";
import { useDeviceNavigation } from "@/hooks/useDeviceNavigation";
import IdleScreen from "@/components/screens/IdleScreen";
import ListeningScreen from "@/components/screens/ListeningScreen";
import MenuScreen from "@/components/screens/MenuScreen";
import ItemDetailScreen from "@/components/screens/ItemDetailScreen";
import OrderSummaryScreen from "@/components/screens/OrderSummaryScreen";
import BillSummaryScreen from "@/components/screens/BillSummaryScreen";
import OrderConfirmationScreen from "@/components/screens/OrderConfirmationScreen";
import VoiceAssistantOverlay from "@/components/VoiceAssistantOverlay";
import SessionIdleScreen from "@/components/screens/SessionIdleScreen";
import { MenuItem } from "@/data/menu";

const voiceHints = [
  "Need suggestions?",
  "Talk to your waiter",
  "Ask about allergens",
  "What's popular?",
  "Get a recommendation",
];

const VoiceFab = ({ onClick }: { onClick: () => void }) => {
  const [hintIndex, setHintIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setHintIndex((i) => (i + 1) % voiceHints.length);
        setVisible(true);
      }, 300);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="absolute bottom-4 right-4 z-40 flex items-center gap-2">
      <div
        className={`bg-secondary/10 border border-secondary/30 px-3 py-1.5 transition-all duration-300 ${
          visible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-2"
        }`}
        style={{ boxShadow: "0 0 12px hsl(var(--tt-orange) / 0.3), 0 0 4px hsl(var(--tt-orange) / 0.15)" }}
      >
        <span className="text-[10px] tracking-wider text-secondary font-display font-semibold whitespace-nowrap" style={{ textShadow: "0 0 8px hsl(var(--tt-orange) / 0.6)" }}>
          {voiceHints[hintIndex]}
        </span>
      </div>
      <button
        onClick={onClick}
        className="w-12 h-12 border border-secondary bg-secondary/10 flex items-center justify-center cursor-pointer transition-all hover:bg-secondary/20 active:bg-secondary/30 group flex-shrink-0 animate-mic-pulse-glow"
        style={{ boxShadow: "0 0 16px hsl(var(--tt-orange) / 0.4), 0 0 6px hsl(var(--tt-orange) / 0.2)" }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-secondary group-hover:text-secondary transition-colors" style={{ filter: "drop-shadow(0 0 4px hsl(var(--tt-orange) / 0.6))" }}>
          <rect x="9" y="2" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5 10a7 7 0 0014 0" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <line x1="12" y1="17" x2="12" y2="22" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
    </div>
  );
};

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
    voiceOverlayOpen,
    setVoiceOverlayOpen,
  } = useDeviceNavigation();

  const handleSelectItem = useCallback(
    (item: MenuItem) => {
      setSelectedItem(item);
      setCurrentScreen("item-detail");
    },
    [setSelectedItem, setCurrentScreen]
  );

  const handleAddToOrder = useCallback(() => {
    if (selectedItem) {
      addToOrder(selectedItem);
      setCurrentScreen("order-summary");
    }
  }, [selectedItem, addToOrder, setCurrentScreen]);

  const handleConfirmOrder = useCallback(() => {
    confirmOrder();
  }, [confirmOrder]);

  const handleReset = useCallback(() => {
    setCurrentScreen("idle");
  }, [setCurrentScreen]);

  const renderScreen = () => {
    switch (currentScreen) {
      case "idle":
        return (
          <IdleScreen onActivate={() => setCurrentScreen("menu")} />
        );
      case "listening":
        return (
          <ListeningScreen
            onDone={() => setCurrentScreen("menu")}
          />
        );
      case "menu":
        return (
          <MenuScreen onSelect={handleSelectItem} onAddToCart={addToOrder} onUpdateQuantity={updateQuantity} order={order} />
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
          {order.length > 0 && currentScreen !== "order-summary" && currentScreen !== "order-confirmation" && (
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
          {/* Voice assistant overlay */}
          {currentScreen === "menu" && voiceOverlayOpen && (
            <VoiceAssistantOverlay onClose={() => setVoiceOverlayOpen(false)} />
          )}
          {/* Voice FAB on menu */}
          {currentScreen === "menu" && !voiceOverlayOpen && (
            <VoiceFab onClick={() => setVoiceOverlayOpen(true)} />
          )}
        </div>
      </div>

    </div>
  );
};

export default Index;
