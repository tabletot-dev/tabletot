import type { ScreenType } from "@/hooks/useDeviceNavigation";
import TabletotLogo from "@/components/TabletotLogo";

interface AppHeaderProps {
  currentScreen: ScreenType;
  onNavigate: (screen: ScreenType) => void;
  restaurantName: string;
  tableId: string;
  showStatusReturn?: boolean;
}

export default function AppHeader({
  onNavigate,
  restaurantName, 
  tableId,
  showStatusReturn = false,
}: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="brand-block" onClick={() => onNavigate("home")} role="button" tabIndex={0}>
        <div className="brand-mark">
          <TabletotLogo />
        </div>
        <div className="brand-copy">
          <strong>{restaurantName || "Tabletot"}</strong>
          <span>Table {tableId || "—"}</span>
        </div>  
      </div>
      {showStatusReturn && (
        <button
          type="button"
          className="header-status-return"
          onClick={() => onNavigate("session-idle")}
        >
          Order Status
        </button>
      )}
      <div className="system-status-strip" aria-label="System status">
        <span>Service OS</span>
        <strong>Online</strong>
      </div>
    </header>
  );
}
