import catalog from './font-catalog.json';
export const FONT_CATALOG = catalog;
export const DEFAULT_FONT_STACK = "'Noto Sans KR',-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif";
const pending = new Map<string,Promise<void>>();
export function fontFamily(id:string):string { const font=catalog.fonts.find(font=>font.id===id);return font?`'${font.family}',${DEFAULT_FONT_STACK}`:DEFAULT_FONT_STACK; }
export function loadFont(id:string):Promise<void> {
  if(id==='default')return Promise.resolve();
  const font=catalog.fonts.find(font=>font.id===id);if(!font)return Promise.reject(new Error('목록에 없는 폰트입니다. 기본 폰트를 선택해주세요.'));
  if(pending.has(id))return pending.get(id)!;
  const promise=new Promise<void>((resolve,reject)=>{
    const link=document.createElement('link');link.rel='stylesheet';link.href=import.meta.env.BASE_URL+'fonts/'+font.id+'.css';
    const timer=setTimeout(()=>fail(),20000);
    const fail=()=>{clearTimeout(timer);link.remove();pending.delete(id);reject(new Error('폰트를 불러오지 못했습니다. 다시 시도하거나 다른 폰트를 선택해주세요.'));};
    link.onerror=fail;
    link.onload=()=>{document.fonts.load(`400 18px "${font.family}"`,'다시 풀어보는 오늘의 오답 ABC 123').then(faces=>{if(!faces.length){fail();return;}clearTimeout(timer);resolve();}).catch(fail);};
    document.head.append(link);
  });pending.set(id,promise);return promise;
}
