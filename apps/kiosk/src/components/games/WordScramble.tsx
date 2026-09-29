import { useState } from "react";
import type { MenuItem } from "@/data/menu";
import { scrambleWords, scrambleLetters } from "@/lib/games/decks";
import GameShell from "./GameShell";
import GameEnd from "./GameEnd";
import { Progress } from "./QuizParts";

interface GameProps {
  items: MenuItem[];
  status: string | null;
  onExit: () => void;
  onAgain: () => void;
}

export default function WordScramble({ items, status, onExit, onAgain }: GameProps) {
  const [words] = useState(() => scrambleWords(items) ?? []);
  const [i, setI] = useState(0);
  const [tiles, setTiles] = useState(() => words[0]?.tiles ?? []);
  const [placed, setPlaced] = useState<number[]>([]); // tile indexes, in slot order
  const [revealed, setRevealed] = useState(false);
  const [solved, setSolved] = useState(false);
  const [score, setScore] = useState(0);

  const word = words[i];
  const done = i >= words.length;
  const letters = word ? word.answer.replace(" ", "").split("") : [];
  const spaceAt = word ? word.answer.indexOf(" ") : -1; // slots before the word gap

  const place = (t: number) => {
    if (solved || placed.includes(t)) return;
    const next = [...placed, t];
    setPlaced(next);
    if (next.length === letters.length && next.map((n) => tiles[n]).join("") === letters.join("")) {
      setSolved(true);
      setScore((s) => s + (revealed ? 1 : 3));
    }
  };
  const remove = (slot: number) => {
    if (!solved) setPlaced((p) => p.filter((_, k) => k !== slot));
  };
  const reveal = () => {
    if (solved) return;
    // Drop any wrong suffix, then place the next correct letter.
    let good = 0;
    while (good < placed.length && tiles[placed[good]] === letters[good]) good++;
    const kept = placed.slice(0, good);
    const t = tiles.findIndex((l, n) => l === letters[good] && !kept.includes(n));
    setRevealed(true);
    const next = [...kept, t];
    setPlaced(next);
    if (next.length === letters.length) {
      setSolved(true);
      setScore((s) => s + 1);
    }
  };
  const shuffle = () => {
    setTiles(scrambleLetters(letters));
    setPlaced([]);
  };
  const next = () => {
    const n = i + 1;
    setI(n);
    setTiles(words[n]?.tiles ?? []);
    setPlaced([]);
    setRevealed(false);
    setSolved(false);
  };

  const full = placed.length === letters.length;

  return (
    <GameShell eyebrow="Word Scramble" title={done ? "Nicely done" : "Unjumble the dish"} backLabel="All games" onBack={onExit} status={status}>
      {done ? (
        <GameEnd stats={[{ label: "Score", value: `${score} of ${words.length * 3}` }]} onAgain={onAgain} onExit={onExit} />
      ) : (
        <>
          <Progress current={i} total={words.length} score={score} />
          <div className="tt-gm-panel tt-gm-scramble">
            <p className="tt-gm-hint">{word.hint}</p>
            <div className="tt-gm-slots" aria-label="Your answer">
              {letters.map((_, slot) => (
                <span key={slot} className="tt-gm-slotwrap">
                  {slot === spaceAt && <span className="tt-gm-gap" aria-hidden="true" />}
                  <button
                    type="button"
                    className={`tt-gm-slot${placed[slot] !== undefined ? " is-filled" : ""}`}
                    aria-label={placed[slot] !== undefined ? `Letter ${tiles[placed[slot]]}, tap to remove` : "Empty"}
                    onClick={() => remove(slot)}
                  >
                    {placed[slot] !== undefined ? tiles[placed[slot]] : ""}
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="tt-gm-tiles">
            {tiles.map((l, t) => (
              <button key={t} type="button" className="tt-gm-tile" disabled={placed.includes(t) || solved} onClick={() => place(t)}>
                {l}
              </button>
            ))}
          </div>

          {solved ? (
            <>
              <p className="tt-gm-feedback">{`Correct! ${word.answer.charAt(0) + word.answer.slice(1).toLowerCase()}`}</p>
              <button type="button" className="tt-btn--primary" onClick={next}>
                {i === words.length - 1 ? "See score" : "Next word"}
              </button>
            </>
          ) : (
            <>
              {full && <p className="tt-gm-feedback">Not quite — tap a letter to remove it.</p>}
              <div className="tt-gm-actions">
                <button type="button" className="tt-gm-pill" onClick={() => setPlaced([])}>Clear</button>
                <button type="button" className="tt-gm-pill" onClick={shuffle}>Shuffle</button>
                <button type="button" className="tt-gm-pill" onClick={reveal}>Reveal a letter</button>
              </div>
            </>
          )}
        </>
      )}
    </GameShell>
  );
}
