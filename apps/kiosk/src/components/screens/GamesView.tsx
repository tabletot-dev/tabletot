import { useMemo, useState } from "react";
import { ChevronRight, Hash, LayoutGrid, Search, Shuffle, Smile } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMenu } from "@/lib/menuStore";
import { memoryDeck, scrambleWords } from "@/lib/games/decks";
import GameShell from "@/components/games/GameShell";
import ReadyBanner from "@/components/games/ReadyBanner";
import { useFoodStatus } from "@/components/games/useFoodStatus";
import MemoryMatch from "@/components/games/MemoryMatch";
import GuessDish from "@/components/games/GuessDish";
import TicTacToe from "@/components/games/TicTacToe";
import WordScramble from "@/components/games/WordScramble";
import EmojiDecode from "@/components/games/EmojiDecode";

interface GamesViewProps {
  onBack: () => void;
  /** Live order id — drives the food status pill and the "food is ready" banner. */
  orderId?: string | null;
}

type GameId = "memory" | "guess" | "tictactoe" | "scramble" | "emoji";

const GAMES: Array<{ id: GameId; title: string; blurb: string; Icon: LucideIcon }> = [
  { id: "memory", title: "Memory Match", blurb: "Find the dish pairs · 1–2 players", Icon: LayoutGrid },
  { id: "guess", title: "Guess the Dish", blurb: "Name it from a zoomed photo", Icon: Search },
  { id: "tictactoe", title: "Tic-Tac-Toe", blurb: "Vs the tablet or vs a friend", Icon: Hash },
  { id: "scramble", title: "Word Scramble", blurb: "Unjumble a menu dish", Icon: Shuffle },
  { id: "emoji", title: "Emoji Decode", blurb: "Which dish is this in emoji?", Icon: Smile },
];

export default function GamesView({ onBack, orderId = null }: GamesViewProps) {
  const { items } = useMenu();
  const { status, ready } = useFoodStatus(orderId);
  const [active, setActive] = useState<GameId | null>(null);
  const [round, setRound] = useState(0); // bumped by "Play again" → remounts the game with a fresh deck

  // Menu-driven games hide themselves when the menu can't fill them.
  const available = useMemo(
    () => ({
      memory: memoryDeck(items) !== null,
      guess: false, // hidden 2026-09-30 — GuessDish + guessRounds kept; flip to guessRounds(items) !== null to bring it back
      scramble: scrambleWords(items) !== null,
      tictactoe: true,
      emoji: true,
    }),
    [items],
  );

  const exit = () => setActive(null);
  const again = () => setRound((r) => r + 1);
  const shared = { status, onExit: exit, onAgain: again };

  const game = (() => {
    switch (active) {
      case "memory": return <MemoryMatch key={round} items={items} {...shared} />;
      case "guess": return <GuessDish key={round} items={items} {...shared} />;
      case "scramble": return <WordScramble key={round} items={items} {...shared} />;
      case "emoji": return <EmojiDecode key={round} {...shared} />;
      case "tictactoe": return <TicTacToe status={status} onExit={exit} />;
      default: return null;
    }
  })();

  return (
    <>
      {ready && <ReadyBanner onSeeOrder={onBack} />}
      {game ?? (
        <GameShell eyebrow="While you wait" title="Pick a game" backLabel="Order status" onBack={onBack} status={status}>
          <div className="tt-gm-list">
            {GAMES.filter((g) => available[g.id]).map(({ id, title, blurb, Icon }) => (
              <button key={id} type="button" className="tt-gm-item" onClick={() => setActive(id)}>
                <span className="tt-gm-item-icon"><Icon size={40} strokeWidth={1.75} aria-hidden="true" /></span>
                <span className="tt-gm-item-text">
                  <strong>{title}</strong>
                  <small>{blurb}</small>
                </span>
                <ChevronRight size={32} aria-hidden="true" />
              </button>
            ))}
          </div>
        </GameShell>
      )}
    </>
  );
}
