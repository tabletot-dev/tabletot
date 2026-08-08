import TabletotLogo from "@/components/TabletotLogo";

interface AppBarProps {
  venueName: string;
  tableId: string;
  onAbout?: () => void;
}

export default function AppBar({ venueName, tableId, onAbout }: AppBarProps) {
  const [venueFirst, ...venueRest] = venueName.split(" ");
  const venueTag = venueRest.join(" ");

  return (
    <header className="tt-appbar">
      <div className="tt-appbar-brand">
        <TabletotLogo className="tt-appbar-icon" />
        <div>
          <p className="tt-appbar-brand-name">Tabletot</p>
          <p className="tt-appbar-brand-tag">Table Service</p>
        </div>
      </div>
      <div className="tt-appbar-divider" />
      <button
        type="button"
        className="tt-appbar-venue"
        onClick={onAbout}
        disabled={!onAbout}
      >
        <p className="tt-appbar-venue-name">{venueFirst}</p>
        {venueTag && <p className="tt-appbar-venue-tag">{venueTag}</p>}
      </button>
      <span className="tt-badge">Table {tableId || "—"}</span>
    </header>
  );
}
