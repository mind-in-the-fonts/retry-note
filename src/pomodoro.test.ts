import {describe,expect,it} from 'vitest';import {POMODORO_VIDEOS,pomoPhase} from './pomodoro-core';
describe('사용자가 지정한 뽀모도로 영상',()=>{
 it('지정한 여섯 URL만 순서대로 등록한다',()=>expect(POMODORO_VIDEOS.map(v=>v.id)).toEqual(['7de9NZVQEx0','zbLk3-TgGEA','pts1U6XuXlA','MyxX6yGTS9Q','2ckGFNyMXME','6-6QSW8P2ik']));
 it('고정 50분 계산 대신 원본 챕터의 초 단위 차이를 반영한다',()=>{expect(pomoPhase('pts1U6XuXlA',7200)?.kind).toBe('rest');expect(pomoPhase('pts1U6XuXlA',7201)?.kind).toBe('focus');expect(pomoPhase('pts1U6XuXlA',10202)?.kind).toBe('rest');});
 it('1시간 영상과 40/10 영상의 완료 시각을 구분한다',()=>{expect(pomoPhase('2ckGFNyMXME',3599)?.kind).toBe('focus');expect(pomoPhase('2ckGFNyMXME',3600)?.kind).toBe('done');expect(pomoPhase('7de9NZVQEx0',2402)?.kind).toBe('rest');});
});
