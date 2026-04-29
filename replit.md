# 일레븐힐스 경영진 대시보드 (Eleven Hills Executive Dashboard)

A Korean corporate governance dashboard for tracking holding/subsidiary structures, ownership, family relationships, and (planned) revenue/reports.

## Stack

- **Frontend artifact:** `artifacts/dashboard/` — React + Vite + Tailwind v4, wouter routing, dark editorial theme.
- **Auth (optional):** Supabase JS client. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to enable login. When unset, dev bypass is active and any login goes straight to the dashboard.
- **Scaffold packages:** `artifacts/api-server/` (Express, currently unused by the app), `artifacts/mockup-sandbox/`, `lib/api-spec/`, `lib/api-client-react/`, `lib/db/`.

## Pages

- `/login` — login form (dev bypass when Supabase env not set).
- `/` — overview with stats and family relationships.
- `/governance` — tree view + org chart toggle.
- `/governance/:id` — single company detail (locations, shareholders, directors, parent/children).
- `/revenue` — placeholder (Phase 2).
- `/reports` — placeholder (Phase 3).

## Notes

- Migrated from a Next.js (v0/Vercel) project. File-based routing was converted to wouter; `next/link`/`next/image`/`next/navigation` were removed; Supabase SSR was replaced with the browser client; Korean fonts are loaded directly from Google Fonts in `index.html`.
- All seed data lives in `artifacts/dashboard/src/lib/data/companies.ts`. No backend or database is required to run the app.
