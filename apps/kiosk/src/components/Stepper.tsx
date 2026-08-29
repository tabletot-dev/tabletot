interface StepperProps {
  /** Current quantity, shown between the − and + controls. */
  qty: number;
  /** Item name — used to build the aria-labels ("Decrease Avocado Toast"). */
  label: string;
  onDec: () => void;
  onInc: () => void;
}

/**
 * The −/qty/+ control shared by the menu card, the inline pairing row, and the
 * cart row. Extracted verbatim from those three call sites — no behaviour
 * change. Styling still lives in `.tt-stepper` (tabletot.css); the CSS targets
 * `button:first-of-type` / `:last-of-type`, so the child order here (button,
 * span, button) is load-bearing.
 */
export default function Stepper({ qty, label, onDec, onInc }: StepperProps) {
  return (
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
}
