import type {CSSProperties} from 'react';
export const SLOT_NAMES={hat:'모자',face:'얼굴 장식',outfit:'옷·목도리'};
// Anchors follow the head and torso of each original full-body illustration.
const anchors:Record<string,{cx:number;hat:number;face:number;body:number;head:number;torso:number}>={
 usagi:{cx:.5,hat:.29,face:.51,body:.72,head:.79,torso:.63},
 hachiware:{cx:.5,hat:.12,face:.41,body:.68,head:.87,torso:.5},
 kurimanju:{cx:.5,hat:.08,face:.42,body:.66,head:.86,torso:.5},
 shisa:{cx:.48,hat:.1,face:.41,body:.69,head:.74,torso:.56},
 momonga:{cx:.4,hat:.17,face:.47,body:.72,head:.68,torso:.4},
 furuhonya:{cx:.5,hat:.22,face:.48,body:.72,head:.89,torso:.5},
 anoko:{cx:.6,hat:.17,face:.37,body:.68,head:.62,torso:.56}
};
export function wearablePosition(character:string,slot:string):CSSProperties{const a=anchors[character]||anchors.usagi;return {left:a.cx*100+'%',top:(slot==='hat'?a.hat:slot==='face'?a.face:a.body)*100+'%',width:(slot==='outfit'?a.torso:a.head)*100+'%'};}
export function Wearable({id}:{id:string}){return <svg className="wearable-art" viewBox="0 0 160 120" aria-hidden="true"><g stroke="#765844" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
{id==='straw-hat'?<><path d="M36 78 48 31q32-16 64 0l12 47" fill="#efd798"/><path d="m42 57 76 0 4 15H38Z" fill="#c78583"/><ellipse cx="80" cy="79" rx="72" ry="17" fill="#f6e3ad"/><path d="m22 83 111 0M58 33l-8 20m25-23-1 23m23-21 8 21" stroke="#d6ba78" strokeWidth="2"/></>:
id==='berry-beret'?<><path d="M21 67Q5 31 48 26q35-32 72-4t16 49" fill="#e6a6ae"/><path d="M25 67h108v15H25Z" fill="#c77f8c"/><path d="M78 24q-3-16 12-20" fill="none" stroke="#8f9a71" strokeWidth="7"/><path d="M88 16q5-20 24-11-9 16-24 11" fill="#a7bc89" stroke="#829368"/></>:
id==='sleep-cap'?<><path d="M27 80q13-57 52-63 39-4 57 37-29-18-44 25" fill="#a6bcd6"/><path d="m50 39 47 11m-58 9 47 11" stroke="#ecf0ed" strokeWidth="9"/><rect x="24" y="75" width="73" height="17" rx="8" fill="#fff5e6"/><circle cx="135" cy="57" r="13" fill="#fff5e6"/></>:
id==='flower-crown'?<><path d="M15 69q65-27 130 0" fill="none" stroke="#9aae85" strokeWidth="10"/>{[28,61,96,131].map((x,i)=><g key={x} transform={`translate(${x} ${i%2?54:64})`} fill={i%2?'#ffe3a1':'#eab6b5'}>{[0,72,144,216,288].map(r=><ellipse key={r} cy="-10" rx="7" ry="10" transform={`rotate(${r})`}/>)}<circle r="6" fill="#fff2c4"/></g>)}</>:
id==='royal-crown'?<><path d="m29 78-9-47 34 21 26-35 26 35 34-21-9 47Z" fill="#f4d687"/><rect x="28" y="76" width="104" height="15" rx="5" fill="#e9bb63"/><path d="m80 51 10 12-10 12-10-12Z" fill="#da8e9d"/><circle cx="49" cy="66" r="5" fill="#b2cfc7"/><circle cx="111" cy="66" r="5" fill="#b2cfc7"/></>:
id==='wizard-hat'?<><path d="M32 85 77 5l48 80" fill="#8f93bd"/><ellipse cx="80" cy="88" rx="72" ry="15" fill="#a0a4cb"/><path d="m74 26 4 8 9 2-7 6 1 10-8-5-8 4 2-9-6-7 10-1" fill="#f8df9e" stroke="none"/><path d="M96 56a10 10 0 1 0 8 17 10 10 0 0 1-8-17" fill="#f8df9e" stroke="none"/></>:
id==='round-glasses'||id==='heart-glasses'?<g fill="none" stroke={id==='round-glasses'?'#876d64':'#c9748b'} strokeWidth="5">{id==='round-glasses'?<><circle cx="43" cy="60" r="25"/><circle cx="117" cy="60" r="25"/></>:<><path d="M43 81 18 58C-2 33 26 21 43 40c17-19 45-7 25 18Z"/><path d="m117 81-25-23c-20-25 8-37 25-18 17-19 45-7 25 18Z"/></>}<path d="M68 57q12-10 24 0M4 49l14 6m124 0 14-6"/></g>:
id==='flower-pin'?<g transform="translate(132 38)" fill="#f2bdc2">{[0,72,144,216,288].map(r=><ellipse key={r} cy="-11" rx="8" ry="12" transform={`rotate(${r})`}/>)}<circle r="8" fill="#f4d98f"/></g>:
id==='ribbon-pin'?<g transform="translate(125 35)"><path d="M0 0q-35-28-31 0t31 0q35-28 31 0T0 0" fill="#d88c9b"/><circle r="7" fill="#edb4be"/><path d="m-3 6-13 23 16-6 6 7 4-24" fill="#d88c9b"/></g>:
id==='pink-bow'?<><path d="M78 45Q17 3 24 48T78 62q61 42 54-1T82 45" fill="#ebb0b3"/><path d="m68 62-21 37 25-8 8 16 12-43" fill="#e5a0a8"/><rect x="69" y="39" width="23" height="31" rx="9" fill="#f6c7c6"/></>:
id==='mint-scarf'?<><path d="m79 52 5 56 30-3-11-57" fill="#b4ccc2"/><path d="m85 78 24-3m-23 15 24-3m-22 16 1 12m9-13 1 12m8-13 1 12" stroke="#87aaa0"/><rect x="17" y="27" width="126" height="34" rx="15" fill="#c0d6cb"/><path d="M32 37h94M31 49h97" stroke="#9bbeb1" strokeWidth="2"/></>:
id==='sailor-collar'?<><path d="M21 20 80 44l59-24-17 52-42-15-42 15Z" fill="#8daac7"/><path d="m30 29 14 33 36-15 36 15 14-33" fill="none" stroke="#eff4ee"/><path d="m80 51-17 26 17 29 17-29Z" fill="#d78f98"/></>:
id==='picnic-apron'?<><path d="m54 9-9 38-23 17 18 47h80l18-47-23-17-9-38-16 7H70Z" fill="#e9c6b8"/><path d="M45 53h70v51H45Z" fill="#f9e8da"/><path d="M49 65h63M49 80h63M49 95h63m-50-40v45m16-45v45m16-45v45" stroke="#dfb6a7" strokeWidth="5"/><path d="M65 75h30v20H65Z" fill="#f3d4c6"/></>:
id==='cozy-vest'?<><path d="m47 14-28 28 17 16 7 54h74l7-54 17-16-28-28-33 24Z" fill="#f2dfb7"/><path d="m53 20 27 31 27-31M80 52v57" fill="none" stroke="#bcaa8b"/><path d="m52 57 5 5-5 5m0 10 5 5-5 5m52-30-5 5 5 5m0 10-5 5 5 5" fill="none" stroke="#dac69d"/><path d="M79 71q-8-9-11 0t11 11q14-10 11-11t-11 0" fill="#d7989e" stroke="none"/></>:
<><path d="M41 25 12 107q68 18 136 0l-29-82-39 20Z" fill={id==='star-cape'?'#a5a4c7':id==='rain-cape'?'#efd382':'#d393a5'}/><path d="M41 26q39 28 78 0" fill="none" stroke={id==='royal-cape'?'#fff1df':id==='rain-cape'?'#f9e8ac':'#dedbed'} strokeWidth="12"/>{id==='star-cape'?<g fill="#fff1bd" stroke="none"><path d="m42 61 3 8 9 1-7 6 2 9-7-5-7 5 2-9-7-6 9-1Z"/><path d="m110 82 2 6 7 1-5 4 1 7-5-4-5 4 1-7-5-4 7-1Z"/></g>:id==='rain-cape'?<><path d="M80 52v60" stroke="#c4a64e"/><circle cx="86" cy="67" r="3" fill="#b49b50"/><circle cx="86" cy="88" r="3" fill="#b49b50"/></>:<path d="M15 106q65 19 130 0" stroke="#fff1df" strokeWidth="10" fill="none"/>}<circle cx="80" cy="45" r="8" fill="#efcd81"/></>}
</g></svg>;}
