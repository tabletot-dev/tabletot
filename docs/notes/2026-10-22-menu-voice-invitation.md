# Menu voice invitation

The customer menu's voice launcher was a fixed 52px circle with a 20px
microphone. It was easy to overlook on the portrait tablet.

The menu launcher now pairs an orange microphone circle with “At your service”
and “Tap to talk”. The circle is 96px and the glyph is 38px at the existing
design scale of 1; both follow `--tt-scale` (72px circle at the 0.75 minimum).
The icon and copy remain one native button. Only the text floats, by 4 scaled
pixels over 3.6 seconds. Reduced-motion preferences disable that animation.
Keyboard focus has an explicit outline, and the accessible name includes the
visible label.

Scope: presentation only in `VoiceOrderButton.tsx` and a scoped CSS modifier.
No changes to callbacks, effects, audio, sessions, providers, AI prompts,
ordering, database, environment variables, or the AppShell mount/hide rules.
The existing direct-recording button styling is retained outside conversation
mode.

Validation:
- Existing kiosk suite: 119 tests pass in 28 files (`VITE_RESTAURANT_ID=audit-test`).
- Kiosk TypeScript check and production build pass.
- An isolated local browser preview uses the real MenuView, AppShell,
  OrderBar, VoiceOrderButton and VoiceConversationPanel with stubbed voice
  and menu services. No live orders or microphone recordings are made.
- Browser layouts checked at 800 x 1340, 800 x 1200, 600 x 1005 and 360 x 640.
  The launcher fits without horizontal overflow. The cart bar does not overlap
  the launcher. Both the icon and text open the existing voice panel; closing
  returns to the menu. AppShell still hides the dock on non-menu screens.
- Hardware specification: Lenovo Tab K9, 8.7-inch 1340 x 800 physical display.
  Browser checks simulate viewports; they do not establish the tablet's actual
  Android display scaling or substitute for a physical-device check.

Release baseline: `f590118d8b319e379e1808de42cd7b0809d552d4` on main.
Rollback is a revert of this UI-only change and kiosk rebuild; no database
migration or voice-service release is required.
