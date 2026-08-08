import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { initSentry } from "./lib/sentry";
import "./index.css";
import "./styles/tokens.css";
import "./styles/tabletot.css";

// The design canvas is 800 x 1280 portrait and every token above is a literal
// pixel at that size. Real panels differ, so derive one multiplier from the
// narrower axis and let every spacing and type token scale off it. Read once
// at boot, not on resize: this is a fixed-orientation kiosk, and a live
// listener would only ever fire for the on-screen keyboard.
function setScaleFromViewport(): void {
  const scale = Math.min(window.innerWidth / 800, window.innerHeight / 1280);
  // Clamped so a phone-sized dev window stays legible and a large kiosk does
  // not blow the 800px column apart — the handoff's 0.80 and 1.5 targets sit
  // inside this range.
  const clamped = Math.min(Math.max(scale, 0.75), 1.6);
  document.documentElement.style.setProperty("--tt-scale", String(clamped));
}

setScaleFromViewport();
initSentry();

createRoot(document.getElementById("root")!).render(<App />);
