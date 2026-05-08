import type { ScreenType } from "@/hooks/useDeviceNavigation";

interface AppHeaderProps {
  currentScreen: ScreenType;
  onNavigate: (screen: ScreenType) => void;
  onAskWaiter?: () => void;
  cartCount: number;
  restaurantName: string;
  tableId: string;
}

const NAV: { label: string; screen: ScreenType; activeOn?: ScreenType[] }[] = [
  { label: "Home", screen: "idle" },
  { label: "Menu", screen: "menu" },
  {
    label: "Status",
    screen: "session-idle",
    activeOn: ["session-idle", "order-confirmation", "listening"],
  },
  { label: "Bill", screen: "bill-summary" },
];

function MicIcon() {
  return (
    <svg className="mic-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0" />
      <path d="M12 17v4" />
      <path d="M9 21h6" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg className="cart-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 5h2l2.3 9.2a2 2 0 0 0 1.9 1.5h7.8a2 2 0 0 0 1.9-1.4L21 8H7.2" />
      <circle cx="10" cy="19" r="1.5" />
      <circle cx="18" cy="19" r="1.5" />
    </svg>
  );
}

export default function AppHeader({
  currentScreen,
  onNavigate,
  onAskWaiter,
  cartCount,
  restaurantName,
  tableId,
}: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="brand-block" onClick={() => onNavigate("idle")} role="button" tabIndex={0}>
        <div className="brand-mark">T</div>
        <div className="brand-copy">
          <strong>{restaurantName || "Tabletot"}</strong>
          <span>Table {tableId || "—"}</span>
        </div>
      </div>

      <div className="header-tools">
        {onAskWaiter && (
          <button
            className="tool-btn voice-button"
            onClick={onAskWaiter}
            aria-label="Speak to order"
          >
            <MicIcon />
          </button>
        )}

        <nav className="top-nav" aria-label="Primary navigation">
          {NAV.map(({ label, screen, activeOn }) => {
            const active = activeOn ? activeOn.includes(currentScreen) : currentScreen === screen;
            return (
              <button
                key={label}
                className={`nav-btn${active ? " active" : ""}`}
                onClick={() => onNavigate(screen)}
              >
                {label}
              </button>
            );
          })}
        </nav>

        <button
          className="tool-btn dark cart-button"
          onClick={() => onNavigate("order-summary")}
          aria-label={`Cart — ${cartCount} item${cartCount === 1 ? "" : "s"}`}
        >
          <CartIcon />
          {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
        </button>
      </div>
    </header>
  );
}
