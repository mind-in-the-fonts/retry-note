export function normalizeUsername(input:unknown):string {
 if(typeof input!=='string')throw Error('아이디를 입력해주세요.');
 const username=input.normalize('NFKC').trim().toLowerCase();
 if(!/^[a-z0-9가-힣_]{2,24}$/.test(username))throw Error('아이디는 한글·영문·숫자·밑줄로 2~24자 입력해주세요.');
 return username;
}
export function validatePassword(input:unknown):string {
 if(typeof input!=='string'||input.length<8)throw Error('비밀번호를 8자 이상 입력해주세요.');
 if(new TextEncoder().encode(input).length>72)throw Error('비밀번호가 너무 깁니다. 더 짧게 입력해주세요.');
 return input;
}
export async function usernameEmail(input:unknown):Promise<string> {
 const username=normalizeUsername(input);const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(username));
 const digest=Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
 return `u-${digest.slice(0,60)}@accounts.retry-note.invalid`;
}
