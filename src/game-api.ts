import {db} from './api';
export interface Wallet {coins:number;xp:number;character:string;background:string}
export interface Item {id:string;name:string;price:number;kind:string;description:string}
export interface Owned {item_id:string;placed:boolean;x:number;y:number}
export interface Reward {id:string;kind:string;base:number;random_bonus:number;correct_bonus:number;total:number;minutes:number;created_at:string}
export interface GameState {wallet:Wallet;inventory:Owned[];items:Item[];recent:Reward[];communityMinutes:number}
export interface Visit {name:string;character:string;background:string;inventory:Owned[]}
export interface PomoProgress {cycle:number;focus_seconds:number;goal:string;completed_at:string|null;reward_id:string|null}
async function rpc<T>(name:string,args?:Record<string,unknown>):Promise<T>{const {data,error}=await db().rpc(name,args).abortSignal(AbortSignal.timeout(15000));if(error)throw Error(error.message);return data as T;}
export const gameState=()=>rpc<GameState>('game_state');
export const buyItem=(id:string)=>rpc<GameState>('game_buy',{p_item:id});
export const placeItem=(id:string,placed:boolean,x:number,y:number)=>rpc<void>('game_place',{p_item:id,p_placed:placed,p_x:x,p_y:y});
export const setStyle=(character:string,background:string)=>rpc<void>('game_style',{p_character:character,p_background:background});
export const visitRoom=(id:string)=>rpc<Visit|null>('game_visit',{p_user:id});
export const takeAttemptReward=(id:string)=>rpc<Reward|null>('game_attempt_reward',{p_id:id});
export const pomoGoal=(room:string,cycle:number,goal:string)=>rpc<void>('pomo_goal',{p_room:room,p_cycle:cycle,p_goal:goal});
export const pomoHeartbeat=(room:string,position:number,active:boolean)=>rpc<PomoProgress[]>('pomo_heartbeat',{p_room:room,p_position:position,p_active:active});
export const pomoClaim=(room:string,cycle:number)=>rpc<Reward|null>('pomo_claim',{p_room:room,p_cycle:cycle,p_confirm:true});
export function announceReward(reward:Reward|null){if(reward)window.dispatchEvent(new CustomEvent('study-reward',{detail:reward}));}
