import { describe, it, expect } from "vitest";
import type { MenuItem } from "@/data/menu";
import { memoryDeck, guessRounds, scrambleWords, scrambleLetters, shuffle, emojiRounds } from "../decks";
import { computeEta } from "@/lib/eta";
import type { KotTicket } from "@/hooks/useKotTickets";
import { cpuMove, winner, winningLine, type Board } from "../tictactoe";

const dish = (n: number, over: Partial<MenuItem> = {}): MenuItem => ({
  id: `id${n}`,
  name: `Dish${String.fromCharCode(97 + n)}${String.fromCharCode(97 + n)}${String.fromCharCode(97 + n)}`,
  price: 100,
  category: "Cafe",
  tags: [],
  is_veg: true,
  image: `/img/${n}.webp`,
  ...over,
});
const menu = (n: number) => Array.from({ length: n }, (_, i) => dish(i));

describe("memoryDeck", () => {
  it("doubles N distinct dishes and shuffles them", () => {
    const deck = memoryDeck(menu(10), 6)!;
    expect(deck).toHaveLength(12);
    expect(new Set(deck.map((c) => c.name)).size).toBe(6);
    expect(new Set(deck.map((c) => c.key)).size).toBe(12);
  });
  it("is null when too few dishes have photos", () => {
    const items = menu(10).map((d, i) => (i < 4 ? d : { ...d, image: undefined, name: `Zzzz${i}` }));
    expect(memoryDeck(items, 6)).toBeNull();
  });
  it("never pairs two rows with the same name", () => {
    const items = [...menu(6), dish(99, { name: menu(6)[0].name })];
    expect(memoryDeck(items, 7)).toBeNull();
  });
});

describe("guessRounds", () => {
  it("gives 4 distinct options including the answer", () => {
    const rounds = guessRounds(menu(8), 5)!;
    expect(rounds).toHaveLength(5);
    for (const r of rounds) {
      expect(r.options).toHaveLength(4);
      expect(new Set(r.options).size).toBe(4);
      expect(r.options).toContain(r.answer);
    }
  });
  it("is null with fewer than 4 dishes", () => {
    expect(guessRounds(menu(3), 1)).toBeNull();
  });
});

describe("scrambleWords", () => {
  const names = ["Mocha", "Cortado", "Cold Brew", "Hot Chocolate", "Al", "V60 Card", "Berry", "Latte", "Espresso"];
  const items = names.map((name, i) => dish(i, { name }));
  it("only uses 1–2 alphabetic words of 5–10 letters, and starts scrambled", () => {
    const words = scrambleWords(items, 5)!;
    expect(words).toHaveLength(5);
    for (const w of words) {
      expect(w.answer.replace(" ", "").length).toBeGreaterThanOrEqual(5);
      expect(w.answer.replace(" ", "").length).toBeLessThanOrEqual(10);
      expect(w.tiles.slice().sort().join("")).toBe(w.answer.replace(" ", "").split("").sort().join(""));
      expect(w.tiles.join("")).not.toBe(w.answer.replace(" ", ""));
    }
    expect(words.map((w) => w.answer)).not.toContain("AL");
    expect(words.map((w) => w.answer)).not.toContain("HOT CHOCOLATE");
  });
  it("is null when the menu has too few fair words", () => {
    expect(scrambleWords(items.slice(0, 3), 5)).toBeNull();
  });
  it("scrambleLetters terminates for words that can't differ", () => {
    expect(scrambleLetters(["A", "A", "A", "A", "A"]).join("")).toBe("AAAAA");
  });
});

describe("shuffle", () => {
  it("keeps every element", () => {
    expect(shuffle([1, 2, 3, 4]).sort()).toEqual([1, 2, 3, 4]);
  });
});

describe("tic-tac-toe", () => {
  const b = (s: string): Board => s.split("").map((c) => (c === "X" || c === "O" ? c : null));
  it("finds winners and the winning line", () => {
    expect(winner(b("XXX......"))).toBe("X");
    expect(winningLine(b("O..O..O.."))).toEqual([0, 3, 6]);
    expect(winner(b("XO......."))).toBeNull();
  });
  it("cpu takes a win before blocking", () => {
    expect(cpuMove(b("OO.XX...."))).toBe(2);
  });
  it("cpu blocks the human when it can't win", () => {
    expect(cpuMove(b("XX......."))).toBe(2);
  });
  it("cpu takes the centre, else a free cell", () => {
    expect(cpuMove(b("X........"))).toBe(4);
    expect(cpuMove(b("X...O...."), "O", () => 0)).toBe(1);
  });
});

describe("emojiRounds", () => {
  it("has 4 distinct options including the answer", () => {
    const rounds = emojiRounds(5);
    expect(rounds).toHaveLength(5);
    for (const r of rounds) {
      expect(new Set(r.options).size).toBe(4);
      expect(r.options).toContain(r.answer);
    }
  });
});

describe("computeEta", () => {
  const ticket = (status: KotTicket["status"], ids: string[]): KotTicket => ({
    id: status + ids.join(),
    status,
    createdAt: "2026-01-01T00:00:00Z",
    items: ids.map((id) => ({ id, name: id, qty: 1 })),
  });
  const menuWithPrep = [dish(1, { id: "a", prepMinutes: 10 }), dish(2, { id: "b", prepMinutes: 4 }), dish(3, { id: "c" })];
  it("is the longest prep among tickets still cooking, fixed regardless of time", () => {
    expect(computeEta([ticket("preparing", ["a", "b"])], menuWithPrep)).toBe(10);
  });
  it("ignores ready tickets and unset prep times", () => {
    expect(computeEta([ticket("ready", ["a"]), ticket("accepted", ["b", "c"])], menuWithPrep)).toBe(4);
    expect(computeEta([ticket("accepted", ["c"])], menuWithPrep)).toBeNull();
    expect(computeEta([], menuWithPrep)).toBeNull();
  });
});
