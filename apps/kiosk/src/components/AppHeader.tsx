import type { ScreenType } from "@/hooks/useDeviceNavigation";

interface AppHeaderProps {
  currentScreen: ScreenType;
  onNavigate: (screen: ScreenType) => void;
  restaurantName: string;
  tableId: string;
}

export default function AppHeader({
  onNavigate,
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
    </header>
  );
}
