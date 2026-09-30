import { useEffect, useState } from "react";
import { useRestaurant } from "@/lib/restaurantContext";
import { useKitchenStatus, STATUS_STAGE } from "@/hooks/useKitchenStatus";

interface ScreensaverOverlayProps {
  onDismiss: () => void;
  /** Live order id, when there is one — lets the screensaver show a food
   *  status strip and auto-dismiss once the order is ready. */
  orderId?: string | null;
  /** Override for the bottom-right hint — the Attract screen says "Tap to order". */
  cta?: string;
}

// Fullscreen ad carousel shown after a period of no touch on the Attract (20s) or
// Order Status (30s) screens. Reuses the same `ads` data + rotation cadence as
// WaitingView's inline promo strip (apps/kiosk/src/components/screens/WaitingView.tsx).
export default function ScreensaverOverlay({ onDismiss, orderId = null, cta = "Tap anywhere to continue" }: ScreensaverOverlayProps) {
  const { ads, venueName } = useRestaurant();
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const kitchenStatus = useKitchenStatus(orderId);

  useEffect(() => {
    if (ads.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % ads.length), 4500);
    return () => clearInterval(id);
  }, [ads.length]);

  // Close automatically once the kitchen has this order ready — the ad
  // shouldn't be the thing standing between a guest and their food.
  useEffect(() => {
    if (kitchenStatus === "ready" || kitchenStatus === "served") onDismiss();
  }, [kitchenStatus, onDismiss]);

  const visibleAds = ads.filter((a) => !failed.has(a.id));
  // Every ad image failed to load (or there are none) — fall back to the
  // normal screen instead of a black rectangle with just a button on it.
  if (visibleAds.length === 0) return null;
  const ad = visibleAds[index % visibleAds.length];

  return (
    <div className="tt-screensaver">
      <img
        key={ad.id}
        src={ad.image_url}
        alt=""
        aria-hidden="true"
        className="tt-screensaver-media"
        onError={() => setFailed((prev) => new Set(prev).add(ad.id))}
      />
      {/* Full-bleed tap target, a flat sibling of the image — tapping
          anywhere dismisses, not just the small hint button. */}
      <button type="button" className="tt-screensaver-touch" onClick={onDismiss} aria-label="Tap to continue" />
      {venueName && <span className="tt-screensaver-venue">{venueName}</span>}
      {orderId && kitchenStatus !== "unknown" && (
        <span className="tt-screensaver-status">
          Your food: {STATUS_STAGE[kitchenStatus].label}
        </span>
      )}
      <span className="tt-screensaver-exit" aria-hidden="true">{cta}</span>
    </div>
  );
}
