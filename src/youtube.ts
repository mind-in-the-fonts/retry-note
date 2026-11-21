export interface YouTubePlayer {
 playVideo():void;pauseVideo():void;seekTo(seconds:number,allowSeekAhead:boolean):void;
 cueVideoById(options:{videoId:string;startSeconds:number}):void;loadVideoById(options:{videoId:string;startSeconds:number}):void;
 getCurrentTime():number;getDuration():number;getPlayerState():number;getPlaybackRate():number;setPlaybackRate(rate:number):void;destroy():void;
}
interface PlayerOptions {videoId:string;width:string;height:string;playerVars:Record<string,string|number>;events:{onReady:(event:{target:YouTubePlayer})=>void;onStateChange:(event:{data:number})=>void;onPlaybackRateChange:(event:{data:number})=>void;onError:(event:{data:number})=>void;onAutoplayBlocked:()=>void}}
export interface YouTubeAPI {Player:new(element:HTMLElement,options:PlayerOptions)=>YouTubePlayer}
declare global {interface Window {YT?:YouTubeAPI;onYouTubeIframeAPIReady?:()=>void}}
let pending:Promise<YouTubeAPI>|null=null;
export function loadYouTube():Promise<YouTubeAPI>{
 if(window.YT?.Player)return Promise.resolve(window.YT);if(pending)return pending;
 pending=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.async=true;
  const fail=()=>{clearTimeout(timer);script.remove();pending=null;reject(Error('유튜브 플레이어를 불러오지 못했습니다. 네트워크를 확인하고 다시 입장해주세요.'));};
  const timer=setTimeout(fail,20000);const previous=window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady=()=>{previous?.();clearTimeout(timer);if(window.YT?.Player)resolve(window.YT);else fail();};script.onerror=fail;document.head.append(script);
 });return pending;
}
export function youtubeError(code:number):string {
 if(code===101||code===150)return '영상 소유자가 외부 사이트 재생을 허용하지 않았습니다. 다른 유튜브 URL을 선택해주세요.';
 if(code===100)return '삭제되었거나 비공개인 영상입니다. 다른 유튜브 URL을 선택해주세요.';
 if(code===153)return '유튜브가 사이트 출처를 확인하지 못했습니다. 브라우저의 추적 차단 설정을 확인해주세요.';
 return '이 영상을 재생하지 못했습니다. 다른 유튜브 URL을 선택하거나 방에 다시 입장해주세요.';
}
