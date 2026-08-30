# Tabletot POS

Restaurant management app for the Tabletot pilot — auth, billing, kitchen
display (KOT), table management, menu admin, and reports. Runs as a layer
above the restaurant's own POS.

## Local development

```sh
npm install
npm run dev
```

Dev server runs on **http://localhost:8081**.

Copy `.env.example` to `.env.local` and fill in the Supabase URL, publishable
key, and `VITE_RESTAURANT_ID`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on :8081 |
| `npm run build` | Type-check + production build to `dist/` |
| `npm run lint` | ESLint |
| `npm run preview` | Serve the production build locally |

## Deployment

Deployed on Railway. Pushes and deploys are manual — see the repo root
`CLAUDE.md` and `docs/` for conventions.
