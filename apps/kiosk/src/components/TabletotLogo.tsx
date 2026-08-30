// Client-delivered mark ("The Tot"): two bars + a centre dot. Bars take
// `currentColor` so each context tints them; the dot is always the coral
// accent and is never recoloured. Geometry from the client's marks.jsx.
const TabletotLogo = ({ className = "" }: { className?: string }) => (
  <div className={`flex flex-col items-center gap-3 ${className}`}>
    <svg width="48" height="48" viewBox="0 0 64 64" fill="none">
      <rect x="11" y="12" width="8" height="40" fill="currentColor" />
      <rect x="45" y="12" width="8" height="40" fill="currentColor" />
      <circle cx="32" cy="32" r="6" fill="var(--tt-action)" />
    </svg>
    <span className="font-display text-2xl font-bold text-foreground">
      tabletot
    </span>
  </div>
);

export default TabletotLogo;
