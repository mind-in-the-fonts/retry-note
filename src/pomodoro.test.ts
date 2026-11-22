import {describe,expect,it} from 'vitest';import {POMODORO_VIDEOS,pomoPhase} from './pomodoro-core';
describe('사용자가 지정한 뽀모도로 영상',()=>{
 it('지정한 여섯 URL만 순서대로 등록한다',()=>expect(POMODORO_VIDEOS.map(v=>v.id)).toEqual(['7de9NZVQEx0','zbLk3-TgGEA','pts1U6XuXlA','MyxX6yGTS9Q','2ckGFNyMXME','6-6QSW8P2ik']));
 it('고정 50분 계산 대신 원본 챕터의 초 단위 차이를 반영한다',()=>{expect(pomoPhase('pts1U6XuXlA',7200)?.kind).toBe('rest');expect(pomoPhase('pts1U6XuXlA',7201)?.kind).toBe('focus');expect(pomoPhase('pts1U6XuXlA',10202)?.kind).toBe('rest');});
 it('1시간 영상과 40/10 영상의 완료 시각을 구분한다',()=>{expect(pomoPhase('2ckGFNyMXME',3599)?.kind).toBe('focus');expect(pomoPhase('2ckGFNyMXME',3600)?.kind).toBe('done');expect(pomoPhase('7de9NZVQEx0',2402)?.kind).toBe('rest');});
});

import {clockPhase} from './pomodoro-core';import type {WatchRoom} from './watch-core';
it('공통 시각으로 집중·휴식을 계산하고 확인·영상 위치와 무관하게 다음 회차로 넘어간다',()=>{const room={timer_kind:'clock',focus_seconds:3000,rest_seconds:600,timer_elapsed:0,timer_running:true,timer_updated_at:'2026-11-23T05:00:00Z',position:99999,playing:false} as WatchRoom;const at=(s:number)=>clockPhase(room,Date.parse(room.timer_updated_at!)+s*1000);expect(at(2999)).toMatchObject({kind:'focus',cycle:0,remaining:1});expect(at(3000)).toMatchObject({kind:'rest',cycle:0,remaining:600});expect(at(3600)).toMatchObject({kind:'focus',cycle:1,remaining:3000});expect(clockPhase({...room,timer_running:false,timer_elapsed:120},Date.now())).toMatchObject({kind:'focus',remaining:2880});expect(clockPhase({...room,rest_seconds:0},Date.parse(room.timer_updated_at!)+3000000)).toMatchObject({kind:'focus',cycle:1});});
