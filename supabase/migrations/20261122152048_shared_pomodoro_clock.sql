-- Independent shared study clock. Video chapters remain supported for older rooms.
alter table public.watch_rooms
 add column timer_kind text not null default 'video' check(timer_kind in ('video','clock')),
 add column focus_seconds integer not null default 3000 check(focus_seconds between 60 and 10800),
 add column rest_seconds integer not null default 600 check(rest_seconds between 0 and 3600),
 add column pause_during_rest boolean not null default false,
 add column timer_elapsed double precision not null default 0 check(timer_elapsed>=0 and timer_elapsed<'Infinity'::double precision),
 add column timer_running boolean not null default false,
 add column timer_updated_at timestamptz,
 add column timer_video_phase bigint not null default -1;

create function game_private.clock_elapsed(r public.watch_rooms) returns double precision language sql stable set search_path='' as $$
 select r.timer_elapsed+case when r.timer_running then greatest(0,extract(epoch from(clock_timestamp()-r.timer_updated_at))) else 0 end;
$$;

create function game_private.create_clock(p_video text,p_name text,p_focus integer,p_rest integer,p_pause boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare data jsonb;rid uuid;
begin
 if p_focus is null or p_focus not between 60 and 10800 or p_rest is null or p_rest not between 0 and 3600 or p_pause is null then raise exception '집중·휴식 시간을 확인해주세요.';end if;
 data:=watch_private.create_room(p_video);rid:=(data->'room'->>'id')::uuid;
 update public.watch_rooms set mode='pomodoro',timer_kind='clock',focus_seconds=p_focus,rest_seconds=p_rest,pause_during_rest=p_pause where id=rid;
 return watch_private.rename_room(rid,coalesce(nullif(btrim(p_name),''),'함께 공부하는 방'));
end;$$;

-- Each phase change is applied once under a room lock; polling also repairs missed realtime events.
create function game_private.sync_clock_video(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.watch_rooms;e double precision;marker bigint;wanted boolean;at_time timestamptz:=clock_timestamp();
begin
 if not watch_private.can_access(p_id) then raise exception '방에 먼저 참여해주세요.';end if;
 select * into r from public.watch_rooms where id=p_id for update;
 if r.timer_kind<>'clock' or r.closed or r.timer_updated_at is null or not r.pause_during_rest then return;end if;
 e:=game_private.clock_elapsed(r);marker:=floor(e/(r.focus_seconds+r.rest_seconds))::bigint*2+case when mod(e::numeric,(r.focus_seconds+r.rest_seconds)::numeric)>=r.focus_seconds then 1 else 0 end;
 if marker=r.timer_video_phase then return;end if;
 wanted:=r.timer_running and mod(marker,2)=0;
 update public.watch_rooms set timer_video_phase=marker,playing=wanted,
 position=least(604800,r.position+case when r.playing then greatest(0,extract(epoch from(at_time-r.updated_at)))*r.playback_rate else 0 end),updated_at=at_time,version=version+1 where id=p_id;
end;$$;
create or replace function watch_private.read_room(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if not watch_private.can_access(p_id) then raise exception '방에 먼저 참여해주세요.';end if;
 perform game_private.sync_clock_video(p_id);return watch_private.snapshot(p_id);
end;$$;
create function game_private.control_clock(p_id uuid,p_running boolean,p_version bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.watch_rooms;e double precision;wanted boolean;at_time timestamptz:=clock_timestamp();
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.';end if;
 select * into r from public.watch_rooms where id=p_id for update;
 if not found or r.owner_id<>auth.uid() then raise exception '방을 만든 사용자만 타이머를 조작할 수 있습니다.';end if;
 if r.closed or r.timer_kind<>'clock' or p_running is null or p_version is null then raise exception '공부방 타이머를 확인해주세요.';end if;
 if r.version<>p_version then return watch_private.snapshot(p_id)||jsonb_build_object('applied',false);end if;
 if r.timer_running=p_running then return watch_private.snapshot(p_id)||jsonb_build_object('applied',true);end if;
 e:=game_private.clock_elapsed(r);wanted:=p_running and (not r.pause_during_rest or mod(e::numeric,(r.focus_seconds+r.rest_seconds)::numeric)<r.focus_seconds);
 update public.watch_rooms set timer_elapsed=e,timer_running=p_running,timer_updated_at=at_time,timer_video_phase=-1,
 position=least(604800,r.position+case when r.playing then greatest(0,extract(epoch from(at_time-r.updated_at)))*r.playback_rate else 0 end),playing=wanted,updated_at=at_time,updated_by=auth.uid(),version=version+1 where id=p_id;
 perform game_private.sync_clock_video(p_id);return watch_private.snapshot(p_id)||jsonb_build_object('applied',true);
end;$$;

create or replace function game_private.guard_pomo_room() returns trigger language plpgsql set search_path='' as $$begin
 if old.mode='pomodoro' and old.timer_kind='video' and (new.video_id<>old.video_id or new.playback_rate<>1) then raise exception '뽀모도로 방의 영상과 배속은 고정되어 있습니다.';end if;
 if old.timer_kind='clock' and new.closed and not old.closed then new.timer_elapsed:=game_private.clock_elapsed(old);new.timer_running:=false;new.timer_updated_at:=clock_timestamp();end if;
 return new;end;$$;

create or replace function game_private.goal(p_room uuid,p_cycle integer,p_goal text) returns void language plpgsql security definer set search_path='' as $$
declare r public.watch_rooms;total integer;
begin
 if not watch_private.can_access(p_room) then raise exception '방에 먼저 참여해주세요.';end if;
 select * into r from public.watch_rooms where id=p_room and mode='pomodoro';if not found then raise exception '뽀모도로 방이 아닙니다.';end if;
 if r.timer_kind='clock' then total:=floor(game_private.clock_elapsed(r)/(r.focus_seconds+r.rest_seconds))::integer+2;
 else select jsonb_array_length(sessions) into total from public.pomodoro_catalog where video_id=r.video_id;end if;
 if p_cycle is null or p_cycle<0 or p_cycle>=total or p_goal is null or length(p_goal)>500 then raise exception '목표를 확인해주세요.';end if;
 insert into public.pomodoro_progress(user_id,room_id,cycle,goal) values(auth.uid(),p_room,p_cycle,p_goal) on conflict(user_id,room_id,cycle) do update set goal=excluded.goal;
end;$$;

create function game_private.video_heartbeat(p_room uuid,p_position double precision,p_active boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.watch_rooms;prior game_private.presence;s jsonb;idx integer:=0;elapsed double precision;advance double precision;credit double precision;expected double precision;valid boolean;begin
 if not watch_private.can_access(p_room) then raise exception '방에 먼저 참여해주세요.';end if;select * into r from public.watch_rooms where id=p_room and mode='pomodoro';if not found then raise exception '뽀모도로 방이 아닙니다.';end if;
 if p_position is null or p_active is null or not(p_position between 0 and 604800) then raise exception '재생 위치를 확인해주세요.';end if;
 perform game_private.ensure_wallet();perform 1 from public.game_wallets where user_id=auth.uid() for update;
 select * into prior from game_private.presence where user_id=auth.uid();expected:=r.position+case when r.playing and not r.closed then greatest(0,extract(epoch from(clock_timestamp()-r.updated_at)))*r.playback_rate else 0 end;
 valid:=abs(p_position-expected)<=8 and r.playback_rate=1 and not r.closed;
 elapsed:=case when prior.last_at is not null then greatest(0,extract(epoch from(clock_timestamp()-prior.last_at))) else 0 end;advance:=p_position-coalesce(prior.last_position,p_position);
 for s in select value from public.pomodoro_catalog c,jsonb_array_elements(c.sessions) where c.video_id=r.video_id loop
  credit:=0;if valid and (p_active or not r.playing) and prior.last_playing and prior.room_id=p_room and elapsed<=90 and advance between 0 and elapsed+5 then credit:=least(elapsed+1,advance)*greatest(0,least(p_position,(s->>'end')::double precision)-greatest(prior.last_position,(s->>'start')::double precision))/greatest(advance,0.001);end if;
  if credit>0 then insert into public.pomodoro_progress(user_id,room_id,cycle,focus_seconds) values(auth.uid(),p_room,idx,credit) on conflict(user_id,room_id,cycle) do update set focus_seconds=least((s->>'end')::double precision-(s->>'start')::double precision,public.pomodoro_progress.focus_seconds+credit);end if;
  if valid and p_position>=(s->>'end')::double precision then update public.pomodoro_progress set completed_at=coalesce(completed_at,now()) where user_id=auth.uid() and room_id=p_room and cycle=idx and focus_seconds>=60;end if;idx:=idx+1;
 end loop;
 insert into game_private.presence values(auth.uid(),p_room,clock_timestamp(),p_position,p_active and r.playing and valid) on conflict(user_id) do update set room_id=excluded.room_id,last_at=excluded.last_at,last_position=excluded.last_position,last_playing=excluded.last_playing;
 return coalesce((select jsonb_agg(to_jsonb(p) order by cycle) from public.pomodoro_progress p where user_id=auth.uid() and room_id=p_room),'[]'::jsonb);end;$$;
create or replace function game_private.heartbeat(p_room uuid,p_position double precision,p_active boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.watch_rooms;prior game_private.presence;e double precision;elapsed double precision;credit double precision;idx integer;span integer;lower_cycle integer;upper_cycle integer;at_time timestamptz:=clock_timestamp();
begin
 if not watch_private.can_access(p_room) then raise exception '방에 먼저 참여해주세요.';end if;
 select * into r from public.watch_rooms where id=p_room and mode='pomodoro' for update;if not found then raise exception '뽀모도로 방이 아닙니다.';end if;
 if r.timer_kind<>'clock' then return game_private.video_heartbeat(p_room,p_position,p_active);end if;
 if p_active is null then raise exception '참여 상태를 확인해주세요.';end if;
 perform game_private.sync_clock_video(p_room);
 perform game_private.ensure_wallet();perform 1 from public.game_wallets where user_id=auth.uid() for update;
 select * into prior from game_private.presence where user_id=auth.uid();
 e:=game_private.clock_elapsed(r);span:=r.focus_seconds+r.rest_seconds;
 elapsed:=extract(epoch from(at_time-prior.last_at));
 -- Only contiguous, server-measured attendance counts. Video seeks cannot create study credit.
 if prior.room_id=p_room and prior.last_playing and elapsed between 0 and 90 and e-prior.last_position between 0 and elapsed+1 then
  lower_cycle:=floor(prior.last_position/span)::integer;upper_cycle:=floor(e/span)::integer;
  for idx in lower_cycle..upper_cycle loop
   credit:=greatest(0,least(e,idx*span::double precision+r.focus_seconds)-greatest(prior.last_position,idx*span::double precision));
   if credit>0 then
    insert into public.pomodoro_progress(user_id,room_id,cycle,focus_seconds) values(auth.uid(),p_room,idx,credit)
    on conflict(user_id,room_id,cycle) do update set focus_seconds=least(r.focus_seconds,public.pomodoro_progress.focus_seconds+credit);
   end if;
  end loop;
 end if;
 update public.pomodoro_progress set completed_at=coalesce(completed_at,at_time)
 where user_id=auth.uid() and room_id=p_room and focus_seconds>=60 and e>=cycle*span::double precision+r.focus_seconds;
 insert into game_private.presence values(auth.uid(),p_room,at_time,e,p_active and not r.closed)
 on conflict(user_id) do update set room_id=excluded.room_id,last_at=excluded.last_at,last_position=excluded.last_position,last_playing=excluded.last_playing;
 return coalesce((select jsonb_agg(to_jsonb(p) order by cycle) from public.pomodoro_progress p where user_id=auth.uid() and room_id=p_room),'[]'::jsonb);
end;$$;

-- Preserve the exact study goal and room name in the existing activity log.
create or replace function game_private.describe_reward(p_reward public.game_rewards) returns jsonb language plpgsql stable set search_path='' as $$
declare result jsonb;
begin
 if p_reward.kind='quiz' then
  select jsonb_build_object('title',coalesce(a.snapshot->>'category','오답 복습'),'category',a.snapshot->>'category','question',left(a.snapshot->>'stem',180),'page',a.snapshot->>'page','questionNumber',a.snapshot->>'bookNumber','correct',a.is_correct)
  into result from public.attempts a where a.id=p_reward.attempt_id and a.user_id=p_reward.user_id;
 elsif p_reward.kind='pomodoro' then
  select jsonb_build_object('title',coalesce(c.title,r.name),'videoId',r.video_id,'cycle',p.cycle+1,'goal',p.goal,'focusSeconds',p.focus_seconds,'completedAt',p.completed_at)
  into result from public.pomodoro_progress p join public.watch_rooms r on r.id=p.room_id left join public.pomodoro_catalog c on c.video_id=r.video_id
  where p.user_id=p_reward.user_id and p.room_id::text||':'||p.cycle=p_reward.source_key;
 end if;
 return coalesce(result,jsonb_build_object('title',case when p_reward.kind='pomodoro' then '뽀모도로 공부' else '오답 복습' end));
end;$$;

create function public.pomo_create_clock(p_video text,p_name text,p_focus integer,p_rest integer,p_pause boolean) returns jsonb language sql security invoker set search_path='' as $$select game_private.create_clock(p_video,p_name,p_focus,p_rest,p_pause);$$;
create function public.pomo_timer(p_id uuid,p_running boolean,p_version bigint) returns jsonb language sql security invoker set search_path='' as $$select game_private.control_clock(p_id,p_running,p_version);$$;
revoke all on function game_private.clock_elapsed(public.watch_rooms),game_private.create_clock(text,text,integer,integer,boolean),game_private.sync_clock_video(uuid),game_private.control_clock(uuid,boolean,bigint),game_private.video_heartbeat(uuid,double precision,boolean),public.pomo_create_clock(text,text,integer,integer,boolean),public.pomo_timer(uuid,boolean,bigint) from public,anon,authenticated;
grant execute on function game_private.create_clock(text,text,integer,integer,boolean),game_private.control_clock(uuid,boolean,bigint),public.pomo_create_clock(text,text,integer,integer,boolean),public.pomo_timer(uuid,boolean,bigint) to authenticated;
