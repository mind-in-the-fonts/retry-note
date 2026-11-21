-- Keep playback clocks intact when editing room metadata.
alter table public.watch_rooms add column name text not null default '같이 보는 방' check(length(btrim(name)) between 1 and 60);
update public.watch_rooms set name='함께 공부하는 방' where mode='pomodoro';
create function watch_private.rename_room(p_id uuid,p_name text) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.';end if;
 if p_name is null or length(btrim(p_name)) not between 1 and 60 then raise exception '방 이름은 1~60자로 입력해주세요.';end if;
 -- updated_at is the playback anchor, so changing a title must not reset it.
 update public.watch_rooms set name=btrim(p_name),version=version+1,updated_by=auth.uid() where id=p_id and owner_id=auth.uid() and not closed;
 if not found then raise exception '방을 만든 사용자만 열린 방의 이름을 바꿀 수 있습니다.';end if;
 return watch_private.snapshot(p_id);end;$$;
create function watch_private.create_named(p_video_id text,p_name text) returns jsonb language plpgsql security definer set search_path='' as $$declare data jsonb;begin
 data:=watch_private.create_room(p_video_id);return watch_private.rename_room((data->'room'->>'id')::uuid,coalesce(p_name,'같이 보는 방'));end;$$;
create function game_private.pomo_create_named(p_video text,p_name text) returns jsonb language plpgsql security definer set search_path='' as $$declare data jsonb;begin
 data:=game_private.pomo_create(p_video);return watch_private.rename_room((data->'room'->>'id')::uuid,coalesce(p_name,'함께 공부하는 방'));end;$$;
create function public.watch_rename(p_id uuid,p_name text) returns jsonb language sql security invoker set search_path='' as $$select watch_private.rename_room(p_id,p_name);$$;
create function public.watch_create_named(p_video_id text,p_name text default null) returns jsonb language sql security invoker set search_path='' as $$select watch_private.create_named(p_video_id,p_name);$$;
create function public.pomo_create_named(p_video text,p_name text default null) returns jsonb language sql security invoker set search_path='' as $$select game_private.pomo_create_named(p_video,p_name);$$;
revoke all on function watch_private.rename_room(uuid,text),watch_private.create_named(text,text),game_private.pomo_create_named(text,text),public.watch_rename(uuid,text),public.watch_create_named(text,text),public.pomo_create_named(text,text) from public,anon;
grant execute on function watch_private.rename_room(uuid,text),watch_private.create_named(text,text),game_private.pomo_create_named(text,text),public.watch_rename(uuid,text),public.watch_create_named(text,text),public.pomo_create_named(text,text) to authenticated;

alter table public.game_items add column slot text check(slot in ('hat','face','outfit'));
insert into public.game_items(id,name,price,kind,description,slot) values
('straw-hat','햇살 밀짚모자',1800,'wearable','산책 가고 싶은 날의 리본 밀짚모자','hat'),
('berry-beret','딸기우유 베레모',2200,'wearable','딸기빛 베레모에 작은 잎사귀 하나','hat'),
('sleep-cap','별빛 수면모자',2400,'wearable','포근한 밤을 위한 줄무늬 모자','hat'),
('flower-crown','들꽃 화관',3000,'wearable','작은 꽃들을 엮어 만든 화관','hat'),
('royal-crown','반짝 왕관',6500,'wearable','열심히 공부한 친구에게 주는 왕관','hat'),
('wizard-hat','달빛 마법사 모자',4800,'wearable','별과 초승달이 반짝이는 고깔모자','hat'),
('round-glasses','동그란 안경',1600,'wearable','책 읽는 시간이 더 잘 어울리는 안경','face'),
('heart-glasses','하트 선글라스',2600,'wearable','오늘의 기분은 사랑스러운 하트','face'),
('flower-pin','봄꽃 머리핀',1400,'wearable','귀 옆에 살짝 얹는 작은 꽃','face'),
('ribbon-pin','체리 리본핀',1900,'wearable','얼굴 옆에 달아주는 체리빛 리본','face'),
('pink-bow','복숭아 나비넥타이',1800,'wearable','폭신한 복숭아색 리본으로 단정하게','outfit'),
('mint-scarf','민트 뜨개 목도리',2600,'wearable','따뜻한 민트색 목도리','outfit'),
('sailor-collar','바다 세일러 칼라',3200,'wearable','파란 칼라와 빨간 리본의 조합','outfit'),
('picnic-apron','소풍 체크 앞치마',3600,'wearable','도시락을 준비하는 작은 요리사','outfit'),
('star-cape','별가루 망토',5200,'wearable','공부를 마치면 모험을 떠나요','outfit'),
('cozy-vest','크림 니트 조끼',4000,'wearable','하트 단추가 달린 크림색 조끼','outfit'),
('rain-cape','노란 우비',4500,'wearable','비 오는 날도 즐거운 노란 우비','outfit'),
('royal-cape','딸기 왕실 망토',8000,'wearable','보송한 테두리의 특별한 망토','outfit');
create or replace function game_private.place(p_item text,p_placed boolean,p_x numeric,p_y numeric) returns void language plpgsql security definer set search_path='' as $$declare chosen public.game_items;begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.';end if;
 if p_x is null or p_y is null or p_placed is null or not(p_x between 5 and 95 and p_y between 35 and 90) then raise exception '배치 위치를 확인해주세요.';end if;
 perform 1 from public.game_wallets where user_id=auth.uid() for update;
 select * into chosen from public.game_items where id=p_item;
 if not found or chosen.kind='theme' or not exists(select 1 from public.game_inventory where user_id=auth.uid() and item_id=p_item) then raise exception '보유한 아이템을 선택해주세요.';end if;
 if chosen.slot is not null and p_placed then
  update public.game_inventory i set placed=false from public.game_items a where i.item_id=a.id and i.user_id=auth.uid() and a.slot=chosen.slot;
 end if;
 update public.game_inventory set placed=p_placed,x=p_x,y=p_y where user_id=auth.uid() and item_id=p_item;
end;$$;
