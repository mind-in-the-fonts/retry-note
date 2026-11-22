-- Changing background video must never reset attendance, goals, claims, or the current phase.
create function game_private.change_video(p_room uuid,p_video text,p_version bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.watch_rooms;sessions jsonb;s jsonb;n jsonb;presence game_private.presence;
 at_time timestamptz:=clock_timestamp();pos double precision;elapsed double precision;advance double precision;credit double precision;
 idx integer;chosen integer:=0;count_sessions integer;focus_len integer;rest_len integer;clock_pos double precision;finished boolean;
begin
 if not watch_private.can_access(p_room) then raise exception '방에 먼저 참여해주세요.';end if;
 select * into r from public.watch_rooms where id=p_room for update;
 if r.closed or r.mode<>'pomodoro' then raise exception '열린 뽀모도로 방을 선택해주세요.';end if;
 if p_video is null or p_video !~ '^[A-Za-z0-9_-]{11}$' or p_version is null then raise exception '유튜브 영상 주소를 확인해주세요.';end if;
 if p_version<>r.version then return watch_private.snapshot(p_room)||jsonb_build_object('applied',false);end if;
 if p_video=r.video_id then return watch_private.snapshot(p_room)||jsonb_build_object('applied',true);end if;
 if r.timer_kind='clock' then return watch_private.update_room(p_room,p_video,0,false,1,r.version);end if;
 select c.sessions into sessions from public.pomodoro_catalog c where c.video_id=r.video_id;
 if sessions is null then raise exception '기존 영상의 공부 구간을 찾을 수 없습니다.';end if;
 pos:=least(604800,r.position+case when r.playing then greatest(0,extract(epoch from(at_time-r.updated_at)))*r.playback_rate else 0 end);
 count_sessions:=jsonb_array_length(sessions);
 -- Settle the last heartbeat interval for every attending member before changing clock coordinates.
 for presence in select p.* from game_private.presence p where p.room_id=p_room and p.last_playing and exists(select 1 from public.watch_members m where m.room_id=p_room and m.user_id=p.user_id) loop
  elapsed:=extract(epoch from(at_time-presence.last_at));advance:=pos-presence.last_position;
  if elapsed between 0 and 90 and advance between 0 and elapsed+5 and r.playback_rate=1 then
   for idx in 0..count_sessions-1 loop
    s:=sessions->idx;credit:=least(elapsed+1,advance)*greatest(0,least(pos,(s->>'end')::double precision)-greatest(presence.last_position,(s->>'start')::double precision))/greatest(advance,0.001);
    if credit>0 then
     insert into public.pomodoro_progress(user_id,room_id,cycle,focus_seconds) values(presence.user_id,p_room,idx,credit)
     on conflict(user_id,room_id,cycle) do update set focus_seconds=least((s->>'end')::double precision-(s->>'start')::double precision,public.pomodoro_progress.focus_seconds+credit);
    end if;
   end loop;
  end if;
 end loop;
 for idx in 0..count_sessions-1 loop
  s:=sessions->idx;
  if pos>=(s->>'end')::double precision then
   update public.pomodoro_progress set completed_at=coalesce(completed_at,at_time) where room_id=p_room and cycle=idx and focus_seconds>=60;
  end if;
 end loop;
 -- Use the current session's lengths and map its exact remaining focus/rest time to the shared clock.
 for idx in 0..count_sessions-1 loop
  s:=sessions->idx;chosen:=idx;n:=sessions->(idx+1);
  exit when n is null or pos<(n->>'start')::double precision;
 end loop;
 s:=sessions->chosen;n:=sessions->(chosen+1);
 focus_len:=greatest(60,least(10800,ceil((s->>'end')::numeric-(s->>'start')::numeric)::integer));
 rest_len:=case when n is not null then greatest(0,least(3600,ceil((n->>'start')::numeric-(s->>'end')::numeric)::integer)) else
  case when chosen>0 then greatest(0,least(3600,ceil((s->>'start')::numeric-(sessions->(chosen-1)->>'end')::numeric)::integer)) else 600 end end;
 finished:=chosen=count_sessions-1 and pos>=(s->>'end')::double precision;
 clock_pos:=case when finished then (chosen+1)*(focus_len+rest_len)::double precision else chosen*(focus_len+rest_len)::double precision+greatest(0,pos-(s->>'start')::double precision) end;
 update public.watch_rooms set timer_kind='clock',focus_seconds=focus_len,rest_seconds=rest_len,pause_during_rest=false,
 timer_elapsed=clock_pos,timer_running=r.playing and not finished,timer_updated_at=at_time,timer_video_phase=-1,version=version+1 where id=p_room;
 update game_private.presence set last_position=clock_pos,last_playing=last_playing and extract(epoch from(at_time-last_at))<=90,last_at=at_time where room_id=p_room;
 return watch_private.update_room(p_room,p_video,0,false,1,r.version+1);
end;$$;
create function public.pomo_change_video(p_room uuid,p_video text,p_version bigint) returns jsonb language sql security invoker set search_path='' as $$select game_private.change_video(p_room,p_video,p_version);$$;
revoke all on function game_private.change_video(uuid,text,bigint),public.pomo_change_video(uuid,text,bigint) from public,anon;
grant execute on function game_private.change_video(uuid,text,bigint),public.pomo_change_video(uuid,text,bigint) to authenticated;
