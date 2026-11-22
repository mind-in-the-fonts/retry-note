import {db} from './api';
import type { WatchCommand, WatchRoom, WatchSnapshot } from './watch-core';
const checked=<T>(result:{data:T;error:{message:string}|null}):T=>{if(result.error)throw Error(result.error.message);return result.data;};
export async function listRooms(mode='watch'):Promise<WatchRoom[]>{let query=db().from('watch_rooms').select('*').eq('closed',false);if(mode!=='all')query=query.eq('mode',mode);return checked(await query.order('updated_at',{ascending:false}).limit(30).abortSignal(AbortSignal.timeout(12000)))||[];}
export async function createRoom(videoId:string,name?:string):Promise<WatchSnapshot>{return checked(await db().rpc('watch_create_named',{p_video_id:videoId,p_name:name?.trim()||null}).abortSignal(AbortSignal.timeout(12000)));}
export async function joinRoom(id:string):Promise<WatchSnapshot>{return checked(await db().rpc('watch_join',{p_id:id}).abortSignal(AbortSignal.timeout(12000)));}
export async function getRoom(id:string):Promise<WatchSnapshot>{return checked(await db().rpc('watch_get',{p_id:id}).abortSignal(AbortSignal.timeout(12000)));}
export async function updateRoom(room:WatchRoom,command:WatchCommand):Promise<WatchSnapshot>{return checked(await db().rpc('watch_update',{p_id:room.id,p_video_id:command.videoId,p_position:command.position,p_playing:command.playing,p_rate:command.rate,p_version:room.version}).abortSignal(AbortSignal.timeout(12000)));}
export async function leaveRoom(id:string){checked(await db().rpc('watch_leave',{p_id:id}).abortSignal(AbortSignal.timeout(12000)));}
export async function closeRoom(id:string){checked(await db().rpc('watch_close',{p_id:id}).abortSignal(AbortSignal.timeout(12000)));}

export async function renameRoom(id:string,name:string):Promise<WatchSnapshot>{return checked(await db().rpc('watch_rename',{p_id:id,p_name:name}).abortSignal(AbortSignal.timeout(12000)));}

export async function createClock(video:string,name:string,focus:number,rest:number,pause:boolean):Promise<WatchSnapshot>{return checked(await db().rpc('pomo_create_clock',{p_video:video,p_name:name,p_focus:focus*60,p_rest:rest*60,p_pause:pause}).abortSignal(AbortSignal.timeout(12000)));}
export async function controlTimer(room:WatchRoom,running:boolean):Promise<WatchSnapshot>{return checked(await db().rpc('pomo_timer',{p_id:room.id,p_running:running,p_version:room.version}).abortSignal(AbortSignal.timeout(12000)));}
export async function changePomodoroVideo(room:WatchRoom,video:string):Promise<WatchSnapshot>{return checked(await db().rpc('pomo_change_video',{p_room:room.id,p_video:video,p_version:room.version}).abortSignal(AbortSignal.timeout(12000)));}
