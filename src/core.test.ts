import { describe, expect, it } from 'vitest';
import { parseExplanations, parseQuestions, percentages, todayKST, validateQuestion } from './core';
const q = { id: '11111111-1111-4111-8111-111111111111', category: '프로그래밍언어론', stem: '실행 결과는?', choices: ['1', '2'], correctIndex: 1, page: '721', bookNumber: '3', firstWrongDate: '2026-11-21', explanation: '' };
describe('입력과 통계', () => {
  it('한국 날짜가 UTC 자정을 기다리지 않고 바뀐다', () => { expect(todayKST(new Date('2026-11-21T15:01:00Z'))).toBe('2026-11-22'); });
  it('아직 재시험하지 않은 문제는 0%가 아니라 기록 없음이다', () => { expect(percentages(0, 0)).toEqual({ correct: null, wrong: null }); expect(percentages(3, 2)).toEqual({ correct: 66.7, wrong: 33.3 }); });
  it('정답 누락, 존재하지 않는 날짜와 과목을 거부한다', () => { expect(() => validateQuestion({ ...q, correctIndex: -1 })).toThrow(); expect(() => validateQuestion({ ...q, firstWrongDate: '2026-02-30' })).toThrow(); expect(() => validateQuestion({ ...q, category: 'DB' })).toThrow(); });
  it('문제 가져오기가 중복 ID를 거부하고 코드 줄바꿈을 보존한다', () => { expect(() => parseQuestions(JSON.stringify([q, q]))).toThrow('중복'); expect(parseQuestions(JSON.stringify({ questions: [{ ...q, stem: 'int x = 1;\n  x++;' }] }))[0].stem).toBe('int x = 1;\n  x++;'); });
  it('채팅 해설은 내 문제의 ID로만 연결하며 JSON 코드 블록을 지원한다', () => { const text = '```json\n' + JSON.stringify({ explanations: [{ questionId: q.id, explanation: '증가 연산 이후 2입니다.' }] }) + '\n```'; expect(parseExplanations(text, new Set([q.id]))[0].explanation).toContain('2'); expect(() => parseExplanations(text, new Set())).toThrow('없는 문제'); });
});
