const TabletotLogo = ({ className = "" }: { className?: string }) => (
  <div className={`flex flex-col items-center gap-3 ${className}`}>
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <rect width="48" height="48" rx="12" fill="var(--tt-ink)" />
      <path
        d="M14 16h20M24 16v18"
        stroke="var(--tt-paper)"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
    <span className="font-display text-2xl font-bold text-foreground">
      Tabletot
    </span>
  </div>
);

export default TabletotLogo;
