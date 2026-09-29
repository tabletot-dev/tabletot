import { useEffect, useRef, useState } from "react";
import { cpuMove, winner, winningLine, type Board, type Mark } from "@/lib/games/tictactoe";
import GameShell from "./GameShell";

interface GameProps {
  status: string | null;
  onExit: () => void;
}

const EMPTY: Board = Array(9).fill(null);

function MarkGlyph({ mark }: { mark: Mark }) {
  return mark === "X" ? (
    <svg viewBox="0 0 100 100" aria-hidden="true"><path d="M20 20L80 80M80 20L20 80" className="tt-gm-x" /></svg>
  ) : (
    <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="30" className="tt-gm-o" /></svg>
  );
}

export default function TicTacToe({ status, onExit }: GameProps) {
  const [vsCpu, setVsCpu] = useState(true);
  const [board, setBoard] = useState<Board>(EMPTY);
  const [turn, setTurn] = useState<Mark>("X");
  const [score, setScore] = useState({ X: 0, O: 0, draw: 0 });
  const timer = useRef<number>();

  const won = winner(board);
  const line = winningLine(board);
  const draw = !won && board.every(Boolean);
  const over = !!won || draw;
  const cpuThinking = vsCpu && turn === "O" && !over;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Count each finished game once.
  useEffect(() => {
    if (won) setScore((s) => ({ ...s, [won]: s[won] + 1 }));
    else if (draw) setScore((s) => ({ ...s, draw: s.draw + 1 }));
  }, [won, draw]);

  const play = (i: number) => {
    if (board[i] || over || cpuThinking) return;
    const next = [...board];
    next[i] = turn;
    setBoard(next);
    setTurn(turn === "X" ? "O" : "X");
    if (vsCpu && !winner(next) && next.some((c) => !c)) {
      timer.current = window.setTimeout(() => {
        const move = cpuMove(next, "O");
        setBoard((b) => b.map((c, k) => (k === move ? "O" : c)));
        setTurn("X");
      }, 450);
    }
  };

  const reset = (cpu = vsCpu) => {
    window.clearTimeout(timer.current);
    setBoard(EMPTY);
    setTurn("X");
    setVsCpu(cpu);
  };
  const changeMode = (cpu: boolean) => {
    if (cpu === vsCpu) return;
    setScore({ X: 0, O: 0, draw: 0 });
    reset(cpu);
  };

  const heading = won
    ? vsCpu ? (won === "X" ? "You win!" : "Tablet wins") : `${won} wins!`
    : draw ? "It's a draw"
    : cpuThinking ? "Tablet is thinking…"
    : vsCpu ? "Your move" : `${turn}'s turn`;
  const [left, right] = vsCpu ? ["You", "Tablet"] : ["X", "O"];

  return (
    <GameShell eyebrow="Tic-Tac-Toe" title={heading} backLabel="All games" onBack={onExit} status={status}>
      <div className="tt-gm-seg">
        <button type="button" className={vsCpu ? "is-on" : undefined} onClick={() => changeMode(true)}>vs Tablet</button>
        <button type="button" className={vsCpu ? undefined : "is-on"} onClick={() => changeMode(false)}>vs Friend</button>
      </div>

      <div className="tt-gm-board" role="grid" aria-label="Tic-tac-toe board">
        {board.map((cell, i) => (
          <button
            key={i}
            type="button"
            role="gridcell"
            className={`tt-gm-cell${line?.includes(i) ? " is-win" : ""}`}
            aria-label={cell ? `${cell}` : `Empty cell ${i + 1}`}
            onClick={() => play(i)}
          >
            {cell && <MarkGlyph mark={cell} />}
          </button>
        ))}
      </div>

      <div className="tt-gm-row">
        <span className="tt-gm-chip">{left} {score.X}</span>
        <span className="tt-gm-chip">{right} {score.O}</span>
        <span className="tt-gm-chip">Draws {score.draw}</span>
        <button type="button" className="tt-gm-pill" onClick={() => reset()}>New game</button>
      </div>
    </GameShell>
  );
}
