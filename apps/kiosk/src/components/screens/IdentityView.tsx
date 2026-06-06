import { useState } from "react";

interface IdentityViewProps {
  onContinue: (displayName: string | undefined) => void;
}

const MAX_NAME_LENGTH = 24;

export default function IdentityView({ onContinue }: IdentityViewProps) {
  const [value, setValue] = useState("");

  const handleContinue = () => {
    const trimmed = value.trim();
    onContinue(trimmed.length > 0 ? trimmed : undefined);
  };

  const handleSkip = () => {
    onContinue(undefined);
  };

  return (
    <section className="view home-view home-sun-view">
      <div className="home-command-grid">
        <div className="home-launch-panel">
          <div className="home-hero-block">
            <p className="eyebrow">One last thing</p>
            <div className="home-hero-row">
              <h1 className="home-brand-headline">
                <span className="headline-speak">What should</span>
                <span className="headline-order">we call</span>
                <span className="headline-served">you?</span>
              </h1>
              <p className="hero-sub hero-system-copy">
                We'll use your name to personalize your visit.
                <span>We won't share it with anyone.</span>
              </p>
            </div>
          </div>

          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Your name (optional)"
            maxLength={MAX_NAME_LENGTH}
            autoFocus
            aria-label="Your name"
            style={{
              padding: "16px 18px",
              fontSize: "20px",
              fontFamily: "inherit",
              border: "1px solid var(--border, #d4c4ad)",
              background: "var(--background, #fff)",
              color: "inherit",
              borderRadius: 0,
              outline: "none",
              width: "100%",
              boxSizing: "border-box",
            }}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <button className="primary-btn home-start-cta" onClick={handleContinue}>
              <span>Send to Kitchen</span>
              <small>Confirm your order</small>
            </button>
            <button
              onClick={handleSkip}
              className="w-full py-3 border border-border text-muted-foreground font-display text-xs font-semibold tracking-widest uppercase cursor-pointer hover:border-primary/40 hover:text-foreground active:bg-muted transition-all"
              style={{ background: "transparent" }}
            >
              Skip
            </button>
          </div>
        </div>

        <div className="home-spotlight-stack">
          <div
            className="hero-feature home-spotlight"
            style={{ background: "linear-gradient(135deg, #f5e6d8, #e8c9a8)" }}
          />
        </div>
      </div>
    </section>
  );
}
