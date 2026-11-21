import {clockOffset,playbackPosition,type WatchCommand,type WatchRoom,type WatchSnapshot} from './watch-core';
import type {YouTubePlayer} from './youtube';
interface Sample {position:number;at:number;state:number;rate:number}
interface SyncOptions {publish:(room:WatchRoom,command:WatchCommand)=>Promise<WatchSnapshot>;onSnapshot:(snapshot:WatchSnapshot)=>void;onError:(message:string)=>void;onEnabled:(enabled:boolean)=>void;onPending?:(pending:boolean)=>void;now?:()=>number}
export class WatchSync {
 private snapshot:WatchSnapshot;private offset:number;private suppressedUntil=0;private loadedVideo='';private sample:Sample|null=null;private enabled=false;private disposed=false;private publishing=false;private now:()=>number;
 constructor(private player:YouTubePlayer,initial:WatchSnapshot,private options:SyncOptions){this.snapshot=initial;this.now=options.now||Date.now;this.offset=clockOffset(initial.serverNow,this.now(),this.now());this.apply(true);}
 get room(){return this.snapshot.room;} get isPublishing(){return this.publishing;} get isEnabled(){return this.enabled;}
 get position(){const duration=this.player.getDuration();return Math.min(duration>0?duration:604800,playbackPosition(this.room,this.now(),this.offset));}
 accept(snapshot:WatchSnapshot,started?:number,finished?:number){if(this.disposed||snapshot.room.id!==this.room.id||snapshot.room.version<this.room.version)return;if(started!==undefined&&finished!==undefined)this.offset=clockOffset(snapshot.serverNow,started,finished);this.snapshot=snapshot;this.options.onSnapshot(snapshot);this.apply();}
 acceptRecord(room:WatchRoom){this.accept({...this.snapshot,room});}
 private suppress(){this.suppressedUntil=this.now()+1500;this.sample=null;}
 private apply(force=false){
  if(this.disposed)return;const room=this.room;const position=this.position;const state=this.player.getPlayerState();const changed=this.loadedVideo!==room.video_id;
  const seek=force||Math.abs(this.player.getCurrentTime()-position)>1.5;const play=room.playing&&this.enabled&&!room.closed;
  const stateChange=play?(state!==1&&state!==3):(state===1||state===3);const rateChange=this.player.getPlaybackRate()!==room.playback_rate;
  if(!changed&&!seek&&!stateChange&&!rateChange)return;this.suppress();
  if(changed){this.loadedVideo=room.video_id;const video={videoId:room.video_id,startSeconds:position};if(play)this.player.loadVideoById(video);else this.player.cueVideoById(video);}
  else if(seek)this.player.seekTo(position,true);
  if(rateChange)this.player.setPlaybackRate(room.playback_rate);
  if(play)this.player.playVideo();else this.player.pauseVideo();
 }
 private changedPosition():boolean {const prior=this.sample;if(!prior)return false;const seconds=(this.now()-prior.at)/1000;if(seconds<0||seconds>2)return false;const expected=prior.position+(prior.state===1?seconds*prior.rate:0);return Math.abs(this.player.getCurrentTime()-expected)>1.5;}
 private async send(command:WatchCommand){
  if(this.disposed||this.publishing||this.room.closed)return;this.publishing=true;this.options.onPending?.(true);this.suppress();const started=this.now();
  try{const snapshot=await this.options.publish(this.room,command);if(this.disposed)return;this.accept(snapshot,started,this.now());if(snapshot.applied===false)this.apply(true);}
  catch(error){if(!this.disposed){this.options.onError(error instanceof Error?error.message:'재생 상태를 공유하지 못했습니다.');this.apply(true);}}
  finally{this.publishing=false;this.options.onPending?.(false);}
 }
 start(){if(this.disposed||this.room.closed)return;this.enabled=true;this.options.onEnabled(true);this.suppress();this.player.seekTo(this.position,true);this.player.playVideo();if(!this.room.playing)void this.send({videoId:this.room.video_id,position:this.position,playing:true,rate:this.room.playback_rate});}
 toggle(){if(this.disposed||this.publishing)return;this.enabled=true;this.options.onEnabled(true);const playing=!this.room.playing;const position=this.position;this.suppress();if(playing)this.player.playVideo();else this.player.pauseVideo();void this.send({videoId:this.room.video_id,position,playing,rate:this.room.playback_rate});}
 seek(position:number){if(this.disposed||this.publishing||this.room.closed||!Number.isFinite(position))return;const duration=this.player.getDuration();const target=Math.max(0,Math.min(duration>0?duration:604800,position));this.suppress();this.player.seekTo(target,true);void this.send({videoId:this.room.video_id,position:target,playing:this.room.playing,rate:this.room.playback_rate});}
 changeVideo(videoId:string){void this.send({videoId,position:0,playing:false,rate:1});}
 onState(state:number){
  if(this.disposed||this.room.closed)return;
  if(!this.enabled){if(state!==1)return;this.enabled=true;this.suppressedUntil=0;this.options.onEnabled(true);}
  if(this.publishing||this.now()<this.suppressedUntil)return;
  if(![0,1,2,3].includes(state))return;
  const playing=state===3?this.room.playing:state===1;
  if((state!==3&&playing!==this.room.playing)||this.changedPosition())void this.send({videoId:this.room.video_id,position:this.player.getCurrentTime(),playing,rate:this.player.getPlaybackRate()||1});
 }
 onRate(rate:number){if(this.enabled&&!this.disposed&&!this.publishing&&this.now()>=this.suppressedUntil&&rate!==this.room.playback_rate)void this.send({videoId:this.room.video_id,position:this.player.getCurrentTime(),playing:this.room.playing,rate});}
 autoplayBlocked(){this.enabled=false;this.suppress();this.options.onEnabled(false);}
 tick(){
  if(this.disposed)return;const state=this.player.getPlayerState();
  if(this.enabled&&!this.room.closed&&!this.publishing&&this.now()>=this.suppressedUntil){
   if([0,1,2,3].includes(state))this.onState(state);
   if(!this.publishing&&[1,2].includes(state)&&Math.abs(this.player.getCurrentTime()-this.position)>1.75)this.apply();
  }
  if(this.now()>=this.suppressedUntil)this.sample={position:this.player.getCurrentTime(),at:this.now(),state,rate:this.player.getPlaybackRate()||1};
  return {playing:this.player.getPlayerState()===1,position:this.enabled?this.player.getCurrentTime():this.position,duration:this.player.getDuration(),enabled:this.enabled};
 }
 dispose(){this.disposed=true;}
}
