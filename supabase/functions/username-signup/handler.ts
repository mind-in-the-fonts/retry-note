import {normalizeUsername,usernameEmail,validatePassword} from '../_shared/account.ts';
export interface SignupServices {
 verifyKey:(key:string)=>Promise<boolean>;
 hashIp:(ip:string)=>Promise<string>;
 takeSlot:(scope:'global'|'ip',key:string)=>Promise<boolean>;
 createAccount:(email:string,password:string,username:string)=>Promise<'created'|'duplicate'>;
}
const origins=new Set(['https://retry-note.pages.dev','https://mind-in-the-fonts.github.io','http://localhost:5173','http://127.0.0.1:5173']);
export function createSignupHandler(services:SignupServices){return async(request:Request):Promise<Response>=>{
 const origin=request.headers.get('origin');const headers:Record<string,string>={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin'};
 if(origin&&origins.has(origin))Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'apikey, content-type, authorization, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'});
 const reply=(status:number,message:string,extra:Record<string,string>={})=>new Response(JSON.stringify({message}),{status,headers:{...headers,...extra}});
 if(origin&&!origins.has(origin))return reply(403,'허용되지 않은 사이트입니다.');
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return reply(405,'회원가입 요청만 처리할 수 있습니다.',{Allow:'POST, OPTIONS'});
 if(!request.headers.get('content-type')?.startsWith('application/json'))return reply(415,'입력 형식을 확인해주세요.');
 const key=request.headers.get('apikey')||'';if(key.length<20||key.length>512)return reply(401,'사이트 연결을 확인해주세요.');
 try{
  if(!await services.verifyKey(key))return reply(401,'사이트 연결을 확인해주세요.');
  let text='';let size=0;const reader=request.body?.getReader();if(reader){const decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();return reply(413,'입력 내용이 너무 깁니다.');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}
  let body:Record<string,unknown>;try{body=JSON.parse(text);if(!body||Array.isArray(body)||typeof body!=='object')throw Error();}catch{return reply(400,'입력 형식을 확인해주세요.');}
  let username:string;let password:string;try{username=normalizeUsername(body.username);password=validatePassword(body.password);}catch(error){return reply(400,error instanceof Error?error.message:'아이디와 비밀번호를 확인해주세요.');}
  const ip=request.headers.get('cf-connecting-ip')||request.headers.get('x-real-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
  if(!await services.takeSlot('global','global')||!await services.takeSlot('ip',await services.hashIp(ip)))return reply(429,'가입 요청이 많습니다. 잠시 후 다시 시도해주세요.',{'Retry-After':'3600'});
  const result=await services.createAccount(await usernameEmail(username),password,username);
  return result==='duplicate'?reply(409,'이미 사용 중인 아이디입니다.'):reply(201,'회원가입이 완료됐습니다.');
 }catch{return reply(503,'회원가입을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.');}
};}
