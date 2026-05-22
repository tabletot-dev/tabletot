import type { ScreenType } from "@/hooks/useDeviceNavigation";
import AppHeader from "./AppHeader";

interface AppShellProps {
  children: React.ReactNode;
  currentScreen: ScreenType;
  onNavigate: (screen: ScreenType) => void;
  restaurantName?: string;
  tableId: string;
}

const HEADERLESS_SCREENS: ScreenType[] = ["session-idle"];

export default function AppShell({
  children,
  currentScreen,
  onNavigate,
  restaurantName = "Tabletot",
  tableId,
}: AppShellProps) {
  const isChromeless = HEADERLESS_SCREENS.includes(currentScreen);
  const isIdleFrame = currentScreen === "session-idle";

  return (
    <div className="app-shell">
      <div className={`tablet-frame${isIdleFrame ? " idle-frame" : ""}`}>
        {!isChromeless && (
          <AppHeader
            currentScreen={currentScreen}
            onNavigate={onNavigate}
            restaurantName={restaurantName}
            tableId={tableId}
          />
        )}
        <main className={`app-content${isIdleFrame ? " idle-content" : ""}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
