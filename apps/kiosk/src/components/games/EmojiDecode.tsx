import { useState } from "react";
import { emojiRounds } from "@/lib/games/decks";
import GameShell from "./GameShell";
import GameEnd from "./GameEnd";
import { Progress, Options } from "./QuizParts";

interface GameProps {
  status: string | null;
  onExit: () => void;
  onAgain: () => void;
}

export default function EmojiDecode({ status, onExit, onAgain }: GameProps) {
  const [rounds] = useState(() => emojiRounds());
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);

  const round = rounds[i];
  const done = i >= rounds.length;

  const pick = (option: string) => {
    setPicked(option);
    if (option === round.answer) setScore((s) => s + 1);
  };
  const next = () => {
    setI((n) => n + 1);
    setPicked(null);
  };

  return (
    <GameShell eyebrow="Emoji Decode" title={done ? "Nicely done" : "Decode the dish"} backLabel="All games" onBack={onExit} status={status}>
      {done ? (
        <GameEnd stats={[{ label: "Score", value: `${score} of ${rounds.length}` }]} onAgain={onAgain} onExit={onExit} />
      ) : (
        <>
          <Progress current={i} total={rounds.length} score={score} />
          <div className="tt-gm-panel tt-gm-emoji">
            <p className="tt-gm-emoji-glyphs" aria-label="Emoji puzzle">{round.emoji}</p>
            <p className="tt-gm-note">{round.hint}</p>
          </div>
          <Options options={round.options} answer={round.answer} picked={picked} onPick={pick} />
          {picked !== null && (
            <>
              <p className="tt-gm-feedback">{picked === round.answer ? "Correct! +1" : `It was ${round.answer}`}</p>
              <button type="button" className="tt-btn--primary" onClick={next}>
                {i === rounds.length - 1 ? "See score" : "Next puzzle"}
              </button>
            </>
          )}
        </>
      )}
    </GameShell>
  );
}
