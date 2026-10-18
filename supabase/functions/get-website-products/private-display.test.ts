// Offline real handler execution; every request restricted to synthetic localhost service.
import {assertEquals,assert} from 'jsr:@std/assert@1';
import {information} from '../_shared/publicPrivateTariffDisplay.test.ts';
Deno.test({name:'private catalog display: verification, season/product isolation, missing schema, legacy rates and gate',sanitizeOps:false,sanitizeResources:false,fn:async()=>{
 const fetchBefore=globalThis.fetch,serveBefore=Deno.serve;
 const keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','YETI_INTAKE_API_KEY'];const env=keys.map(k=>Deno.env.get(k));
 let handler:((r:Request)=>Promise<Response>)|undefined;let mode='verified';let calls=0;
 const ids=['3646f155-8a66-53e3-b512-749f3a42c1ae','0e8e8669-d8f4-5b19-8e6d-36ff588fdee1'];
 try{
 Deno.env.set(keys[0],'http://localhost:54321');Deno.env.set(keys[1],'synthetic-only');Deno.env.set(keys[2],'synthetic-key');
 Deno.serve=((fn:unknown)=>{handler=fn as typeof handler;return {} as Deno.HttpServer;}) as typeof Deno.serve;
 globalThis.fetch=async input=>{
  const u=new URL(input instanceof Request?input.url:String(input));assertEquals(u.origin,'http://localhost:54321');calls++;
  const t=u.pathname.split('/').pop();
  assert(!['group_courses','private_appointments','private_lesson_rates','product_private_tariffs'].includes(t??''));
  const product={name:'Synthetic',type:'private',discipline:'ski',price:75,pricing_type:'fixed',currency:'CHF',sort_order:0};
  const rows:Record<string,unknown>={seasons:[{id:'season',start_date:'2026-12-01',end_date:'2027-04-15'}],products:[...ids.map(id=>({...product,id})),{...product,id:'other'},{...product,type:'group',id:'group'}],product_price_tiers:[],product_public_offerings:[],bc_product_tariff_sources:ids.map(product_id=>({product_id,duration_minutes:120,persons_per_lesson:1,price_chf:170}))};
  if(t==='public_private_tariff_display'){
   assertEquals(u.searchParams.get('season_id'),'eq.season');assertEquals(u.searchParams.get('verified_at'),'not.is.null');
   assert(u.searchParams.get('product_id')?.includes(ids[0]));assert(!u.searchParams.get('product_id')?.includes('group'));
   if(mode==='missing')return new Response(JSON.stringify({code:'PGRST205',message:'missing table'}),{status:404,headers:{'Content-Type':'application/json'}});
   if(mode==='error')return new Response(JSON.stringify({code:'42501',message:'permission denied'}),{status:403,headers:{'Content-Type':'application/json'}});
   rows[t]=[...ids.map(product_id=>({...information,product_id,season_id:'season',base_persons:1,verified_by:'00000000-0000-4000-8000-000000000001',verified_at:mode==='unverified'?null:'2026-10-18T15:20:00Z'})),{...information,product_id:'other',season_id:'different',base_persons:1,verified_by:'00000000-0000-4000-8000-000000000001',verified_at:'2026-10-18T15:20:00Z'}];
  }
  assert(t && t in rows,`Unexpected table ${t}`);return new Response(JSON.stringify(rows[t]),{headers:{'Content-Type':'application/json'}});
 };
 await import('./index.ts');assert(handler);
 assertEquals((await handler(new Request('http://localhost/catalog'))).status,401);assertEquals(calls,0);
 const request=()=>new Request('http://localhost/catalog',{headers:{'x-api-key':'synthetic-key'}});
 for(const state of ['verified','unverified','missing']){
  mode=state;const r=await handler(request());assertEquals(r.status,200);const {products}=await r.json();
  for(const p of products){assertEquals(p.online_bookable,false);if(ids.includes(p.id)){
    assertEquals(p.private_rates,[{duration_minutes:120,persons:1,price:170}]);assertEquals(p.availability_policy,'private_check');
    assertEquals('public_private_time_tariffs' in p,state==='verified');if(state==='verified'){assertEquals(p.public_private_time_tariffs.windows,information.windows);assertEquals(p.public_private_tariff_rules.affects_operational_pricing,false);assertEquals(p.public_private_time_tariffs.base_persons,1);assert(!JSON.stringify(p).includes(information.source_note));}
   }else assertEquals('public_private_time_tariffs' in p,false);
  }
 }
 mode='error';assertEquals((await handler(request())).status,503);
 }finally{globalThis.fetch=fetchBefore;Deno.serve=serveBefore;keys.forEach((k,i)=>env[i]===undefined?Deno.env.delete(k):Deno.env.set(k,env[i]??''));}
}});
