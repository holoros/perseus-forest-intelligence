# PERSEUS production deploy guide

Two layers ship independently:

1. **Static app (live now).** React/Vite SPA on GitHub Pages, auto-deployed from `main` by
   `.github/workflows/deploy-pages.yml`. This is the production site today and needs no
   backend. Custom domain optional (CNAME + a `CNAME` file in `public/`).

2. **Run-service backend (optional, for the subscriber tier).** Supabase + Cloudflare Pages +
   Paddle, with Cardinal as the compute layer. This is scaffolding; standing it up requires
   creating accounts and supplying credentials. Steps that require Aaron (accounts, billing,
   credentials, institutional sign-off) are marked **[YOU]**.

## Architecture

```
Browser (Cloudflare Pages)
   |  Supabase JS (anon key, user JWT)
   v
Supabase  ── Auth ── Postgres (RLS tier gate) ── Edge Functions ── Storage
   |                                                  |
   | paddle-webhook  <─── Paddle (Merchant of Record) |
   |                                                  | submit-run
   v                                                  v
Profiles/subscriptions/runs                   Cardinal dispatcher (SSH/SLURM)
                                                      |
                                                      v
                                              OSC Cardinal (PUOM0008)
```

Tier gating lives in Postgres RLS (`runs_insert_entitled`), not in app middleware: a run
insert only succeeds for a user with an active subscription who is under their monthly quota.

## A. Supabase (the backend store)

1. **[YOU]** Create a Supabase project (US or EU region per UMaine data policy). **[YOU]** Get
   UMaine IT/security sign-off on managed Postgres before storing any user data.
2. Apply the schema: `supabase db push` (or `psql -f run-service/supabase/schema.sql`).
3. Enable Auth (email magic-link or OAuth). Profiles auto-create via the `on_auth_user_created`
   trigger.
4. Set function secrets (**[YOU]** supply the values):
   `supabase secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... PADDLE_WEBHOOK_SECRET=... CARDINAL_DISPATCH_URL=...`
5. Deploy functions:
   `supabase functions deploy paddle-webhook --no-verify-jwt`
   `supabase functions deploy submit-run`

## B. Paddle (billing, Merchant of Record)

1. **[YOU]** Confirm with UMaine DIC that a Paddle commission / revenue-share (MoR) model is
   acceptable. If not, fall back to Stripe with UMaine as the direct merchant. This is the one
   open business decision that gates billing.
2. **[YOU]** Create the Paddle account, a product, and a subscription price; copy the price id
   into `VITE_PADDLE_PRICE_ID` and the client token into `VITE_PADDLE_CLIENT_TOKEN`.
3. **[YOU]** Register the `paddle-webhook` function URL as a notification destination; copy the
   signing secret into `PADDLE_WEBHOOK_SECRET`.

## C. Cardinal dispatcher (compute)

1. Run `run-service/backend` (the FastAPI dispatcher) on an always-on host that holds the
   Cardinal SSH deploy key. It exposes the `CARDINAL_DISPATCH_URL` the `submit-run` function
   calls; it translates a run-spec to a SLURM job via `backend/cardinal_dispatch.py` and the
   `cardinal/` runner, then writes results back to Supabase (inline or Storage).
2. **[YOU]** Create a dedicated Cardinal deploy key and set `CARDINAL_*` env values. Keep the
   key on the backend host only; it never touches the browser or the repo.

## D. Front end (Cloudflare Pages)

1. **[YOU]** Create a Cloudflare Pages project pointed at this repo. Build command
   `npm run build`, output directory `dist`.
2. Set the `VITE_*` build variables (public anon/client values only).
3. Copy `run-service/cloudflare/_headers` into `public/` (or configure Pages headers) so it
   ships in `dist/`.
4. Point the gated UI (the "Submit custom run to Cardinal" button, account, saved analyses) at
   Supabase Auth + the `submit-run` function. The free precomputed tier keeps working with no
   account.

## Security notes (non-negotiable)

- The service-role key and the Cardinal SSH key are server-only. Never put them in `VITE_*`
  variables, the repo, or any client bundle.
- The browser only ever holds the Supabase anon key and the Paddle client token (both public).
- All entitlement decisions are enforced server-side by RLS, not by hiding UI.

## Current status

Scaffolding committed: `supabase/schema.sql`, `supabase/functions/paddle-webhook`,
`supabase/functions/submit-run`, `cloudflare/_headers`, `.env.example`, and the existing
`backend/` + `cardinal/` runner. No accounts created, no secrets present, nothing billed.
The static app is the live production deliverable; the backend is ready to stand up when the
DIC billing decision and IT sign-off land.
