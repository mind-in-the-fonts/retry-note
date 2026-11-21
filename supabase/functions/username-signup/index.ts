import {createSignupHandler} from './handler.ts';
const base=Deno.env.get('SUPABASE_URL')!;
const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');
const secret=secretKeys.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if(!base||!secret)throw Error('Signup service configuration is missing');
const adminHeaders:Record<string,string>={apikey:secret,'Content-Type':'application/json'};
if(!secret.startsWith('sb_secret_'))adminHeaders.Authorization='Bearer '+secret;
const ipKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
Deno.serve(createSignupHandler({
 async verifyKey(key){
  // Public signup has no session yet. Validate the project API key explicitly.
  const response=await fetch(base+'/auth/v1/settings',{headers:{apikey:key},signal:AbortSignal.timeout(5000)});
  if(!response.ok)return false;const settings=await response.json();return settings.external?.email===true;
 },
 async hashIp(ip){const bytes=await crypto.subtle.sign('HMAC',ipKey,new TextEncoder().encode('username-signup:'+ip));return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');},
 async takeSlot(scope,key){const response=await fetch(base+'/rest/v1/rpc/account_signup_slot',{method:'POST',headers:adminHeaders,body:JSON.stringify({p_scope:scope,p_key:key}),signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error('Signup limit unavailable');return await response.json()===true;},
 async createAccount(email,password,username){
  const response=await fetch(base+'/auth/v1/admin/users',{method:'POST',headers:adminHeaders,body:JSON.stringify({email,password,email_confirm:true,user_metadata:{user_name:username,display_name:username}}),signal:AbortSignal.timeout(10000)});
  if(response.ok)return 'created';const error=await response.json();if(['email_exists','user_already_exists'].includes(error.code)||/already.*registered|already.*exists/i.test(error.msg||error.message||''))return 'duplicate';throw Error('Account creation failed');
 }
}));
