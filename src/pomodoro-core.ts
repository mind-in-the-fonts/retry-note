import catalog from './pomodoro-catalog.json';
export const POMODORO_VIDEOS=catalog;
export function pomoPhase(videoId:string,position:number){const video=catalog.find(v=>v.id===videoId);if(!video)return null;const focus=video.sessions.findIndex(s=>position>=s.start&&position<s.end);if(focus>=0)return {video,cycle:focus,kind:'focus' as const,remaining:Math.max(0,video.sessions[focus].end-position)};const next=video.sessions.findIndex(s=>s.start>position);return {video,cycle:next>=0?next:video.sessions.length-1,kind:next>=0?'rest' as const:'done' as const,remaining:next>=0?video.sessions[next].start-position:0};}

/** Shared clock ignores video position and each user's reward acknowledgments. */
export function clockPhase(room:import('./watch-core').WatchRoom,serverNow=Date.now()) {
 const focus=room.focus_seconds||3000,rest=room.rest_seconds??600,span=focus+rest;
 const elapsed=Math.max(0,(room.timer_elapsed||0)+(room.timer_running&&room.timer_updated_at?Math.max(0,(serverNow-Date.parse(room.timer_updated_at))/1000):0));
 const cycle=Math.floor(elapsed/span),within=elapsed-cycle*span,kind=within<focus?'focus' as const:'rest' as const;
 return {cycle,kind,remaining:Math.max(0,(kind==='focus'?focus:span)-within),elapsed,started:!!room.timer_updated_at,running:!!room.timer_running};
}
