import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import type { MenuItem } from "@/data/menu";
import { memoryDeck } from "@/lib/games/decks";
import GameShell from "./GameShell";
import GameEnd from "./GameEnd";

interface GameProps {
  items: MenuItem[];
  status: string | null;
  onExit: () => void;
  onAgain: () => void;
}

const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

export default function MemoryMatch({ items, status, onExit, onAgain }: GameProps) {
  const [deck] = useState(() => memoryDeck(items) ?? []);
  const [open, setOpen] = useState<number[]>([]); // face-up, not yet matched
  const [matched, setMatched] = useState<string[]>([]); // dish names
  const [moves, setMoves] = useState(0);
  const [twoPlayer, setTwoPlayer] = useState(false);
  const [turn, setTurn] = useState(0);
  const [pairs, setPairs] = useState([0, 0]);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const startedAt = useRef(Date.now());
  const timer = useRef<number>();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const restart = (two: boolean) => {
    window.clearTimeout(timer.current);
    setOpen([]);
    setMatched([]);
    setMoves(0);
    setTurn(0);
    setPairs([0, 0]);
    setElapsed(null);
    setTwoPlayer(two);
    startedAt.current = Date.now();
  };

  const flip = (i: number) => {
    if (open.length === 2 || open.includes(i) || matched.includes(deck[i].name)) return;
    const next = [...open, i];
    setOpen(next);
    if (next.length < 2) return;
    setMoves((m) => m + 1);
    const [a, b] = next;
    if (deck[a].name === deck[b].name) {
      const nowMatched = [...matched, deck[a].name];
      setMatched(nowMatched);
      setPairs((p) => p.map((n, k) => (k === turn ? n + 1 : n)));
      setOpen([]);
      if (nowMatched.length === deck.length / 2) setElapsed(Date.now() - startedAt.current);
    } else {
      timer.current = window.setTimeout(() => {
        setOpen([]);
        if (twoPlayer) setTurn((t) => 1 - t);
      }, 800);
    }
  };

  const done = elapsed !== null;
  const dishes = deck.filter((c) => c.key.endsWith("-0"));
  const title = !done
    ? "Find the pairs"
    : twoPlayer
      ? pairs[0] === pairs[1] ? "It's a tie" : `Player ${pairs[0] > pairs[1] ? 1 : 2} wins`
      : `All ${dishes.length} pairs found`;

  return (
    <GameShell eyebrow="Memory Match" title={title} backLabel="All games" onBack={onExit} status={status}>
      {done ? (
        <GameEnd
          stats={
            twoPlayer
              ? [{ label: "Player 1", value: pairs[0] }, { label: "Player 2", value: pairs[1] }, { label: "Moves", value: moves }]
              : [{ label: "Moves", value: moves }, { label: "Time", value: mmss(elapsed) }]
          }
          onAgain={onAgain}
          onExit={onExit}
        >
          <div className="tt-gm-panel">
            <p className="eyebrow">You matched</p>
            <div className="tt-gm-matched">
              {dishes.map((c) => (
                <figure key={c.key}>
                  <img src={c.image} alt="" />
                  <figcaption>{c.name}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </GameEnd>
      ) : (
        <>
          <div className="tt-gm-row">
            <span className="tt-gm-chip">Moves {moves}</span>
            <span className="tt-gm-chip">Pairs {matched.length} of {deck.length / 2}</span>
            {twoPlayer && <span className="tt-gm-chip is-ink">Player {turn + 1}'s turn</span>}
            <button type="button" className="tt-gm-pill" onClick={onAgain}>Restart</button>
          </div>

          <div className="tt-gm-memgrid">
            {deck.map((c, i) => {
              const isMatched = matched.includes(c.name);
              const faceUp = isMatched || open.includes(i);
              return (
                <button
                  key={c.key}
                  type="button"
                  className={`tt-gm-card${faceUp ? " is-up" : ""}${isMatched ? " is-matched" : ""}`}
                  aria-label={faceUp ? c.name : "Hidden card"}
                  onClick={() => flip(i)}
                >
                  {faceUp ? (
                    <>
                      <img src={c.image} alt="" />
                      <span>{c.name}</span>
                      {isMatched && <i aria-hidden="true"><Check size={16} strokeWidth={3} /></i>}
                    </>
                  ) : (
                    <b aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>

          <div>
            <p className="eyebrow">Players</p>
            <div className="tt-gm-seg">
              <button type="button" className={twoPlayer ? undefined : "is-on"} onClick={() => restart(false)}>Solo</button>
              <button type="button" className={twoPlayer ? "is-on" : undefined} onClick={() => restart(true)}>2 players · take turns</button>
            </div>
          </div>
        </>
      )}
    </GameShell>
  );
}
