create index game_inventory_item_reference on public.game_inventory(item_id);
create or replace function watch_private.snapshot(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('room',to_jsonb(r),'serverNow',clock_timestamp(),'memberCount',(select count(*) from public.watch_members m where m.room_id=r.id),'members',coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'name',coalesce(u.raw_user_meta_data->>'user_name','친구'),'character',coalesce(w.character,'usagi')) order by m.joined_at) from public.watch_members m join auth.users u on u.id=m.user_id left join public.game_wallets w on w.user_id=m.user_id where m.room_id=r.id),'[]'::jsonb)) from public.watch_rooms r where r.id=p_id;
$$;
