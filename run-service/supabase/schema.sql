-- PERSEUS run-service · Supabase schema + row-level security
-- Architecture: Supabase (managed Postgres + Auth + Edge Functions + Storage) is the
-- accounts/results/entitlements store; Cloudflare Pages serves the static front end;
-- Cardinal is the compute layer; Paddle (Merchant of Record) handles billing.
-- Tier gating is enforced by RLS in the database, NOT by app middleware.
--
-- Apply with: supabase db push   (or psql -f schema.sql against the project).
-- This file is declarative and idempotent where practical. No secrets here.

-- ---------------------------------------------------------------------------
-- Profiles: one row per auth user, carrying tier + a monthly compute quota.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text,
  tier          text not null default 'free' check (tier in ('free','subscriber','admin')),
  runs_this_month   int not null default 0,
  quota_monthly     int not null default 0,        -- 0 for free; set per plan for subscribers
  quota_period_start date not null default date_trunc('month', now())::date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Auto-create a profile when a user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Subscriptions: mirror of Paddle subscription state (written by the webhook).
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  paddle_subscription_id text unique,
  paddle_customer_id     text,
  status             text not null default 'inactive'
                       check (status in ('active','trialing','past_due','paused','canceled','inactive')),
  plan               text,
  current_period_end timestamptz,
  updated_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Runs: one row per submitted run-spec; results stored alongside or in Storage.
-- ---------------------------------------------------------------------------
create table if not exists public.runs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  spec         jsonb not null,                 -- the validated run-spec (run_spec.schema.json)
  tier         text not null default 'subscriber',
  status       text not null default 'queued'  -- queued -> dispatched -> running -> complete -> failed
                 check (status in ('queued','dispatched','running','complete','failed')),
  cardinal_job_id text,
  result       jsonb,                          -- small results inline; large ones in Storage
  result_path  text,                           -- Storage path for large result bundles
  error        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists runs_user_idx on public.runs(user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Uploads: user-supplied inventory references (the files live in Storage).
-- ---------------------------------------------------------------------------
create table if not exists public.uploads (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  filename    text,
  storage_path text not null,
  n_rows      int,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row-level security. The browser uses the anon key; every read/write is scoped
-- to auth.uid(). Service-role (edge functions / webhook) bypasses RLS.
-- ---------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.subscriptions enable row level security;
alter table public.runs          enable row level security;
alter table public.uploads       enable row level security;

-- Profiles: a user sees and updates only their own row (tier/quota are not user-writable;
-- restrict updates to non-privileged columns at the app layer or via a column grant).
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles for select using (auth.uid() = id);
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update using (auth.uid() = id);

-- Subscriptions: read-only to the owner (only the webhook, via service role, writes).
drop policy if exists subs_self_select on public.subscriptions;
create policy subs_self_select on public.subscriptions for select using (auth.uid() = user_id);

-- Runs: owner can read all their runs and INSERT only when entitled (active subscription
-- AND under monthly quota). This is the tier gate, in the database.
drop policy if exists runs_self_select on public.runs;
create policy runs_self_select on public.runs for select using (auth.uid() = user_id);

drop policy if exists runs_insert_entitled on public.runs;
create policy runs_insert_entitled on public.runs for insert with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.subscriptions s
    where s.user_id = auth.uid() and s.status in ('active','trialing')
  )
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.runs_this_month < p.quota_monthly
  )
);

-- Uploads: owner-scoped read/write.
drop policy if exists uploads_self_all on public.uploads;
create policy uploads_self_all on public.uploads for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Quota helper: reset monthly counter and increment on a completed run.
-- Called by the dispatch/result edge functions (service role).
-- ---------------------------------------------------------------------------
create or replace function public.increment_run_quota(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
     set runs_this_month = case when quota_period_start < date_trunc('month', now())::date
                                then 1 else runs_this_month + 1 end,
         quota_period_start = date_trunc('month', now())::date,
         updated_at = now()
   where id = p_user;
end; $$;
