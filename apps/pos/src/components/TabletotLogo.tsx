const TabletotLogo = ({ className = "" }: { className?: string }) => (
  <div className={`flex flex-col items-center gap-3 ${className}`}>
    {/* Triangle icon from brand */}
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      className="text-foreground"
    >
      <circle cx="24" cy="24" r="23" stroke="currentColor" strokeWidth="1" />
      <path
        d="M24 14L34 34H14L24 14Z"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
      />
      <circle cx="24" cy="28" r="3" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
    <span className="font-display text-2xl font-bold tracking-[0.2em] uppercase text-foreground">
      Table-Tot
    </span>
  </div>
);

export default TabletotLogo;
