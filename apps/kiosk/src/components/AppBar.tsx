import TabletotLogo from "@/components/TabletotLogo";

interface AppBarProps {
  venueName: string;
  tableId: string;
  onAbout?: () => void;
}

export default function AppBar({ venueName, tableId, onAbout }: AppBarProps) {
  return (
    <header className="tt-appbar">
      <div className="tt-appbar-brand">
        <TabletotLogo />
        <span>Tabletot</span>
      </div>
      <button
        type="button"
        className="tt-appbar-venue"
        onClick={onAbout}
        disabled={!onAbout}
      >
        {venueName}
      </button>
      <span className="tt-badge">Table {tableId || "—"}</span>
    </header>
  );
}
