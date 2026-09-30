# Auto-reload on deploy (kiosk, POS, dashboard) — plan

Status: PLAN ONLY. Nothing built. Wait for Rohan's go-ahead before editing code.
Context: 5 tablets will run the kiosk full-screen inside FreeKiosk; staff use POS;
admin uses the dashboard. After every Railway deploy, open screens should pick up
the new version by themselves, without anyone touching the tablet.

## Why this is easy here

- All three apps are static Vite builds. kiosk and POS are served by nginx
  (`apps/kiosk/nginx.conf` and `apps/pos/nginx.conf` are identical).
- No service worker anywhere (checked `apps/*/src`, no `registerSW` / PWA plugin),
  so the browser cannot serve a stale app behind our back.
- This replaces needing FreeKiosk's `/api/reload` for routine deploys. Keep that
  for emergencies (frozen tablet). See the FreeKiosk fork plan.

## How it works

1. **Stamp each build.** A tiny Vite plugin (or inline `define` + `generateBundle`
   hook in each `vite.config.ts`) does two things at build time:
   - writes `dist/version.json` as `{"build":"<id>"}`;
   - bakes the same `<id>` into the JS as `__BUILD_ID__`.
   Use the build timestamp as the id. A git SHA would need a Dockerfile `ARG`
   for each app; the timestamp needs nothing from Railway.
2. **Make sure the check is never cached.** In nginx add, for kiosk and POS:
   ```
   location = /version.json { add_header Cache-Control "no-cache, no-store"; }
   location = /index.html   { add_header Cache-Control "no-cache"; }
   ```
   (Hashed assets under `/assets/` can stay cached.) Without this the check can
   read a stale `version.json` and never see the deploy.
3. **Check and reload.** One small hook, `useReloadOnDeploy`, that:
   - fetches `/version.json` (with `cache: "no-store"`) every 3 minutes and when
     the tab becomes visible again;
   - compares `build` to `__BUILD_ID__`;
   - if different and the app is idle (rules below), calls `location.reload()`;
   - if the fetch fails or returns non-JSON, does nothing (see "Safety").

   One shared copy would be ideal, but `packages/` is empty and the apps do not
   share code today. Pilot-sized choice: copy the ~15-line hook into each app
   rather than create a shared package. Revisit if it grows.

## When it is safe to reload (per app)

| App | Reload when | Never while |
|---|---|---|
| Kiosk | Attract/idle screen, or cart empty and no voice session active | Customer has items in cart, voice session active, order just sent and waiting view showing, bill open |
| POS | No dialog open, no payment/discount/add-items flow in progress | Payment in progress, order dialog or form open. Be strictest here. |
| Dashboard | Show a "New version available — refresh" banner; reload only when the user clicks | Any unsaved edit. Do not auto-reload a form-heavy editor. |

If the app is busy when a new version is detected, remember it and retry on the
next check (and on the next idle event). The kiosk already has an idle/attract
state to hook into; find the existing idle signal before adding a new one.

## Safety

- A failed check (offline, 5xx, bad JSON) must NEVER trigger a reload, or an
  offline tablet would reload in a loop. Only a successful response with a
  *different* `build` value reloads.
- Guard against a reload loop after reload: if the freshly loaded app still sees
  a different `build` than the server (e.g. a CDN serving old assets), allow at
  most one auto-reload per few minutes (store the last reload time in
  `sessionStorage`, wrapped in try/catch).
- Railway deploys each service separately. A tablet may reload into a new kiosk
  while the order-engine or Supabase schema is still the old one. Keep API and
  schema changes backward compatible across a deploy (migrations are pushed by
  hand, so sequence: push migration first, then deploy apps).

## Files this would touch

- `apps/kiosk/vite.config.ts`, `apps/pos/vite.config.ts`, `apps/dashboard/vite.config.ts` — stamp plugin
- `apps/kiosk/nginx.conf`, `apps/pos/nginx.conf` — no-cache rules
- A `useReloadOnDeploy` hook in each app, mounted once near the app root
- A `__BUILD_ID__` type declaration in each app (`vite-env.d.ts`)
- One test per app for the compare-and-decide logic (a pure function:
  `shouldReload(serverBuild, myBuild, isIdle)`), plus one check that a failed
  fetch does not reload.
- `CHANGELOG.md` entries; a short note in `docs/notes/` (not an ADR, this is small).

## Open questions

1. **How is the dashboard served on Railway?** `apps/dashboard` has no Dockerfile
   or nginx.conf in the repo (kiosk and POS do). If it runs via Nixpacks and
   `vite preview` or a static server, the no-cache rule has to be set a different
   way (or via Railway config). Confirm before building. The banner approach
   still works either way if `version.json` is reachable and uncached.
2. Polling interval: 3 minutes assumed. Shorter is fine (the file is tiny) but
   gives no real benefit for a deploy cadence measured in hours.
3. Kiosk idle signal: which existing state should count as "idle enough"? Needs a
   quick look at the Attract/waiting screens before implementing.
4. Does Rohan want a visible "updating…" flash on the kiosk, or a silent reload?
   Recommendation: silent, since it only happens on the idle screen.

## Out of scope

- Service worker / offline caching (not used today; adding it would reverse
  the assumption this plan relies on).
- Forcing an immediate reload of busy screens.
- Anything touching the frozen voice pipeline.

## Verification once built

- Build twice; `version.json` differs between builds.
- Load the app, deploy/replace `dist`, confirm it reloads within one interval
  when idle and does NOT reload when busy (cart non-empty, dialog open).
- Kill the network mid-poll: no reload, no error loop.
- After implementing: refresh the graph with `/graphify` (code and docs only).
