import type { ScreenType } from "@/hooks/useDeviceNavigation";
import AppHeader from "./AppHeader";

interface AppShellProps {
  children: React.ReactNode;
  currentScreen: ScreenType;
  onNavigate: (screen: ScreenType) => void;
  restaurantName?: string;
  tableId: string;
  showStatusReturn?: boolean;
}

const HEADERLESS_SCREENS: ScreenType[] = ["idle", "session-idle", "bill-summary"];

export default function AppShell({
  children,
  currentScreen,
  onNavigate,
  restaurantName = "Tabletot",
  tableId,
  showStatusReturn = false,
}: AppShellProps) {
  const isChromeless = HEADERLESS_SCREENS.includes(currentScreen);
  const isIdleFrame = currentScreen === "session-idle";
  const isAttractFrame = currentScreen === "idle";

  return (
    <div className="app-shell">
      <div className={`tablet-frame${isIdleFrame ? " idle-frame" : ""}${isAttractFrame ? " attract-frame" : ""}`}>
        {!isChromeless && (
          <AppHeader
            currentScreen={currentScreen}
            onNavigate={onNavigate}
            restaurantName={restaurantName}
            tableId={tableId}
            showStatusReturn={showStatusReturn}
          />
        )}
        <main className={`app-content${isIdleFrame ? " idle-content" : ""}${isAttractFrame ? " attract-content" : ""}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
