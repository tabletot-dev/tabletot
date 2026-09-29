import { useState } from "react";
import type { MenuItem } from "@/data/menu";
import { guessRounds } from "@/lib/games/decks";
import GameShell from "./GameShell";
import GameEnd from "./GameEnd";
import { Progress, Options } from "./QuizParts";

interface GameProps {
  items: MenuItem[];
  status: string | null;
  onExit: () => void;
  onAgain: () => void;
}

// Close-up → wider → whole photo. Points fall as the guest zooms out.
const ZOOM_SCALE = [3, 1.8, 1];
const ZOOM_LABEL = ["Close-up", "Wider", "Whole dish"];
const pointsFor = (zoom: number) => 3 - zoom;

const randomOrigin = () => `${30 + Math.floor(Math.random() * 40)}% ${30 + Math.floor(Math.random() * 40)}%`;

export default function GuessDish({ items, status, onExit, onAgain }: GameProps) {
  const [rounds] = useState(() => guessRounds(items) ?? []);
  const [origins] = useState(() => rounds.map(randomOrigin));
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);

  const round = rounds[i];
  const done = i >= rounds.length;

  const pick = (option: string) => {
    setPicked(option);
    if (option === round.answer) setScore((s) => s + pointsFor(zoom));
  };
  const next = () => {
    setI((n) => n + 1);
    setZoom(0);
    setPicked(null);
  };

  return (
    <GameShell eyebrow="Guess the Dish" title={done ? "Nicely done" : "What's this dish?"} backLabel="All games" onBack={onExit} status={status}>
      {done ? (
        <GameEnd stats={[{ label: "Score", value: `${score} of ${rounds.length * 3}` }]} onAgain={onAgain} onExit={onExit} />
      ) : (
        <>
          <Progress current={i} total={rounds.length} score={score} />
          <div className="tt-gm-photo">
            <img
              src={round.image}
              alt={picked ? round.answer : "A close-up of a dish"}
              style={{ transform: `scale(${picked ? 1 : ZOOM_SCALE[zoom]})`, transformOrigin: origins[i] }}
            />
            {picked === null && <span className="tt-gm-photo-tag">{ZOOM_LABEL[zoom]} · {pointsFor(zoom)} points</span>}
            {picked === null && zoom < 2 && (
              <button type="button" className="tt-gm-pill tt-gm-photo-zoom" onClick={() => setZoom((z) => z + 1)}>
                Zoom out · {pointsFor(zoom + 1)} {pointsFor(zoom + 1) === 1 ? "point" : "points"}
              </button>
            )}
          </div>
          <Options options={round.options} answer={round.answer} picked={picked} onPick={pick} />
          {picked !== null ? (
            <>
              <p className="tt-gm-feedback">
                {picked === round.answer ? `Correct! +${pointsFor(zoom)}` : `It was ${round.answer}`}
              </p>
              <button type="button" className="tt-btn--primary" onClick={next}>
                {i === rounds.length - 1 ? "See score" : "Next round"}
              </button>
            </>
          ) : (
            <p className="tt-gm-note">Every zoom-out makes it easier and worth fewer points.</p>
          )}
        </>
      )}
    </GameShell>
  );
}
