import type { MenuItem } from "@/data/menu";
import { menuImageForName } from "@/lib/menuImages";

// Pure deck builders for the Games section. Everything is derived from the live
// menu (menuStore) so the games stay Silver-specific with no authoring. Each
// returns null when the menu can't fill the game, so the hub can hide it.

export type Rng = () => number;

export function shuffle<T>(xs: readonly T[], rng: Rng = Math.random): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const photoOf = (item: MenuItem) => item.image ?? menuImageForName(item.name);

/** Distinct dish names (case-insensitive), so two "Latte" rows can't be both a pair and a decoy. */
function uniqueByName(items: readonly MenuItem[]): MenuItem[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const key = i.name.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface MemoryCard {
  key: string;
  name: string;
  image: string;
}

/** `pairs` distinct dishes with photos, doubled and shuffled. */
export function memoryDeck(items: readonly MenuItem[], pairs = 6, rng: Rng = Math.random): MemoryCard[] | null {
  const withPhoto = uniqueByName(items).filter((i) => photoOf(i));
  if (withPhoto.length < pairs) return null;
  const picked = shuffle(withPhoto, rng).slice(0, pairs);
  return shuffle(
    picked.flatMap((i) => [0, 1].map((n) => ({ key: `${i.id}-${n}`, name: i.name, image: photoOf(i)! }))),
    rng,
  );
}

export interface GuessRound {
  image: string;
  answer: string;
  options: string[];
}

/** `rounds` photo questions, each with the right name plus 3 other dish names. */
export function guessRounds(items: readonly MenuItem[], rounds = 5, rng: Rng = Math.random): GuessRound[] | null {
  const dishes = uniqueByName(items);
  const withPhoto = dishes.filter((i) => photoOf(i));
  if (dishes.length < 4 || withPhoto.length < rounds) return null;
  return shuffle(withPhoto, rng)
    .slice(0, rounds)
    .map((dish) => {
      const decoys = shuffle(dishes.filter((d) => d.id !== dish.id), rng).slice(0, 3);
      return {
        image: photoOf(dish)!,
        answer: dish.name,
        options: shuffle([dish, ...decoys], rng).map((d) => d.name),
      };
    });
}

export interface ScrambleWord {
  answer: string;
  hint: string;
  /** Letters only (no spaces), in scrambled order. */
  tiles: string[];
}

/** Names that make a fair puzzle: 1–2 alphabetic words, 5–10 letters in all. */
const scrambleable = (name: string) => {
  const letters = name.replace(" ", "").length;
  return /^[A-Za-z]+( [A-Za-z]+)?$/.test(name) && letters >= 5 && letters <= 10;
};

export function scrambleLetters(letters: string[], rng: Rng = Math.random): string[] {
  // Retry so the puzzle never starts already solved (bounded: "AAAAA" can't differ).
  for (let i = 0; i < 10; i++) {
    const s = shuffle(letters, rng);
    if (s.join("") !== letters.join("")) return s;
  }
  return shuffle(letters, rng);
}

export function scrambleWords(items: readonly MenuItem[], count = 5, rng: Rng = Math.random): ScrambleWord[] | null {
  const pool = uniqueByName(items).filter((i) => scrambleable(i.name.trim()));
  if (pool.length < count) return null;
  return shuffle(pool, rng)
    .slice(0, count)
    .map((i) => {
      const answer = i.name.trim().toUpperCase();
      const letters = answer.replace(" ", "").split("");
      return {
        answer,
        hint: `${i.category} · ${letters.length} letters`,
        tiles: scrambleLetters(letters, rng),
      };
    });
}

export interface EmojiRound {
  emoji: string;
  answer: string;
  hint: string;
  options: string[];
}

// Not menu-driven: emoji puzzles need authoring. Generic dishes and drinks, so
// the list works for any cafe menu. Decoys are the other answers.
const EMOJI_PUZZLES = [
  { emoji: "🥑 + 🍞", answer: "Avocado Toast", hint: "A breakfast plate" },
  { emoji: "🧊 + ☕", answer: "Cold Brew", hint: "A chilled coffee" },
  { emoji: "🥞 + 🍯", answer: "Pancakes", hint: "Stacked and syrupy" },
  { emoji: "🍔 + 🍟", answer: "Burger", hint: "Comes with fries" },
  { emoji: "🍵 + 🥛", answer: "Matcha Latte", hint: "Green and creamy" },
  { emoji: "🍫 + ☕", answer: "Mocha", hint: "Coffee meets chocolate" },
  { emoji: "🍊 + 🧃", answer: "Orange Juice", hint: "Fresh squeezed" },
  { emoji: "🍝 + 🧄", answer: "Garlic Pasta", hint: "Aglio e olio" },
  { emoji: "🥪 + 🐔", answer: "Chicken Sandwich", hint: "Between two slices" },
  { emoji: "🍓 + 🥣", answer: "Berry Bowl", hint: "Fruity and healthy" },
  { emoji: "🥐 + 🍫", answer: "Chocolate Croissant", hint: "Flaky and sweet" },
  { emoji: "🍉 + 🧃", answer: "Watermelon Juice", hint: "Summer in a glass" },
];

export function emojiRounds(count = 5, rng: Rng = Math.random): EmojiRound[] {
  return shuffle(EMOJI_PUZZLES, rng)
    .slice(0, count)
    .map((p) => ({
      ...p,
      options: shuffle(
        [p.answer, ...shuffle(EMOJI_PUZZLES.filter((o) => o.answer !== p.answer), rng).slice(0, 3).map((o) => o.answer)],
        rng,
      ),
    }));
}
