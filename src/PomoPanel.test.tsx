// @vitest-environment jsdom
import React from 'react';import {afterEach,beforeAll,expect,it,vi} from 'vitest';import {cleanup,render,screen,waitFor} from '@testing-library/react';import userEvent from '@testing-library/user-event';import {PomoPanel} from './PomoPanel';import * as api from './game-api';import type {WatchRoom} from './watch-core';
vi.mock('./game-api',()=>({pomoHeartbeat:vi.fn(async()=>[{cycle:0,focus_seconds:3000,goal:'책 20쪽',completed_at:'2026-11-22',reward_id:null}]),pomoGoal:vi.fn(async()=>{}),pomoClaim:vi.fn(async()=>({id:'reward',total:142})),announceReward:vi.fn()}));
beforeAll(()=>{HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};});afterEach(cleanup);
const room:WatchRoom={id:'room',mode:'pomodoro',owner_id:'a',video_id:'pts1U6XuXlA',position:3000,playing:true,playback_rate:1,version:1,updated_at:'2026-11-22',updated_by:'a',closed:false,created_at:'2026-11-22'};
it('개인의 완료 확인을 받아야 보상을 요청하고 수령액 알림을 보낸다',async()=>{const user=userEvent.setup();render(<PomoPanel room={room} position={3000} active/>);await waitFor(()=>expect(screen.getByRole('dialog',{name:'뽀모도로 완료 확인'})).toBeTruthy());expect(api.pomoClaim).not.toHaveBeenCalled();await user.click(screen.getByRole('button',{name:'잘했어요! 보상 받기'}));await waitFor(()=>expect(api.pomoClaim).toHaveBeenCalledWith('room',0));expect(api.announceReward).toHaveBeenCalledWith({id:'reward',total:142});});
it('다음 집중이 시작되면 확인창을 접고 지난 보상 버튼을 남기며 공통 타이머는 조작하지 않는다',async()=>{
 const user=userEvent.setup();const clock={...room,timer_kind:'clock' as const,focus_seconds:3000,rest_seconds:600,timer_running:true,timer_elapsed:0,timer_updated_at:'2026-11-23T05:00:00Z'};
 const start=Date.parse(clock.timer_updated_at);const {rerender}=render(<PomoPanel room={clock} position={0} active serverTime={start+3000000}/>);
 await waitFor(()=>expect(screen.getByRole('dialog')).toBeTruthy());rerender(<PomoPanel room={clock} position={0} active serverTime={start+3600000}/>);
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(screen.getByText('2회차 · 지금은 집중할 시간')).toBeTruthy();expect(screen.getByRole('timer').textContent).toBe('50:00');
 await user.click(screen.getByRole('button',{name:'1회차 · 지난 회차 보상 받기'}));expect(screen.getByRole('dialog')).toBeTruthy();expect(screen.getByRole('timer').textContent).toBe('50:00');
});
