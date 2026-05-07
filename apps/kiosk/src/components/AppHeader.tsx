import type { ScreenType } from "@/hooks/useDeviceNavigation";

interface AppHeaderProps {
  currentScreen: ScreenType;
  onNavigate: (screen: ScreenType) => void;
  cartCount: number;
  restaurantName: string;
  tableId: string;
}

const NAV: { label: string; screen: ScreenType }[] = [
  { label: "Home", screen: "idle" },
  { label: "Menu", screen: "menu" },
  { label: "Order", screen: "order-summary" },
  { label: "Bill", screen: "bill-summary" },
];

export default function AppHeader({
  currentScreen,
  onNavigate,
  cartCount,
  restaurantName,
  tableId,
}: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="brand-block">
        <div className="brand-mark">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M11 3L19 19H3L11 3Z" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <circle cx="11" cy="14" r="2" stroke="currentColor" strokeWidth="1.2" fill="none" />
          </svg>
        </div>
        <div className="brand-copy">
          <strong style={{ font: "700 17px/1.1 Sora, sans-serif", color: "var(--text)" }}>
            {restaurantName || "Tabletot"}
          </strong>
          <span style={{ fontSize: 13, color: "var(--muted)", marginTop: 3 }}>
            Table {tableId || "—"}
          </span>
        </div>
      </div>

      <div className="header-tools" style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <nav className="top-nav">
          {NAV.map(({ label, screen }) => (
            <button
              key={screen}
              className={`nav-btn${currentScreen === screen ? " active" : ""}`}
              onClick={() => onNavigate(screen)}
            >
              {label}
            </button>
          ))}
        </nav>

        {cartCount > 0 && (
          <button
            className="cart-button"
            onClick={() => onNavigate("order-summary")}
            aria-label={`Cart — ${cartCount} items`}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M2 2h2l2.5 9h9l1.5-6H6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="9" cy="17" r="1.5" fill="currentColor" />
              <circle cx="15" cy="17" r="1.5" fill="currentColor" />
            </svg>
            <span
              style={{
                position: "absolute",
                top: -6,
                right: -6,
                background: "var(--brand)",
                color: "#fff",
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 999,
                minWidth: 18,
                height: 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 4px",
              }}
            >
              {cartCount}
            </span>
          </button>
        )}

        {/* Voice button — wired in Phase 5 */}
        <button className="voice-button" aria-label="Voice order" disabled>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="7" y="2" width="6" height="10" rx="3" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M4 10a6 6 0 0 0 12 0"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <line x1="10" y1="16" x2="10" y2="19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </header>
  );
}
