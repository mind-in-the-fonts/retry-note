import {useLayoutEffect,useRef,useState,type ReactNode} from 'react';
interface Point{x:number;y:number}
const MARGIN=8;
export function clampFloating(point:Point,size:{width:number;height:number},viewport:{width:number;height:number}):Point{
 return {x:Math.max(MARGIN,Math.min(point.x,viewport.width-size.width-MARGIN)),y:Math.max(MARGIN,Math.min(point.y,viewport.height-size.height-MARGIN))};
}
export function FloatingPomodoro({floating,active,userId,onReturn,children}:{floating:boolean;active:boolean;userId:string;onReturn:()=>void;children:ReactNode}){
 const root=useRef<HTMLDivElement>(null);const drag=useRef<{pointer:number;dx:number;dy:number}|null>(null);const current=useRef<Point|null>(null);const [position,setPosition]=useState<Point|null>(null);const [dragging,setDragging]=useState(false);
 const enabled=floating&&active;const key='retry-note-mini-position:'+userId;
 function move(next:Point,save=false){if(!root.current)return;const rect=root.current.getBoundingClientRect();const visual=window.visualViewport;const value=clampFloating(next,rect,{width:visual?.width||window.innerWidth,height:visual?.height||window.innerHeight});current.current=value;setPosition(value);if(save)try{localStorage.setItem(key,JSON.stringify(value));}catch{/* Moving works even when storage is unavailable. */}}
 useLayoutEffect(()=>{
  if(!enabled||!root.current){drag.current=null;setDragging(false);return;}
  const rect=root.current.getBoundingClientRect();let initial:Point={x:rect.left,y:rect.top};
  try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y))initial=saved;}catch{/* Ignore malformed or unavailable storage. */}
  move(initial);
  const resize=()=>{if(current.current)move(current.current);};
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(resize);observer?.observe(root.current);window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);
  return()=>{observer?.disconnect();window.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('resize',resize);};
 },[enabled,key]);
 function finish(pointer:number){if(drag.current?.pointer!==pointer)return;drag.current=null;setDragging(false);if(current.current)move(current.current,true);}
 return <div ref={root} className={floating?`pomo-wrapper pomo-background ${active?'has-session':''} ${dragging?'mini-is-dragging':''}`:'pomo-wrapper'} style={enabled&&position?{left:position.x,top:position.y,bottom:'auto'}:undefined}>
  <div className="mini-pomo-header"><button type="button" className="mini-pomo-drag" aria-label="미니 공부방 이동" title="드래그해서 이동 · 방향키로도 옮길 수 있어요" onPointerDown={event=>{if(!enabled||event.button!==0||!root.current)return;event.preventDefault();event.currentTarget.focus();const box=root.current.getBoundingClientRect();drag.current={pointer:event.pointerId,dx:event.clientX-box.left,dy:event.clientY-box.top};event.currentTarget.setPointerCapture?.(event.pointerId);setDragging(true);}} onPointerMove={event=>{const state=drag.current;if(state?.pointer===event.pointerId)move({x:event.clientX-state.dx,y:event.clientY-state.dy});}} onPointerUp={event=>finish(event.pointerId)} onPointerCancel={event=>finish(event.pointerId)} onLostPointerCapture={event=>finish(event.pointerId)} onKeyDown={event=>{const step=event.shiftKey?48:16;const direction:Record<string,Point>={ArrowLeft:{x:-step,y:0},ArrowRight:{x:step,y:0},ArrowUp:{x:0,y:-step},ArrowDown:{x:0,y:step}};const delta=direction[event.key];if(!enabled||!delta||!current.current)return;event.preventDefault();move({x:current.current.x+delta.x,y:current.current.y+delta.y},true);}}><svg aria-hidden="true" viewBox="0 0 20 24">{[6,14].flatMap(x=>[5,12,19].map(y=><circle key={`${x}-${y}`} cx={x} cy={y} r="1.5"/>))}</svg></button><button type="button" className="mini-pomo-return" onClick={onReturn}>공부방으로 돌아가기</button><span className="mini-pomo-drag-hint" aria-hidden="true">드래그로 이동</span></div>
  {children}
 </div>;
}
