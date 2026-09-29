# Kiosk Games redesign (2026-09-29)

Branch `feat/kiosk-games-redesign`, not merged. Client asked for the Games
screen to match the rest of the kiosk, Ludo removed, and better games.
Mockups: https://claude.ai/artifact/6icWGnHaP47H5q7bKUcU89 (800 x 1340, the
Lenovo Tab K9 in portrait).

## What changed
- `GamesView.tsx` (742 lines, one file, no tests) is now a "While you wait"
  hub plus five games in `components/games/`: Memory Match (solo or 2 players),
  Guess the Dish, Tic-Tac-Toe (vs tablet or vs friend), Word Scramble, Emoji
  Decode. Ludo, Connect 4 and Word Duel are deleted.
- **Menu-driven decks** (`lib/games/decks.ts`): Memory, Guess and Scramble are
  built from the live menu, so they stay Silver-specific with no authoring. A
  game hides itself if the menu can't fill it (Memory needs 6 dishes with
  photos, Guess needs 4 dishes, Scramble needs 5 fair words). Emoji Decode is a
  fixed list of 12 puzzles in the same file. Tic-Tac-Toe logic is in
  `lib/games/tictactoe.ts`; the tablet is beatable on purpose.
- **Food status** on every game screen: "Cooking · ~10 min" pill, and an orange
  "Your food is ready" banner that stays out of the way of a game in progress.
  The ETA logic moved from `WaitingView` to `lib/eta.ts` (`computeEta`) so both
  screens share it.
- **CSS**: about 1,230 lines of old game rules removed from `tabletot.css`
  (`tt-game-*`, `tt-ludo-*`, tic/connect/duel, legacy `ludo-*`/dice, dead
  keyframes). The shared `tt-activities-*`/`tt-talk-*` rules stay for
  Conversation Starters. New rules are `tt-gm-*`, tokens only, no gradients or
  shadows, transform/opacity animations only.
- **Images**: optimized WebPs (`~/Downloads/optimized-images`, 7.6 MB total)
  copied into `public/images/silver/`. `menuImages.ts` fixed for three names
  that pointed at `.png` (espresso-tonic, silver-cold-coffee, teas).

## Left out on purpose
- The hub has the status pill, not the full Received/Cooking/Ready/Served
  stepper from the mockup.
- No mic dock on Games (`AppShell` hides the voice dock outside the menu).
- Swapping to non-food content later: replace the deck builders / emoji list;
  the shell and game logic don't change.

## Open
- Original 57 JPGs (about 330 MB) are still tracked in `public/images/silver/`.
- Some menu names are fragments ("Chicken", "Original"), which show up as
  answers in Guess the Dish.
- Not yet tried on the Lenovo Tab K9.
