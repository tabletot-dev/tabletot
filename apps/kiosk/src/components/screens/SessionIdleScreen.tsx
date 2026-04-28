import { useState, useEffect } from "react";

const ads = [
  {
    title: "Happy Hour",
    subtitle: "50% off cocktails · 4–7 PM daily",
    gradient: "linear-gradient(135deg, hsl(var(--tt-red)), hsl(var(--tt-orange)))",
  },
  {
    title: "Live Jazz Fridays",
    subtitle: "Every Friday from 8 PM · No cover charge",
    gradient: "linear-gradient(135deg, hsl(18 89% 40%), hsl(359 84% 45%))",
  },
  {
    title: "Chef's Tasting Menu",
    subtitle: "5-course experience · $89 per person",
    gradient: "linear-gradient(135deg, hsl(359 84% 35%), hsl(18 89% 57%))",
  },
  {
    title: "Weekend Brunch",
    subtitle: "Sat & Sun · 10 AM – 2 PM · Bottomless mimosas",
    gradient: "linear-gradient(135deg, hsl(var(--tt-orange)), hsl(40 90% 50%))",
  },
  {
    title: "Loyalty Rewards",
    subtitle: "Earn points on every order · Join free today",
    gradient: "linear-gradient(135deg, hsl(var(--tt-red)), hsl(330 70% 45%))",
  },
];

interface SessionIdleScreenProps {
  onOrderMore: () => void;
  onRequestBill: () => void;
}

const SessionIdleScreen = ({ onOrderMore, onRequestBill }: SessionIdleScreenProps) => {
  const [activeIndex, setActiveIndex] = useState(0);

  // Auto-advance carousel
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((i) => (i + 1) % ads.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Carousel area */}
      <div className="flex-1 relative overflow-hidden">
        {ads.map((ad, i) => (
          <div
            key={i}
            className={`absolute inset-0 flex flex-col items-center justify-center px-8 transition-all duration-700 ${
              i === activeIndex ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
            }`}
            style={{ background: ad.gradient }}
          >
            {/* Overlay for readability */}
            <div className="absolute inset-0 bg-background/30" />

            <div className="relative z-10 flex flex-col items-center gap-4 text-center">
              <h2 className="font-display text-3xl font-bold text-foreground tracking-wide leading-tight">
                {ad.title}
              </h2>
              <p className="text-sm text-foreground/80 tracking-wider max-w-[260px]">
                {ad.subtitle}
              </p>
            </div>
          </div>
        ))}

        {/* Carousel dots */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 z-20">
          {ads.map((_, i) => (
            <button
              key={i}
              onClick={() => setActiveIndex(i)}
              className={`w-2 h-2 cursor-pointer transition-all ${
                i === activeIndex ? "bg-primary scale-125" : "bg-foreground/30"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="p-4 flex flex-col gap-2 border-t border-border bg-background">
        <button
          onClick={onOrderMore}
          className="w-full py-4 bg-primary text-primary-foreground font-display text-sm font-semibold tracking-widest uppercase cursor-pointer transition-all hover:opacity-90 active:scale-[0.98]"
        >
          Order More
        </button>
        <button
          onClick={onRequestBill}
          className="w-full py-3.5 font-display text-sm font-semibold tracking-widest uppercase cursor-pointer transition-all bg-muted text-foreground border border-border hover:border-primary/50 active:bg-primary/10"
        >
          Request Bill
        </button>
      </div>
    </div>
  );
};

export default SessionIdleScreen;
