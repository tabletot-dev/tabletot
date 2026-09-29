import type { ReactNode } from "react";

interface GameEndProps {
  stats: Array<{ label: string; value: string | number }>;
  onAgain: () => void;
  onExit: () => void;
  children?: ReactNode;
}

/** End-of-game panel shared by every game (the shell above supplies the heading). */
export default function GameEnd({ stats, onAgain, onExit, children }: GameEndProps) {
  return (
    <>
      <div className="tt-gm-stats">
        {stats.map((s) => (
          <div key={s.label} className="tt-gm-stat">
            <span>{s.label}</span>
            <strong>{s.value}</strong>
          </div>
        ))}
      </div>
      {children}
      <button type="button" className="tt-btn--primary" onClick={onAgain}>
        Play again
      </button>
      <button type="button" className="tt-btn--secondary" onClick={onExit}>
        Pick another game
      </button>
    </>
  );
}
