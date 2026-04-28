import { useEffect, useState } from "react";

interface VoiceAssistantOverlayProps {
  onClose: () => void;
}

const examplePrompts = [
  "\u201CWhat\u2019s popular today?\u201D",
  "\u201CRecommend something light\u201D",
  "\u201CAny gluten-free options?\u201D",
  "\u201CTell me about the salmon\u201D",
];

const VoiceAssistantOverlay = ({ onClose }: VoiceAssistantOverlayProps) => {
  const [elapsed, setElapsed] = useState(0);
  const [activePrompt, setActivePrompt] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setActivePrompt((p) => (p + 1) % examplePrompts.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="absolute bottom-0 left-0 right-0 z-50 flex flex-col" style={{ height: "45%" }}>
      <div className="h-px w-full bg-primary/30" />

      <div className="relative flex-1 flex flex-col items-center justify-center bg-background/95 border-t border-primary/20 px-5 py-4">
        <div
          className="absolute inset-0 opacity-5 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at center bottom, hsl(var(--tt-red)), transparent 70%)",
          }}
        />

        {/* Close button - tappable */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer active:bg-muted transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>

        <div className="relative z-10 flex flex-col items-center gap-3">
          <div className="relative">
            <div className="absolute inset-[-10px] border border-primary/20 animate-mic-pulse" />
            <div className="w-12 h-12 border border-primary flex items-center justify-center bg-background">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-primary">
                <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" />
                <path d="M5 10a7 7 0 0014 0" stroke="currentColor" strokeWidth="2" fill="none" />
                <line x1="12" y1="17" x2="12" y2="22" stroke="currentColor" strokeWidth="2" />
              </svg>
            </div>
          </div>

          <div className="flex items-center gap-1 h-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="w-0.5 bg-primary animate-sound-wave"
                style={{ animationDelay: `${i * 0.15}s`, height: "3px" }}
              />
            ))}
          </div>

          <p className="font-display text-sm tracking-[0.2em] uppercase text-foreground">
            Listening…
          </p>

          <div className="border border-primary/30 px-4 py-1.5 text-center text-xs text-foreground/70 bg-primary/5 min-w-[200px] transition-all duration-500">
            {examplePrompts[activePrompt]}
          </div>
        </div>

        <div className="absolute bottom-2 right-3 text-[9px] font-mono text-muted-foreground/40">
          {String(Math.floor(elapsed / 60)).padStart(2, "0")}:
          {String(elapsed % 60).padStart(2, "0")}
        </div>
      </div>
    </div>
  );
};

export default VoiceAssistantOverlay;
