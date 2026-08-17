import type { ScreenType } from "@/hooks/useDeviceNavigation";
import AppBar from "./AppBar";

interface AppShellProps {
  children: React.ReactNode;
  currentScreen: ScreenType;
  venueName?: string;
  tableId: string;
  onAbout?: () => void;
  orderBar?: React.ReactNode;
  statusStrip?: React.ReactNode;
  voiceDock?: React.ReactNode;
}

// Screens that own their full canvas and draw no chrome.
const BARE_SCREENS: ScreenType[] = ["idle", "order-confirmation"];

// The invariant for every screen in the product: AppBar (optional) → exactly
// one scroll region → docked bars, bars always flex: none. If a new screen
// needs chrome that is not in this file, it is the wrong shape.
export default function AppShell({
  children,
  currentScreen,
  venueName = "Tabletot",
  tableId,
  onAbout,
  orderBar,
  statusStrip,
  voiceDock,
}: AppShellProps) {
  const bare = BARE_SCREENS.includes(currentScreen);

  return (
    <div className="tt-shell">
      {!bare && <AppBar venueName={venueName} tableId={tableId} onAbout={onAbout} />}
      <main className="tt-scroll" style={bare ? { padding: 0 } : undefined}>{children}</main>
      {statusStrip}
      {orderBar}
      {voiceDock}
    </div>
  );
}
