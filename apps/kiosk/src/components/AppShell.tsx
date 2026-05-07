import type { ScreenType } from "@/hooks/useDeviceNavigation";
import AppHeader from "./AppHeader";

interface AppShellProps {
  children: React.ReactNode;
  currentScreen: ScreenType;
  onNavigate: (screen: ScreenType) => void;
  cartCount: number;
  restaurantName?: string;
  tableId: string;
}

const HEADERLESS_SCREENS: ScreenType[] = ["idle", "order-confirmation"];

export default function AppShell({
  children,
  currentScreen,
  onNavigate,
  cartCount,
  restaurantName = "Tabletot",
  tableId,
}: AppShellProps) {
  const isIdle = HEADERLESS_SCREENS.includes(currentScreen);

  return (
    <div className="app-shell">
      <div className={`tablet-frame${isIdle ? " idle-frame" : ""}`}>
        {!isIdle && (
          <AppHeader
            currentScreen={currentScreen}
            onNavigate={onNavigate}
            cartCount={cartCount}
            restaurantName={restaurantName}
            tableId={tableId}
          />
        )}
        <main className={`app-content${isIdle ? " idle-content" : ""}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
