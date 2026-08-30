# Tabletot Dashboard

Recommendation curation and AOV measurement for the Tabletot pilot. This is a
curation tool only — anchor items, item pairings, meal-completion rules, and
the AOV lift view. It is **not** a menu CRUD tool (that lives in `apps/pos`).

## Local development

```sh
npm install
npm run dev
```

Dev server runs on **http://localhost:8082**.

Copy `.env.example` to `.env.local` and fill in the Supabase URL and
publishable key.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on :8082 |
| `npm run build` | Type-check + production build to `dist/` |
| `npm run lint` | ESLint |
| `npm run preview` | Serve the production build locally |

## Deployment

Deployed on Railway. Pushes and deploys are manual — see the repo root
`CLAUDE.md` and `docs/` for conventions.
