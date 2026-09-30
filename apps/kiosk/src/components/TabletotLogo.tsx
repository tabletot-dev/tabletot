// Client-delivered mark ("The Tot"): two bars + a centre dot. Bars take
// `currentColor` so each context tints them; the dot is always the coral
// accent and is never recoloured. `spinning` pulses the dot for loading screens. Geometry from the client's marks.jsx.
const TabletotLogo = ({ className = "", spinning = false }: { className?: string; spinning?: boolean }) => (
  <div className={`flex flex-col items-center gap-3 ${className}`}>
    <svg width="48" height="48" viewBox="0 0 64 64" fill="none" className={spinning ? "tt-logo--spinning" : undefined}>
      <rect x="11" y="12" width="8" height="40" fill="currentColor" />
      <rect x="45" y="12" width="8" height="40" fill="currentColor" />
      <circle cx="32" cy="32" r="6" fill="var(--tt-action)" />
    </svg>
    <span className="font-display text-2xl font-bold text-foreground">
      tabletot
    </span>
  </div>
);

// Centered spinning mark for loading screens (menu fetch, lazy screens, bill).
export const LoadingMark = () => (
  <div className="tt-loading" role="status" aria-label="Loading">
    <TabletotLogo spinning />
  </div>
);

export default TabletotLogo;
