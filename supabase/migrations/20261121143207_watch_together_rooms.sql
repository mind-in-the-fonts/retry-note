create schema if not exists watch_private;
revoke all on schema watch_private from public, anon;
grant usage on schema watch_private to authenticated;

create table public.watch_rooms (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 video_id text not null check(video_id ~ '^[A-Za-z0-9_-]{11}$'),
 position double precision not null default 0 check(position between 0 and 604800),
 playing boolean not null default false,
 playback_rate double precision not null default 1 check(playback_rate in (0.25,0.5,0.75,1,1.25,1.5,1.75,2)),
 version bigint not null default 0,
 updated_at timestamptz not null default clock_timestamp(),
 updated_by uuid default auth.uid() references auth.users(id) on delete set null,
 closed boolean not null default false,
 created_at timestamptz not null default now()
);
create table public.watch_members (
 room_id uuid not null references public.watch_rooms(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 joined_at timestamptz not null default now(),
 primary key(room_id,user_id)
);
create index watch_members_user on public.watch_members(user_id,room_id);
create index watch_rooms_owner on public.watch_rooms(owner_id);
create index watch_rooms_updated_by on public.watch_rooms(updated_by);
alter table public.watch_rooms enable row level security;
alter table public.watch_members enable row level security;

create function watch_private.can_access(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.watch_rooms r where r.id=p_id and
  (r.owner_id=auth.uid() or exists(select 1 from public.watch_members m where m.room_id=r.id and m.user_id=auth.uid())));
$$;
create policy watch_room_members on public.watch_rooms for select to authenticated using(watch_private.can_access(id));
create policy watch_own_membership on public.watch_members for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.watch_rooms,public.watch_members from anon,authenticated;
grant select on public.watch_rooms,public.watch_members to authenticated;

create function watch_private.snapshot(p_id uuid) returns jsonb language sql set search_path='' as $$
 select jsonb_build_object('room',to_jsonb(r),'serverNow',clock_timestamp(),'memberCount',(select count(*) from public.watch_members m where m.room_id=r.id)) from public.watch_rooms r where r.id=p_id;
$$;
create function watch_private.create_room(p_video_id text) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); rid uuid;
begin
 if uid is null then raise exception '로그인이 필요합니다.'; end if;
 if p_video_id is null or p_video_id !~ '^[A-Za-z0-9_-]{11}$' then raise exception '유튜브 영상 주소를 확인해주세요.'; end if;
 insert into public.watch_rooms(owner_id,updated_by,video_id) values(uid,uid,p_video_id) returning id into rid;
 insert into public.watch_members(room_id,user_id) values(rid,uid);
 return watch_private.snapshot(rid);
end; $$;
create function watch_private.join_room(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if uid is null then raise exception '로그인이 필요합니다.'; end if;
 perform 1 from public.watch_rooms where id=p_id and not closed for update;
 if not found then raise exception '참여할 수 있는 방을 찾을 수 없습니다.'; end if;
 insert into public.watch_members(room_id,user_id) values(p_id,uid) on conflict do nothing;
 return watch_private.snapshot(p_id);
end; $$;
create function watch_private.read_room(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not watch_private.can_access(p_id) then raise exception '방에 먼저 참여해주세요.'; end if;
 return watch_private.snapshot(p_id);
end; $$;
create function watch_private.update_room(p_id uuid,p_video_id text,p_position double precision,p_playing boolean,p_rate double precision,p_version bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare current public.watch_rooms;
begin
 if not watch_private.can_access(p_id) then raise exception '방에 먼저 참여해주세요.'; end if;
 select * into current from public.watch_rooms where id=p_id for update;
 if current.closed then raise exception '종료된 방입니다.'; end if;
 if p_video_id is null or p_video_id !~ '^[A-Za-z0-9_-]{11}$' or p_position is null or not(p_position between 0 and 604800)
   or p_playing is null or p_rate is null or p_rate not in (0.25,0.5,0.75,1,1.25,1.5,1.75,2) or p_version is null then
   raise exception '재생 상태를 확인해주세요.';
 end if;
 if p_version<>current.version then return watch_private.snapshot(p_id)||jsonb_build_object('applied',false); end if;
 update public.watch_rooms set video_id=p_video_id,position=p_position,playing=p_playing,playback_rate=p_rate,
  version=version+1,updated_at=clock_timestamp(),updated_by=auth.uid() where id=p_id;
 return watch_private.snapshot(p_id)||jsonb_build_object('applied',true);
end; $$;
create function watch_private.leave_room(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
 delete from public.watch_members where room_id=p_id and user_id=auth.uid();
end; $$;
create function watch_private.close_room(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
 update public.watch_rooms set closed=true,playing=false,version=version+1,updated_at=clock_timestamp(),updated_by=auth.uid() where id=p_id and owner_id=auth.uid();
 if not found then raise exception '방을 만든 사용자만 종료할 수 있습니다.'; end if;
end; $$;
revoke all on all functions in schema watch_private from public,anon,authenticated;
grant execute on function watch_private.can_access(uuid),watch_private.create_room(text),watch_private.join_room(uuid),watch_private.read_room(uuid),watch_private.update_room(uuid,text,double precision,boolean,double precision,bigint),watch_private.leave_room(uuid),watch_private.close_room(uuid) to authenticated;

create function public.watch_create(p_video_id text) returns jsonb language sql security invoker set search_path='' as $$select watch_private.create_room(p_video_id);$$;
create function public.watch_join(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$select watch_private.join_room(p_id);$$;
create function public.watch_get(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$select watch_private.read_room(p_id);$$;
create function public.watch_update(p_id uuid,p_video_id text,p_position double precision,p_playing boolean,p_rate double precision,p_version bigint) returns jsonb language sql security invoker set search_path='' as $$select watch_private.update_room(p_id,p_video_id,p_position,p_playing,p_rate,p_version);$$;
create function public.watch_leave(p_id uuid) returns void language sql security invoker set search_path='' as $$select watch_private.leave_room(p_id);$$;
create function public.watch_close(p_id uuid) returns void language sql security invoker set search_path='' as $$select watch_private.close_room(p_id);$$;
revoke all on function public.watch_create(text),public.watch_join(uuid),public.watch_get(uuid),public.watch_update(uuid,text,double precision,boolean,double precision,bigint),public.watch_leave(uuid),public.watch_close(uuid) from public,anon;
grant execute on function public.watch_create(text),public.watch_join(uuid),public.watch_get(uuid),public.watch_update(uuid,text,double precision,boolean,double precision,bigint),public.watch_leave(uuid),public.watch_close(uuid) to authenticated;

do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='watch_rooms') then
  alter publication supabase_realtime add table public.watch_rooms;
 end if;
end;$$;
