import { withActiveAccount } from './fixtures/supabase-fetch.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/create-app.js';
const userId='e1000000-0000-4000-8000-000000000001',characterId='e2000000-0000-4000-8000-000000000001',chatId='e3000000-0000-4000-8000-000000000001',systemId='e4000000-0000-4000-8000-000000000001';
const createdAt='2026-11-15T12:00:00.000Z';
const chat={id:chatId,game_system_id:systemId,name:'Room',description:null,status:'active',created_at:createdAt,max_players:2,player_count:1,permissions:{view:true,enter:true,write:false},is_member:false,has_player_seat:false,can_manage:false};
const message={id:'e5000000-0000-4000-8000-000000000001',chat_id:chatId,character_id:characterId,content:'Hello',created_at:createdAt};
let result:Record<string,unknown>,role:'owner'|'mod'|'user'|null,admin:boolean,invalidCharacter:boolean,calls:{name:string;body:Record<string,unknown>}[];
beforeEach(()=>{
 vi.stubEnv('SUPABASE_URL','https://example.supabase.co');vi.stubEnv('SUPABASE_PUBLISHABLE_KEY','sb_publishable_test');
 role='owner';admin=false;invalidCharacter=false;calls=[];result={status:'ok',chat,messages:[message],message,roles:[],users:[],members:[]};
 vi.stubGlobal('fetch',withActiveAccount(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(String(input)),name=url.pathname.split('/').at(-1)!,body=init?.body?JSON.parse(String(init.body)):{};
  if(url.pathname==='/auth/v1/user')return Response.json({id:userId,aud:'authenticated',role:'authenticated',email:'test@test.invalid',app_metadata:{},user_metadata:{},created_at:createdAt});
  if(name==='get_my_system_memberships')return Response.json({is_platform_admin:admin,memberships:role?[{game_system_id:systemId,game_system_name:'System',role}]:[]});
  if(name==='characters')return Response.json(invalidCharacter?[]:[{id:characterId,user_id:userId,game_system_id:systemId,status:'active'}]);
  calls.push({name,body});
  if(name==='create_system_chat')return Response.json({status:'created',character_id:null,chat});
  if(name==='list_system_chats')return Response.json({status:'ok',chats:[chat]});
  if(name==='room_operation')return Response.json(result);
  throw new Error(`Unexpected ${url}`);
 }));
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
async function request(method:'GET'|'POST'|'PUT'|'DELETE',url:string,payload?:unknown){const app=buildApp({nodeEnv:'test'});try{return await app.inject({method,url,headers:{authorization:'Bearer test','content-type':'application/json'},...(payload===undefined?{}:{payload:JSON.stringify(payload)})});}finally{await app.close();}}
const path=`/api/v1/me/characters/${characterId}/chats`;
describe('RPG rooms',()=>{
 it('creates without a character or automatic participation',async()=>{
  const r=await request('POST',`/api/v1/owner/game-systems/${systemId}/chats`,{name:' Room '});expect(r.statusCode).toBe(201);expect(r.json().chat).toEqual(chat);
  expect(calls.find(c=>c.name==='create_system_chat')?.body).toEqual({p_game_system_id:systemId,p_character_id:null,p_name:'Room',p_description:null});
 });
 it.each(['mod','user',null] as const)('rejects %s creation even as platform admin',async value=>{role=value;admin=true;expect((await request('POST',`/api/v1/owner/game-systems/${systemId}/chats`,{name:'Room'})).statusCode).toBe(403);expect(calls).toEqual([]);});
 it('rejects blank room names',async()=>{expect((await request('POST',`/api/v1/owner/game-systems/${systemId}/chats`,{name:' '})).statusCode).toBe(400);});
 it('lists visible unjoined rooms',async()=>{const r=await request('GET',path);expect(r.statusCode).toBe(200);expect(r.json().chats).toEqual([chat]);});
 it('rejects foreign/inactive character',async()=>{invalidCharacter=true;expect((await request('GET',path)).statusCode).toBe(404);});
 it('reads visible history without membership',async()=>{const r=await request('GET',`${path}/${chatId}/messages`);expect(r.statusCode).toBe(200);expect(r.json()).toEqual({messages:[message]});});
 it.each([['room_full',409],['forbidden',403],['not_found',404],['invalid_character',404]] as const)('maps admission %s',async(status,code)=>{result={status};expect((await request('POST',`${path}/${chatId}/membership`,{})).statusCode).toBe(code);});
 it('rejects denied writing',async()=>{result={status:'forbidden'};expect((await request('POST',`${path}/${chatId}/messages`,{content:'Hello'})).statusCode).toBe(403);});
 it('sends trimmed message through authorization RPC',async()=>{expect((await request('POST',`${path}/${chatId}/messages`,{content:' Hello '})).statusCode).toBe(201);expect(calls.at(-1)?.body).toEqual({p_action:'send',p_chat:chatId,p_character:characterId,p_payload:{content:'Hello'}});});
 it('rejects invalid capacity and duplicate role rules',async()=>{for(const payload of [{max_players:0,roles:[],users:[]},{max_players:1.5,roles:[],users:[]},{max_players:null,roles:[{role:'user',view:true,enter:true,write:true},{role:'user',view:false,enter:false,write:false}],users:[]}])expect((await request('PUT',`/api/v1/chats/${chatId}/settings`,payload)).statusCode).toBe(400);expect(calls).toEqual([]);});
 it('loads management without selecting character',async()=>{expect((await request('GET',`/api/v1/chats/${chatId}/settings`)).statusCode).toBe(200);expect(calls.at(-1)?.body.p_character).toBeNull();});
 it('rejects malformed RPC response',async()=>{result={status:'ok',messages:'bad'};expect((await request('GET',`${path}/${chatId}/messages`)).statusCode).toBe(500);});
});
