import { mkdir, writeFile, rm } from 'node:fs/promises';
const source='https://raw.githubusercontent.com/mind-in-the-fonts/font-changer-data/main/free-fonts.json';
const response=await fetch(source);if(!response.ok)throw Error('Font catalog unavailable');
const data=await response.json();
const unique=[...new Map(data.fonts.filter(f=>/^noonnu-\d+$/.test(f.id)).map(f=>[f.id,f])).values()].sort((a,b)=>Number(b.id.slice(7))-Number(a.id.slice(7)));
const allowed=new Set(['cdn.jsdelivr.net','fastly.jsdelivr.net','fonts.googleapis.com','fonts.gstatic.com','raw.githubusercontent.com','noonnu.cc']);
function safeUrl(raw){const url=new URL(raw);if(url.protocol!=='https:'||!allowed.has(url.hostname)||url.username||url.password)throw Error('Unsupported font host: '+url.hostname);return url.href;}
const cache=new Map();
async function expand(css,depth=0){if(depth>3)throw Error('Too many imports');const imports=[...css.matchAll(/@import\s+(?:url\(\s*)?['"]([^'"]+)['"]\s*\)?[^;]*;/g)];for(const match of imports){const url=safeUrl(match[1]);if(!cache.has(url))cache.set(url,fetch(url).then(async r=>{if(!r.ok)throw Error('CSS request failed');return r.text();}));css=css.replace(match[0],await expand(await cache.get(url),depth+1));}return css;}
await rm('public/fonts',{recursive:true,force:true});await mkdir('public/fonts',{recursive:true});const fonts=[];
for(const item of unique){if(fonts.length===100)break;try{
const css=await expand(item.cssText);const family='RetryFont-'+item.id;const faces=[];
for(const match of css.matchAll(/@font-face\s*\{([^}]+)\}/g)){
 const body=match[1];const prop=name=>body.match(new RegExp('(?:^|;)\\s*'+name+'\\s*:\\s*([^;]+)','i'))?.[1]?.trim();
 const src=prop('src');if(!src)continue;const urls=[...src.matchAll(/url\(\s*['"]?([^'"\s)]+)['"]?\s*\)(?:\s*format\(['"]?([^'")]+)['"]?\))?/g)].map(m=>`url(${JSON.stringify(safeUrl(m[1]))})${m[2]&&/^[a-z0-9-]+$/i.test(m[2])?' format('+JSON.stringify(m[2])+')':''}`);if(!urls.length)continue;
 const weight=prop('font-weight')||'400';const style=prop('font-style')||'normal';const range=prop('unicode-range');
 if(!/^(normal|bold|[\d\s]+)$/.test(weight)||!/^(normal|italic|oblique)$/.test(style))continue;
 faces.push(`@font-face{font-family:${JSON.stringify(family)};src:${urls.join(',')};font-weight:${weight};font-style:${style};font-display:swap;${range&&/^[Uu+\da-fA-F?,\s-]+$/.test(range)?'unicode-range:'+range+';':''}}`);
}
if(!faces.length)throw Error('No supported webfont');await writeFile('public/fonts/'+item.id+'.css',faces.join('\n')+'\n');fonts.push({id:item.id,name:item.name,family});
}catch(error){console.log('Skipped',item.id,error.message);}}
if(fonts.length!==100)throw Error('Expected 100 usable fonts');
await writeFile('src/font-catalog.json',JSON.stringify({source,sourceUpdatedAt:data.updatedAt,order:'registration-id-desc',fonts},null,2)+'\n');
console.log('Generated',fonts.length,'fonts. Source updated:',data.updatedAt);
