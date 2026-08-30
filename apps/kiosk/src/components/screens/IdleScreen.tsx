import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, Info, Star, Wifi } from "lucide-react";
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
  /** "About" secondary — opens the Venue/About screen. Does NOT start a session. */
  onOpenAbout: () => void;
  tableId?: string;
}

const ADVANCE_MS = 3500;
const MAX_SLIDES = 5;

const IdleScreen = ({ onActivate, onSelectHeroItem, onOpenPopular, onOpenAbout, tableId }: IdleScreenProps) => {
  const { anchors, loading } = useMenu();
  const reduceMotion = useReducedMotion();

  const chefPicks = anchors
    .filter((a) => a.anchorType === "chef_pick")
    .slice(0, MAX_SLIDES);
  const multi = chefPicks.length > 1;

  const n = chefPicks.length;
  const [wifiOpen, setWifiOpen] = useState(false);

  // One-way infinite filmstrip. `loopPos` indexes into a tripled `loop` array;
  // auto-advance only ever moves it forward. When a slide settles outside the
  // middle copy, `rebase()` snaps it back one copy-width with the transition
  // suppressed — same picture, so the strip reads as a continuous forward loop
  // and never rewinds. Starts on the first card of the middle copy.
  const [loopPos, setLoopPos] = useState(n);
  const [noAnim, setNoAnim] = useState(false);

  const heroIndex = n > 0 ? (((loopPos - n) % n) + n) % n : 0;

  // Auto-advance: always +1 (forward only). Off under reduced-motion / <2 picks.
  // ponytail: a 3.5s setState is not the jank the perf budget guards against.
  useEffect(() => {
    if (!multi || reduceMotion) return;
    const id = window.setInterval(() => setLoopPos((p) => p + 1), ADVANCE_MS);
    return () => window.clearInterval(id);
  }, [multi, reduceMotion]);

  // Recentre if the pick set changes size on a menu refresh.
  useEffect(() => {
    setLoopPos(n);
  }, [n]);

  // Re-enable the transition once the silent rebase jump has painted.
  useEffect(() => {
    if (!noAnim) return;
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => setNoAnim(false)),
    );
    return () => cancelAnimationFrame(id);
  }, [noAnim]);

  const rebase = (e: React.TransitionEvent) => {
    if (e.propertyName !== "transform" || n < 2) return;
    if (loopPos < n || loopPos >= 2 * n) {
      setNoAnim(true);
      setLoopPos(n + ((((loopPos - n) % n) + n) % n));
    }
  };

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

  const step = (dir: -1 | 1) => {
    if (reduceMotion) {
      // No transition to ride (so no transitionend to rebase on) — wrap now.
      setLoopPos((p) => n + ((((p - n + dir) % n) + n) % n));
    } else {
      setLoopPos((p) => p + dir);
    }
  };

  // Render the picks three times so a real card always peeks on BOTH edges,
  // even at the first/last card. The middle copy is the real one (kept in the
  // tab order + a11y tree); the flanking copies are decorative peek.
  const loop = multi ? [...chefPicks, ...chefPicks, ...chefPicks] : chefPicks;
  const centerIdx = multi ? loopPos : heroIndex;

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
          {tableId && (
            <span className="tt-attract-badge">
              <TabletotLogo className="tt-attract-badge-logo" />
              Table {tableId}
            </span>
          )}
        </div>

        <div className="tt-attract-title">
          <p className="tt-attract-title-word">Silver</p>
          <p className="tt-attract-title-sub">Specialty Coffee</p>
          <div className="tt-attract-rule">
            <span />
          </div>
          <p className="tt-attract-tagline">
            Your table waiter.
            <br />
            Browse the menu, or just ask out loud.
          </p>
        </div>

        <button type="button" className="tt-attract-cta" onClick={onActivate}>
          See the menu
          <ChevronRight className="tt-attract-cta-chevron" aria-hidden="true" />
        </button>

        {loading ? (
          <div className="tt-chefpicks-skeleton" aria-hidden="true" />
        ) : chefPicks.length > 0 ? (
          <div className="tt-chefpicks" aria-label="Chef's picks">
            <div className="tt-chefpicks-stage">
              {multi && (
                <button
                  type="button"
                  className="tt-chefpick-nav prev"
                  onClick={() => step(-1)}
                  aria-label="Previous pick"
                >
                  <ChevronLeft size={20} aria-hidden="true" />
                </button>
              )}
              <div className="tt-chefpicks-viewport">
                <div
                  className={`tt-chefpicks-track${noAnim ? " no-anim" : ""}`}
                  onTransitionEnd={rebase}
                  style={{
                    transform: `translateX(calc(50vw - ${centerIdx} * (var(--tt-chefpick-w) + var(--tt-space-3)) - (var(--tt-chefpick-w) / 2)))`,
                  }}
                >
                  {loop.map((item, i) => {
                    const isClone =
                      multi && (i < chefPicks.length || i >= chefPicks.length * 2);
                    return (
                      <button
                        key={i}
                        type="button"
                        className="tt-chefpick"
                        onClick={() => handleSlideTap(item)}
                        aria-label={`View ${item.name}`}
                        aria-hidden={isClone || undefined}
                        tabIndex={isClone ? -1 : undefined}
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
                    );
                  })}
                </div>
              </div>
              {multi && (
                <button
                  type="button"
                  className="tt-chefpick-nav next"
                  onClick={() => step(1)}
                  aria-label="Next pick"
                >
                  <ChevronRight size={20} aria-hidden="true" />
                </button>
              )}
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
            <span className="tt-attract-secondary-icon">
              <Star size={18} aria-hidden="true" />
            </span>
            Popular
            <ChevronRight size={18} className="tt-attract-secondary-arrow" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="tt-attract-secondary"
            onClick={() => setWifiOpen(true)}
          >
            <span className="tt-attract-secondary-icon">
              <Wifi size={18} aria-hidden="true" />
            </span>
            Wi-Fi
            <ChevronRight size={18} className="tt-attract-secondary-arrow" aria-hidden="true" />
          </button>
          <button type="button" className="tt-attract-secondary" onClick={onOpenAbout}>
            <span className="tt-attract-secondary-icon">
              <Info size={18} aria-hidden="true" />
            </span>
            About
            <ChevronRight size={18} className="tt-attract-secondary-arrow" aria-hidden="true" />
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
