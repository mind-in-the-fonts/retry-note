import {describe,expect,it} from 'vitest';
import {clockOffset,playbackPosition,roomCode,youtubeId,type WatchRoom} from './watch-core';
const room:WatchRoom={id:'11111111-1111-4111-8111-111111111111',owner_id:'owner',video_id:'M7lc1UVf-VE',position:20,playing:true,playback_rate:1.5,version:1,updated_at:'2026-11-21T10:00:00Z',updated_by:'owner',closed:false,created_at:'2026-11-21T10:00:00Z'};
describe('함께 보기 주소와 공유 시각',()=>{
 it('일반·공유·쇼츠·라이브·임베드 URL에서 영상 ID를 읽는다',()=>{for(const url of ['https://www.youtube.com/watch?v=M7lc1UVf-VE&t=10','https://youtu.be/M7lc1UVf-VE?si=abc','https://youtube.com/shorts/M7lc1UVf-VE','https://youtube.com/live/M7lc1UVf-VE','https://www.youtube-nocookie.com/embed/M7lc1UVf-VE'])expect(youtubeId(url)).toBe('M7lc1UVf-VE');});
 it('유튜브를 사칭한 호스트와 스크립트·채널·재생목록 URL을 거부한다',()=>{for(const url of ['https://youtube.com.evil.example/watch?v=M7lc1UVf-VE','https://youtube.com@evil.example/watch?v=M7lc1UVf-VE','javascript:alert(1)','https://youtube.com/playlist?list=abc','https://youtube.com/watch?v=bad'])expect(()=>youtubeId(url)).toThrow();});
 it('초대 링크 또는 UUID만 방 코드로 인정한다',()=>{expect(roomCode('https://retry-note.pages.dev/?room='+room.id)).toBe(room.id);expect(roomCode(room.id)).toBe(room.id);expect(()=>roomCode('영어 공부방')).toThrow();});
 it('서버 시계 차이와 재생 속도를 반영하고 일시정지 상태는 이동시키지 않는다',()=>{const server=Date.parse(room.updated_at);const offset=clockOffset(room.updated_at,server-1100,server-900);expect(offset).toBe(1000);expect(playbackPosition(room,server+9000,offset)).toBe(35);expect(playbackPosition({...room,playing:false},server+9000,offset)).toBe(20);expect(playbackPosition(room,server-5000)).toBe(20);});
});
