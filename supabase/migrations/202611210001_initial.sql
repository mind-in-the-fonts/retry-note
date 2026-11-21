-- 다시풀다: private per-user storage. No seed questions or learning records.
create or replace function public.valid_choices(value jsonb) returns boolean language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(value) <> 'array' then false else
    jsonb_array_length(value) between 2 and 8 and not exists (
      select 1 from jsonb_array_elements(value) x where jsonb_typeof(x) <> 'string' or length(trim(x #>> '{}')) = 0 or length(x #>> '{}') > 15000
    ) end;
$$;

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null check (category in ('전자계산기구조론','운영체제론','데이터통신론','자료구조론','데이터베이스론','소프트웨어공학론','프로그래밍언어론','스프레드시트')),
  stem text not null check (length(trim(stem)) between 1 and 30000),
  choices jsonb not null check (public.valid_choices(choices)),
  correct_index integer not null check (correct_index >= 0 and correct_index < jsonb_array_length(choices)),
  explanation text not null default '' check (length(explanation) <= 30000),
  page text not null default '' check (length(page) <= 256),
  book_number text not null default '' check (length(book_number) <= 128),
  first_wrong_date date not null default (now() at time zone 'Asia/Seoul')::date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index questions_user_category on public.questions(user_id, category) where archived_at is null;
create function public.question_updated_at() returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at := now(); return new; end; $$;
create trigger question_updated_at before update on public.questions for each row execute function public.question_updated_at();

create table public.exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  categories text[] not null,
  snapshots jsonb not null check (jsonb_typeof(snapshots) = 'array' and jsonb_array_length(snapshots) > 0),
  cursor integer not null default 0 check (cursor >= 0),
  status text not null default 'active' check (status in ('active','completed','abandoned')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index one_active_exam_per_user on public.exams(user_id) where status = 'active';
create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid references public.questions(id) on delete set null,
  exam_id uuid not null references public.exams(id) on delete cascade,
  position integer not null check (position >= 0),
  selected_index integer not null,
  correct_index integer not null,
  is_correct boolean not null,
  snapshot jsonb not null,
  answered_at timestamptz not null default now(),
  unique (exam_id, position)
);
create index attempts_user_question on public.attempts(user_id, question_id);
create index attempts_user_date on public.attempts(user_id, answered_at desc);

alter table public.questions enable row level security;
alter table public.exams enable row level security;
alter table public.attempts enable row level security;
create policy question_owner_select on public.questions for select to authenticated using ((select auth.uid()) = user_id);
create policy question_owner_insert on public.questions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy question_owner_update on public.questions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy exam_owner_select on public.exams for select to authenticated using ((select auth.uid()) = user_id);
create policy attempt_owner_select on public.attempts for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.questions, public.exams, public.attempts from anon, authenticated;
grant select, insert, update on public.questions to authenticated;
grant select on public.exams, public.attempts to authenticated;

create view public.question_statistics with (security_invoker = true) as
select q.id as question_id, count(a.id)::integer as total,
  count(a.id) filter (where a.is_correct)::integer as correct,
  count(a.id) filter (where not a.is_correct)::integer as wrong,
  max(a.answered_at) as last_attempt_at
from public.questions q left join public.attempts a on a.question_id = q.id and a.user_id = q.user_id
group by q.id;
revoke all on public.question_statistics from anon;
grant select on public.question_statistics to authenticated;

create function public.start_exam(p_categories text[], p_limit integer default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); selected jsonb; result public.exams;
begin
  if uid is null then raise exception '로그인이 필요합니다.'; end if;
  if p_limit is null or p_limit not in (0,10,30,50) then raise exception '문항 수를 확인해주세요.'; end if;
  if p_categories is null or cardinality(p_categories) = 0 then raise exception '과목을 선택해주세요.'; end if;
  perform pg_advisory_xact_lock(hashtext(uid::text));
  select jsonb_agg(x.snapshot order by x.position) into selected from (
    select row_number() over () as position, jsonb_build_object(
      'id',q.id,'category',q.category,'stem',q.stem,'choices',q.choices,'correctIndex',q.correct_index,
      'explanation',q.explanation,'page',q.page,'bookNumber',q.book_number,'firstWrongDate',q.first_wrong_date
    ) as snapshot from (
      select * from public.questions where user_id = uid and archived_at is null and category = any(p_categories)
      order by random() limit case when p_limit = 0 then null else p_limit end
    ) q
  ) x;
  if selected is null or jsonb_array_length(selected) = 0 then raise exception '선택한 과목에 등록된 문제가 없습니다.'; end if;
  update public.exams set status = 'abandoned', completed_at = now() where user_id = uid and status = 'active';
  insert into public.exams(user_id,categories,snapshots) values(uid,p_categories,selected) returning * into result;
  return to_jsonb(result);
end; $$;

create function public.submit_answer(p_exam_id uuid, p_position integer, p_selected integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); test public.exams; prior public.attempts; snap jsonb; correct integer; result public.attempts;
begin
  if uid is null then raise exception '로그인이 필요합니다.'; end if;
  select * into test from public.exams where id = p_exam_id and user_id = uid for update;
  if not found then raise exception '시험을 찾을 수 없습니다.'; end if;
  select * into prior from public.attempts where exam_id = p_exam_id and position = p_position and user_id = uid;
  if found then return to_jsonb(prior); end if;
  if test.status <> 'active' or p_position is distinct from test.cursor then raise exception '현재 시험 문제를 확인해주세요.'; end if;
  snap := test.snapshots -> p_position;
  if snap is null or p_selected is null or p_selected < 0 or p_selected >= jsonb_array_length(snap -> 'choices') then raise exception '보기를 선택해주세요.'; end if;
  correct := (snap ->> 'correctIndex')::integer;
  insert into public.attempts(user_id,question_id,exam_id,position,selected_index,correct_index,is_correct,snapshot)
    values(uid,(snap ->> 'id')::uuid,p_exam_id,p_position,p_selected,correct,p_selected=correct,snap) returning * into result;
  return to_jsonb(result);
end; $$;

create function public.advance_exam(p_exam_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); test public.exams;
begin
  if uid is null then raise exception '로그인이 필요합니다.'; end if;
  select * into test from public.exams where id = p_exam_id and user_id = uid for update;
  if not found then raise exception '시험을 찾을 수 없습니다.'; end if;
  if test.status <> 'active' then return to_jsonb(test); end if;
  if not exists(select 1 from public.attempts where exam_id=p_exam_id and position=test.cursor and user_id=uid) then raise exception '먼저 답을 제출해주세요.'; end if;
  update public.exams set cursor=cursor+1,
    status=case when cursor+1 >= jsonb_array_length(snapshots) then 'completed' else 'active' end,
    completed_at=case when cursor+1 >= jsonb_array_length(snapshots) then now() else null end
    where id=p_exam_id returning * into test;
  return to_jsonb(test);
end; $$;

create function public.update_explanations(p_items jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); item jsonb; changed integer := 0;
begin
  if uid is null then raise exception '로그인이 필요합니다.'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 500 then raise exception '해설 목록을 확인해주세요.'; end if;
  for item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(item -> 'explanation') is distinct from 'string' or length(trim(item ->> 'explanation')) not between 1 and 30000 then raise exception '해설 내용을 확인해주세요.'; end if;
    update public.questions set explanation=item ->> 'explanation' where id=(item ->> 'questionId')::uuid and user_id=uid and archived_at is null;
    if not found then raise exception '내 오답에 없는 문제가 포함되어 있습니다.'; end if;
    changed := changed+1;
  end loop;
  return changed;
end; $$;

revoke all on function public.start_exam(text[],integer), public.submit_answer(uuid,integer,integer), public.advance_exam(uuid), public.update_explanations(jsonb) from public, anon;
grant execute on function public.start_exam(text[],integer), public.submit_answer(uuid,integer,integer), public.advance_exam(uuid), public.update_explanations(jsonb) to authenticated;
