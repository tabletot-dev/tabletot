import { useEffect, useState } from "react";
import { useRestaurant } from "@/lib/restaurantContext";

interface ScreensaverOverlayProps {
  onDismiss: () => void;
}

// Fullscreen ad carousel shown after a period of no touch on the Attract or
// Order Status screens. Reuses the same `ads` data + rotation cadence as
// WaitingView's inline promo strip (apps/kiosk/src/components/screens/WaitingView.tsx).
export default function ScreensaverOverlay({ onDismiss }: ScreensaverOverlayProps) {
  const { ads } = useRestaurant();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (ads.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % ads.length), 4500);
    return () => clearInterval(id);
  }, [ads.length]);

  if (ads.length === 0) return null;
  const ad = ads[index];

  return (
    <div className="tt-screensaver">
      <div className="tt-screensaver-media" style={{ backgroundImage: `url(${ad.image_url})` }} />
      <button type="button" className="tt-screensaver-exit" onClick={onDismiss}>
        Tap to continue
      </button>
    </div>
  );
}
