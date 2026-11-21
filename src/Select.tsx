import { useEffect, useId, useRef, useState } from 'react';
export interface SelectOption { value: string; label: string }
export function Select({ value, options, onChange, label, placeholder='선택해주세요', disabled=false }: { value: string; options: SelectOption[]; onChange: (value:string)=>void; label:string; placeholder?:string; disabled?:boolean }) {
  const id=useId(); const root=useRef<HTMLDivElement>(null); const trigger=useRef<HTMLButtonElement>(null);
  const [open,setOpen]=useState(false);const [query,setQuery]=useState('');const [active,setActive]=useState(0);const [above,setAbove]=useState(false);
  const visible=options.filter(option=>option.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  function close(){setOpen(false);setQuery('');}
  function show(){if(disabled)return;setQuery('');setActive(Math.max(0,options.findIndex(option=>option.value===value)));const bounds=root.current?.getBoundingClientRect();setAbove(!!bounds&&window.innerHeight-bounds.bottom<310&&bounds.top>window.innerHeight-bounds.bottom);setOpen(true);}
  function choose(index:number){const option=visible[index];if(option){onChange(option.value);close();trigger.current?.focus();}}
  useEffect(()=>{if(!open)return;const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))close();};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[open]);
  useEffect(()=>{if(open)document.getElementById(id+'-option-'+active)?.scrollIntoView({block:'nearest'});},[active,open,id]);
  return <div ref={root} className={`custom-select ${open?'is-open':''}`} onKeyDown={event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();trigger.current?.focus();}
    else if(event.key==='Tab')close();
    else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();if(!open){show();return;}setActive(old=>event.key==='Home'?0:event.key==='End'?Math.max(0,visible.length-1):Math.min(Math.max(0,visible.length-1),Math.max(0,old+(event.key==='ArrowDown'?1:-1))));}
    else if(open&&event.key==='Enter'){event.preventDefault();choose(active);}
  }}>
    <button type="button" ref={trigger} className="select-trigger" role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open?id:undefined} aria-activedescendant={open&&visible[active]?id+'-option-'+active:undefined} disabled={disabled} onClick={()=>open?close():show()}><span className={!value?'muted':''}>{options.find(option=>option.value===value)?.label||placeholder}</span><svg aria-hidden="true" viewBox="0 0 20 20"><path d="m5 7 5 5 5-5"/></svg></button>
    {open&&<div className={`select-panel ${above?'opens-above':''}`}>
      {options.length>6&&<input autoFocus aria-label={`${label} 검색`} className="select-search" placeholder="과목 검색" value={query} onChange={event=>{setQuery(event.target.value);setActive(0);}}/>}
      <div role="listbox" id={id} aria-label={label} className="select-options">{visible.map((option,index)=><button type="button" role="option" aria-selected={option.value===value} tabIndex={-1} id={id+'-option-'+index} key={option.value} className={`select-option ${index===active?'highlighted':''}`} onPointerMove={()=>setActive(index)} onClick={()=>choose(index)}><span>{option.label}</span>{option.value===value&&<span aria-hidden="true">✓</span>}</button>)}{!visible.length&&<p className="select-empty">선택할 과목이 없습니다.</p>}</div>
    </div>}
  </div>;
}
