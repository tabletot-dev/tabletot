import { useEffect, useRef, useState } from "react";

interface StepperProps {
  /** Current quantity, shown between the − and + controls. */
  qty: number;
  /** Item name — used to build the aria-labels ("Decrease Avocado Toast"). */
  label: string;
  onDec: () => void;
  onInc: () => void;
  /**
   * When provided AND qty >= 2, renders a "×" clear control at the opposite
   * end of the group from the − button (≥24px dead-space). It is a two-tap
   * confirm: first tap swaps it to "Tap again to remove" for ~2s, a second tap
   * within the window clears the line; the timeout reverts. At qty 1 the −
   * button already clears in one tap, so no × is shown.
   */
  onClear?: () => void;
}

const CONFIRM_MS = 2000;

/**
 * The −/qty/+ control shared by the menu card, the inline pairing row, and the
 * cart row. Styling lives in `.tt-stepper` (tabletot.css); the CSS targets
 * `button:first-of-type` / `:last-of-type`, so the child order here (button,
 * span, button) is load-bearing. The optional × clear sits OUTSIDE `.tt-stepper`
 * so it never shifts those selectors.
 */
export default function Stepper({ qty, label, onDec, onInc, onClear }: StepperProps) {
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    // A quantity change (or unmount) cancels any pending "tap again" confirm.
    setConfirming(false);
    return () => clearTimeout(timer.current);
  }, [qty]);

  const handleClear = () => {
    if (confirming) {
      clearTimeout(timer.current);
      setConfirming(false);
      onClear?.();
      return;
    }
    setConfirming(true);
    timer.current = setTimeout(() => setConfirming(false), CONFIRM_MS);
  };

  const stepper = (
    <div className="tt-stepper" aria-label={`${label} quantity`}>
      <button
        type="button"
        className={qty === 1 ? "tt-stepper-minus--floor" : undefined}
        onClick={onDec}
        aria-label={`Decrease ${label}`}
      >
        −
      </button>
      <span>{qty}</span>
      <button type="button" onClick={onInc} aria-label={`Increase ${label}`}>
        +
      </button>
    </div>
  );

  if (!onClear || qty < 2) return stepper;

  return (
    <div className="tt-stepper-group">
      {stepper}
      <button
        type="button"
        className={`tt-stepper-clear${confirming ? " is-confirming" : ""}`}
        onClick={handleClear}
        aria-label={confirming ? `Tap again to remove ${label}` : `Remove ${label}`}
      >
        {confirming ? "Tap again to remove" : "×"}
      </button>
    </div>
  );
}
