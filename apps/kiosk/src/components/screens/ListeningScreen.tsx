import { useEffect, useState } from "react";

const ListeningScreen = ({ onDone }: { onDone: () => void }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    // Auto-transition after demo
    const timeout = setTimeout(onDone, 4000);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [onDone]);

  return (
    <div className="relative flex flex-col items-center justify-center h-full tt-grid-bg overflow-hidden">
      {/* Red glow */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          background: "radial-gradient(ellipse at center, hsl(var(--tt-red)), transparent 70%)",
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-8">
        {/* Large mic with wave animation */}
        <div className="relative">
          {/* Outer pulse rings */}
          <div className="absolute inset-[-20px] border border-primary opacity-20 animate-mic-pulse" />
          <div className="absolute inset-[-40px] border border-primary opacity-10 animate-mic-pulse" style={{ animationDelay: "0.5s" }} />

          <div className="w-24 h-24 border-2 border-primary flex items-center justify-center bg-background">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="text-primary">
              <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" />
              <path d="M5 10a7 7 0 0014 0" stroke="currentColor" strokeWidth="2" fill="none" />
              <line x1="12" y1="17" x2="12" y2="22" stroke="currentColor" strokeWidth="2" />
            </svg>
          </div>
        </div>

        {/* Sound wave bars */}
        <div className="flex items-center gap-1 h-8">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="w-1 bg-primary animate-sound-wave"
              style={{
                animationDelay: `${i * 0.15}s`,
                height: "4px",
              }}
            />
          ))}
        </div>

        <p className="font-display text-xl tracking-[0.2em] uppercase text-foreground">
          Listening…
        </p>

        {/* Example commands */}
        <div className="mt-4 flex flex-col gap-3 w-full max-w-[260px]">
          <p className="text-xs tracking-widest uppercase text-muted-foreground text-center mb-1">
            Try saying
          </p>
          {['"Order a burger"', '"Show desserts"', '"Add fries"'].map((cmd, i) => (
            <div
              key={i}
              className="border border-border px-4 py-2 text-center text-sm text-foreground opacity-60"
            >
              {cmd}
            </div>
          ))}
        </div>
      </div>

      {/* Timer */}
      <div className="absolute bottom-6 right-6 text-xs font-mono text-muted-foreground">
        {String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}
      </div>
    </div>
  );
};

export default ListeningScreen;
