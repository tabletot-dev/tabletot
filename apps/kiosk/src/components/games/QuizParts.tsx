import { Check } from "lucide-react";

/** Round progress: one segment per round, the current one in the action colour. */
export function Progress({ current, total, score }: { current: number; total: number; score: number }) {
  return (
    <div className="tt-gm-progress">
      <div className="tt-gm-progress-bar" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={i < current ? "done" : i === current ? "current" : undefined} />
        ))}
      </div>
      <span className="tt-gm-progress-label">Round {Math.min(current + 1, total)} of {total}</span>
      <span className="tt-gm-chip">Score {score}</span>
    </div>
  );
}

interface OptionsProps {
  options: string[];
  answer: string;
  /** null until the guest picks; then the grid locks and shows the result. */
  picked: string | null;
  onPick: (option: string) => void;
}

/** Four answer buttons. After a pick: the right one is ink-filled, the others fall back. */
export function Options({ options, answer, picked, onPick }: OptionsProps) {
  return (
    <div className="tt-gm-options">
      {options.map((o) => {
        const state = picked === null ? "" : o === answer ? " is-right" : o === picked ? " is-wrong" : " is-dim";
        return (
          <button key={o} type="button" className={`tt-gm-option${state}`} disabled={picked !== null} onClick={() => onPick(o)}>
            {picked !== null && o === answer && <Check size={26} strokeWidth={3} aria-hidden="true" />}
            {o}
          </button>
        );
      })}
    </div>
  );
}
