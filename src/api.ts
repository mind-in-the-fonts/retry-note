import { usernameEmail } from '../supabase/functions/_shared/account.ts';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Attempt, Exam, ExplanationPatch, Question, Statistics, UserCategory, UserSettings } from './core';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && /^https:\/\//.test(url) && key && !url.includes('YOUR_PROJECT'));
export const supabase: SupabaseClient | null = configured ? createClient(url, key, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
export function db(): SupabaseClient { if (!supabase) throw new Error('데이터베이스 연결을 준비하고 있습니다.'); return supabase; }
const check = <T>(r: { data: T; error: { message: string } | null }): T => { if (r.error) throw new Error(r.error.message); return r.data; };
const fromRow = (q: any): Question => ({ id: q.id, category: q.category, stem: q.stem, choices: q.choices, correctIndex: q.correct_index, explanation: q.explanation, page: q.page, bookNumber: q.book_number, firstWrongDate: q.first_wrong_date, createdAt: q.created_at, archivedAt: q.archived_at });
const toRow = (q: Question) => ({ id: q.id, category: q.category, stem: q.stem, choices: q.choices, correct_index: q.correctIndex, explanation: q.explanation, page: q.page, book_number: q.bookNumber, first_wrong_date: q.firstWrongDate });
const attemptRow = (a: any): Attempt => ({ id: a.id, questionId: a.question_id, examId: a.exam_id, position: a.position, selectedIndex: a.selected_index, correctIndex: a.correct_index, isCorrect: a.is_correct, answeredAt: a.answered_at, snapshot: a.snapshot });
const examRow = (x: any): Exam => ({ id: x.id, snapshots: x.snapshots, cursor: x.cursor, status: x.status, createdAt: x.created_at });
async function allRows(table: string, archived = false) {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = db().from(table).select('*').order(table === 'question_statistics' ? 'question_id' : table === 'attempts' ? 'answered_at' : 'created_at', { ascending: false }).range(offset, offset + 999);
    if (table === 'questions' && !archived) query = query.is('archived_at', null);
    const page = check(await query) || []; rows.push(...page); if (page.length < 1000) return rows;
  }
}
export async function loadLibrary(): Promise<{ questions: Question[]; stats: Statistics[] }> {
  const [qs, ss] = await Promise.all([allRows('questions'), allRows('question_statistics')]);
  return { questions: qs.map(fromRow), stats: ss.map(s => ({ questionId: s.question_id, total: Number(s.total), correct: Number(s.correct), wrong: Number(s.wrong), lastAttemptAt: s.last_attempt_at })) };
}
export async function saveQuestion(q: Question) { check(await db().from('questions').upsert(toRow(q))); }
export async function archiveQuestion(id: string) { check(await db().from('questions').update({ archived_at: new Date().toISOString() }).eq('id', id)); }
export async function importQuestions(qs: Question[]) { check(await db().from('questions').upsert(qs.map(toRow))); }
export async function saveExplanations(items: ExplanationPatch[]) { check(await db().rpc('update_explanations', { p_items: items })); }
export async function startExam(categories: string[], count: number | 'all'): Promise<Exam> { const x = check(await db().rpc('start_exam', { p_categories: categories, p_limit: count === 'all' ? 0 : count })); return examRow(x); }
export async function activeExam(): Promise<Exam | null> { const x = check(await db().from('exams').select('*').eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle()); return x ? examRow(x) : null; }
export async function submitAnswer(examId: string, position: number, choice: number): Promise<Attempt> { const x = check(await db().rpc('submit_answer', { p_exam_id: examId, p_position: position, p_selected: choice })); return attemptRow(x); }
export async function nextQuestion(examId: string): Promise<Exam> { const x = check(await db().rpc('advance_exam', { p_exam_id: examId })); return examRow(x); }
export async function currentAttempt(examId: string, position: number): Promise<Attempt | null> { const x = check(await db().from('attempts').select('*').eq('exam_id', examId).eq('position', position).maybeSingle()); return x ? attemptRow(x) : null; }
export async function examAttempts(id: string): Promise<Attempt[]> { const xs = check(await db().from('attempts').select('*').eq('exam_id', id).order('position')); return (xs || []).map(attemptRow); }
export async function history(): Promise<Attempt[]> { const xs = check(await db().from('attempts').select('*').order('answered_at', { ascending: false }).limit(100)); return (xs || []).map(attemptRow); }
export async function backup() { const [questions, attempts, exams, preferences, wallet, inventory, rewards, pomodoro, purchases] = await Promise.all([allRows('questions', true), allRows('attempts'), allRows('exams'), loadSettings(), allRows('game_wallets'), allRows('game_inventory'), allRows('game_rewards'), allRows('pomodoro_progress'), allRows('game_purchases')]); return { schemaVersion: 4, ...preferences, game: { wallet: wallet[0] || null, inventory, rewards, pomodoro, purchases }, exportedAt: new Date().toISOString(), questions: questions.map(fromRow), attempts: attempts.map(attemptRow), exams: exams.map(examRow) }; }

export async function loadSettings(): Promise<{ categories: UserCategory[]; settings: UserSettings }> {
  const [rows, settings] = await Promise.all([allRows('user_categories'), db().from('user_settings').select('font_id').maybeSingle()]);
  return { categories: rows.map(row => ({ name: row.name, createdAt: row.created_at })).sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name)), settings: { fontId: check(settings)?.font_id || 'default' } };
}
export async function addCategory(name: string) { check(await db().from('user_categories').insert({name: name.trim()})); }
export async function renameCategory(name: string, nextName: string) { check(await db().from('user_categories').update({name: nextName.trim()}).eq('name',name)); }
export async function removeCategory(name: string, replacement: string | null) { check(await db().rpc('remove_category',{p_name:name,p_replacement:replacement})); }
export async function saveFont(fontId: string) {
  const {data,error}=await db().auth.getUser(); if(error)throw new Error(error.message); const user=data.user;
  if(!user) throw new Error('로그인이 필요합니다.');
  check(await db().from('user_settings').upsert({user_id:user.id,font_id:fontId}));
}

export async function loginUsername(username:string,password:string) {
  const {error}=await db().auth.signInWithPassword({email:await usernameEmail(username),password});
  if(error)throw Error(error.code==='invalid_credentials'?'아이디 또는 비밀번호를 확인해주세요.':error.status===429?'로그인 시도가 많습니다. 잠시 후 다시 시도해주세요.':'로그인하지 못했습니다. 잠시 후 다시 시도해주세요.');
}
export async function registerUsername(username:string,password:string) {
  if(!configured)throw Error('서버 연결을 확인해주세요.');
  const response=await fetch(url+'/functions/v1/username-signup',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({username,password}),signal:AbortSignal.timeout(20000)});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(result.message||'회원가입을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.');
}
