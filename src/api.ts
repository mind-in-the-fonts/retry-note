import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Attempt, Exam, ExplanationPatch, Question, Statistics } from './core';
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
export async function backup() { const [questions, attempts, exams] = await Promise.all([allRows('questions', true), allRows('attempts'), allRows('exams')]); return { schemaVersion: 1, exportedAt: new Date().toISOString(), questions: questions.map(fromRow), attempts: attempts.map(attemptRow), exams: exams.map(examRow) }; }
