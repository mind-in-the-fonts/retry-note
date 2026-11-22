import type {Item} from './game-api';
export const SHOP_TABS=[['all','전체'],['hat','모자'],['face','얼굴 장식'],['outfit','옷·목도리'],['appearance','캐릭터 컬렉션'],['room','방 꾸미기'],['theme','배경']] as const;
export function shopItems(items:Item[],tab:string,character:string):Item[]{return items.filter(item=>{
 if(item.kind==='appearance'&&item.character_id!==character)return false;
 if(tab==='all')return true;
 if(tab==='appearance')return item.kind==='appearance';
 if(tab==='room')return !item.slot&&!['theme','appearance'].includes(item.kind);
 if(tab==='theme')return item.kind==='theme';
 return item.slot===tab;
});}
