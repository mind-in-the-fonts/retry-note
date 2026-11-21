-- Account-owned subjects. Existing questions retain their subjects and history.
create table public.user_categories (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (name = btrim(name) and length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  primary key (user_id, name)
);
alter table public.user_categories enable row level security;
create policy categories_owner on public.user_categories for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.user_categories from anon, authenticated;
grant select, insert, update, delete on public.user_categories to authenticated;
insert into public.user_categories(user_id,name) select distinct user_id,category from public.questions;
alter table public.questions drop constraint questions_category_check;
alter table public.questions add constraint questions_saved_category foreign key (user_id,category)
  references public.user_categories(user_id,name) on update cascade on delete restrict;

create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  font_id text not null default 'default' check (font_id = 'default' or font_id ~ '^noonnu-[0-9]{1,8}$'),
  created_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
create policy settings_owner on public.user_settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.user_settings from anon, authenticated;
grant select, insert, update on public.user_settings to authenticated;

-- RLS and normal caller privileges apply; no elevated privileges.
create function public.remove_category(p_name text, p_replacement text default null) returns void
language plpgsql security invoker set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception '로그인이 필요합니다.'; end if;
  perform 1 from public.user_categories where user_id=uid and name=p_name for update;
  if not found then raise exception '과목을 찾을 수 없습니다.'; end if;
  if p_replacement is not null then
    if p_replacement=p_name or not exists(select 1 from public.user_categories where user_id=uid and name=p_replacement) then
      raise exception '문제를 옮길 다른 과목을 선택해주세요.';
    end if;
    update public.questions set category=p_replacement where user_id=uid and category=p_name;
  elsif exists(select 1 from public.questions where user_id=uid and category=p_name) then
    raise exception '이 과목의 문제를 옮길 과목을 선택해주세요. 보관 해제한 문제도 포함됩니다.';
  end if;
  delete from public.user_categories where user_id=uid and name=p_name;
end; $$;
revoke all on function public.remove_category(text,text) from public, anon;
grant execute on function public.remove_category(text,text) to authenticated;
create index attempts_question_reference on public.attempts(question_id);
