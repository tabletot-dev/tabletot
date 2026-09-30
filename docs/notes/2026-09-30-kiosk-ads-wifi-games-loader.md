# Kiosk: ad timing, brand loader, Wi-Fi/About, games (2026-09-30)

- **Ad screensaver:** Attract screen after 20s idle ("Tap to order" → back to Attract);
  Order Status screen after 30s. Check runs every 5s. Paused while the Wi-Fi dialog is open.
  Thresholds: `SCREENSAVER_THRESHOLDS_MS` in `pages/Index.tsx`. Inline ad strip on the status page unchanged.
- **Loader:** `TabletotLogo spinning` (coral dot pulses) / `LoadingMark`, used on loading
  screens only — menu load, lazy screens (Suspense), bill loading. Grey skeleton cards kept.
  Voice spinners untouched (frozen).
- **Wi-Fi + About mid-session:** a Wi-Fi icon button in the app bar; About stays on the
  venue name (tap it). Wi-Fi dialog is now one shared
  `WifiDialog` (owned by `Index.tsx`), also used by the Attract screen.
- **Guess the Dish hidden:** `available.guess = false` in `GamesView.tsx`; `GuessDish` and
  `guessRounds` untouched — flip the flag to bring it back.
- **Memory Match:** solo move cap = number of cards (2 × pairs = 12). Perfect memory needs
  n moves; an optimal player averages ~1.6n (Zwick & Paterson), so 2n is hard but winnable.
  Two-player has no cap.
- Not checked on a real tablet. `tsc` still shows 2 pre-existing Float32Array errors in
  `lib/voice/{stt,tts}Client.ts` (unrelated).
