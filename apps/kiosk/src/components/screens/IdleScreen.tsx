import TabletotLogo from "@/components/TabletotLogo";

const IdleScreen = ({ onActivate }: { onActivate: () => void }) => {
  return (
    <div className="relative flex flex-col items-center justify-center h-full tt-grid-bg overflow-hidden">
      {/* Subtle gradient glow from brand */}
      <div
        className="absolute top-0 right-0 w-64 h-64 opacity-20 blur-[80px]"
        style={{
          background: "radial-gradient(circle, hsl(var(--tt-red)), transparent)",
        }}
      />
      <div
        className="absolute bottom-0 left-0 w-48 h-48 opacity-15 blur-[60px]"
        style={{
          background: "radial-gradient(circle, hsl(var(--tt-orange)), transparent)",
        }}
      />

      {/* Scanline effect */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="w-full h-px opacity-10 animate-scanline"
          style={{ background: "hsl(var(--tt-red))" }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-8">
        <TabletotLogo />

        <p className="font-display text-lg tracking-[0.3em] uppercase text-foreground opacity-80">
          Speak. Order. Served.
        </p>

        {/* Start Ordering CTA */}
        <button
          onClick={onActivate}
          className="mt-6 px-10 py-4 bg-primary text-primary-foreground font-display text-base font-semibold tracking-[0.2em] uppercase cursor-pointer transition-all hover:opacity-90 active:scale-95"
        >
          Start Ordering
        </button>

        {/* Voice option */}
        <div className="flex items-center gap-2 text-muted-foreground mt-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-primary/60">
            <rect x="9" y="2" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M5 10a7 7 0 0014 0" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <line x1="12" y1="17" x2="12" y2="22" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <span className="text-xs tracking-widest uppercase">Or use voice to order</span>
        </div>
      </div>

      {/* Corner decorations - brand HUD style */}
      <div className="absolute top-4 left-4 w-6 h-6 border-t border-l border-border" />
      <div className="absolute top-4 right-4 w-6 h-6 border-t border-r border-border" />
      <div className="absolute bottom-4 left-4 w-6 h-6 border-b border-l border-border" />
      <div className="absolute bottom-4 right-4 w-6 h-6 border-b border-r border-border" />
    </div>
  );
};

export default IdleScreen;
