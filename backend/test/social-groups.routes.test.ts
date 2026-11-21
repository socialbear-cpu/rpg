import { withActiveAccount } from './fixtures/supabase-fetch.js';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { buildApp } from '../src/create-app.js';
const id='ae100000-0000-4000-8000-000000000001';
let status:string,calls:Record<string,unknown>[];
beforeEach(()=>{status='ok';calls=[];vi.stubEnv('SUPABASE_URL','https://example.supabase.co');vi.stubEnv('SUPABASE_PUBLISHABLE_KEY','sb_publishable_test');vi.stubGlobal('fetch',withActiveAccount(async(input:RequestInfo|URL,init?:RequestInit)=>{
 if(new URL(String(input)).pathname==='/auth/v1/user')return Response.json({id,aud:'authenticated',role:'authenticated',email:'test@test.invalid',app_metadata:{},user_metadata:{},created_at:'2026-11-21T00:00:00Z'});
 calls.push(JSON.parse(String(init?.body??'{}')));return Response.json({status,groups:[],conversations:[],group:{id,name:'Friends',owner_user_id:id,created_at:'2026-11-21T00:00:00Z'},members:[],messages:[]});
}));});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
async function request(method:'GET'|'POST'|'PATCH'|'PUT'|'DELETE',url:string,payload?:unknown,auth=true){const app=buildApp({nodeEnv:'test'});try{return await app.inject({method,url,headers:auth?{authorization:'Bearer test','content-type':'application/json'}:{},...(payload===undefined?{}:{payload:JSON.stringify(payload)})});}finally{await app.close();}}
describe('social groups',()=>{
 it('requires authentication',async()=>{expect((await request('GET','/api/v1/social-groups',undefined,false)).statusCode).toBe(401);});
 it('creates using accounts without character',async()=>{expect((await request('POST','/api/v1/social-groups',{name:' Friends ',user_ids:[id]})).statusCode).toBe(201);expect(calls.at(-1)).toEqual({p_action:'create',p_group:null,p_payload:{name:'Friends',user_ids:[id]}});});
 it('rejects empty name and invalid members',async()=>{for(const body of [{name:' ',user_ids:[]},{name:'Friends',user_ids:['oops']}])expect((await request('POST','/api/v1/social-groups',body)).statusCode).toBe(400);expect(calls).toEqual([]);});
 it.each([['not_found',404],['forbidden',403],['transfer_required',409]] as const)('maps %s',async(s,code)=>{status=s;expect((await request('POST',`/api/v1/social-groups/${id}/leave`,{})).statusCode).toBe(code);});
 it('limits message length',async()=>{expect((await request('POST',`/api/v1/social-groups/${id}/messages`,{content:'x'.repeat(2001)})).statusCode).toBe(400);});
 it('lists direct conversations',async()=>{expect((await request('GET','/api/v1/direct-messages')).statusCode).toBe(200);});
});
