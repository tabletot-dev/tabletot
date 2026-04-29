# ADR-0002: Retire Google Sheets middleware between kiosk and POS

**Status:** Accepted
**Date:** 2026-04-29

## Context

The Lovable-generated PoCs shipped with an indirect data path between the customer kiosk and the POS. The kiosk wrote orders to a Google Sheet; a Supabase Edge Function polled the sheet on a 10-second interval, parsed rows, and inserted them into the POS Supabase project. The POS frontend then surfaced new orders via Supabase Realtime subscriptions.

The Sheets layer flattened structured order data into strings (e.g. `"2x Pizza"`), losing variant selections, modifiers, addon choices, and any structured metadata the order engine produces. It also introduced up to 10 seconds of latency between order submission and POS visibility, and added Google Sheets as a hard runtime dependency for a path that has no business needing one.

Both apps already use Supabase as their data layer. The middleware existed because the two PoCs were generated independently and Sheets was the easiest glue at PoC time, not because the architecture required a broker.

## Decision

Retire the Google Sheets middleware and the polling Edge Function. The kiosk and POS will share a single Supabase project per restaurant deployment and write directly to the same tables. Order submission becomes a direct Supabase insert from the kiosk; the POS reads via existing Realtime subscriptions on the same tables.

This applies to both deployment configurations of Tabletot — standalone (Tabletot POS as backend) and layer mode (Petpooja as backend). In layer mode the POS adapter is Petpooja's API rather than the Tabletot POS app, but the kiosk-to-shared-Supabase path is unchanged; Supabase remains the source of truth for the kiosk session and recommendation layer regardless of which POS adapter is downstream.

## Alternatives considered

**Keep Sheets, fix the data shape.** Replace the flat string format with a structured JSON column in the sheet, preserving variant and modifier data. Rejected: still leaves a 10-second polling floor, still requires Google account credentials in the runtime path, still requires a parser on the read side. Solves the data-loss problem but none of the others, and adds maintenance surface (sheet schema versioning, parser drift) for no architectural benefit.

**Direct REST between kiosk and POS app.** Have the kiosk POST orders to an HTTP endpoint exposed by the POS app. Rejected: requires the POS app to expose and authenticate a public endpoint, duplicates auth and persistence logic the kiosk would otherwise get from Supabase for free, and breaks down entirely in layer mode where the "POS" is Petpooja and not under our control.

**Message broker (Redis, NATS, etc.) between kiosk and POS.** Rejected as overengineering for a single-restaurant pilot writing tens of orders per day. The realtime requirement is satisfied by Supabase's existing Realtime subscriptions; introducing a broker adds operational surface with no measurable benefit at pilot scale.

## Consequences

**Unlocked.** Order submission latency drops from up to 10 seconds to single-digit milliseconds. Structured order data — variants, modifiers, addons, special notes — survives the kiosk-to-POS hop intact, which is a precondition for the recommendation layer (Stage 4) to key off real cart contents. The shared-Supabase model gives the recommendation tables clean foreign keys to menu items, sessions, and orders without cross-database joins.

**Cost.** POS components that read orders need a structural rewrite, not just an env-var swap: the Lovable schema modeled `orders → order_items` (flat), and the new schema models `orders → kots → kot_items` (round-aware). Estimated 2–4 components touched. The auto-generated `apps/pos/src/integrations/supabase/types.ts` is stale against the new schema and must be regenerated. Both apps need their `.env` files re-pointed at the local Supabase URL and publishable key.

**Permanently ruled out.** Offline kiosk-to-POS handoff via a passive store like Sheets is no longer possible without re-introducing a queue. If the local network between the kiosk and Supabase fails, orders fail to submit until connectivity returns. For a single-restaurant pilot on owner-controlled wifi this is acceptable; for multi-outlet rollout an offline queue would need to be designed deliberately, not inherited from the PoC by accident.

**Edge Function disposition.** The polling function is dead code post-migration. It will be removed from the Supabase project as part of the Beat 3 cleanup, not left to rot.