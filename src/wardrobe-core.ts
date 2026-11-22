import type {Fit,Owned} from './game-api';
export function fittingsFor(inventory:Owned[],character:string):Record<string,Fit>{return Object.fromEntries(inventory.map(owned=>[owned.item_id,owned.wearable_offsets?.[character]||{x:0,y:0}]));}
export function fitPixel(value:number):number{return Number.isFinite(value)?Math.max(-100,Math.min(100,Math.round(value))):0;}
