export interface WatchRoom {
 id:string;owner_id:string;video_id:string;position:number;playing:boolean;playback_rate:number;version:number;updated_at:string;updated_by:string|null;closed:boolean;created_at:string;
}
export interface WatchSnapshot {room:WatchRoom;serverNow:string;memberCount:number;applied?:boolean}
export interface WatchCommand {videoId:string;position:number;playing:boolean;rate:number}
export function youtubeId(input:string):string {
 let url:URL;try{url=new URL(input.trim());}catch{throw Error('유튜브 영상 URL을 입력해주세요.');}
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('유튜브 영상 URL을 입력해주세요.');
 const host=url.hostname.toLowerCase();let id:string|null=null;
 if(host==='youtu.be')id=url.pathname.split('/')[1];
 else if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','www.youtube-nocookie.com','youtube-nocookie.com'].includes(host)){
  if(url.pathname==='/watch')id=url.searchParams.get('v');else if(/^\/(embed|shorts|live)\//.test(url.pathname))id=url.pathname.split('/')[2];
 }
 if(!id||!/^[-\w]{11}$/.test(id))throw Error('재생할 수 있는 유튜브 영상 URL을 확인해주세요.');return id;
}
export function roomCode(input:string):string {
 const value=input.trim();let code=value;try{code=new URL(value).searchParams.get('room')||'';}catch{/* A room UUID can be pasted directly. */}
 if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(code))throw Error('초대 링크 또는 방 코드를 확인해주세요.');return code.toLowerCase();
}
export function playbackPosition(room:WatchRoom,now=Date.now(),offset=0):number {
 const elapsed=room.playing?Math.max(0,(now+offset-Date.parse(room.updated_at))/1000)*room.playback_rate:0;
 return Math.max(0,Math.min(604800,room.position+elapsed));
}
export function clockOffset(serverNow:string,started:number,finished:number):number{return Date.parse(serverNow)-(started+finished)/2;}
export function watchTime(seconds:number):string { const s=Math.max(0,Math.floor(seconds||0));return s>=3600?`${Math.floor(s/3600)}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`:`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; }
export function getWatchInvite():string|null {
 try{const input=new URLSearchParams(location.search).get('room')||sessionStorage.getItem('retry-note-room-invite');return input?roomCode(input):null;}catch{return null;}
}
