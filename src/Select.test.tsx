// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from './Select';
beforeAll(()=>{Element.prototype.scrollIntoView=vi.fn();});
afterEach(cleanup);
const options=['한국사','영어','자료구조','물리','화학','수학','프로그래밍'].map(value=>({value,label:value}));
describe('커스텀 과목 선택',()=>{
 it('검색한 과목을 키보드로 선택하고 Escape로 닫을 수 있다',async()=>{
  const user=userEvent.setup();const changed=vi.fn();render(<Select value="" options={options} onChange={changed} label="과목"/>);
  await user.click(screen.getByRole('combobox'));await user.type(screen.getByRole('textbox',{name:'과목 검색'}),'영어');expect(screen.getAllByRole('option')).toHaveLength(1);
  await user.keyboard('{Enter}');expect(changed).toHaveBeenCalledWith('영어');expect(screen.queryByRole('listbox')).toBeNull();
  await user.click(screen.getByRole('combobox'));await user.keyboard('{Escape}');expect(screen.queryByRole('listbox')).toBeNull();
 });
 it('빈 과목 목록에서 존재하지 않는 값을 선택하지 않으며 바깥 클릭으로 닫힌다',async()=>{
  const user=userEvent.setup();const changed=vi.fn();render(<><Select value="" options={[]} onChange={changed} label="과목"/><button>바깥</button></>);
  await user.click(screen.getByRole('combobox'));await user.keyboard('{ArrowDown}{Enter}');expect(changed).not.toHaveBeenCalled();await user.click(screen.getByText('바깥'));expect(screen.queryByRole('listbox')).toBeNull();
 });
 it('저장된 선택 상태를 표시하고 아래 방향키로 다음 과목을 선택한다',async()=>{
  const user=userEvent.setup();const changed=vi.fn();render(<Select value="한국사" options={options.slice(0,3)} onChange={changed} label="과목"/>);
  await user.tab();await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');expect(changed).toHaveBeenCalledWith('영어');
 });
});
