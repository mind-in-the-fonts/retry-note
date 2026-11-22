import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const Q1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', Q2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
let pg: PGlite;
let migrationCategories: string[] = [];
async function asUser(id: string) { await pg.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`); }
async function call<T = any>(sql: string, params: any[] = []): Promise<T> { const r = await pg.query<{ value: T }>(`select ${sql} as value`, params); return r.rows[0].value; }
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}'); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
  for (const file of (await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(file=>file.endsWith('.sql')).sort()) {
    await pg.exec(await readFile(new URL('../supabase/migrations/'+file, import.meta.url), 'utf8'));
    if(file==='202611210001_initial.sql') await pg.exec(`insert into auth.users values('${A}'); insert into public.questions(user_id,category,stem,choices,correct_index) values ('${A}','데이터베이스론','기존 문제','["A","B"]',0);`);
  }
  migrationCategories=(await pg.query<{name:string}>('select name from public.user_categories')).rows.map(row=>row.name);
}, 30000);
beforeEach(async () => {
  await pg.exec(`reset role; truncate account_private.signup_limits; truncate public.attempts,public.exams,public.questions,public.user_categories,public.user_settings,auth.users cascade; insert into auth.users values('${A}'),('${B}');`);
  await asUser(A);
  await pg.exec(`insert into public.user_categories(name) values ('프로그래밍언어론'),('데이터베이스론');`);
  await pg.query(`insert into public.questions(id,category,stem,choices,correct_index,page,explanation) values ($1,'프로그래밍언어론','문제 A','["보기1","보기2"]',1,'721','원래 해설'),($2,'데이터베이스론','문제 B','["참","거짓"]',0,'569','DB 해설')`, [Q1, Q2]);
});
afterAll(async () => { await pg?.close(); });
describe('실제 PostgreSQL 저장·채점·접근 권한', () => {
  it('최초 오답 등록은 재시험 통계에 포함하지 않는다', async () => { const r = await pg.query<{ total: number }>('select total from public.question_statistics'); expect(r.rows.map(x => x.total)).toEqual([0, 0]); });
  it('선택 과목만 출제하고 전체·10·30·50은 있는 문제 수까지 중복 없이 출제한다', async () => { for (const limit of [0, 10, 30, 50]) { const ex = await call('public.start_exam($1,$2)', [['프로그래밍언어론'], limit]); expect(ex.snapshots).toHaveLength(1); expect(ex.snapshots[0].id).toBe(Q1); } const ex = await call('public.start_exam($1,0)', [['프로그래밍언어론', '데이터베이스론']]); expect(new Set(ex.snapshots.map((x: any) => x.id)).size).toBe(2); });
  it('동일 답 중복 제출은 기록을 하나만 만들고 서버가 정오답을 결정한다', async () => { const ex = await call('public.start_exam($1,0)', [['프로그래밍언어론']]); const a = await call('public.submit_answer($1,0,1)', [ex.id]); const again = await call('public.submit_answer($1,0,0)', [ex.id]); expect(a.is_correct).toBe(true); expect(again.id).toBe(a.id); expect(again.selected_index).toBe(1); const r = await pg.query('select total,correct,wrong from public.question_statistics where question_id=$1', [Q1]); expect(r.rows[0]).toEqual({ total: 1, correct: 1, wrong: 0 }); });
  it('원문 수정 뒤에도 시작한 시험과 이전 풀이의 정답·해설은 보존된다', async () => { const ex = await call('public.start_exam($1,0)', [['프로그래밍언어론']]); await pg.query('update public.questions set correct_index=0,explanation=$1 where id=$2', ['수정 해설', Q1]); const a = await call('public.submit_answer($1,0,1)', [ex.id]); expect(a.is_correct).toBe(true); expect(a.snapshot.explanation).toBe('원래 해설'); const done = await call('public.advance_exam($1)', [ex.id]); expect(done.status).toBe('completed'); expect(done.cursor).toBe(1); });
  it('로그인한 다른 사용자가 문제·통계·시험·풀이를 읽거나 수정할 수 없다', async () => { const ex = await call('public.start_exam($1,0)', [['프로그래밍언어론']]); await call('public.submit_answer($1,0,1)', [ex.id]); await asUser(B); for (const table of ['questions', 'question_statistics', 'exams', 'attempts']) expect((await pg.query(`select * from public.${table}`)).rows).toHaveLength(0); await expect(call('public.submit_answer($1,0,1)', [ex.id])).rejects.toThrow('시험을 찾을 수 없습니다'); const r = await pg.query('update public.questions set explanation=$1 where id=$2 returning id', ['다른 사용자', Q1]); expect(r.rows).toHaveLength(0); });
  it('브라우저가 채점 결과나 시험을 직접 조작할 수 없다', async () => { await expect(pg.query(`insert into public.exams(user_id,categories,snapshots) values($1,'{}','[{}]')`, [A])).rejects.toThrow(); await expect(pg.query(`insert into public.attempts(user_id,exam_id,position,selected_index,correct_index,is_correct,snapshot) values($1,$2,0,0,0,true,'{}')`, [A, Q1])).rejects.toThrow(); });
  it('해설 묶음에 다른 사용자의 ID가 섞이면 전부 취소된다', async () => { await asUser(B); await pg.exec(`insert into public.user_categories(name) values ('프로그래밍언어론');`); await pg.query(`insert into public.questions(category,stem,choices,correct_index) values('프로그래밍언어론','내 문제','["A","B"]',0)`); const own = (await pg.query<{ id: string }>('select id from public.questions')).rows[0].id; await expect(call('public.update_explanations($1)', [JSON.stringify([{ questionId: own, explanation: '새 해설' }, { questionId: Q1, explanation: '침범' }])])).rejects.toThrow('없는 문제'); expect((await pg.query<{ explanation: string }>('select explanation from public.questions where id=$1', [own])).rows[0].explanation).toBe(''); });
});

describe('사용자별 과목과 앱 설정',()=>{
 it('이전 데이터에서 실제 사용하던 과목만 누락 없이 이관한다',()=>{expect(migrationCategories).toEqual(['데이터베이스론']);});
 it('새 계정에는 고정 과목이 없고, 자신이 저장한 과목만 볼 수 있다',async()=>{
  await asUser(B);expect((await pg.query('select * from public.user_categories')).rows).toHaveLength(0);
  await pg.exec("insert into public.user_categories(name) values ('영어');");
  await pg.exec("insert into public.questions(category,stem,choices,correct_index) values ('영어','English question','[\"a\",\"b\"]',0);");
  await expect(pg.exec("insert into public.questions(category,stem,choices,correct_index) values ('데이터베이스론','Foreign subject','[\"a\",\"b\"]',0);")).rejects.toThrow();
  await asUser(A);expect((await pg.query('select name from public.user_categories')).rows).toHaveLength(2);
 });
 it('과목 이름 변경은 보관 해제한 문제에도 반영하고 시험 스냅샷은 보존한다',async()=>{
  const ex=await call('public.start_exam($1,0)',[['프로그래밍언어론']]);await pg.query('update public.questions set archived_at=now() where id=$1',[Q1]);
  await pg.exec("update public.user_categories set name='프로그래밍 기초' where name='프로그래밍언어론';");
  expect((await pg.query<{category:string}>('select category from public.questions where id=$1',[Q1])).rows[0].category).toBe('프로그래밍 기초');
  const answer=await call('public.submit_answer($1,0,1)',[ex.id]);expect(answer.snapshot.category).toBe('프로그래밍언어론');expect(answer.is_correct).toBe(true);
 });
 it('문제가 있는 과목은 대체 과목 없이 삭제하지 않으며 이동 후 기록은 유지한다',async()=>{
  const ex=await call('public.start_exam($1,0)',[['프로그래밍언어론']]);await call('public.submit_answer($1,0,1)',[ex.id]);
  await expect(call('public.remove_category($1,null)',['프로그래밍언어론'])).rejects.toThrow('옮길 과목');
  await expect(pg.exec("delete from public.user_categories where name='프로그래밍언어론'")).rejects.toThrow();
  await call('public.remove_category($1,$2)',['프로그래밍언어론','데이터베이스론']);
  expect((await pg.query('select * from public.questions')).rows).toHaveLength(2);expect((await pg.query<{category:string}>('select category from public.questions where id=$1',[Q1])).rows[0].category).toBe('데이터베이스론');
  expect((await pg.query('select total,correct from public.question_statistics where question_id=$1',[Q1])).rows[0]).toEqual({total:1,correct:1});
 });
 it('비어있는 과목은 삭제할 수 있고 중복·빈 이름을 거부한다',async()=>{
  await pg.exec("insert into public.user_categories(name) values ('한국사');");await call('public.remove_category($1,null)',['한국사']);
  await expect(pg.exec("insert into public.user_categories(name) values ('')")).rejects.toThrow();await expect(pg.exec("insert into public.user_categories(name) values ('데이터베이스론')")).rejects.toThrow();
 });
 it('다른 사용자 과목을 삭제하거나 다른 사용자 과목으로 이동할 수 없다',async()=>{
  await asUser(B);await pg.exec("insert into public.user_categories(name) values ('영어');");
  await expect(call('public.remove_category($1,$2)',['프로그래밍언어론','영어'])).rejects.toThrow('과목을 찾을 수');
  await asUser(A);await expect(call('public.remove_category($1,$2)',['프로그래밍언어론','영어'])).rejects.toThrow('다른 과목');
 });
 it('앱 글꼴은 계정마다 저장되며 다른 사용자 설정은 읽거나 수정할 수 없다',async()=>{
  await pg.exec("insert into public.user_settings(font_id) values ('noonnu-1977');");await asUser(B);
  expect((await pg.query('select * from public.user_settings')).rows).toHaveLength(0);
  expect((await pg.query("update public.user_settings set font_id='default' returning user_id")).rows).toHaveLength(0);
  await expect(pg.query("insert into public.user_settings(user_id,font_id) values ($1,'default')",[A])).rejects.toThrow();
  await pg.exec("insert into public.user_settings(font_id) values ('default');");await asUser(A);
  expect((await pg.query<{font_id:string}>('select font_id from public.user_settings')).rows[0].font_id).toBe('noonnu-1977');
 });
});

describe('초대한 참여자끼리만 공유하는 유튜브 방',()=>{
 it('방 코드를 가진 사용자가 참여한 뒤 공유 상태를 읽고 조작할 수 있다',async()=>{
  const created=await call('public.watch_create($1)',['M7lc1UVf-VE']);expect(created.memberCount).toBe(1);
  await asUser(B);expect((await pg.query('select * from public.watch_rooms')).rows).toHaveLength(0);await expect(call('public.watch_get($1)',[created.room.id])).rejects.toThrow('먼저 참여');
  const joined=await call('public.watch_join($1)',[created.room.id]);expect(joined.memberCount).toBe(2);expect((await pg.query('select * from public.questions')).rows).toHaveLength(0);
  const playing=await call('public.watch_update($1,$2,30,true,1,0)',[created.room.id,'M7lc1UVf-VE']);expect(playing.room.playing).toBe(true);expect(playing.room.version).toBe(1);
  await asUser(A);const latest=await call('public.watch_get($1)',[created.room.id]);expect(latest.room.position).toBe(30);
  const paused=await call('public.watch_update($1,$2,45,false,1,1)',[created.room.id,'M7lc1UVf-VE']);expect(paused.room.playing).toBe(false);expect(paused.room.position).toBe(45);
 });
 it('뒤늦게 들어온 조작이 더 최신 상태를 덮어쓰지 않는다',async()=>{
  const created=await call('public.watch_create($1)',['M7lc1UVf-VE']);const first=await call('public.watch_update($1,$2,60,true,1,0)',[created.room.id,'M7lc1UVf-VE']);
  const stale=await call('public.watch_update($1,$2,10,false,1,0)',[created.room.id,'M7lc1UVf-VE']);expect(first.applied).toBe(true);expect(stale.applied).toBe(false);expect(stale.room.position).toBe(60);expect(stale.room.playing).toBe(true);
 });
 it('미참여자의 상태 변경과 직접 DB 조작을 차단한다',async()=>{
  const created=await call('public.watch_create($1)',['M7lc1UVf-VE']);await asUser(B);await expect(call('public.watch_update($1,$2,60,true,1,0)',[created.room.id,'M7lc1UVf-VE'])).rejects.toThrow('먼저 참여');
  await expect(pg.query('update public.watch_rooms set playing=true where id=$1',[created.room.id])).rejects.toThrow();await expect(pg.query('insert into public.watch_members(room_id,user_id) values($1,$2)',[created.room.id,B])).rejects.toThrow();
 });
 it('나간 참여자는 방을 볼 수 없고 방 종료는 만든 사람만 할 수 있다',async()=>{
  const created=await call('public.watch_create($1)',['M7lc1UVf-VE']);await asUser(B);await call('public.watch_join($1)',[created.room.id]);await expect(call('public.watch_close($1)',[created.room.id])).rejects.toThrow('만든 사용자');
  await call('public.watch_leave($1)',[created.room.id]);await expect(call('public.watch_get($1)',[created.room.id])).rejects.toThrow('먼저 참여');await call('public.watch_join($1)',[created.room.id]);
  await asUser(A);await call('public.watch_close($1)',[created.room.id]);await asUser(B);expect((await call('public.watch_get($1)',[created.room.id])).room.closed).toBe(true);await expect(call('public.watch_update($1,$2,0,true,1,1)',[created.room.id,'M7lc1UVf-VE'])).rejects.toThrow('종료된 방');await expect(call('public.watch_join($1)',[created.room.id])).rejects.toThrow('찾을 수');
 });
 it('잘못된 영상 ID·위치·재생 속도를 거부한다',async()=>{
  await expect(call('public.watch_create($1)',['https://evil.example'])).rejects.toThrow();const created=await call('public.watch_create($1)',['M7lc1UVf-VE']);
  await expect(call('public.watch_update($1,$2,-1,true,1,0)',[created.room.id,'M7lc1UVf-VE'])).rejects.toThrow('재생 상태');await expect(call('public.watch_update($1,$2,0,true,100,0)',[created.room.id,'M7lc1UVf-VE'])).rejects.toThrow('재생 상태');
 });
});

describe('공개 회원가입의 서버 전용 요청 제한',()=>{
 it('일반 사용자와 비로그인 사용자는 가입 제한 함수를 호출할 수 없다',async()=>{
  await expect(call('public.account_signup_slot($1,$2)',['global','global'])).rejects.toThrow();await pg.exec('reset role; set role anon;');await expect(call('public.account_signup_slot($1,$2)',['global','global'])).rejects.toThrow();
 });
 it('서버만 가입 요청 한도를 소비하고 시간 경과 후 다시 허용한다',async()=>{
  await pg.exec('reset role; set role service_role;');for(let i=0;i<10;i++)expect(await call('public.account_signup_slot($1,$2)',['ip','test-ip-hash'])).toBe(true);expect(await call('public.account_signup_slot($1,$2)',['ip','test-ip-hash'])).toBe(false);
  await pg.exec("reset role; update account_private.signup_limits set window_started_at=now()-interval '2 hours'; set role service_role;");expect(await call('public.account_signup_slot($1,$2)',['ip','test-ip-hash'])).toBe(true);
 });
});

describe('공부 보상과 내 방 경제',()=>{
 it('등록은 보상을 주지 않고, 실제 풀이만 하루 한 번 랜덤 코인을 지급한다',async()=>{
  let state=await call('public.game_state()');expect(state.wallet.coins).toBe(0);const ex=await call('public.start_exam($1,0)',[['프로그래밍언어론']]);const answer=await call('public.submit_answer($1,0,1)',[ex.id]);const reward=await call('public.game_attempt_reward($1)',[answer.id]);expect(reward.base).toBe(3);expect(reward.random_bonus).toBeGreaterThanOrEqual(0);expect(reward.random_bonus).toBeLessThanOrEqual(4);expect(reward.correct_bonus).toBe(2);expect(await call('public.game_attempt_reward($1)',[answer.id])).toBeNull();
  const again=await call('public.start_exam($1,0)',[['프로그래밍언어론']]);await call('public.submit_answer($1,0,1)',[again.id]);state=await call('public.game_state()');expect(state.wallet.coins).toBe(reward.total);expect(state.recent).toHaveLength(1);
 });
 it('가격은 서버에서 계산하고 중복 구매는 코인을 재차감하지 않는다',async()=>{
  await call('public.game_state()');await expect(call('public.game_buy($1)',['desk'])).rejects.toThrow('코인');await pg.exec(`reset role; update public.game_wallets set coins=10000 where user_id='${A}';`);await asUser(A);
  const state=await call('public.game_buy($1)',['desk']);expect(state.wallet.coins).toBe(4000);const again=await call('public.game_buy($1)',['desk']);expect(again.wallet.coins).toBe(4000);expect(again.inventory).toHaveLength(1);await expect(pg.exec('update public.game_wallets set coins=999999')).rejects.toThrow();
 });
 it('자기가 구매한 가구만 배치하고 다른 사용자 보관함은 볼 수 없다',async()=>{
  await call('public.game_state()');await pg.exec(`reset role; update public.game_wallets set coins=10000 where user_id='${A}';`);await asUser(A);await call('public.game_buy($1)',['mug']);await call('public.game_place($1,true,40,65)',['mug']);await expect(call('public.game_place($1,true,40,65)',['bed'])).rejects.toThrow('보유');await expect(call('public.game_place($1,true,500,65)',['mug'])).rejects.toThrow('위치');
  await asUser(B);expect((await pg.query('select * from public.game_inventory')).rows).toHaveLength(0);const visit=await call('public.game_visit($1)',[A]);expect(visit.inventory).toHaveLength(1);expect(visit).not.toHaveProperty('coins');expect(visit).not.toHaveProperty('recent');
 });
 it('요청한 일곱 캐릭터는 무료로 선택하지만 유료 배경은 구매해야 한다',async()=>{
  for(const id of ['usagi','hachiware','kurimanju','shisa','momonga','furuhonya','anoko']){await call('public.game_style($1,$2)',[id,'cloud']);expect((await call('public.game_state()')).wallet.character).toBe(id);}await expect(call('public.game_style($1,$2)',['usagi','night'])).rejects.toThrow('구매');
 });
});
describe('뽀모도로 완료 확인과 참여 시간',()=>{
 it('정해진 여섯 영상만 공부방으로 만들고 영상·배속 변경은 차단한다',async()=>{
  expect((await pg.query('select * from public.pomodoro_catalog')).rows).toHaveLength(6);await expect(call('public.pomo_create($1)',['dQw4w9WgXcQ'])).rejects.toThrow('등록된');const made=await call('public.pomo_create($1)',['pts1U6XuXlA']);expect(made.room.mode).toBe('pomodoro');await expect(call('public.watch_update($1,$2,0,true,2,0)',[made.room.id,'pts1U6XuXlA'])).rejects.toThrow('고정');
 });
 it('목표 메모는 개인별로 보관하며 재생 위치를 건너뛰어도 보상을 주지 않는다',async()=>{
  const made=await call('public.pomo_create($1)',['pts1U6XuXlA']);await call('public.pomo_goal($1,0,$2)',[made.room.id,'책 20쪽 읽기']);await call('public.pomo_heartbeat($1,0,true)',[made.room.id]);await call('public.watch_update($1,$2,3000,true,1,0)',[made.room.id,'pts1U6XuXlA']);await call('public.pomo_heartbeat($1,3000,true)',[made.room.id]);await expect(call('public.pomo_claim($1,0,true)',[made.room.id])).rejects.toThrow('공부 구간');
  await asUser(B);await call('public.watch_join($1)',[made.room.id]);expect((await pg.query('select * from public.pomodoro_progress')).rows).toHaveLength(0);await call('public.pomo_goal($1,0,$2)',[made.room.id,'친구의 별도 목표']);await asUser(A);expect((await pg.query<{goal:string}>('select goal from public.pomodoro_progress')).rows[0].goal).toBe('책 20쪽 읽기');
 });
 it('실제 시간으로 누적한 회차가 끝나야 확인 보상을 한 번 지급한다',async()=>{
  const made=await call('public.pomo_create($1)',['pts1U6XuXlA']);await call('public.watch_update($1,$2,2940,true,1,0)',[made.room.id,'pts1U6XuXlA']);await call('public.pomo_heartbeat($1,2940,true)',[made.room.id]);
  await pg.exec(`reset role; update public.watch_rooms set updated_at=clock_timestamp()-interval '60 seconds' where id='${made.room.id}'; update game_private.presence set last_at=clock_timestamp()-interval '60 seconds' where user_id='${A}'; insert into public.pomodoro_progress(user_id,room_id,cycle,focus_seconds) values('${A}','${made.room.id}',0,2940);`);await asUser(A);
  const progress=await call('public.pomo_heartbeat($1,3000,true)',[made.room.id]);expect(progress[0].completed_at).not.toBeNull();await expect(call('public.pomo_claim($1,0,false)',[made.room.id])).rejects.toThrow('확인');const reward=await call('public.pomo_claim($1,0,true)',[made.room.id]);expect(reward.base).toBe(100);expect(reward.total).toBeGreaterThanOrEqual(110);expect(reward.total).toBeLessThanOrEqual(300);expect(await call('public.pomo_claim($1,0,true)',[made.room.id])).toBeNull();expect((await call('public.game_state()')).wallet.coins).toBe(reward.total);
 });
 it('한 계정의 두 방에서 같은 시간에 공부 시간을 중복 누적하지 않는다',async()=>{
  const one=await call('public.pomo_create($1)',['pts1U6XuXlA']);const two=await call('public.pomo_create($1)',['pts1U6XuXlA']);await call('public.watch_update($1,$2,0,true,1,0)',[one.room.id,'pts1U6XuXlA']);await call('public.watch_update($1,$2,0,true,1,0)',[two.room.id,'pts1U6XuXlA']);await call('public.pomo_heartbeat($1,0,true)',[one.room.id]);await call('public.pomo_heartbeat($1,0,true)',[two.room.id]);await pg.exec(`reset role; update public.watch_rooms set updated_at=clock_timestamp()-interval '30 seconds'; update game_private.presence set last_at=clock_timestamp()-interval '30 seconds';`);await asUser(A);const data=await call('public.pomo_heartbeat($1,30,true)',[one.room.id]);expect(data).toHaveLength(0);
 });
});

describe('공부 보상·상점 활동 기록',()=>{
 it('보상 시점의 과목·책 페이지·문제를 보관하고 나중 수정에 영향받지 않는다',async()=>{
  const ex=await call('public.start_exam($1,0)',[['프로그래밍언어론']]);await call('public.submit_answer($1,0,1)',[ex.id]);await pg.query('update public.questions set stem=$1,page=$2 where id=$3',['바뀐 내용','999',Q1]);await pg.exec("update public.user_categories set name='바뀐 과목' where name='프로그래밍언어론'");
  const log=await call('public.game_activity()');expect(log.entries).toHaveLength(1);expect(log.entries[0].title).toBe('프로그래밍언어론');expect(log.entries[0].details.question).toBe('문제 A');expect(log.entries[0].details.page).toBe('721');expect(log.entries[0].details.correct).toBe(true);expect(log.summary.earned).toBe(log.entries[0].amount);
 });
 it('구매와 결제를 함께 기록하고 중복 구매·가격 변경에도 당시 가격과 이름을 유지한다',async()=>{
  await call('public.game_state()');await pg.exec(`reset role;update public.game_wallets set coins=10000 where user_id='${A}'`);await asUser(A);await call('public.game_buy($1)',['mug']);await call('public.game_buy($1)',['mug']);
  await pg.exec("reset role;update public.game_items set price=999,name='바뀐 이름' where id='mug'");await asUser(A);const log=await call('public.game_activity($1)',['purchase']);expect(log.entries).toHaveLength(1);expect(log.entries[0].amount).toBe(-400);expect(log.entries[0].title).toBe('따뜻한 머그잔');expect(log.summary.spent).toBe(400);expect(log.summary.balance).toBe(9600);
  await pg.exec("reset role;update public.game_items set price=400,name='따뜻한 머그잔' where id='mug'");
 });
 it('뽀모도로 보상에는 영상·회차·집중 시간·당시 목표를 남긴다',async()=>{
  const made=await call('public.pomo_create($1)',['pts1U6XuXlA']);await call('public.pomo_goal($1,0,$2)',[made.room.id,'한국사 근현대 10쪽']);await pg.exec(`reset role;update public.pomodoro_progress set focus_seconds=600,completed_at=now() where user_id='${A}' and room_id='${made.room.id}'`);await asUser(A);await call('public.pomo_claim($1,0,true)',[made.room.id]);await call('public.pomo_goal($1,0,$2)',[made.room.id,'나중 수정한 목표']);
  const log=await call('public.game_activity($1)',['pomodoro']);expect(log.entries[0].details.goal).toBe('한국사 근현대 10쪽');expect(log.entries[0].details.cycle).toBe(1);expect(log.entries[0].minutes).toBe(10);expect(log.entries[0].details.videoId).toBe('pts1U6XuXlA');
 });
 it('종류·검색·날짜 경계와 커서 페이지를 적용하면서 누락·중복 없이 조회한다',async()=>{
  for(const category of ['프로그래밍언어론','데이터베이스론']){const ex=await call('public.start_exam($1,0)',[[category]]);await call('public.submit_answer($1,0,0)',[ex.id]);}
  await pg.exec(`reset role;update public.game_wallets set coins=10000 where user_id='${A}'`);await asUser(A);await call('public.game_buy($1)',['mug']);
  const first=await call('public.game_activity($1,$2,null,null,null,null,1)',['all','']);expect(first.entries).toHaveLength(1);expect(first.hasMore).toBe(true);expect(first.summary.count).toBe(3);
  const second=await call('public.game_activity($1,$2,null,null,$3,$4,1)',['all','',first.entries[0].occurred_at,first.entries[0].id]);const third=await call('public.game_activity($1,$2,null,null,$3,$4,1)',['all','',second.entries[0].occurred_at,second.entries[0].id]);expect(new Set([...first.entries,...second.entries,...third.entries].map(row=>row.id)).size).toBe(3);expect(third.hasMore).toBe(false);
  expect((await call('public.game_activity($1)',['quiz'])).entries).toHaveLength(2);expect((await call('public.game_activity($1,$2)',['all','데이터베이스'])).entries).toHaveLength(1);
  const before=await call('public.game_activity($1,$2,null,$3)',['all','',first.entries[0].occurred_at]);expect(before.entries.some((row:{id:string})=>row.id===first.entries[0].id)).toBe(false);
 });
 it('다른 계정의 원장은 조회할 수 없으며 구매 기록 위조·삭제를 막는다',async()=>{
  await call('public.game_state()');await pg.exec(`reset role;update public.game_wallets set coins=10000 where user_id='${A}'`);await asUser(A);await call('public.game_buy($1)',['mug']);await expect(pg.exec('delete from public.game_purchases')).rejects.toThrow();await asUser(B);
  expect((await pg.query('select * from public.game_activity_log')).rows).toHaveLength(0);expect((await call('public.game_activity()')).summary.count).toBe(0);await expect(pg.query("insert into public.game_purchases(user_id,item_id,item_name,price) values($1,'bed','침대',1)",[B])).rejects.toThrow();
 });
 it('무제한 조회나 잘못된 필터 요청을 거부한다',async()=>{await expect(call('public.game_activity($1)',['other'])).rejects.toThrow('조회 조건');await expect(call('public.game_activity($1,$2,null,null,null,null,10000)',['all',''])).rejects.toThrow('조회 조건');});
});

describe('방 이름과 캐릭터 착용 아이템',()=>{
 it('방장만 이름을 바꾸며 재생 시간 기준과 위치를 보존한다',async()=>{
  const created=await call('public.watch_create_named($1,$2)',['M7lc1UVf-VE','  주말 공부방  ']);expect(created.room.name).toBe('주말 공부방');
  const playing=await call('public.watch_update($1,$2,123,true,1,$3)',[created.room.id,'M7lc1UVf-VE',created.room.version]);
  const renamed=await call('public.watch_rename($1,$2)',[created.room.id,'퇴근하고 모여요']);expect(renamed.room.name).toBe('퇴근하고 모여요');expect(renamed.room.position).toBe(123);expect(renamed.room.updated_at).toBe(playing.room.updated_at);expect(renamed.room.playing).toBe(true);expect(renamed.room.version).toBe(playing.room.version+1);
  const stale=await call('public.watch_update($1,$2,1,false,1,$3)',[created.room.id,'M7lc1UVf-VE',playing.room.version]);expect(stale.applied).toBe(false);expect(stale.room.name).toBe('퇴근하고 모여요');
  await asUser(B);await call('public.watch_join($1)',[created.room.id]);await expect(call('public.watch_rename($1,$2)',[created.room.id,'탈취'])).rejects.toThrow('만든 사용자');
  expect((await call('public.watch_get($1)',[created.room.id])).room.name).toBe('퇴근하고 모여요');
 });
 it('뽀모도로도 이름을 정해 만들고 빈 이름과 너무 긴 이름을 거절한다',async()=>{
  const created=await call('public.pomo_create_named($1,$2)',['pts1U6XuXlA','오전 집중']);expect(created.room.name).toBe('오전 집중');expect(created.room.mode).toBe('pomodoro');
  await expect(call('public.watch_rename($1,$2)',[created.room.id,'   '])).rejects.toThrow('1~60');await expect(call('public.watch_rename($1,$2)',[created.room.id,'가'.repeat(61)])).rejects.toThrow('1~60');
  await call('public.watch_close($1)',[created.room.id]);await expect(call('public.watch_rename($1,$2)',[created.room.id,'종료 후'])).rejects.toThrow('열린 방');
 });
 it('구매한 옷만 착용하고 같은 부위는 교체하며 다른 부위와 가구는 유지한다',async()=>{
  await call('public.game_state()');await pg.exec(`reset role;update public.game_wallets set coins=100000 where user_id='${A}'`);await asUser(A);
  for(const id of ['berry-beret','straw-hat','mint-scarf','round-glasses','mug'])await call('public.game_buy($1)',[id]);
  for(const id of ['berry-beret','mint-scarf','round-glasses','mug'])await call('public.game_place($1,true,50,65)',[id]);
  await call('public.game_place($1,true,50,65)',['straw-hat']);const state=await call('public.game_state()');
  expect(state.inventory.filter((i:any)=>i.placed).map((i:any)=>i.item_id).sort()).toEqual(['mint-scarf','mug','round-glasses','straw-hat']);
  await expect(call('public.game_place($1,true,50,65)',['royal-crown'])).rejects.toThrow('보유한 아이템');
  await asUser(B);await expect(call('public.game_place($1,true,50,65)',['straw-hat'])).rejects.toThrow('보유한 아이템');
  const visit=await call('public.game_visit($1)',[A]);expect(visit.inventory.filter((i:any)=>i.placed)).toHaveLength(4);
  await asUser(A);await call('public.game_place($1,false,50,65)',['straw-hat']);expect((await call('public.game_state()')).inventory.find((i:any)=>i.item_id==='straw-hat').placed).toBe(false);
 });
});

describe('캐릭터별 1px 착용 위치 저장',()=>{
 it('아이템과 캐릭터별로 위치를 보존하고 다시 입혀도 초기화하지 않는다',async()=>{
  await call('public.game_state()');await pg.exec(`reset role;update public.game_wallets set coins=100000 where user_id='${A}'`);await asUser(A);await call('public.game_buy($1)',['berry-beret']);await call('public.game_buy($1)',['straw-hat']);
  await call('public.game_fit($1,$2,-12,9)',['berry-beret','momonga']);await call('public.game_fit($1,$2,4,-3)',['berry-beret','furuhonya']);await call('public.game_fit($1,$2,0,0)',['straw-hat','momonga']);
  const state=await call('public.game_state()');const beret=state.inventory.find((i:any)=>i.item_id==='berry-beret');expect(beret.wearable_offsets).toEqual({momonga:{x:-12,y:9},furuhonya:{x:4,y:-3}});expect(beret.placed).toBe(false);
  await call('public.game_place($1,true,50,65)',['berry-beret']);const visit=await call('public.game_visit($1)',[A]);expect(visit.inventory.find((i:any)=>i.item_id==='berry-beret').wearable_offsets).toEqual(beret.wearable_offsets);
 });
 it('구매하지 않은 아이템·다른 계정·가구·잘못된 위치는 저장하지 못한다',async()=>{
  await call('public.game_state()');await pg.exec(`reset role;update public.game_wallets set coins=100000 where user_id='${A}'`);await asUser(A);for(const id of ['berry-beret','mug'])await call('public.game_buy($1)',[id]);
  await expect(call('public.game_fit($1,$2,0,0)',['straw-hat','momonga'])).rejects.toThrow('구매한');await expect(call('public.game_fit($1,$2,0,0)',['mug','momonga'])).rejects.toThrow('구매한');await expect(call('public.game_fit($1,$2,101,0)',['berry-beret','momonga'])).rejects.toThrow('범위');await expect(call('public.game_fit($1,$2,0,0)',['berry-beret','other'])).rejects.toThrow('캐릭터');
  await asUser(B);await expect(call('public.game_fit($1,$2,0,0)',['berry-beret','momonga'])).rejects.toThrow('구매한');
 });
});

describe('봉제 굿즈를 참고한 캐릭터 일러스트 컬렉션',()=>{
 it('구매한 모습만 적용하고 지정된 캐릭터로 전환하며 친구 방에 동일하게 보여준다',async()=>{
  await call('public.game_state()');await expect(call('public.game_appearance($1)',['magical-momonga'])).rejects.toThrow('구매한');await pg.exec(`reset role;update public.game_wallets set coins=100000 where user_id='${A}'`);await asUser(A);await call('public.game_buy($1)',['magical-momonga']);await call('public.game_appearance($1)',['magical-momonga']);let state=await call('public.game_state()');expect(state.wallet.character).toBe('momonga');expect(state.wallet.appearance_id).toBe('magical-momonga');
  await asUser(B);const visit=await call('public.game_visit($1)',[A]);expect(visit.appearance_id).toBe('magical-momonga');await expect(call('public.game_appearance($1)',['magical-momonga'])).rejects.toThrow('구매한');
 });
 it('한벌 모습과 개별 장신구를 교체해도 구매·위치 기록을 잃지 않으며 기본 모습으로 돌아간다',async()=>{
  await call('public.game_state()');await pg.exec(`reset role;update public.game_wallets set coins=100000 where user_id='${A}'`);await asUser(A);for(const id of ['magical-momonga','berry-beret'])await call('public.game_buy($1)',[id]);await call('public.game_fit($1,$2,2,-4)',['berry-beret','momonga']);await call('public.game_appearance($1)',['magical-momonga']);expect((await call('public.game_state()')).inventory.find((i:any)=>i.item_id==='berry-beret').placed).toBe(false);
  await call('public.game_fit($1,$2,2,-4)',['berry-beret','momonga']);expect((await call('public.game_state()')).wallet.appearance_id).toBeNull();await call('public.game_appearance($1)',['magical-momonga']);await call('public.game_style($1,$2)',['momonga','cloud']);expect((await call('public.game_state()')).wallet.appearance_id).toBe('magical-momonga');await call('public.game_style($1,$2)',['furuhonya','cloud']);expect((await call('public.game_state()')).wallet.appearance_id).toBeNull();
  await call('public.game_appearance($1)',['magical-momonga']);await call('public.game_appearance(null)');const state=await call('public.game_state()');expect(state.wallet.appearance_id).toBeNull();expect(state.inventory.find((i:any)=>i.item_id==='berry-beret').wearable_offsets.momonga).toEqual({x:2,y:-4});expect(state.inventory).toHaveLength(2);
 });
 it('캐릭터 모습은 가구로 배치할 수 없고 일반 가구를 캐릭터 모습으로 적용할 수 없다',async()=>{
  await call('public.game_state()');await pg.exec(`reset role;update public.game_wallets set coins=100000 where user_id='${A}'`);await asUser(A);for(const id of ['magical-anoko','mug'])await call('public.game_buy($1)',[id]);await expect(call('public.game_place($1,true,50,65)',['magical-anoko'])).rejects.toThrow('보유한');await expect(call('public.game_appearance($1)',['mug'])).rejects.toThrow('구매한');
 });
});

describe('시즌별 캐릭터 컬렉션 추가',()=>{
 it('베이비·파자마·인어섬·벚꽃 23종이 기존 컬렉션을 보존하며 등록된다',async()=>{const rows=(await pg.query<{character_id:string;total:number}>("select character_id,count(*)::integer total from public.game_items where kind='appearance' group by character_id order by character_id")).rows;expect(Object.fromEntries(rows.map(r=>[r.character_id,r.total]))).toEqual({anoko:1,furuhonya:4,hachiware:5,kurimanju:5,momonga:5,shisa:5,usagi:5});});
 it('새 컬렉션을 구매·적용·재적용해도 한 번만 차감하고 친구 방에 같은 모습으로 남긴다',async()=>{await call('public.game_state()');await pg.exec(`reset role;update public.game_wallets set coins=10000 where user_id='${A}'`);await asUser(A);await call('public.game_buy($1)',['sakura-furuhonya']);await call('public.game_appearance($1)',['sakura-furuhonya']);await call('public.game_buy($1)',['sakura-furuhonya']);const state=await call('public.game_state()');expect(state.wallet.coins).toBe(6500);expect(state.wallet.character).toBe('furuhonya');expect(state.wallet.appearance_id).toBe('sakura-furuhonya');await asUser(B);expect((await call('public.game_visit($1)',[A])).appearance_id).toBe('sakura-furuhonya');await expect(call('public.game_appearance($1)',['sakura-furuhonya'])).rejects.toThrow('구매한');});
});

describe('사용자 영상과 독립적인 공부방 공통 타이머',()=>{
 async function clock(focus=120,rest=60,pause=false){return call('public.pomo_create_clock($1,$2,$3,$4,$5)',['dQw4w9WgXcQ','친구 공부방',focus,rest,pause]);}
 async function advance(room:string,seconds:number){await pg.query("reset role");await pg.query("update public.watch_rooms set timer_elapsed=timer_elapsed+$2,timer_updated_at=clock_timestamp() where id=$1",[room,seconds]);await pg.query("update game_private.presence set last_at=clock_timestamp()-($2||' seconds')::interval where room_id=$1",[room,seconds]);await asUser(A);}
 it('임의의 영상으로 방을 만들고 기존 영상 방·초대·시간 제한을 보존한다',async()=>{
  const made=await clock();expect(made.room.timer_kind).toBe('clock');expect(made.room.name).toBe('친구 공부방');expect(made.room.timer_running).toBe(false);
  for(const args of [[0,60],[120,-1],[10801,60],[120,3601]])await expect(clock(...args as [number,number])).rejects.toThrow('시간');
  const old=await call('public.watch_create($1)',['M7lc1UVf-VE']);await asUser(B);expect((await call('public.watch_join($1)',[old.room.id])).room.mode).toBe('watch');
  await expect(call('public.pomo_timer($1,true,$2)',[made.room.id,made.room.version])).rejects.toThrow('만든 사용자');
  await call('public.watch_join($1)',[made.room.id]);await expect(call('public.pomo_timer($1,true,$2)',[made.room.id,made.room.version])).rejects.toThrow('만든 사용자');
 });
 it('각자 다른 때 보상을 받아도 공통 시간은 그대로이며 다음 집중 회차가 시작된다',async()=>{
  const made=await clock();let snap=await call('public.pomo_timer($1,true,$2)',[made.room.id,made.room.version]);await call('public.pomo_goal($1,0,$2)',[made.room.id,'수학 10문제']);await call('public.pomo_heartbeat($1,0,true)',[made.room.id]);
  await asUser(B);await call('public.watch_join($1)',[made.room.id]);await call('public.pomo_heartbeat($1,0,true)',[made.room.id]);await asUser(A);
  for(let i=0;i<3;i++){await advance(made.room.id,60);await call('public.pomo_heartbeat($1,999999,true)',[made.room.id]);await asUser(B);await call('public.pomo_heartbeat($1,0,true)',[made.room.id]);await asUser(A);}
  const before=(await call('public.watch_get($1)',[made.room.id])).room;expect(before.timer_elapsed).toBeGreaterThanOrEqual(180);
  const reward=await call('public.pomo_claim($1,0,true)',[made.room.id]);expect(reward.minutes).toBe(2);expect(reward.details.goal).toBe('수학 10문제');expect(reward.details.title).toBe('친구 공부방');
  await asUser(B);const other=(await call('public.watch_get($1)',[made.room.id])).room;expect(other.timer_updated_at).toBe(before.timer_updated_at);expect(other.timer_running).toBe(true);expect(other.timer_elapsed).toBe(before.timer_elapsed);
  expect((await call('public.pomo_claim($1,0,true)',[made.room.id])).minutes).toBe(2);expect(await call('public.pomo_claim($1,0,true)',[made.room.id])).toBeNull();
  const after=(await call('public.watch_get($1)',[made.room.id])).room;expect(after.version).toBe(before.version);expect(after.timer_updated_at).toBe(before.timer_updated_at);
 });
 it('영상 탐색·배속·일시정지는 공부 시간을 만들지 않으며 휴식·오프라인 공백을 제외한다',async()=>{
  const made=await clock();let snap=await call('public.pomo_timer($1,true,$2)',[made.room.id,made.room.version]);await call('public.pomo_heartbeat($1,0,true)',[made.room.id]);
  await call('public.watch_update($1,$2,50000,false,2,$3)',[made.room.id,'M7lc1UVf-VE',snap.room.version]);await call('public.pomo_heartbeat($1,50000,true)',[made.room.id]);await expect(call('public.pomo_claim($1,0,true)',[made.room.id])).rejects.toThrow('공부 구간');
  await advance(made.room.id,60);await call('public.pomo_heartbeat($1,50000,true)',[made.room.id]);await advance(made.room.id,60);let progress=await call('public.pomo_heartbeat($1,50000,true)',[made.room.id]);expect(progress[0].focus_seconds).toBeCloseTo(120,0);
  await advance(made.room.id,50);progress=await call('public.pomo_heartbeat($1,50000,true)',[made.room.id]);expect(progress[0].focus_seconds).toBeCloseTo(120,0);expect(progress.find((p:any)=>p.cycle===1)).toBeUndefined();
  await advance(made.room.id,600);progress=await call('public.pomo_heartbeat($1,50000,true)',[made.room.id]);expect(progress.filter((p:any)=>p.cycle>0)).toHaveLength(0);
 });
 it('방장 일시정지·재개는 시간을 보존하고 휴식 중 영상 정지를 함께 동기화한다',async()=>{
  const made=await clock(120,60,true);let snap=await call('public.pomo_timer($1,true,$2)',[made.room.id,made.room.version]);await advance(made.room.id,120);snap=await call('public.watch_get($1)',[made.room.id]);expect(snap.room.playing).toBe(false);
  const paused=await call('public.pomo_timer($1,false,$2)',[made.room.id,snap.room.version]);expect(paused.room.timer_running).toBe(false);expect(paused.room.timer_elapsed).toBeGreaterThanOrEqual(120);
  const stale=await call('public.pomo_timer($1,true,$2)',[made.room.id,snap.room.version]);expect(stale.applied).toBe(false);expect(stale.room.timer_running).toBe(false);
  const resumed=await call('public.pomo_timer($1,true,$2)',[made.room.id,paused.room.version]);expect(resumed.room.playing).toBe(false);await advance(made.room.id,60);snap=await call('public.watch_get($1)',[made.room.id]);expect(snap.room.playing).toBe(true);
  await call('public.watch_close($1)',[made.room.id]);snap=await call('public.watch_get($1)',[made.room.id]);expect(snap.room.timer_running).toBe(false);expect(snap.room.closed).toBe(true);
 });
 it('未완료·미래 보상과 미참여자 호출·타이머 직접 위조를 차단한다',async()=>{
  const made=await clock();await expect(call('public.pomo_claim($1,999,true)',[made.room.id])).rejects.toThrow();await expect(pg.query('update public.watch_rooms set timer_elapsed=999999 where id=$1',[made.room.id])).rejects.toThrow();
  await asUser(B);await expect(call('public.pomo_heartbeat($1,0,true)',[made.room.id])).rejects.toThrow('먼저 참여');await pg.exec('reset role;set role anon;');await expect(call('public.pomo_create_clock($1,$2,120,60,false)',['dQw4w9WgXcQ','bad'])).rejects.toThrow();
 });
});
