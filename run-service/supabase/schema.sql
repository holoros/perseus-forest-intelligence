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

-- Profiles: a user sees and updates only their own row. Entitlement columns (tier,
-- runs_this_month, quota_monthly, quota_period_start) are NOT user-writable. Three layers:
--   1. the RLS policy limits updates to the caller's own row (USING and WITH CHECK);
--   2. column privileges: browser roles may update only email and updated_at;
--   3. a trigger rejects any entitlement change not made by a privileged role, so a
--      future broad GRANT cannot silently reopen the hole.
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles for select using (auth.uid() = id);
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (email, updated_at) on public.profiles to authenticated;

create or replace function public.profiles_guard_entitlement()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') and (
       new.tier               is distinct from old.tier
    or new.runs_this_month    is distinct from old.runs_this_month
    or new.quota_monthly      is distinct from old.quota_monthly
    or new.quota_period_start is distinct from old.quota_period_start
    or new.id                 is distinct from old.id) then
    raise exception 'entitlement columns are not user writable' using errcode = '42501';
  end if;
  return new;
end; $$;
drop trigger if exists profiles_guard_entitlement on public.profiles;
create trigger profiles_guard_entitlement
  before update on public.profiles for each row execute function public.profiles_guard_entitlement();

-- Subscriptions: read-only to the owner (only the webhook, via service role, writes).
drop policy if exists subs_self_select on public.subscriptions;
create policy subs_self_select on public.subscriptions for select using (auth.uid() = user_id);

-- Privileges. Supabase grants browser roles ALL on new public tables by default (which
-- includes TRUNCATE, which RLS does not cover), so start from nothing and grant back only
-- what the policies below need.
revoke all on public.runs, public.subscriptions, public.uploads from anon, authenticated;
grant select on public.runs, public.subscriptions to authenticated;
grant insert (user_id, spec) on public.runs to authenticated;
grant select, insert, update, delete on public.uploads to authenticated;

-- Runs: owner can read all their runs and INSERT only with an active subscription. Browser
-- roles may set only user_id and spec; status, result, job id and error are server written.
-- The monthly quota is taken atomically by the runs_take_quota trigger below, so parallel
-- submissions cannot overrun it and the counter resets when the month rolls over.
drop policy if exists runs_self_select on public.runs;
create policy runs_self_select on public.runs for select using (auth.uid() = user_id);

drop policy if exists runs_insert_entitled on public.runs;
create policy runs_insert_entitled on public.runs for insert with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.subscriptions s
    where s.user_id = auth.uid() and s.status in ('active','trialing')
  )
);

-- Uploads: owner scoped, and the Storage path must sit under the owner's own prefix.
drop policy if exists uploads_self_all on public.uploads;
create policy uploads_self_all on public.uploads for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id and storage_path like auth.uid()::text || '/%'
              and position('..' in storage_path) = 0);

-- ---------------------------------------------------------------------------
-- Quota. One row lock per submission: reset the counter if the period is stale, refuse
-- when the quota is spent, otherwise count the run. Runs for every insert, browser or
-- server, so a direct PostgREST insert is charged exactly like one from submit-run.
-- ---------------------------------------------------------------------------
create or replace function public.runs_take_quota()
returns trigger language plpgsql security definer set search_path = public as $$
declare p public.profiles%rowtype; m date := date_trunc('month', now())::date;
begin
  select * into p from public.profiles where id = new.user_id for update;
  if not found then raise exception 'no profile' using errcode = '42501'; end if;
  if p.quota_period_start < m then p.runs_this_month := 0; end if;
  if p.runs_this_month >= p.quota_monthly then
    raise exception 'monthly run quota reached' using errcode = '42501';
  end if;
  update public.profiles
     set runs_this_month = p.runs_this_month + 1, quota_period_start = m, updated_at = now()
   where id = new.user_id;
  return new;
end; $$;
revoke all on function public.runs_take_quota() from public, anon, authenticated;
drop trigger if exists runs_take_quota on public.runs;
create trigger runs_take_quota before insert on public.runs
  for each row execute function public.runs_take_quota();

-- Refund one run when dispatch fails after the insert (server only).
create or replace function public.refund_run_quota(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set runs_this_month = greatest(runs_this_month - 1, 0), updated_at = now()
   where id = p_user and quota_period_start = date_trunc('month', now())::date;
end; $$;
revoke all on function public.refund_run_quota(uuid) from public, anon, authenticated;
grant execute on function public.refund_run_quota(uuid) to service_role;

-- Retired: counting now happens in runs_take_quota. Dropped so nothing can double count.
drop function if exists public.increment_run_quota(uuid);

-- ---------------------------------------------------------------------------
-- Paddle events. apply_paddle_event records the event id and applies it in ONE
-- transaction: a duplicate is a no-op, an older event never overwrites newer state, a
-- subscription is never moved to a different user, and the profile tier is recomputed
-- from ALL of the user's subscriptions. If anything fails the whole call rolls back,
-- the event id is not recorded, and Paddle's retry can apply it. Service role only.
-- ---------------------------------------------------------------------------
create table if not exists public.paddle_events (
  event_id     text primary key,
  event_type   text,
  occurred_at  timestamptz,
  received_at  timestamptz not null default now()
);
alter table public.paddle_events enable row level security;  -- no policies: server only
revoke all on public.paddle_events from anon, authenticated;
alter table public.subscriptions add column if not exists last_event_at timestamptz;

create or replace function public.apply_paddle_event(
  p_event_id text, p_event_type text, p_occurred timestamptz, p_user uuid,
  p_sub_id text, p_customer_id text, p_status text, p_plan text, p_period_end timestamptz,
  p_quota int default 50)
returns text language plpgsql security definer set search_path = public as $$
declare cur public.subscriptions%rowtype; entitled boolean;
begin
  insert into public.paddle_events(event_id, event_type, occurred_at)
  values (p_event_id, p_event_type, p_occurred) on conflict (event_id) do nothing;
  if not found then return 'duplicate'; end if;
  if p_status is null then return 'ignored'; end if;

  select * into cur from public.subscriptions where paddle_subscription_id = p_sub_id for update;
  if found then
    if cur.user_id <> p_user then
      raise exception 'subscription % belongs to another user', p_sub_id using errcode = '42501';
    end if;
    if cur.last_event_at is not null and cur.last_event_at >= p_occurred then
      return 'stale';
    end if;
    update public.subscriptions
       set status = p_status, paddle_customer_id = p_customer_id, plan = p_plan,
           current_period_end = p_period_end, last_event_at = p_occurred, updated_at = now()
     where paddle_subscription_id = p_sub_id;
  else
    insert into public.subscriptions(user_id, paddle_subscription_id, paddle_customer_id,
                                     status, plan, current_period_end, last_event_at)
    values (p_user, p_sub_id, p_customer_id, p_status, p_plan, p_period_end, p_occurred);
  end if;

  select exists (select 1 from public.subscriptions
                  where user_id = p_user and status in ('active','trialing')) into entitled;
  update public.profiles
     set tier = case when tier = 'admin' then tier when entitled then 'subscriber' else 'free' end,
         quota_monthly = case when entitled then greatest(quota_monthly, p_quota) else 0 end,
         updated_at = now()
   where id = p_user;
  return 'applied';
end; $$;
revoke all on function public.apply_paddle_event(text, text, timestamptz, uuid, text, text, text, text, timestamptz, int)
  from public, anon, authenticated;
grant execute on function public.apply_paddle_event(text, text, timestamptz, uuid, text, text, text, text, timestamptz, int)
  to service_role;
