alter table public.game_inventory add column wearable_offsets jsonb not null default '{}'::jsonb check(jsonb_typeof(wearable_offsets)='object' and octet_length(wearable_offsets::text)<=6000);
create function game_private.fit_item(p_item text,p_character text,p_x integer,p_y integer) returns void language plpgsql security definer set search_path='' as $$declare fitted_slot text;begin
 if auth.uid() is null then raise exception '로그인이 필요합니다.';end if;
 if p_character is null or p_character not in ('usagi','hachiware','kurimanju','shisa','momonga','furuhonya','anoko') or p_x is null or p_y is null or p_x not between -100 and 100 or p_y not between -100 and 100 then raise exception '캐릭터와 조정 범위(-100~100px)를 확인해주세요.';end if;
 perform 1 from public.game_wallets where user_id=auth.uid() for update;
 select a.slot into fitted_slot from public.game_items a join public.game_inventory i on i.item_id=a.id where a.id=p_item and i.user_id=auth.uid();
 if fitted_slot is null then raise exception '구매한 착용 아이템을 선택해주세요.';end if;
 -- Serialize with equip/buy so the slot still contains only one item.
 update public.game_inventory i set placed=false from public.game_items a where i.item_id=a.id and i.user_id=auth.uid() and a.slot=fitted_slot;
 update public.game_inventory set placed=true,wearable_offsets=jsonb_set(wearable_offsets,array[p_character],jsonb_build_object('x',p_x,'y',p_y),true) where user_id=auth.uid() and item_id=p_item;
end;$$;
create function public.game_fit(p_item text,p_character text,p_x integer,p_y integer) returns void language sql security invoker set search_path='' as $$select game_private.fit_item(p_item,p_character,p_x,p_y);$$;
revoke all on function game_private.fit_item(text,text,integer,integer),public.game_fit(text,text,integer,integer) from public,anon;
grant execute on function game_private.fit_item(text,text,integer,integer),public.game_fit(text,text,integer,integer) to authenticated;
