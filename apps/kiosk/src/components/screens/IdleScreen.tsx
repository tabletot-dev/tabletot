import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import * as Dialog from "@radix-ui/react-dialog";
import { Mic } from "lucide-react";
import TabletotLogo from "@/components/TabletotLogo";
import { useMenu } from "@/lib/menuStore";
import type { AnchorItem } from "@/lib/menuStore";
import { itemImageBackground } from "@/lib/menuImages";
import { track } from "@/lib/eventBus";
import wifiQrSrc from "@/assets/wifi-qr.svg";

// Pilot is a single open network. TODO: restaurant_settings key when multi-restaurant lands.
const WIFI_SSID = "SILVER-GUEST";

interface IdleScreenProps {
  /** "See the menu" / touch anywhere — starts the session and goes to the menu. */
  onActivate: () => void;
  /** A chef's-pick slide tap — starts the session and deep-links to detail. */
  onSelectHeroItem: (item: AnchorItem) => void;
  /** "Popular" secondary — starts the session and opens the Popular screen. */
  onOpenPopular: () => void;
  tableId?: string;
}

const ADVANCE_MS = 3500;
const MAX_SLIDES = 5;

const IdleScreen = ({ onActivate, onSelectHeroItem, onOpenPopular, tableId }: IdleScreenProps) => {
  const { anchors, loading } = useMenu();
  const reduceMotion = useReducedMotion();

  const chefPicks = anchors
    .filter((a) => a.anchorType === "chef_pick")
    .slice(0, MAX_SLIDES);
  const multi = chefPicks.length > 1;

  const [heroIndex, setHeroIndex] = useState(0);
  const [wifiOpen, setWifiOpen] = useState(false);

  // Auto-advance: one ~3.5s tick drives both the track transform and the
  // dots. Disabled under prefers-reduced-motion (slide 1 only) and when
  // there is 0 or 1 pick. ponytail: a 3.5s setState is not the jank the
  // perf budget guards against; CSS-only can't sync the dots.
  useEffect(() => {
    if (!multi || reduceMotion) return;
    const id = window.setInterval(
      () => setHeroIndex((i) => (i + 1) % chefPicks.length),
      ADVANCE_MS,
    );
    return () => window.clearInterval(id);
  }, [multi, reduceMotion, chefPicks.length]);

  // Keep the index in range if the pick set shrinks on a menu refresh.
  useEffect(() => {
    if (heroIndex >= chefPicks.length) setHeroIndex(0);
  }, [chefPicks.length, heroIndex]);

  // One recommendation_shown per pick per "attract visible" cycle.
  const shownIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    chefPicks.forEach((item) => {
      if (shownIds.current.has(item.id)) return;
      shownIds.current.add(item.id);
      track("recommendation_shown", { itemId: item.id, surface: "attract_carousel" });
    });
  }, [chefPicks]);

  const handleSlideTap = (item: AnchorItem) => {
    track("recommendation_tapped", { itemId: item.id, surface: "attract_carousel" });
    onSelectHeroItem(item);
  };

  return (
    <div className="tt-attract">
      {/* Background "touch anywhere" target. A real <button>, a flat sibling
          of the content — the CTA and the slide buttons layer above it, so
          there is no interactive-nested-in-interactive. */}
      <button
        type="button"
        className="tt-attract-touch"
        onClick={onActivate}
        aria-label="Touch anywhere to start"
      />

      <div className="tt-attract-content">
        <div className="tt-attract-header">
          <div className="tt-attract-brand">
            <TabletotLogo className="tt-attract-icon" />
            <div>
              <p className="tt-attract-brand-name">Tabletot</p>
              <p className="tt-attract-brand-tag">Table Service</p>
            </div>
          </div>
          {tableId && <span className="tt-badge">Table {tableId}</span>}
        </div>

        <div className="tt-attract-title">
          <p className="tt-attract-title-word">Silver</p>
          <p className="tt-attract-title-sub">Specialty Coffee</p>
          <div className="tt-attract-rule" />
          <p className="tt-attract-tagline">
            Your table waiter. Browse the menu, or just ask out loud.
          </p>
        </div>

        <button type="button" className="tt-attract-cta" onClick={onActivate}>
          <span className="tt-attract-cta-icon">
            <Mic size={20} />
          </span>
          <span className="tt-attract-cta-text">
            <strong>See the menu</strong>
            <span>or say "Hey Tabletot, I'm hungry"</span>
          </span>
        </button>

        {loading ? (
          <div className="tt-chefpicks-skeleton" aria-hidden="true" />
        ) : chefPicks.length > 0 ? (
          <div className="tt-chefpicks" aria-label="Chef's picks">
            <p className="tt-badge">Chef's picks</p>
            <div className="tt-chefpicks-viewport">
              <div
                className="tt-chefpicks-track"
                style={{ transform: `translateX(calc(${-heroIndex} * (72vw + var(--tt-space-3))))` }}
              >
                {chefPicks.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="tt-chefpick"
                    onClick={() => handleSlideTap(item)}
                    aria-label={`View ${item.name}`}
                  >
                    <span
                      className="tt-chefpick-thumb"
                      style={{ background: itemImageBackground(item) }}
                    />
                    <span className="tt-chefpick-meta">
                      <span className="tt-chefpick-name">{item.name}</span>
                      <span className="tt-chefpick-price">₹{item.price}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {multi && (
              <div className="tt-chefpick-dots" aria-hidden="true">
                {chefPicks.map((_, i) => (
                  <span
                    key={i}
                    className={`tt-chefpick-dot${i === heroIndex ? " active" : ""}`}
                  />
                ))}
              </div>
            )}
          </div>
        ) : null}

        <div className="tt-attract-secondaries">
          <button type="button" className="tt-attract-secondary" onClick={onOpenPopular}>
            Popular
          </button>
          <button
            type="button"
            className="tt-attract-secondary"
            onClick={() => setWifiOpen(true)}
          >
            Wi-Fi
          </button>
        </div>
      </div>

      <Dialog.Root open={wifiOpen} onOpenChange={setWifiOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="tt-modal-scrim" />
          <Dialog.Content className="tt-modal tt-wifi-dialog" aria-describedby={undefined}>
            <Dialog.Title>Join the café Wi-Fi</Dialog.Title>
            <img
              className="tt-wifi-qr"
              src={wifiQrSrc}
              alt={`QR code to join the ${WIFI_SSID} Wi-Fi network`}
            />
            <p>
              Point your phone camera at the code — the network is open, no
              password needed.
            </p>
            <p className="tt-wifi-network">Network: {WIFI_SSID}</p>
            <div className="tt-modal-actions">
              <Dialog.Close asChild>
                <button type="button" className="tt-btn--secondary">
                  Close
                </button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};

export default IdleScreen;
