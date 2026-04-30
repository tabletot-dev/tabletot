# Dashboard App

`apps/dashboard/` — lightweight React + Vite app for restaurant curation and measurement.
Runs separately from the POS. Designed for the operator (Rohan) to manage kiosk recommendations.

## How to run locally

```bash
cd apps/dashboard
npm install
npm run dev       # starts on http://localhost:8081
```

Copy `.env.example` to `.env.local` and fill in values before running.

## Route map

| Route | Page | Component |
|-------|------|-----------|
| `/` | → redirect | `/curation/anchors` |
| `/curation/anchors` | Anchor Items | `src/pages/AnchorItems.tsx` |
| `/curation/pairings` | Item Pairings | `src/pages/ItemPairings.tsx` |
| `/curation/rules` | Completion Rules | `src/pages/CompletionRules.tsx` |
| `/curation/aov` | AOV Lift | `src/pages/AovView.tsx` |

All routes are available from the sidebar (`src/components/Sidebar.tsx`).

## Env vars

| Var | Purpose |
|-----|---------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/publishable key |
| `VITE_RESTAURANT_ID` | UUID of the active restaurant (e.g. `cccccccc-…` for Roast CCx) |
| `VITE_POS_PROVIDER` | Feature gate value — set to `tabletot` to unlock all pages |

## How pos_provider gating works

Each page is wrapped in `<FeatureGate requiredProvider="tabletot">`. At render time, it reads:

```ts
const posProvider = import.meta.env.VITE_POS_PROVIDER || 'tabletot';
```

If `posProvider !== requiredProvider`, the page shows a "Not available for your plan" banner
instead of its content.

For the pilot (Roast CCx), `VITE_POS_PROVIDER=tabletot` — all 4 pages are accessible.
This gate exists to support future multi-provider deployments where some features are tabletot-only.

## Restaurant-id scoping

Every Supabase query includes `.eq('restaurant_id', RESTAURANT_ID)` where `RESTAURANT_ID` is read
from `VITE_RESTAURANT_ID` at module level. INSERTs also pass `restaurant_id: RESTAURANT_ID`.

## What was deleted from apps/pos

- `apps/pos/src/pages/RecommendationCuration.tsx` — moved to 4 separate pages in dashboard
- Route `/admin/recommendations` removed from `apps/pos/src/App.tsx`
- "Recommendations" nav item removed from `apps/pos/src/components/AppSidebar.tsx`

## Supabase types

`src/integrations/supabase/types.ts` is a copy of the kiosk types (latest schema).
When running migrations, regenerate for all three apps:

```bash
supabase gen types typescript --local > apps/kiosk/src/integrations/supabase/types.ts
cp apps/kiosk/src/integrations/supabase/types.ts apps/pos/src/integrations/supabase/types.ts
cp apps/kiosk/src/integrations/supabase/types.ts apps/dashboard/src/integrations/supabase/types.ts
```
