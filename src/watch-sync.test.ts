import {describe,expect,it,vi} from 'vitest';
import type {WatchCommand,WatchRoom,WatchSnapshot} from './watch-core';
import {WatchSync} from './watch-sync';
import type {YouTubePlayer} from './youtube';
class FakePlayer implements YouTubePlayer {
 position=0;state=2;rate=1;duration=600;onState:((state:number)=>void)|null=null;
 playVideo(){this.state=1;this.onState?.(1);}pauseVideo(){this.state=2;this.onState?.(2);}seekTo(seconds:number){this.position=seconds;this.onState?.(this.state);}cueVideoById(video:{startSeconds:number}){this.position=video.startSeconds;this.state=5;this.onState?.(5);}loadVideoById(video:{startSeconds:number}){this.position=video.startSeconds;this.state=1;this.onState?.(1);}getCurrentTime(){return this.position;}getDuration(){return this.duration;}getPlayerState(){return this.state;}getPlaybackRate(){return this.rate;}setPlaybackRate(rate:number){this.rate=rate;}destroy(){}
}
function setup(){
 let now=Date.parse('2026-11-21T10:00:00Z');let room:WatchRoom={id:'room',owner_id:'a',video_id:'M7lc1UVf-VE',position:0,playing:false,playback_rate:1,version:0,updated_at:new Date(now).toISOString(),updated_by:'a',closed:false,created_at:new Date(now).toISOString()};
 const controllers:WatchSync[]=[];const players=[new FakePlayer(),new FakePlayer()];
 const snapshot=():WatchSnapshot=>({room:{...room},serverNow:new Date(now).toISOString(),memberCount:2});
 const publish=vi.fn(async(prior:WatchRoom,command:WatchCommand):Promise<WatchSnapshot>=>{if(prior.version!==room.version)return {...snapshot(),applied:false};room={...room,video_id:command.videoId,position:command.position,playing:command.playing,playback_rate:command.rate,version:room.version+1,updated_at:new Date(now).toISOString()};for(const controller of controllers)controller.acceptRecord({...room});return {...snapshot(),applied:true};});
 for(const player of players){const controller=new WatchSync(player,snapshot(),{publish,onSnapshot:()=>{},onError:()=>{},onEnabled:()=>{},now:()=>now});controllers.push(controller);player.onState=state=>controller.onState(state);}
 return {players,controllers,publish,snapshot,advance:(ms:number)=>{for(const player of players)if(player.state===1)player.position+=ms/1000*player.rate;now+=ms;for(const controller of controllers)controller.tick();}};
}
const settle=async()=>{await Promise.resolve();await Promise.resolve();};
describe('두 플레이어의 동기화',()=>{
 it('어느 참여자가 재생·일시정지·위치 이동을 해도 모두 따라가며 재전송 루프가 없다',async()=>{
  const {players,controllers,publish,advance}=setup();controllers[0].start();await settle();controllers[1].start();await settle();expect(players.map(player=>player.state)).toEqual([1,1]);expect(publish).toHaveBeenCalledTimes(1);
  advance(2000);controllers[1].toggle();await settle();expect(players.map(player=>player.state)).toEqual([2,2]);expect(publish).toHaveBeenCalledTimes(2);
  controllers[0].seek(90);await settle();expect(players.map(player=>player.position)).toEqual([90,90]);expect(publish).toHaveBeenCalledTimes(3);
 });
 it('유튜브 자체 일시정지 버튼과 탐색 조작도 다른 플레이어로 공유한다',async()=>{
  const {players,controllers,advance,publish}=setup();controllers[0].start();await settle();controllers[1].start();advance(2000);players[1].pauseVideo();await settle();expect(players[0].state).toBe(2);
  advance(2000);controllers.forEach(controller=>controller.tick());players[1].seekTo(120);await settle();expect(players[0].position).toBe(120);expect(publish).toHaveBeenCalledTimes(3);
 });
 it('플레이어가 준비된 직후 유튜브 자체 재생 버튼을 눌러도 방에 공유한다',async()=>{const {players,controllers,publish}=setup();players[0].playVideo();await settle();expect(controllers[0].isEnabled).toBe(true);expect(controllers[1].room.playing).toBe(true);expect(publish).toHaveBeenCalledTimes(1);});
 it('늦게 들어온 사용자는 경과 시간을 반영한 위치에서 시작하고 자동재생 차단은 방 전체를 멈추지 않는다',async()=>{
  const {players,controllers,advance,publish}=setup();controllers[0].start();await settle();advance(10000);controllers[1].start();expect(players[1].position).toBe(10);controllers[1].autoplayBlocked();players[1].pauseVideo();advance(2000);expect(controllers[0].room.playing).toBe(true);expect(publish).toHaveBeenCalledTimes(1);
 });
 it('역순으로 도착한 이전 상태는 최신 영상과 위치를 덮어쓰지 않는다',async()=>{
  const {controllers,snapshot}=setup();const old=snapshot();controllers[0].changeVideo('dQw4w9WgXcQ');await settle();controllers[0].accept(old);expect(controllers[0].room.video_id).toBe('dQw4w9WgXcQ');
 });
 it('오래된 상태로 낸 명령이 거절되면 서버의 최신 상태로 복귀한다',async()=>{
  const player=new FakePlayer();const {snapshot}=setup();const initial=snapshot();const newer={...initial,room:{...initial.room,version:2,position:75,playing:false},applied:false};const publish=vi.fn(async()=>newer);
  const controller=new WatchSync(player,initial,{publish,onSnapshot:()=>{},onError:()=>{},onEnabled:()=>{}});controller.toggle();await settle();expect(controller.room.version).toBe(2);expect(player.position).toBe(75);expect(player.state).toBe(2);expect(publish).toHaveBeenCalledTimes(1);
 });
});
