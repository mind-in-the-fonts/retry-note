import {useState} from 'react';
import * as api from './watch-api';
import type {WatchRoom,WatchSnapshot} from './watch-core';
export function RoomName({room,userId,onSaved}:{room:WatchRoom;userId:string;onSaved:(next:WatchSnapshot)=>void}){
 const [editing,setEditing]=useState(false);const [value,setValue]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const title=room.name||(room.mode==='pomodoro'?'함께 공부하는 방':'같이 보는 방');
 return <div className="room-name"><div><h1>{title}</h1>{room.owner_id===userId&&!room.closed&&!editing&&<button className="text-btn" onClick={()=>{setValue(title);setError('');setEditing(true);}}>방 이름 수정</button>}</div>{editing&&<form onSubmit={async event=>{event.preventDefault();if(busy||!value.trim())return;setBusy(true);setError('');try{onSaved(await api.renameRoom(room.id,value.trim()));setEditing(false);}catch(e){setError(e instanceof Error?e.message:'방 이름을 저장하지 못했습니다.');}finally{setBusy(false);}}}><input autoFocus aria-label="새 방 이름" maxLength={60} required disabled={busy} value={value} onChange={e=>setValue(e.target.value)}/><button className="btn primary" disabled={busy||!value.trim()}>{busy?'저장 중':'이름 저장'}</button><button type="button" className="btn secondary" disabled={busy} onClick={()=>setEditing(false)}>취소</button></form>}{error&&<p className="error" role="alert">{error}</p>}</div>;
}
