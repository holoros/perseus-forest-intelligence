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

-- 4. Users cannot write subscriptions or call the quota function.
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
do $$ begin
  begin insert into public.subscriptions(user_id, status) values (auth.uid(), 'active');
        raise exception 'FAIL: user inserted own subscription';
  exception when insufficient_privilege then null; end;
  begin perform public.increment_run_quota('22222222-2222-2222-2222-222222222222');
        raise exception 'FAIL: user called increment_run_quota';
  exception when insufficient_privilege then null; end;
end $$;

-- 5. Run insert is gated on subscription and quota, and server columns are not settable.
do $$ begin
  begin insert into public.runs(user_id, spec) values (auth.uid(), '{}'::jsonb);
        raise exception 'FAIL: unentitled user inserted a run';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into public.subscriptions(user_id, status) values ('11111111-1111-1111-1111-111111111111','active');
update public.profiles set quota_monthly = 5 where id = '11111111-1111-1111-1111-111111111111';
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
insert into public.runs(user_id, spec) values (auth.uid(), '{"aoi":{}}'::jsonb);
do $$ begin
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

-- 6. The server role still works.
reset role;
set role service_role;
select public.increment_run_quota('11111111-1111-1111-1111-111111111111');
update public.profiles set tier = 'subscriber' where id = '11111111-1111-1111-1111-111111111111';
insert into public.paddle_events(event_id) values ('evt_1');
do $$ begin
  begin insert into public.paddle_events(event_id) values ('evt_1');
        raise exception 'FAIL: duplicate event id accepted';
  exception when unique_violation then null; end;
end $$;
reset role;
select 'ALL RLS TESTS PASSED';
