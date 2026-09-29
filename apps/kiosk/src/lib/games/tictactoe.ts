export type Mark = "X" | "O";
export type Board = Array<Mark | null>;

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

/** The three winning cells (for highlighting), or null when nobody has won. */
export function winningLine(board: Board): number[] | null {
  return LINES.find(([a, b, c]) => board[a] && board[a] === board[b] && board[a] === board[c]) ?? null;
}

export function winner(board: Board): Mark | null {
  const line = winningLine(board);
  return line ? board[line[0]] : null;
}

const emptyCells = (board: Board) => board.flatMap((c, i) => (c ? [] : [i]));

/** Cell that completes a line for `mark`, if any. */
function completing(board: Board, mark: Mark): number | undefined {
  return emptyCells(board).find((i) => {
    const next = [...board];
    next[i] = mark;
    return winner(next) === mark;
  });
}

// ponytail: win → block → centre → random. Beatable on purpose (a fork wins) —
// an unbeatable minimax is no fun for a table waiting on food. Upgrade if asked.
export function cpuMove(board: Board, cpu: Mark = "O", rng: () => number = Math.random): number {
  const human: Mark = cpu === "O" ? "X" : "O";
  const win = completing(board, cpu);
  if (win !== undefined) return win;
  const block = completing(board, human);
  if (block !== undefined) return block;
  if (!board[4]) return 4;
  const free = emptyCells(board);
  return free[Math.floor(rng() * free.length)];
}
