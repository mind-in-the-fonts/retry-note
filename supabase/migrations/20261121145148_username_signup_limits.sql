create schema if not exists account_private;
revoke all on schema account_private from public,anon,authenticated;
grant usage on schema account_private to service_role;
create table account_private.signup_limits (
 scope text not null check(scope in ('global','ip')),
 key text not null,
 window_started_at timestamptz not null default now(),
 attempts integer not null default 1,
 primary key(scope,key)
);
alter table account_private.signup_limits enable row level security;
revoke all on account_private.signup_limits from public,anon,authenticated;
create function account_private.take_slot(p_scope text,p_key text) returns boolean language plpgsql security definer set search_path='' as $$
declare used integer;
begin
 if p_scope not in ('global','ip') or p_scope is null or p_key is null or length(p_key) not between 1 and 64 then raise exception 'Invalid signup limit key'; end if;
 delete from account_private.signup_limits where window_started_at<now()-interval '1 day';
 insert into account_private.signup_limits as limits(scope,key) values(p_scope,p_key)
 on conflict(scope,key) do update set attempts=case when limits.window_started_at<now()-interval '1 hour' then 1 else limits.attempts+1 end,
 window_started_at=case when limits.window_started_at<now()-interval '1 hour' then now() else limits.window_started_at end
 returning attempts into used;
 return used<=case when p_scope='global' then 100 else 10 end;
end; $$;
revoke all on function account_private.take_slot(text,text) from public,anon,authenticated;
grant execute on function account_private.take_slot(text,text) to service_role;
create function public.account_signup_slot(p_scope text,p_key text) returns boolean language sql security invoker set search_path='' as $$select account_private.take_slot(p_scope,p_key);$$;
revoke all on function public.account_signup_slot(text,text) from public,anon,authenticated;
grant execute on function public.account_signup_slot(text,text) to service_role;
