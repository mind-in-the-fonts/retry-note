// @vitest-environment jsdom
import React from 'react';import {afterEach,expect,it,vi} from 'vitest';import {cleanup,render,screen,waitFor} from '@testing-library/react';import userEvent from '@testing-library/user-event';import {ActivityLog} from './ActivityLog';import * as api from './game-api';
vi.mock('./game-api',()=>({activityLog:vi.fn()}));afterEach(()=>{cleanup();vi.clearAllMocks();});
const reward={id:'reward',kind:'pomodoro' as const,title:'쿠리만쥬와 빗소리',details:{goal:'책 20쪽',cycle:1},amount:142,base:100,random_bonus:42,correct_bonus:0,minutes:50,occurred_at:'2026-11-21T15:10:00Z'};
const purchase={...reward,id:'purchase',kind:'purchase' as const,title:'따뜻한 머그잔',details:{itemName:'따뜻한 머그잔'},amount:-400};
it('한국 날짜별 보상·구매 금액과 목표를 보여주고 종류로 필터링한다',async()=>{
 const user=userEvent.setup();vi.mocked(api.activityLog).mockImplementation(async filters=>({entries:filters.kind==='purchase'?[purchase]:[reward,purchase],hasMore:false,summary:{count:2,earned:142,spent:400,balance:742,unknownPurchases:0}}));render(<ActivityLog/>);
 await waitFor(()=>expect(screen.getByText('+142코인')).toBeTruthy());expect(screen.getByText('−400코인')).toBeTruthy();expect(screen.getByText('책 20쪽')).toBeTruthy();expect(screen.getByText(/2026년 11월 22일/)).toBeTruthy();expect(screen.getByText('기본 100 + 랜덤 42')).toBeTruthy();await user.click(screen.getByRole('button',{name:'상점 구매'}));await waitFor(()=>expect(screen.queryByText('+142코인')).toBeNull());expect(screen.getByText('따뜻한 머그잔')).toBeTruthy();
});
it('이전 기록을 불러올 때 마지막 기록의 시각과 ID를 커서로 전달한다',async()=>{
 const user=userEvent.setup();vi.mocked(api.activityLog).mockResolvedValueOnce({entries:[reward],hasMore:true,summary:{count:2,earned:142,spent:400,balance:742,unknownPurchases:0}}).mockResolvedValueOnce({entries:[purchase],hasMore:false,summary:{count:2,earned:142,spent:400,balance:742,unknownPurchases:0}});render(<ActivityLog/>);await user.click(await screen.findByRole('button',{name:'이전 기록 더 보기'}));await waitFor(()=>expect(screen.getByText('따뜻한 머그잔')).toBeTruthy());expect(api.activityLog).toHaveBeenLastCalledWith(expect.anything(),reward);expect(screen.getByText('+142코인')).toBeTruthy();
});
