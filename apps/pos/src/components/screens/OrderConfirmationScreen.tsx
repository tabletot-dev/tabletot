import { useEffect } from "react";

const OrderConfirmationScreen = ({ onReset }: { onReset: () => void }) => {
  useEffect(() => {
    const timeout = setTimeout(onReset, 4000);
    return () => clearTimeout(timeout);
  }, [onReset]);

  return (
    <div className="relative flex flex-col items-center justify-center h-full tt-grid-bg overflow-hidden">
      {/* Glow */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          background: "radial-gradient(ellipse at center, hsl(var(--tt-red)), transparent 60%)",
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-8">
        {/* Checkmark */}
        <div className="w-20 h-20 border-2 border-primary flex items-center justify-center">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <path
              d="M10 20L17 27L30 13"
              stroke="hsl(var(--tt-red))"
              strokeWidth="3"
              strokeLinecap="square"
              strokeDasharray="100"
              className="animate-check-draw"
            />
          </svg>
        </div>

        <div className="flex flex-col items-center gap-2">
          <h1 className="font-display text-2xl font-bold tracking-wide text-foreground text-center">
            Order Sent<br />to Kitchen
          </h1>
          <p className="text-sm text-muted-foreground tracking-wider">
            Your meal is being prepared
          </p>
        </div>

        {/* Decorative lines */}
        <div className="flex items-center gap-2 mt-4">
          <div className="w-8 h-px bg-border" />
          <div className="w-2 h-2 border border-primary rotate-45" />
          <div className="w-8 h-px bg-border" />
        </div>

        <p className="text-xs tracking-widest uppercase text-muted-foreground mt-4">
          Thank you for your order
        </p>
      </div>

      {/* Corner decorations */}
      <div className="absolute top-4 left-4 w-6 h-6 border-t border-l border-primary opacity-40" />
      <div className="absolute top-4 right-4 w-6 h-6 border-t border-r border-primary opacity-40" />
      <div className="absolute bottom-4 left-4 w-6 h-6 border-b border-l border-primary opacity-40" />
      <div className="absolute bottom-4 right-4 w-6 h-6 border-b border-r border-primary opacity-40" />
    </div>
  );
};

export default OrderConfirmationScreen;
