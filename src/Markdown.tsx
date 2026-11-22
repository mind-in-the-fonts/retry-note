import {useId,useState} from 'react';
import ReactMarkdown from 'react-markdown';import remarkGfm from 'remark-gfm';import remarkBreaks from 'remark-breaks';
const plugins=[remarkGfm,remarkBreaks];
/** User text stays Markdown in storage. Raw HTML is escaped; unsafe URLs are filtered. */
export function Markdown({children,className='',inline=false,interactive=true}:{children:string;className?:string;inline?:boolean;interactive?:boolean}){
 const content=<ReactMarkdown remarkPlugins={plugins} allowedElements={inline?['strong','em','del','code','br']:undefined} unwrapDisallowed={inline} components={{
  a:({children,href})=>interactive?<a href={href} target="_blank" rel="noopener noreferrer">{children}</a>:<span>{children}</span>,
  img:({src,alt})=>src?<img src={src} alt={alt||''} loading="lazy" referrerPolicy="no-referrer"/>:<span>{alt}</span>,
  input:({checked})=><span className="markdown-task" aria-label={checked?'완료':'미완료'}>{checked?'☑':'☐'}</span>,
  table:({children})=><div className="markdown-table" tabIndex={0} role="region" aria-label="표"><table>{children}</table></div>
 }}>{children}</ReactMarkdown>;
 return inline?<span className={`markdown markdown-inline ${className}`}>{content}</span>:<div className={`markdown ${className}`}>{content}</div>;
}
export function MarkdownField({label,value,onChange,rows=4,maxLength=30000,required=false,autoFocus=false,placeholder,id}:{label:string;value:string;onChange:(value:string)=>void;rows?:number;maxLength?:number;required?:boolean;autoFocus?:boolean;placeholder?:string;id?:string}){
 const unique=useId();const inputId=id||unique;const [preview,setPreview]=useState(false);
 return <div className="markdown-field"><label htmlFor={inputId}>{label}</label><textarea id={inputId} value={value} onChange={e=>onChange(e.target.value)} rows={rows} maxLength={maxLength} required={required} autoFocus={autoFocus} placeholder={placeholder}/><div className="markdown-field-tools"><span>마크다운 지원</span><button type="button" className="text-btn" aria-label={`${preview?'미리보기 닫기':'미리보기 열기'} · ${label}`} aria-expanded={preview} aria-controls={preview?unique+'-preview':undefined} onClick={()=>setPreview(old=>!old)}>{preview?'미리보기 닫기':'미리보기 열기'}<span className="sr-only"> · {label}</span></button></div>{preview&&<div id={unique+'-preview'} className="markdown-preview" role="region" aria-label={label+' 미리보기'}>{value?<Markdown>{value}</Markdown>:<p className="muted">입력한 내용이 여기에 표시됩니다.</p>}</div>}</div>;
}
