alter table public.game_items add column character_id text check(character_id in ('usagi','hachiware','kurimanju','shisa','momonga','furuhonya','anoko'));
insert into public.game_items(id,name,price,kind,description,character_id) values
('magical-usagi','우사기 · 노란 매지컬',3500,'appearance','노란 리본과 꽃 지팡이 · 매지컬 봉제 키링을 참고한 한벌 모습','usagi'),
('magical-hachiware','하치와레 · 하늘빛 매지컬',3500,'appearance','하늘색 모자와 리본 · 매지컬 봉제 키링을 참고한 한벌 모습','hachiware'),
('magical-momonga','모몽가 · 작은 악마 매지컬',3500,'appearance','작은 뿔과 별 지팡이 · 매지컬 봉제 키링을 참고한 한벌 모습','momonga'),
('magical-kurimanju','쿠리만쥬 · 초록 매지컬',3500,'appearance','초록 모자와 칼 지팡이 · 매지컬 봉제 키링을 참고한 한벌 모습','kurimanju'),
('magical-shisa','시사 · 꽃빛 매지컬',3500,'appearance','빨간 꽃과 주황 리본 · 매지컬 봉제 키링을 참고한 한벌 모습','shisa'),
('magical-furuhonya','카니 · 파란 리본 매지컬',3500,'appearance','작은 모자와 파란 리본 · 매지컬 봉제 키링을 참고한 한벌 모습','furuhonya'),
('magical-anoko','아노코 · 앉은 매지컬',3500,'appearance','앉은 자세와 작은 날개 · 매지컬 봉제 키링을 참고한 한벌 모습','anoko');
alter table public.game_wallets add column appearance_id text references public.game_items(id);
create index game_wallets_appearance on public.game_wallets(appearance_id);
create function game_private.appearance(p_item text) returns void language plpgsql security definer set search_path='' as $$declare c text;begin
 perform game_private.ensure_wallet();perform 1 from public.game_wallets where user_id=auth.uid() for update;
 if p_item is null then update public.game_wallets set appearance_id=null where user_id=auth.uid();return;end if;
 select a.character_id into c from public.game_items a join public.game_inventory i on i.item_id=a.id where a.id=p_item and a.kind='appearance' and i.user_id=auth.uid();
 if c is null then raise exception '구매한 캐릭터 모습을 선택해주세요.';end if;
 update public.game_inventory i set placed=false from public.game_items a where i.user_id=auth.uid() and i.item_id=a.id and a.slot is not null;
 update public.game_wallets set character=c,appearance_id=p_item where user_id=auth.uid();end;$$;
create function public.game_appearance(p_item text default null) returns void language sql security invoker set search_path='' as $$select game_private.appearance(p_item);$$;
revoke all on function game_private.appearance(text),public.game_appearance(text) from public,anon;
grant execute on function game_private.appearance(text),public.game_appearance(text) to authenticated;
create or replace function game_private.style(p_character text,p_background text) returns void language plpgsql security definer set search_path='' as $$begin
 perform game_private.ensure_wallet();if p_character not in ('usagi','hachiware','kurimanju','shisa','momonga','furuhonya','anoko') or p_character is null then raise exception '캐릭터를 선택해주세요.';end if;
 if p_background is null or p_background not in ('cloud','night','forest','picnic') then raise exception '배경을 선택해주세요.';end if;
 if p_background in ('night','forest') and not exists(select 1 from public.game_inventory where user_id=auth.uid() and item_id=p_background) then raise exception '구매한 배경을 선택해주세요.';end if;
 if p_background='picnic' and (select coalesce(sum(minutes),0) from public.game_rewards)<3000 then raise exception '함께 공부 목표를 먼저 달성해주세요.';end if;
 update public.game_wallets set character=p_character,background=p_background,appearance_id=case when character=p_character then appearance_id else null end where user_id=auth.uid();end;$$;
create or replace function game_private.visit(p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.';end if;return (select jsonb_build_object('name',coalesce(u.raw_user_meta_data->>'user_name','친구'),'character',w.character,'background',w.background,'appearance_id',w.appearance_id,'inventory',coalesce((select jsonb_agg(to_jsonb(i)-'user_id') from public.game_inventory i where i.user_id=p_user and placed),'[]'::jsonb)) from public.game_wallets w join auth.users u on u.id=w.user_id where w.user_id=p_user);end;$$;
create or replace function game_private.place(p_item text,p_placed boolean,p_x numeric,p_y numeric) returns void language plpgsql security definer set search_path='' as $$declare chosen public.game_items;begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.';end if;
 if p_x is null or p_y is null or p_placed is null or not(p_x between 5 and 95 and p_y between 35 and 90) then raise exception '배치 위치를 확인해주세요.';end if;
 perform 1 from public.game_wallets where user_id=auth.uid() for update;
 select * into chosen from public.game_items where id=p_item;
 if not found or chosen.kind in ('theme','appearance') or not exists(select 1 from public.game_inventory where user_id=auth.uid() and item_id=p_item) then raise exception '보유한 아이템을 선택해주세요.';end if;
 if chosen.slot is not null and p_placed then
  update public.game_wallets set appearance_id=null where user_id=auth.uid();
  update public.game_inventory i set placed=false from public.game_items a where i.item_id=a.id and i.user_id=auth.uid() and a.slot=chosen.slot;
 end if;
 update public.game_inventory set placed=p_placed,x=p_x,y=p_y where user_id=auth.uid() and item_id=p_item;
end;$$;
create or replace function game_private.fit_item(p_item text,p_character text,p_x integer,p_y integer) returns void language plpgsql security definer set search_path='' as $$declare fitted_slot text;begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.';end if;
 if p_character is null or p_character not in ('usagi','hachiware','kurimanju','shisa','momonga','furuhonya','anoko') or p_x is null or p_y is null or p_x not between -100 and 100 or p_y not between -100 and 100 then raise exception '캐릭터와 조정 범위(-100~100px)를 확인해주세요.';end if;
 perform 1 from public.game_wallets where user_id=auth.uid() for update;
 select a.slot into fitted_slot from public.game_items a join public.game_inventory i on i.item_id=a.id where a.id=p_item and i.user_id=auth.uid();
 if fitted_slot is null then raise exception '구매한 착용 아이템을 선택해주세요.';end if;
 update public.game_wallets set character=p_character,appearance_id=null where user_id=auth.uid();
 -- Serialize with equip/buy so the slot still contains only one item.
 update public.game_inventory i set placed=false from public.game_items a where i.item_id=a.id and i.user_id=auth.uid() and a.slot=fitted_slot;
 update public.game_inventory set placed=true,wearable_offsets=jsonb_set(wearable_offsets,array[p_character],jsonb_build_object('x',p_x,'y',p_y),true) where user_id=auth.uid() and item_id=p_item;
end;$$;
