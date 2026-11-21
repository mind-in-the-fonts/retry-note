// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from './api';
import {AuthPanel} from './AuthPanel';
vi.mock('./api',()=>({configured:true,loginUsername:vi.fn(async()=>{}),registerUsername:vi.fn(async()=>{})}));
afterEach(cleanup);beforeEach(()=>vi.clearAllMocks());
it('GitHub 없이 아이디·비밀번호로 로그인할 수 있다',async()=>{
 const user=userEvent.setup();const github=vi.fn(async()=>{});render(<AuthPanel onGitHub={github} githubBusy={false} externalError=""/>);await user.type(screen.getByLabelText('아이디'),'friend');await user.type(screen.getByLabelText('비밀번호',{exact:true}),'testing-password');await user.click(screen.getByLabelText('비밀번호',{exact:true}).closest('form')!.querySelector('button')!);await waitFor(()=>expect(api.loginUsername).toHaveBeenCalledWith('friend','testing-password'));expect(github).not.toHaveBeenCalled();
});
it('회원가입에서 비밀번호를 확인한 뒤 계정을 만들고 바로 로그인한다',async()=>{
 const user=userEvent.setup();render(<AuthPanel onGitHub={async()=>{}} githubBusy={false} externalError=""/>);await user.click(screen.getByRole('button',{name:'회원가입'}));await user.type(screen.getByLabelText('아이디'),'새친구');await user.type(screen.getByLabelText('비밀번호',{exact:true}),'testing-password');await user.type(screen.getByLabelText('비밀번호 확인'),'different-password');await user.click(screen.getByRole('button',{name:'회원가입하고 시작하기'}));expect(api.registerUsername).not.toHaveBeenCalled();expect(screen.getByRole('alert').textContent).toContain('일치하지');await user.clear(screen.getByLabelText('비밀번호 확인'));await user.type(screen.getByLabelText('비밀번호 확인'),'testing-password');await user.click(screen.getByRole('button',{name:'회원가입하고 시작하기'}));await waitFor(()=>expect(api.registerUsername).toHaveBeenCalledWith('새친구','testing-password'));expect(api.loginUsername).toHaveBeenCalledWith('새친구','testing-password');
});
