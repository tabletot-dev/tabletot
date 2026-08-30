// The Tabletot mark ("The Tot"): two bars flanking a coral centre dot.
// Bars inherit currentColor so callers tint them; the dot is the fixed
// brand coral (#F36C31) and is never recoloured. Geometry matches the kiosk.
const TabletotLogo = ({ className = "" }: { className?: string }) => (
  <svg
    viewBox="0 0 64 64"
    className={className}
    fill="none"
    role="img"
    aria-label="Tabletot"
  >
    <rect x="11" y="12" width="8" height="40" fill="currentColor" />
    <rect x="45" y="12" width="8" height="40" fill="currentColor" />
    <circle cx="32" cy="32" r="6" fill="#F36C31" />
  </svg>
);

export default TabletotLogo;
