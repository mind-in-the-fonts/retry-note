-- Shared play/pause commands atomically update both media and study clocks.
-- Automatic rest-phase video pauses use sync_clock_video directly and keep the rest countdown running.
create or replace function watch_private.update_room(p_id uuid,p_video_id text,p_position double precision,p_playing boolean,p_rate double precision,p_version bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare current public.watch_rooms;coupled boolean;at_time timestamptz;
begin
 if not watch_private.can_access(p_id) then raise exception '방에 먼저 참여해주세요.'; end if;
 select * into current from public.watch_rooms where id=p_id for update;
 if current.closed then raise exception '종료된 방입니다.'; end if;
 if p_video_id is null or p_video_id !~ '^[A-Za-z0-9_-]{11}$' or p_position is null or not(p_position between 0 and 604800)
   or p_playing is null or p_rate is null or p_rate not in (0.25,0.5,0.75,1,1.25,1.5,1.75,2) or p_version is null then
   raise exception '재생 상태를 확인해주세요.';
 end if;
 if p_version<>current.version then return watch_private.snapshot(p_id)||jsonb_build_object('applied',false); end if;
 at_time:=clock_timestamp();
 coupled:=current.mode='pomodoro' and current.timer_kind='clock' and
  (p_video_id<>current.video_id or p_playing<>current.playing or (p_playing and not current.timer_running));
 update public.watch_rooms set
  timer_elapsed=case when coupled then game_private.clock_elapsed(current) else current.timer_elapsed end,
  timer_running=case when coupled then p_playing else current.timer_running end,
  timer_updated_at=case when coupled then at_time else current.timer_updated_at end,
  video_id=p_video_id,position=p_position,playing=p_playing,playback_rate=p_rate,
  version=version+1,updated_at=at_time,updated_by=auth.uid() where id=p_id;
 return watch_private.snapshot(p_id)||jsonb_build_object('applied',true);
end; $$;

-- Bring already-open clock rooms into the same play/pause model without resetting elapsed study time.
update public.watch_rooms r set timer_elapsed=game_private.clock_elapsed(r),timer_running=r.playing,
 timer_updated_at=clock_timestamp(),version=version+1
where r.mode='pomodoro' and r.timer_kind='clock' and not r.closed and r.timer_running<>r.playing
 and not(r.timer_running and not r.playing and r.pause_during_rest
  and mod(game_private.clock_elapsed(r)::numeric,(r.focus_seconds+r.rest_seconds)::numeric)>=r.focus_seconds);
