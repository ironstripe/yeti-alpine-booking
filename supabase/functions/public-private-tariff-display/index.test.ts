import {assertEquals,assert} from 'jsr:@std/assert@1';
import {information} from '../_shared/publicPrivateTariffDisplay.test.ts';
Deno.test({name:'actual staff endpoint: unauthorized/non-staff denied; actor server-derived; revision and verification passed atomically',sanitizeOps:false,sanitizeResources:false,fn:async()=>{
 const originalFetch=globalThis.fetch,originalServe=Deno.serve;const keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];const previous=keys.map(k=>Deno.env.get(k));
 const actor='00000000-0000-4000-8000-000000000001';let role='office';let conflict=false;let rpc=0;let handler:((r:Request)=>Promise<Response>)|undefined;
 try{
 Deno.env.set(keys[0],'http://localhost:54321');Deno.env.set(keys[1],'synthetic');Deno.serve=((f:unknown)=>{handler=f as typeof handler;return {} as Deno.HttpServer;}) as typeof Deno.serve;
 globalThis.fetch=async(input,init)=>{
  const u=new URL(input instanceof Request?input.url:String(input));assertEquals(u.origin,'http://localhost:54321');let data:unknown;
  if(u.pathname==='/auth/v1/user')data={id:actor,email:'synthetic@invalid.test'};
  else if(u.pathname==='/rest/v1/user_roles')data=role==='teacher'?[]:[{role}];
  else if(u.pathname==='/rest/v1/rpc/save_public_private_tariff_display'){
   rpc++;const b=JSON.parse(String(init?.body));assertEquals(b.p_actor,actor);assertEquals(b.p_expected_revision,3);assertEquals(b.p_verify,false);assertEquals(b.p_information,information);
   if(conflict)return new Response(JSON.stringify({code:'40001',message:'Concurrent change'}),{status:400,headers:{'Content-Type':'application/json'}});
   data={...information,revision:4,verified_at:null};
  }else throw Error(`Unexpected ${u.pathname}`);
  return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
 };
 await import('./index.ts');assert(handler);
 const body={product_id:'3646f155-8a66-53e3-b512-749f3a42c1ae',season_id:'f185b448-e6aa-46b8-94ae-0875a7a6c166',information,expected_revision:3,verify:false};
 const req=(b:unknown=body,auth=true)=>new Request('http://localhost/save',{method:'POST',headers:{...(auth?{Authorization:'Bearer synthetic-token'}:{}),'Content-Type':'application/json'},body:JSON.stringify(b)});
 assertEquals((await handler(req(body,false))).status,401);assertEquals(rpc,0);
 role='teacher';assertEquals((await handler(req())).status,403);assertEquals(rpc,0);
 for(const staff of ['office','admin','super_admin']){role=staff;const response=await handler(req());assertEquals(response.status,200);assertEquals((await response.json()).information.revision,4);}
 assertEquals(rpc,3);assertEquals((await handler(req({...body,actor}))).status,400);assertEquals(rpc,3);
 conflict=true;assertEquals((await handler(req())).status,409);
 }finally{globalThis.fetch=originalFetch;Deno.serve=originalServe;keys.forEach((k,i)=>previous[i]===undefined?Deno.env.delete(k):Deno.env.set(k,previous[i]??''));}
}});
