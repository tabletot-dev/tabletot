import { useEffect, useMemo, useState } from "react";

interface GamesViewProps {
  onBack: () => void;
}

type GameId = "tic-tac-toe" | "connect-four" | "word-duel" | "ludo";
type TicPlayer = "X" | "O";
type ConnectPlayer = "orange" | "graphite";
type Team = "A" | "B";
type LudoColor = "red" | "green" | "yellow" | "blue";
type LudoTokenState = Record<LudoColor, number[]>;

const gameModes: Array<{ id: GameId; title: string; meta: string }> = [
  { id: "tic-tac-toe", title: "Tic-Tac-Toe", meta: "2 players" },
  { id: "connect-four", title: "Connect 4", meta: "Drop chips" },
  { id: "word-duel", title: "Word Duel", meta: "5 sec rounds" },
  { id: "ludo", title: "Ludo", meta: "Classic board" },
];

const ticWinLines = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const duelPrompts = [
  "Most overrated food?",
  "One city you could live in forever?",
  "Worst fashion trend ever?",
  "What's your comfort movie?",
  "One thing you'd ban forever?",
  "Most useless superpower?",
  "What's a green flag in people?",
  "One food you'll never eat?",
  "What's your most irrational fear?",
  "Most chaotic thing you've done?",
  "One app you can't live without?",
  "Which decade had the best vibe?",
  "Best midnight snack?",
  "One celebrity you'd survive a road trip with?",
  "Most underrated hobby?",
  "Coffee or tea forever?",
  "One country you want to disappear into for a month?",
  "What instantly ruins a restaurant experience?",
  "Best fast food fries?",
  "What's something everyone pretends to like?",
  "One thing you wish people normalized more?",
  "What's your toxic trait while ordering food?",
  "Which fictional world would you move into?",
  "One thing that makes someone instantly cool?",
  "What's the worst way to spend a weekend?",
  "One conspiracy you lowkey find interesting?",
  "What's your go-to comfort food?",
  "What's something surprisingly difficult?",
  "Most elite dessert?",
  "One thing that should never be expensive?",
];

const LUDO_COLORS: LudoColor[] = ["red", "green", "yellow", "blue"];
const LUDO_COLOR_LABEL: Record<LudoColor, string> = {
  red: "Red",
  green: "Green",
  yellow: "Yellow",
  blue: "Blue",
};

const LUDO_PLAYER_SETS: Record<2 | 3 | 4, LudoColor[]> = {
  2: ["red", "yellow"],
  3: ["red", "green", "yellow"],
  4: ["red", "green", "yellow", "blue"],
};

const LUDO_START_INDEX: Record<LudoColor, number> = {
  red: 0,
  green: 13,
  blue: 26,
  yellow: 39,
};

const LUDO_MAIN_PATH = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7], [0, 8],
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14],
  [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7], [14, 6],
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0], [6, 0],
] as const;

const LUDO_FINAL_PATHS: Record<LudoColor, readonly (readonly [number, number])[]> = {
  red: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
  green: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
  yellow: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
  blue: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
};

const LUDO_HOME_SPOTS: Record<LudoColor, Array<[number, number]>> = {
  red: [[1, 1], [1, 3], [3, 1], [3, 3]],
  green: [[1, 10], [1, 12], [3, 10], [3, 12]],
  yellow: [[10, 1], [10, 3], [12, 1], [12, 3]],
  blue: [[10, 10], [10, 12], [12, 10], [12, 12]],
};

const LUDO_SAFE_GLOBAL_INDEXES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

function createLudoTokens(): LudoTokenState {
  return {
    red: [-1, -1, -1, -1],
    green: [-1, -1, -1, -1],
    yellow: [-1, -1, -1, -1],
    blue: [-1, -1, -1, -1],
  };
}

function coordKey(row: number, col: number) {
  return `${row}-${col}`;
}

function getTicWinner(board: Array<TicPlayer | null>) {
  for (const [a, b, c] of ticWinLines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return board.every(Boolean) ? "draw" : null;
}

function getConnectWinner(board: Array<ConnectPlayer | null>) {
  const rows = 6;
  const cols = 7;
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const current = board[row * cols + col];
      if (!current) continue;

      for (const [dr, dc] of directions) {
        let count = 1;
        for (let step = 1; step < 4; step += 1) {
          const nextRow = row + dr * step;
          const nextCol = col + dc * step;
          if (nextRow < 0 || nextRow >= rows || nextCol < 0 || nextCol >= cols) break;
          if (board[nextRow * cols + nextCol] !== current) break;
          count += 1;
        }
        if (count === 4) return current;
      }
    }
  }

  return board.every(Boolean) ? "draw" : null;
}

function getLudoCoord(color: LudoColor, progress: number): readonly [number, number] | null {
  if (progress < 0) return null;
  if (progress <= 51) {
    return LUDO_MAIN_PATH[(LUDO_START_INDEX[color] + progress) % LUDO_MAIN_PATH.length];
  }
  if (progress <= 57) {
    return LUDO_FINAL_PATHS[color][progress - 52];
  }
  return null;
}

function getLudoGlobalIndex(color: LudoColor, progress: number) {
  if (progress < 0 || progress > 51) return null;
  return (LUDO_START_INDEX[color] + progress) % LUDO_MAIN_PATH.length;
}

function getLudoValidTokens(tokens: LudoTokenState, color: LudoColor, dice: number | null) {
  if (!dice) return [];
  return tokens[color].flatMap((progress, index) => {
    if (progress === 57) return [];
    if (progress < 0) return dice === 6 ? [index] : [];
    return progress + dice <= 57 ? [index] : [];
  });
}

function DiceFace({ value, rolling }: { value: number | null; rolling: boolean }) {
  const shownValue = value ?? 1;
  const dotMap: Record<number, number[]> = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };

  return (
    <div className={`tt-dice-face${rolling ? " rolling" : ""}`} aria-label={`Dice ${value ?? "not rolled"}`}>
      {Array.from({ length: 9 }).map((_, index) => (
        <span key={index} className={dotMap[shownValue].includes(index) ? "visible" : ""} />
      ))}
    </div>
  );
}

export default function GamesView({ onBack }: GamesViewProps) {
  const [activeGame, setActiveGame] = useState<GameId>("tic-tac-toe");

  const [ticBoard, setTicBoard] = useState<Array<TicPlayer | null>>(Array(9).fill(null));
  const [ticTurn, setTicTurn] = useState<TicPlayer>("X");
  const ticWinner = useMemo(() => getTicWinner(ticBoard), [ticBoard]);

  const [connectBoard, setConnectBoard] = useState<Array<ConnectPlayer | null>>(Array(42).fill(null));
  const [connectTurn, setConnectTurn] = useState<ConnectPlayer>("orange");
  const connectWinner = useMemo(() => getConnectWinner(connectBoard), [connectBoard]);

  const [promptIndex, setPromptIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(5);
  const [roundActive, setRoundActive] = useState(false);
  const [score, setScore] = useState<Record<Team, number>>({ A: 0, B: 0 });

  const [ludoPlayerCount, setLudoPlayerCount] = useState<2 | 3 | 4>(2);
  const [ludoStarted, setLudoStarted] = useState(false);
  const [ludoPlayers, setLudoPlayers] = useState<LudoColor[]>(LUDO_PLAYER_SETS[2]);
  const [ludoTurnIndex, setLudoTurnIndex] = useState(0);
  const [ludoDice, setLudoDice] = useState<number | null>(null);
  const [ludoRolling, setLudoRolling] = useState(false);
  const [ludoTokens, setLudoTokens] = useState<LudoTokenState>(createLudoTokens);
  const [ludoLastMoved, setLudoLastMoved] = useState<string | null>(null);
  const [ludoCapture, setLudoCapture] = useState<string | null>(null);

  useEffect(() => {
    if (!roundActive) return;
    if (secondsLeft <= 0) {
      setRoundActive(false);
      return;
    }
    const id = window.setTimeout(() => setSecondsLeft((value) => value - 1), 1000);
    return () => window.clearTimeout(id);
  }, [roundActive, secondsLeft]);

  const resetTic = () => {
    setTicBoard(Array(9).fill(null));
    setTicTurn("X");
  };

  const playTic = (index: number) => {
    if (ticBoard[index] || ticWinner) return;
    setTicBoard((current) => current.map((cell, cellIndex) => (cellIndex === index ? ticTurn : cell)));
    setTicTurn((turn) => (turn === "X" ? "O" : "X"));
  };

  const resetConnect = () => {
    setConnectBoard(Array(42).fill(null));
    setConnectTurn("orange");
  };

  const dropConnectChip = (col: number) => {
    if (connectWinner) return;

    for (let row = 5; row >= 0; row -= 1) {
      const index = row * 7 + col;
      if (!connectBoard[index]) {
        setConnectBoard((current) => current.map((cell, cellIndex) => (cellIndex === index ? connectTurn : cell)));
        setConnectTurn((turn) => (turn === "orange" ? "graphite" : "orange"));
        return;
      }
    }
  };

  const nextPrompt = () => {
    setPromptIndex((current) => (current + 1) % duelPrompts.length);
    setSecondsLeft(5);
    setRoundActive(false);
  };

  const awardPoint = (team: Team) => {
    setScore((current) => ({ ...current, [team]: current[team] + 1 }));
    nextPrompt();
  };

  const currentLudoPlayer = ludoPlayers[ludoTurnIndex] ?? "red";
  const ludoValidTokens = useMemo(
    () => getLudoValidTokens(ludoTokens, currentLudoPlayer, ludoDice),
    [currentLudoPlayer, ludoDice, ludoTokens],
  );
  const ludoWinner = useMemo(
    () => ludoPlayers.find((color) => ludoTokens[color].every((position) => position === 57)) ?? null,
    [ludoPlayers, ludoTokens],
  );

  const passLudoTurn = () => {
    setLudoDice(null);
    setLudoRolling(false);
    setLudoLastMoved(null);
    setLudoTurnIndex((current) => (current + 1) % ludoPlayers.length);
  };

  useEffect(() => {
    if (!ludoStarted || ludoWinner || ludoRolling || !ludoDice || ludoValidTokens.length > 0) return;
    const id = window.setTimeout(passLudoTurn, 850);
    return () => window.clearTimeout(id);
  }, [ludoDice, ludoRolling, ludoStarted, ludoValidTokens.length, ludoWinner]);

  const startLudoGame = () => {
    const players = LUDO_PLAYER_SETS[ludoPlayerCount];
    setLudoPlayers(players);
    setLudoTokens(createLudoTokens());
    setLudoTurnIndex(0);
    setLudoDice(null);
    setLudoRolling(false);
    setLudoLastMoved(null);
    setLudoCapture(null);
    setLudoStarted(true);
  };

  const openLudoSetup = () => {
    setLudoStarted(false);
    setLudoDice(null);
    setLudoRolling(false);
    setLudoLastMoved(null);
    setLudoCapture(null);
  };

  const rollLudoDice = () => {
    if (ludoRolling || ludoDice || ludoWinner) return;
    setLudoRolling(true);
    window.setTimeout(() => {
      setLudoDice(Math.floor(Math.random() * 6) + 1);
      setLudoRolling(false);
    }, 520);
  };

  const moveLudoToken = (tokenIndex: number) => {
    if (!ludoDice || ludoWinner || !ludoValidTokens.includes(tokenIndex)) return;

    const color = currentLudoPlayer;
    const currentProgress = ludoTokens[color][tokenIndex];
    const nextProgress = currentProgress < 0 ? 0 : currentProgress + ludoDice;
    const landedGlobalIndex = getLudoGlobalIndex(color, nextProgress);
    const canCapture = landedGlobalIndex !== null && !LUDO_SAFE_GLOBAL_INDEXES.has(landedGlobalIndex);
    let capturedToken: string | null = null;
    const nextTokens: LudoTokenState = {
      red: [...ludoTokens.red],
      green: [...ludoTokens.green],
      yellow: [...ludoTokens.yellow],
      blue: [...ludoTokens.blue],
    };

    nextTokens[color][tokenIndex] = nextProgress;

    if (canCapture && landedGlobalIndex !== null) {
      for (const opponent of ludoPlayers) {
        if (opponent === color) continue;
        nextTokens[opponent] = nextTokens[opponent].map((progress, opponentIndex) => {
          if (getLudoGlobalIndex(opponent, progress) === landedGlobalIndex) {
            capturedToken = `${opponent}-${opponentIndex}`;
            return -1;
          }
          return progress;
        });
      }
    }

    setLudoTokens(nextTokens);

    setLudoLastMoved(`${color}-${tokenIndex}`);
    setLudoCapture(capturedToken);

    if (ludoDice === 6) {
      setLudoDice(null);
      return;
    }

    setLudoDice(null);
    window.setTimeout(() => {
      setLudoLastMoved(null);
      setLudoCapture(null);
      setLudoTurnIndex((current) => (current + 1) % ludoPlayers.length);
    }, 260);
  };

  const ludoTokensAt = (row: number, col: number) =>
    ludoPlayers.flatMap((color) =>
      ludoTokens[color].flatMap((progress, tokenIndex) => {
        const coord = getLudoCoord(color, progress);
        if (!coord || coord[0] !== row || coord[1] !== col) return [];
        return [{ color, tokenIndex, progress }];
      }),
    );

  const ludoHomeTokens = (color: LudoColor) =>
    ludoTokens[color].flatMap((progress, tokenIndex) => (progress < 0 ? [{ color, tokenIndex, progress }] : []));

  const ludoFinishedCount = (color: LudoColor) => ludoTokens[color].filter((progress) => progress === 57).length;

  const ticStatus =
    ticWinner === "draw" ? "Round locked: draw" : ticWinner ? `Player ${ticWinner} wins` : `Player ${ticTurn} to move`;
  const connectStatus =
    connectWinner === "draw"
      ? "Board full: draw"
      : connectWinner
        ? `${connectWinner === "orange" ? "Orange" : "Graphite"} wins`
        : `${connectTurn === "orange" ? "Orange" : "Graphite"} to drop`;
  const ludoStatus = ludoWinner
    ? `${LUDO_COLOR_LABEL[ludoWinner]} wins`
    : ludoDice && ludoValidTokens.length === 0
      ? `${LUDO_COLOR_LABEL[currentLudoPlayer]} has no move`
      : `${LUDO_COLOR_LABEL[currentLudoPlayer]}'s Turn`;

  const mainPathMap = useMemo(() => {
    const map = new Map<string, number>();
    LUDO_MAIN_PATH.forEach(([row, col], index) => map.set(coordKey(row, col), index));
    return map;
  }, []);

  const finalPathMap = useMemo(() => {
    const map = new Map<string, LudoColor>();
    LUDO_COLORS.forEach((color) => {
      LUDO_FINAL_PATHS[color].forEach(([row, col]) => map.set(coordKey(row, col), color));
    });
    return map;
  }, []);

  return (
    <section className="view tt-activities-view tt-game-feature-view">
      <div className="tt-activities-hero tt-game-feature-hero panel">
        <div>
          <p className="eyebrow">Table Mode</p>
          <h1>Games</h1>
          <p className="hero-sub">Fast social games built for the table while the kitchen works.</p>
        </div>
        <button className="secondary-btn tt-activities-back-btn" onClick={onBack}>
          Back
        </button>
      </div>

      <div className="tt-game-mode-strip" aria-label="Select a game">
        {gameModes.map((game) => (
          <button
            className={`tt-game-mode-btn${activeGame === game.id ? " active" : ""}`}
            key={game.id}
            onClick={() => setActiveGame(game.id)}
          >
            <strong>{game.title}</strong>
            <span>{game.meta}</span>
          </button>
        ))}
      </div>

      {activeGame === "tic-tac-toe" && (
        <div className="tt-game-panel panel">
          <div className="tt-game-panel-header">
            <div>
              <p className="eyebrow">Precision Grid</p>
              <h2>Tic-Tac-Toe</h2>
            </div>
            <div className="tt-game-status-block">
              <span>{ticStatus}</span>
              <button onClick={resetTic}>Reset</button>
            </div>
          </div>

          <div className="tt-tic-board" aria-label="Tic-Tac-Toe board">
            {ticBoard.map((cell, index) => (
              <button
                className={`tt-tic-cell${cell ? ` player-${cell.toLowerCase()}` : ""}`}
                key={index}
                onClick={() => playTic(index)}
                aria-label={`Cell ${index + 1}${cell ? ` ${cell}` : ""}`}
              >
                {cell}
              </button>
            ))}
          </div>
        </div>
      )}

      {activeGame === "connect-four" && (
        <div className="tt-game-panel panel">
          <div className="tt-game-panel-header">
            <div>
              <p className="eyebrow">Drop Sequence</p>
              <h2>Connect 4</h2>
            </div>
            <div className="tt-game-status-block">
              <span>{connectStatus}</span>
              <button onClick={resetConnect}>Reset</button>
            </div>
          </div>

          <div className="tt-connect-board" aria-label="Connect 4 board">
            {connectBoard.map((cell, index) => (
              <button
                className={`tt-connect-cell${cell ? ` ${cell}` : ""}`}
                key={index}
                onClick={() => dropConnectChip(index % 7)}
                aria-label={`Column ${(index % 7) + 1}`}
              >
                <span />
              </button>
            ))}
          </div>
        </div>
      )}

      {activeGame === "word-duel" && (
        <div className="tt-game-panel tt-wordduel-panel panel">
          <div className="tt-game-panel-header">
            <div>
              <p className="eyebrow">Rapid Questions</p>
              <h2>Word Duel</h2>
            </div>
            <div className="tt-duel-scoreboard" aria-label="Score">
              <span>Team A <strong>{score.A}</strong></span>
              <span>Team B <strong>{score.B}</strong></span>
            </div>
          </div>

          <div className="tt-duel-stage">
            <div className={`tt-duel-timer${roundActive ? " active" : ""}`}>
              <strong>{secondsLeft}</strong>
              <span>seconds</span>
            </div>
            <div className="tt-duel-prompt-card">
              <p className="eyebrow">Prompt {String(promptIndex + 1).padStart(2, "0")}</p>
              <h3>{duelPrompts[promptIndex]}</h3>
            </div>
          </div>

          <div className="tt-duel-controls">
            <button
              className="primary-btn"
              onClick={() => {
                setSecondsLeft(5);
                setRoundActive(true);
              }}
            >
              Start 5s
            </button>
            <button className="secondary-btn" onClick={nextPrompt}>
              Next Question
            </button>
            <button className="tt-duel-point-btn" onClick={() => awardPoint("A")}>
              Team A +1
            </button>
            <button className="tt-duel-point-btn" onClick={() => awardPoint("B")}>
              Team B +1
            </button>
          </div>
        </div>
      )}

      {activeGame === "ludo" && (
        <div className="tt-game-panel tt-ludo-panel panel">
          {!ludoStarted ? (
            <div className="tt-ludo-setup">
              <div>
                <p className="eyebrow">Classic Board</p>
                <h2>Ludo</h2>
                <p className="hero-sub">
                  Select the table size, then race tokens around the board with classic dice rules.
                </p>
              </div>
              <div className="tt-ludo-player-select" aria-label="Select players">
                {([2, 3, 4] as const).map((count) => (
                  <button
                    key={count}
                    className={ludoPlayerCount === count ? "active" : ""}
                    onClick={() => setLudoPlayerCount(count)}
                  >
                    <strong>{count} Players</strong>
                    <span>{LUDO_PLAYER_SETS[count].map((color) => LUDO_COLOR_LABEL[color]).join(" / ")}</span>
                  </button>
                ))}
              </div>
              <button className="primary-btn tt-ludo-start" onClick={startLudoGame}>
                Start Game
              </button>
            </div>
          ) : (
            <>
              <div className="tt-game-panel-header tt-ludo-header">
                <div>
                  <p className="eyebrow">Classic Board</p>
                  <h2>Ludo</h2>
                </div>
                <div className="tt-game-status-block">
                  <span className={`tt-ludo-turn ${currentLudoPlayer}`}>{ludoStatus}</span>
                  <button onClick={openLudoSetup}>New Game</button>
                </div>
              </div>

              <div className="tt-ludo-layout">
                <div className="tt-ludo-board" aria-label="Classic Ludo board">
                  {Array.from({ length: 225 }).map((_, index) => {
                    const row = Math.floor(index / 15);
                    const col = index % 15;
                    const key = coordKey(row, col);
                    const mainIndex = mainPathMap.get(key);
                    const finalColor = finalPathMap.get(key);
                    const tokensHere = ludoTokensAt(row, col);
                    const isSafe = typeof mainIndex === "number" && LUDO_SAFE_GLOBAL_INDEXES.has(mainIndex);

                    return (
                      <div
                        className={[
                          "tt-ludo-cell",
                          typeof mainIndex === "number" ? "track" : "",
                          isSafe ? "safe" : "",
                          finalColor ? `finish ${finalColor}` : "",
                        ].filter(Boolean).join(" ")}
                        style={{ gridRow: row + 1, gridColumn: col + 1 }}
                        key={key}
                      >
                        {tokensHere.map((token) => {
                          const tokenId = `${token.color}-${token.tokenIndex}`;
                          const isValid = token.color === currentLudoPlayer && ludoValidTokens.includes(token.tokenIndex);
                          return (
                            <button
                              className={[
                                "tt-ludo-token",
                                token.color,
                                isValid ? "valid" : "",
                                ludoLastMoved === tokenId ? "moved" : "",
                                ludoCapture === tokenId ? "captured" : "",
                              ].filter(Boolean).join(" ")}
                              key={tokenId}
                              onClick={() => token.color === currentLudoPlayer && moveLudoToken(token.tokenIndex)}
                              disabled={!isValid}
                              aria-label={`${LUDO_COLOR_LABEL[token.color]} token ${token.tokenIndex + 1}`}
                            >
                              {token.tokenIndex + 1}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}

                  {LUDO_COLORS.map((color) => (
                    <div className={`tt-ludo-home ${color}`} key={color}>
                      <div className="tt-ludo-home-inner">
                        {LUDO_HOME_SPOTS[color].map((_, index) => {
                          const token = ludoHomeTokens(color).find((candidate) => candidate.tokenIndex === index);
                          const tokenId = `${color}-${index}`;
                          const isValid = color === currentLudoPlayer && ludoValidTokens.includes(index);
                          return (
                            <div className="tt-ludo-home-slot" key={`${color}-home-${index}`}>
                              {token && (
                                <button
                                  className={[
                                    "tt-ludo-token",
                                    color,
                                    isValid ? "valid" : "",
                                    ludoCapture === tokenId ? "captured" : "",
                                  ].filter(Boolean).join(" ")}
                                  onClick={() => color === currentLudoPlayer && moveLudoToken(index)}
                                  disabled={!isValid}
                                  aria-label={`${LUDO_COLOR_LABEL[color]} token ${index + 1}`}
                                >
                                  {index + 1}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <div className="tt-ludo-center" aria-hidden="true" />
                </div>

                <aside className="tt-ludo-side">
                  <div className={`tt-ludo-dice-card ${currentLudoPlayer}`}>
                    <p className="eyebrow">{ludoDice ? "Move token" : "Roll phase"}</p>
                    <h3>{LUDO_COLOR_LABEL[currentLudoPlayer]}'s Turn</h3>
                    <DiceFace value={ludoDice} rolling={ludoRolling} />
                    <button
                      className="primary-btn"
                      onClick={rollLudoDice}
                      disabled={Boolean(ludoDice) || ludoRolling || Boolean(ludoWinner)}
                    >
                      {ludoRolling ? "Rolling..." : "Roll Dice"}
                    </button>
                    {ludoDice && ludoValidTokens.length === 0 && (
                      <span className="tt-ludo-no-move">No legal move. Passing turn.</span>
                    )}
                  </div>

                  <div className="tt-ludo-status-list">
                    {ludoPlayers.map((color) => (
                      <div
                        className={`tt-ludo-status-card ${color}${currentLudoPlayer === color && !ludoWinner ? " active" : ""}`}
                        key={color}
                      >
                        <span>{LUDO_COLOR_LABEL[color]}</span>
                        <strong>{ludoFinishedCount(color)}/4 home</strong>
                      </div>
                    ))}
                  </div>

                  <button className="secondary-btn tt-ludo-reset" onClick={startLudoGame}>
                    Reset Board
                  </button>
                </aside>
              </div>

              {ludoWinner && (
                <div className="tt-ludo-win-modal" role="dialog" aria-modal="true">
                  <div className={`tt-ludo-win-card ${ludoWinner}`}>
                    <p className="eyebrow">Winner</p>
                    <h2>{LUDO_COLOR_LABEL[ludoWinner]} wins</h2>
                    <p>All four tokens reached home.</p>
                    <button className="primary-btn" onClick={openLudoSetup}>
                      New Game
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
