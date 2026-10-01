-- RLS and privilege tests for schema.sql. Run after supabase_stub.sql and schema.sql.
-- Every check raises on failure; the script ends with 'ALL RLS TESTS PASSED'.
\set ON_ERROR_STOP on
insert into auth.users values ('11111111-1111-1111-1111-111111111111','a@x.org'),
                              ('22222222-2222-2222-2222-222222222222','b@x.org');

-- 1. A signed-in user cannot raise their own tier or quota.
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
do $$ begin
  begin update public.profiles set tier = 'admin' where id = auth.uid();
        raise exception 'FAIL: user raised own tier';
  exception when insufficient_privilege then null; end;
  begin update public.profiles set quota_monthly = 9999 where id = auth.uid();
        raise exception 'FAIL: user raised own quota';
  exception when insufficient_privilege then null; end;
  begin update public.profiles set runs_this_month = -100 where id = auth.uid();
        raise exception 'FAIL: user reset own run counter';
  exception when insufficient_privilege then null; end;
end $$;

-- 2. A user may still edit a non entitlement column on their own row, and not on others.
update public.profiles set email = 'a2@x.org' where id = auth.uid();
update public.profiles set email = 'hijack@x.org' where id = '22222222-2222-2222-2222-222222222222';
reset role;
do $$ begin
  if (select email from public.profiles where id = '11111111-1111-1111-1111-111111111111') <> 'a2@x.org'
    then raise exception 'FAIL: own email update did not apply'; end if;
  if (select email from public.profiles where id = '22222222-2222-2222-2222-222222222222') <> 'b@x.org'
    then raise exception 'FAIL: user updated another profile'; end if;
end $$;

-- 3. Trigger backstop: even with a broad grant restored, entitlement changes are refused.
grant update on public.profiles to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
do $$ begin
  begin update public.profiles set tier = 'subscriber' where id = auth.uid();
        raise exception 'FAIL: trigger did not block tier change';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
revoke update on public.profiles from authenticated;
grant update (email, updated_at) on public.profiles to authenticated;

-- 4. Users cannot write subscriptions, call server functions, or TRUNCATE.
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
do $$ begin
  begin insert into public.subscriptions(user_id, status) values (auth.uid(), 'active');
        raise exception 'FAIL: user inserted own subscription';
  exception when insufficient_privilege then null; end;
  begin perform public.refund_run_quota(auth.uid());
        raise exception 'FAIL: user called refund_run_quota';
  exception when insufficient_privilege then null; end;
  begin perform public.apply_paddle_event('e', 't', now(), auth.uid(), 's', 'c', 'active', 'p', null);
        raise exception 'FAIL: user called apply_paddle_event';
  exception when insufficient_privilege then null; end;
  begin truncate public.runs;
        raise exception 'FAIL: user truncated runs';
  exception when insufficient_privilege then null; end;
  begin truncate public.subscriptions;
        raise exception 'FAIL: user truncated subscriptions';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 5. Run insert: needs an active subscription; server columns are not settable.
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
do $$ begin
  begin insert into public.runs(user_id, spec) values (auth.uid(), '{}'::jsonb);
        raise exception 'FAIL: unentitled user inserted a run';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set role service_role;
select public.apply_paddle_event('evt_a1', 'subscription.activated', now() - interval '1 hour',
  '11111111-1111-1111-1111-111111111111', 'sub_a', 'ctm_a', 'active', 'pro', null, 2);
reset role;
do $$ begin
  if (select tier from public.profiles where id = '11111111-1111-1111-1111-111111111111') <> 'subscriber'
    then raise exception 'FAIL: apply_paddle_event did not grant subscriber'; end if;
  if (select quota_monthly from public.profiles where id = '11111111-1111-1111-1111-111111111111') <> 2
    then raise exception 'FAIL: quota not set from plan'; end if;
end $$;

-- 5a. The quota is taken atomically per insert: quota 2 allows exactly two runs.
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
insert into public.runs(user_id, spec) values (auth.uid(), '{"aoi":{}}'::jsonb);
insert into public.runs(user_id, spec) values (auth.uid(), '{"aoi":{}}'::jsonb);
do $$ begin
  begin insert into public.runs(user_id, spec) values (auth.uid(), '{}'::jsonb);
        raise exception 'FAIL: third run accepted on a quota of 2';
  exception when insufficient_privilege then null; end;
  begin insert into public.runs(user_id, spec, status, result)
          values (auth.uid(), '{}'::jsonb, 'complete', '{"fake":true}'::jsonb);
        raise exception 'FAIL: user set server-written run columns';
  exception when insufficient_privilege then null; end;
  begin insert into public.runs(user_id, spec) values ('22222222-2222-2222-2222-222222222222', '{}'::jsonb);
        raise exception 'FAIL: user inserted a run for someone else';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.paddle_events;
        if found then raise exception 'FAIL: paddle_events readable'; end if;
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if (select runs_this_month from public.profiles where id = '11111111-1111-1111-1111-111111111111') <> 2
    then raise exception 'FAIL: counter is not 2 after two runs'; end if;
end $$;

-- 5b. Month rollover: last month's spent quota does not block this month.
update public.profiles set quota_period_start = (date_trunc('month', now()) - interval '1 month')::date
 where id = '11111111-1111-1111-1111-111111111111';
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
insert into public.runs(user_id, spec) values (auth.uid(), '{"aoi":{}}'::jsonb);
reset role;
do $$ begin
  if (select runs_this_month from public.profiles where id = '11111111-1111-1111-1111-111111111111') <> 1
    then raise exception 'FAIL: counter did not reset at month rollover'; end if;
end $$;

-- 5c. Refund (server only) returns one run.
set role service_role;
select public.refund_run_quota('11111111-1111-1111-1111-111111111111');
reset role;
do $$ begin
  if (select runs_this_month from public.profiles where id = '11111111-1111-1111-1111-111111111111') <> 0
    then raise exception 'FAIL: refund did not decrement'; end if;
end $$;

-- 6. Paddle events: duplicate, stale, user mismatch (rolled back), multiple subscriptions.
set role service_role;
do $$ declare r text; begin
  r := public.apply_paddle_event('evt_a1', 'subscription.activated', now(),
        '11111111-1111-1111-1111-111111111111', 'sub_a', 'ctm_a', 'active', 'pro', null);
  if r <> 'duplicate' then raise exception 'FAIL: duplicate event returned %', r; end if;
  r := public.apply_paddle_event('evt_a0', 'subscription.canceled', now() - interval '2 hours',
        '11111111-1111-1111-1111-111111111111', 'sub_a', 'ctm_a', 'canceled', 'pro', null);
  if r <> 'stale' then raise exception 'FAIL: older event returned %', r; end if;
  begin
    perform public.apply_paddle_event('evt_x', 'subscription.canceled', now(),
        '22222222-2222-2222-2222-222222222222', 'sub_a', 'ctm_x', 'canceled', 'pro', null);
    raise exception 'FAIL: subscription moved to another user';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.paddle_events where event_id = 'evt_x')
    then raise exception 'FAIL: rejected event id was recorded (no retry possible)'; end if;
  if (select status from public.subscriptions where paddle_subscription_id = 'sub_a') <> 'active'
    then raise exception 'FAIL: stale or rejected event changed state'; end if;
end $$;
set role service_role;
select public.apply_paddle_event('evt_b1', 'subscription.activated', now(),
  '11111111-1111-1111-1111-111111111111', 'sub_b', 'ctm_a', 'active', 'pro', null);
select public.apply_paddle_event('evt_b2', 'subscription.canceled', now() + interval '1 second',
  '11111111-1111-1111-1111-111111111111', 'sub_b', 'ctm_a', 'canceled', 'pro', null);
reset role;
do $$ begin
  if (select tier from public.profiles where id = '11111111-1111-1111-1111-111111111111') <> 'subscriber'
    then raise exception 'FAIL: cancelling one of two subscriptions removed entitlement'; end if;
end $$;
set role service_role;
select public.apply_paddle_event('evt_a2', 'subscription.canceled', now() + interval '2 seconds',
  '11111111-1111-1111-1111-111111111111', 'sub_a', 'ctm_a', 'canceled', 'pro', null);
reset role;
do $$ begin
  if (select tier from public.profiles where id = '11111111-1111-1111-1111-111111111111') <> 'free'
    or (select quota_monthly from public.profiles where id = '11111111-1111-1111-1111-111111111111') <> 0
    then raise exception 'FAIL: cancelling all subscriptions left entitlement'; end if;
end $$;

-- 7. Uploads must sit under the owner's own storage prefix.
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
insert into public.uploads(user_id, storage_path) values (auth.uid(), auth.uid()::text || '/inv.csv');
do $$ begin
  begin insert into public.uploads(user_id, storage_path)
          values (auth.uid(), '22222222-2222-2222-2222-222222222222/inv.csv');
        raise exception 'FAIL: upload path under another user accepted';
  exception when insufficient_privilege then null; end;
  begin insert into public.uploads(user_id, storage_path)
          values (auth.uid(), auth.uid()::text || '/../22222222-2222-2222-2222-222222222222/x');
        raise exception 'FAIL: traversal upload path accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'ALL RLS TESTS PASSED';
