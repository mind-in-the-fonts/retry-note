alter table public.game_rewards add column details jsonb not null default '{}'::jsonb;
create table public.game_purchases (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 item_id text not null,
 item_name text not null,
 price integer check(price>0),
 legacy boolean not null default false,
 created_at timestamptz not null default clock_timestamp()
);
create index game_purchases_user_date on public.game_purchases(user_id,created_at desc,id desc);
alter table public.game_purchases enable row level security;
create policy purchase_owner on public.game_purchases for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.game_purchases from public,anon,authenticated;
grant select on public.game_purchases to authenticated;
-- Older inventory retains a purchase date but never stored its historical price.
insert into public.game_purchases(user_id,item_id,item_name,price,legacy,created_at)
 select i.user_id,i.item_id,p.name,null,true,i.created_at from public.game_inventory i join public.game_items p on p.id=i.item_id;

create function game_private.describe_reward(p_reward public.game_rewards) returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb;
begin
 if p_reward.kind='quiz' then
  select jsonb_build_object('title',coalesce(a.snapshot->>'category','오답 복습'),'category',a.snapshot->>'category','question',left(a.snapshot->>'stem',180),'page',a.snapshot->>'page','questionNumber',a.snapshot->>'bookNumber','correct',a.is_correct)
  into result from public.attempts a where a.id=p_reward.attempt_id and a.user_id=p_reward.user_id;
 elsif p_reward.kind='pomodoro' then
  select jsonb_build_object('title',c.title,'videoId',r.video_id,'cycle',p.cycle+1,'goal',p.goal,'focusSeconds',p.focus_seconds,'completedAt',p.completed_at)
  into result from public.pomodoro_progress p join public.watch_rooms r on r.id=p.room_id join public.pomodoro_catalog c on c.video_id=r.video_id
  where p.user_id=p_reward.user_id and p.room_id::text||':'||p.cycle=p_reward.source_key;
 end if;
 return coalesce(result,jsonb_build_object('title',case when p_reward.kind='pomodoro' then '뽀모도로 공부' else '오답 복습' end));
end;$$;
create function game_private.capture_reward_details() returns trigger language plpgsql security definer set search_path='' as $$begin new.details:=game_private.describe_reward(new);return new;end;$$;
revoke all on function game_private.describe_reward(public.game_rewards),game_private.capture_reward_details() from public,anon,authenticated;
update public.game_rewards r set details=game_private.describe_reward(r);
create trigger game_capture_reward_details before insert on public.game_rewards for each row execute function game_private.capture_reward_details();

create or replace function game_private.buy(p_item text) returns jsonb language plpgsql security definer set search_path='' as $$
declare cost integer;balance integer;item_title text;
begin
 perform game_private.ensure_wallet();select coins into balance from public.game_wallets where user_id=auth.uid() for update;
 select price,name into cost,item_title from public.game_items where id=p_item;if not found then raise exception '상품을 찾을 수 없습니다.';end if;
 if exists(select 1 from public.game_inventory where user_id=auth.uid() and item_id=p_item) then return game_private.state();end if;
 if balance<cost then raise exception '코인을 조금 더 모아주세요.';end if;
 update public.game_wallets set coins=coins-cost where user_id=auth.uid();
 insert into public.game_inventory(user_id,item_id) values(auth.uid(),p_item);
 insert into public.game_purchases(user_id,item_id,item_name,price) values(auth.uid(),p_item,item_title,cost);
 return game_private.state();
end;$$;

create view public.game_activity_log with(security_invoker=true) as
 select r.id,r.user_id,r.kind,coalesce(r.details->>'title',case when r.kind='pomodoro' then '뽀모도로 공부' else '오답 복습' end) as title,r.details,r.total as amount,r.base,r.random_bonus,r.correct_bonus,r.minutes,r.created_at as occurred_at
 from public.game_rewards r
 union all
 select p.id,p.user_id,'purchase'::text,p.item_name,jsonb_build_object('itemId',p.item_id,'itemName',p.item_name,'legacy',p.legacy),-p.price,0,0,0,0,p.created_at from public.game_purchases p;
revoke all on public.game_activity_log from public,anon,authenticated;
grant select on public.game_activity_log to authenticated;

create function public.game_activity(p_kind text default 'all',p_search text default '',p_from timestamptz default null,p_to timestamptz default null,p_before_time timestamptz default null,p_before_id uuid default null,p_limit integer default 40) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;uid uuid:=auth.uid();
begin
 if uid is null then raise exception '로그인이 필요합니다.';end if;
 if p_kind is null or p_kind not in ('all','quiz','pomodoro','purchase') or p_limit is null or p_limit not between 1 and 100 or length(coalesce(p_search,''))>200 then raise exception '기록 조회 조건을 확인해주세요.';end if;
 if p_from is not null and p_to is not null and p_from>=p_to then raise exception '조회 날짜를 확인해주세요.';end if;
 if (p_before_time is null)<>(p_before_id is null) then raise exception '다음 기록 조회 위치를 확인해주세요.';end if;
 with filtered as (
  select * from public.game_activity_log where user_id=uid and (p_kind='all' or kind=p_kind) and (p_from is null or occurred_at>=p_from) and (p_to is null or occurred_at<p_to)
  and (coalesce(p_search,'')='' or strpos(lower(title||' '||details::text),lower(p_search))>0)
 ), page as (
  select * from filtered where p_before_time is null or (occurred_at,id)<(p_before_time,p_before_id) order by occurred_at desc,id desc limit p_limit+1
 )
 select jsonb_build_object('entries',coalesce((select jsonb_agg(to_jsonb(entries)-'user_id' order by occurred_at desc,id desc) from (select * from page order by occurred_at desc,id desc limit p_limit) entries),'[]'::jsonb),
 'hasMore',(select count(*)>p_limit from page),
 'summary',jsonb_build_object('count',(select count(*) from filtered),'earned',(select coalesce(sum(amount) filter(where amount>0),0) from filtered),'spent',(select coalesce(-sum(amount) filter(where amount<0),0) from filtered),'unknownPurchases',(select count(*) from filtered where kind='purchase' and amount is null),'balance',coalesce((select coins from public.game_wallets where user_id=uid),0))) into result;
 return result;
end;$$;
revoke all on function public.game_activity(text,text,timestamptz,timestamptz,timestamptz,uuid,integer) from public,anon;
grant execute on function public.game_activity(text,text,timestamptz,timestamptz,timestamptz,uuid,integer) to authenticated;
