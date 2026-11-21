import {useState} from 'react';
import * as api from './api';
import {normalizeUsername,validatePassword} from '../supabase/functions/_shared/account.ts';
export function AuthPanel({onGitHub,githubBusy,externalError}:{onGitHub:()=>Promise<void>;githubBusy:boolean;externalError:string}){
 const [mode,setMode]=useState<'login'|'signup'>('login');const [username,setUsername]=useState('');const [password,setPassword]=useState('');const [confirm,setConfirm]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
 const disabled=busy||githubBusy||!api.configured;
 async function submit(event:React.FormEvent){event.preventDefault();if(disabled)return;setBusy(true);setError('');setNotice('');try{
  const name=normalizeUsername(username);if(mode==='signup'){validatePassword(password);if(password!==confirm)throw Error('비밀번호 확인이 일치하지 않습니다.');await api.registerUsername(name,password);setMode('login');setConfirm('');try{await api.loginUsername(name,password);}catch{setNotice('회원가입이 완료됐습니다. 아이디와 비밀번호로 로그인해주세요.');setPassword('');}}
  else await api.loginUsername(name,password);
 }catch(error){setError(error instanceof Error?error.message:'로그인을 처리하지 못했습니다.');}finally{setBusy(false);}}
 return <div className="auth-panel"><div className="auth-tabs" role="group" aria-label="로그인 또는 회원가입"><button type="button" aria-pressed={mode==='login'} disabled={disabled} onClick={()=>{setMode('login');setError('');setNotice('');}}>로그인</button><button type="button" aria-pressed={mode==='signup'} disabled={disabled} onClick={()=>{setMode('signup');setError('');setNotice('');}}>회원가입</button></div><form onSubmit={submit} className="auth-form">
 <label htmlFor="account-username">아이디<input id="account-username" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={24} value={username} onChange={event=>setUsername(event.target.value)} disabled={disabled} placeholder="아이디"/></label>
 {mode==='signup'&&<p className="auth-hint">한글·영문·숫자·밑줄 2~24자</p>}
 <label htmlFor="account-password">비밀번호<input id="account-password" type="password" autoComplete={mode==='signup'?'new-password':'current-password'} required minLength={mode==='signup'?8:undefined} maxLength={72} value={password} onChange={event=>setPassword(event.target.value)} disabled={disabled} placeholder={mode==='signup'?'8자 이상':'비밀번호'}/></label>
 {mode==='signup'&&<label htmlFor="account-password-confirm">비밀번호 확인<input id="account-password-confirm" type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={confirm} onChange={event=>setConfirm(event.target.value)} disabled={disabled} placeholder="비밀번호 다시 입력"/></label>}
 {(error||externalError)&&<p className="error" role="alert">{error||externalError}</p>}{notice&&<p className="settings-notice" role="status">{notice}</p>}
 <button className="btn primary auth-submit" disabled={disabled}>{busy?'처리 중':mode==='signup'?'회원가입하고 시작하기':'로그인'}</button></form><div className="auth-divider"><span>또는</span></div><button className="btn secondary auth-github" disabled={disabled} onClick={()=>void onGitHub()}>{githubBusy?'연결 중':'GitHub로 로그인'}</button>{!api.configured&&<p className="connection-note">서버 연결을 준비하고 있습니다.</p>}</div>;
}
