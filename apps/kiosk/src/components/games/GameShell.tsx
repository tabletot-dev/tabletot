import type { ReactNode } from "react";

interface GameShellProps {
  eyebrow: string;
  title: string;
  backLabel: string;
  onBack: () => void;
  /** Kitchen status pill, e.g. "Cooking · ~10 min". Hidden when there's no live order. */
  status?: string | null;
  children: ReactNode;
}

/** Shared chrome for the hub and every game: back link, eyebrow + heading, food status. */
export default function GameShell({ eyebrow, title, backLabel, onBack, status, children }: GameShellProps) {
  return (
    <section className="tt-gm">
      <button type="button" className="tt-menu-back tt-gm-back" onClick={onBack}>
        ← {backLabel}
      </button>
      <div className="tt-gm-head">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
        </div>
        {status && <p className="tt-gm-status">{status}</p>}
      </div>
      {children}
    </section>
  );
}
