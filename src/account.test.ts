import {describe,expect,it,vi} from 'vitest';
import {normalizeUsername,usernameEmail,validatePassword} from '../supabase/functions/_shared/account';
import {createSignupHandler,type SignupServices} from '../supabase/functions/username-signup/handler';
const password='testing-password-123';
function services():SignupServices{return {verifyKey:vi.fn(async()=>true),hashIp:vi.fn(async()=> 'hashed-ip'),takeSlot:vi.fn(async()=>true),createAccount:vi.fn(async()=> 'created' as const)};}
function request(body:unknown,origin='https://retry-note.pages.dev'){return new Request('https://example.supabase.co/functions/v1/username-signup',{method:'POST',headers:{'Content-Type':'application/json',apikey:'sb_publishable_testing_key_12345',origin},body:JSON.stringify(body)});}
describe('아이디 계정 등록',()=>{
 it('아이디를 정규화하고 로그인과 가입에 동일한 내부 식별자를 사용한다',async()=>{expect(normalizeUsername(' My_Name ')).toBe('my_name');expect(normalizeUsername('홍길동')).toBe('홍길동');expect(await usernameEmail('My_Name')).toBe(await usernameEmail('my_name'));expect((await usernameEmail('my_name')).split('@')[0].length).toBeLessThanOrEqual(64);expect(()=>normalizeUsername('bad@email.com')).toThrow();expect(()=>validatePassword('short')).toThrow();});
 it('사용자가 지정한 권한·메일은 무시하고 검증된 아이디 계정만 생성한다',async()=>{
  const deps=services();const response=await createSignupHandler(deps)(request({username:'새친구',password,email:'someone@example.com',app_metadata:{role:'admin'}}));expect(response.status).toBe(201);expect(deps.createAccount).toHaveBeenCalledWith(await usernameEmail('새친구'),password,'새친구');expect(await response.text()).not.toContain(password);
 });
 it('잘못된 입력·API 키·출처는 계정 생성 전에 거부한다',async()=>{
  const deps=services();const handler=createSignupHandler(deps);expect((await handler(request({username:'x',password}))).status).toBe(400);expect((await handler(request({username:'friend',password},'https://unrelated.example'))).status).toBe(403);vi.mocked(deps.verifyKey).mockResolvedValue(false);expect((await handler(request({username:'friend',password}))).status).toBe(401);expect(deps.createAccount).not.toHaveBeenCalled();
 });
 it('중복 아이디와 요청 제한은 구분하고 서버 오류의 내부 내용은 내보내지 않는다',async()=>{
  const deps=services();const handler=createSignupHandler(deps);vi.mocked(deps.createAccount).mockResolvedValue('duplicate');expect((await handler(request({username:'friend',password}))).status).toBe(409);
  vi.mocked(deps.takeSlot).mockResolvedValue(false);expect((await handler(request({username:'friend',password}))).status).toBe(429);
  vi.mocked(deps.takeSlot).mockResolvedValue(true);vi.mocked(deps.createAccount).mockRejectedValue(Error('secret-backend-key'));const failed=await handler(request({username:'friend',password}));expect(failed.status).toBe(503);expect(await failed.text()).not.toContain('secret-backend-key');
 });
 it('너무 큰 요청 본문을 거부한다',async()=>{const deps=services();expect((await createSignupHandler(deps)(request({username:'friend',password,extra:'x'.repeat(5000)}))).status).toBe(413);expect(deps.createAccount).not.toHaveBeenCalled();});
});
