// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Settings } from './Settings';
import * as api from './api';
vi.mock('./api',()=>({addCategory:vi.fn(),renameCategory:vi.fn(),removeCategory:vi.fn(),saveFont:vi.fn()}));
vi.mock('./fonts',()=>({FONT_CATALOG:{sourceUpdatedAt:'2026-11-01',fonts:[{id:'noonnu-1997',name:'테스트 폰트',family:'Test'}]},fontFamily:()=> 'sans-serif',loadFont:()=>Promise.resolve()}));
beforeAll(()=>{Element.prototype.scrollIntoView=vi.fn();vi.stubGlobal('IntersectionObserver',class{observe(){}disconnect(){}});});
beforeEach(()=>vi.clearAllMocks());afterEach(cleanup);
it('설정에서 과목 추가·이름 변경·삭제를 할 수 있다',async()=>{
 const user=userEvent.setup();let saved=['영어'];
 vi.mocked(api.addCategory).mockImplementation(async name=>{saved.push(name);});vi.mocked(api.renameCategory).mockImplementation(async(name,next)=>{saved=saved.map(old=>old===name?next:old);});vi.mocked(api.removeCategory).mockImplementation(async name=>{saved=saved.filter(old=>old!==name);});
 function Harness(){const [names,setNames]=useState(saved);return <Settings categories={names.map(name=>({name,createdAt:''}))} fontId="default" onCategoriesChanged={async()=>setNames([...saved])} onFontChanged={()=>{}}/>;}
 render(<Harness/>);
 await user.type(screen.getByLabelText('새 과목 이름'),'한국사');await user.click(screen.getByRole('button',{name:'과목 추가'}));await waitFor(()=>expect(screen.getByText('한국사')).toBeTruthy());
 const row=screen.getByText('한국사').closest('.category-item')!;await user.click(within(row as HTMLElement).getByRole('button',{name:'이름 수정'}));await user.clear(screen.getByLabelText('변경할 과목 이름'));await user.type(screen.getByLabelText('변경할 과목 이름'),'세계사');await user.click(screen.getByRole('button',{name:'저장'}));await waitFor(()=>expect(screen.getByText('세계사')).toBeTruthy());
 const next=screen.getByText('세계사').closest('.category-item')!;await user.click(within(next as HTMLElement).getByRole('button',{name:'삭제'}));await user.click(screen.getByRole('button',{name:'과목 삭제'}));await waitFor(()=>expect(screen.queryByText('세계사',{exact:true})).toBeNull());expect(api.removeCategory).toHaveBeenCalledWith('세계사',null);
});
it('폰트 적용 버튼은 사용자 설정을 저장한 뒤 앱에 반영한다',async()=>{
 const user=userEvent.setup();const applied=vi.fn();render(<Settings categories={[]} fontId="default" onCategoriesChanged={async()=>{}} onFontChanged={applied}/>);
 await user.click(screen.getByRole('button',{name:'불러와서 사용하기'}));await waitFor(()=>expect(api.saveFont).toHaveBeenCalledWith('noonnu-1997'));expect(applied).toHaveBeenCalledWith('noonnu-1997');
});
