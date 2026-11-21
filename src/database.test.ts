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
  await pg.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
  for (const file of (await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(file=>file.endsWith('.sql')).sort()) {
    await pg.exec(await readFile(new URL('../supabase/migrations/'+file, import.meta.url), 'utf8'));
    if(file==='202611210001_initial.sql') await pg.exec(`insert into auth.users values('${A}'); insert into public.questions(user_id,category,stem,choices,correct_index) values ('${A}','데이터베이스론','기존 문제','["A","B"]',0);`);
  }
  migrationCategories=(await pg.query<{name:string}>('select name from public.user_categories')).rows.map(row=>row.name);
}, 30000);
beforeEach(async () => {
  await pg.exec(`reset role; truncate public.attempts,public.exams,public.questions,public.user_categories,public.user_settings,auth.users cascade; insert into auth.users values('${A}'),('${B}');`);
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
