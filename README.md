# Kit Up

A crowdfunding platform where Australian schools list the sports equipment they
need — priced from the Hart Sport catalogue — and donors fund it item by item.

Built with **Next.js (App Router) · TypeScript · Tailwind CSS v4 · Supabase**.
Mobile-first, responsive, accessible.

---

## Quick start

> This repo was scaffolded without network access, so dependencies are **not**
> installed yet. Install them first.

```bash
npm install
cp .env.local.example .env.local   # then fill in your Supabase keys
npm run dev
```

Open http://localhost:3000.

The UI runs **immediately with mock data** (see `lib/mock-data.ts`) so you can
see and style everything before the backend is connected. No keys are required
to view the front end.

### Scripts

| Command             | Does                                  |
| ------------------- | ------------------------------------- |
| `npm run dev`       | Start the dev server                  |
| `npm run build`     | Production build                      |
| `npm run start`     | Serve the production build            |
| `npm run lint`      | ESLint (next/core-web-vitals)         |
| `npm run typecheck` | `tsc --noEmit`                        |

---

## Project structure

```
app/
  layout.tsx              Root layout: fonts, header, footer, metadata
  page.tsx                Home — hero, browse grid, how-it-works
  globals.css             Tailwind v4 + the Kit Up design tokens
  campaigns/[id]/page.tsx Campaign detail — fund items (the shopping flow)
  dashboard/page.tsx      School dashboard — manage your campaigns
  sign-in/page.tsx        Auth entry, donor/school role toggle
  not-found.tsx           Custom 404
components/
  site-header / site-footer / wordmark
  campaign-card.tsx       Product-style card for the browse grid
  progress-meter.tsx      ★ signature "court-lane" funding bar
  fundable-item.tsx       Client: quantity stepper + fund action
  ui/                     button, badge primitives
lib/
  types.ts                Types mirroring the DB schema + view models
  data.ts                 Data-access layer (swap mock → Supabase here)
  mock-data.ts            Realistic sample campaigns
  format.ts               AUD currency, dates, % and deadline helpers
  supabase/               Browser + server clients (@supabase/ssr)
supabase/
  migrations/0001_init.sql                 Approved schema (verbatim)
  migrations/0002_hart_products_category.sql  Adds category (see below)
scripts/
  import_catalogue.py     Loads the Hart Sport CSV into Supabase
  hart_sport_products_template.csv
```

---

## Design

Direction: **"Fieldhouse"** — athletic, optimistic, trustworthy. A chalk-court
off-white canvas, deep pine ink, a single bold **coral** for generous action,
and **turf green** reserved for funding progress. The signature element is the
**court-lane funding meter** (`components/progress-meter.tsx`): a progress bar
painted like a sports-court lane that fills with turf green, with a coral
"runner" at the leading edge that becomes a finish flag at 100%.

Typefaces (via `next/font`): **Bricolage Grotesque** (display) + **Plus Jakarta
Sans** (body). All tokens live in the `@theme` block of `app/globals.css`.

---

## Database (Supabase)

The schema models two actors that share an auth account via a thin `profiles`
table: **schools** create campaigns and the **items** they need; **donors**
browse and record **purchases**. Row Level Security is defined for every table.

### Apply the schema

Either paste the SQL into the Supabase SQL editor, or use the CLI:

```bash
# option A — Supabase SQL editor
#   run supabase/migrations/0001_init.sql, then 0002_hart_products_category.sql

# option B — Supabase CLI
supabase link --project-ref <your-project-ref>
supabase db push
```

### A note on `0002_hart_products_category.sql`

The approved `0001_init.sql` defines `hart_sport_products` **without** a
`category` column, but the provided `import_catalogue.py` and CSV template both
populate `category`. Migration `0002` adds that column so the importer, the CSV,
and the app UI (which groups items by category) all agree. `0001` is left
exactly as approved. If you'd rather not have categories, skip `0002` and drop
`category` from the importer and CSV instead.

### Load the Hart Sport catalogue

```bash
pip install supabase
export SUPABASE_URL="https://<your-project-ref>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"   # server-only, bypasses RLS
python scripts/import_catalogue.py scripts/hart_sport_products_template.csv
```

Replace the `EXAMPLE_` rows in the CSV with real products first — placeholder
rows are skipped. Re-running upserts on `hart_sku`, so it's safe on a schedule.

---

## Going live (mock → real data)

Everything reads through `lib/data.ts`. Each function there has the exact
Supabase query to drop in commented above it. The Supabase clients are ready in
`lib/supabase/`. Recommended next steps:

1. Fill `.env.local` with your project URL + anon key.
2. Apply the migrations and import the catalogue.
3. Replace the mock returns in `lib/data.ts` with the documented queries.
4. Add auth: wire `supabase.auth.signInWithPassword` in `app/sign-in`, add a
   middleware session refresh, and gate `app/dashboard` on the signed-in school.
5. Implement funding: `components/fundable-item.tsx` has a `fund()` stub —
   insert into `public.purchases` as the signed-in donor (RLS enforces
   `auth.uid() = donor_id`).
```
