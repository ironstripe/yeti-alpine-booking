// Offline real handler execution; every request restricted to synthetic localhost service.
// Public private prices come only from the resolver projection RPC; legacy display rows are never read.
import {assertEquals,assert} from 'jsr:@std/assert@1';
const W=(start:string,end:string,d:number,a:number,x:number)=>({start,end,duration_minutes:d,amount_chf:a,extra_person_chf:x,classification:'standard',window_kind:'exact'});
const resolved={ok:true,tariff_revision:1,discount_rule_revision:1,discount:{percent:10,threshold:240,unit:'minutes',scope:'same_participant_same_day'},
 windows:[W('09:00','10:00',60,75,20),W('12:00','13:00',60,75,20),W('13:00','14:00',60,75,20),W('10:00','12:00',120,190,40),W('12:00','14:00',120,150,40),W('14:00','16:00',120,190,40)]};
Deno.test({name:'private catalog display: resolver projection, staged install, fail closed, groups unaffected',sanitizeOps:false,sanitizeResources:false,fn:async()=>{
 const fetchBefore=globalThis.fetch,serveBefore=Deno.serve;
 const keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','YETI_INTAKE_API_KEY'];const env=keys.map(k=>Deno.env.get(k));
 let handler:((r:Request)=>Promise<Response>)|undefined;let mode='resolved';let calls=0;const rpcProducts:string[]=[];
 const ids=['3646f155-8a66-53e3-b512-749f3a42c1ae','0e8e8669-d8f4-5b19-8e6d-36ff588fdee1'];
 try{
 Deno.env.set(keys[0],'http://localhost:54321');Deno.env.set(keys[1],'synthetic-only');Deno.env.set(keys[2],'synthetic-key');
 Deno.serve=((fn:unknown)=>{handler=fn as typeof handler;return {} as Deno.HttpServer;}) as typeof Deno.serve;
 globalThis.fetch=async (input,init)=>{
  const req=input instanceof Request?input:new Request(String(input),init);
  const u=new URL(req.url);assertEquals(u.origin,'http://localhost:54321');calls++;
  const t=u.pathname.split('/').pop();
  assert(!['group_courses','private_appointments','private_lesson_rates','product_private_tariffs','public_private_tariff_display','product_private_tariff_rules'].includes(t??''),`must not read ${t}`);
  if(u.pathname.endsWith('/rpc/public_private_tariff_projection')){
   const body=await req.json();assertEquals(body.p_season,'season');rpcProducts.push(body.p_product);
   const j=(b:unknown,status=200)=>new Response(JSON.stringify(b),{status,headers:{'Content-Type':'application/json'}});
   if(mode==='missing')return j({code:'PGRST202',message:'missing function'},404);
   if(mode==='denied')return j({code:'42501',message:'permission denied'},403);
   if(mode==='not_verified')return j({error:'not_verified'});
   if(mode==='resolver_error')return j({error:'tariff_unavailable',reason:'office_only',window:'09:00-11:00'});
   if(mode==='exception_leak')return j({...resolved,windows:[...resolved.windows,{...W('10:00','12:00',60,85,20),classification:'office_exception',window_kind:'within'}]});
   if(mode==='zero')return j({...resolved,windows:[W('09:00','10:00',60,0,20)]});
   return j(body.p_product===ids[1]?{...resolved,windows:resolved.windows.map(w=>w.start==='10:00'?{...w,amount_chf:200}:w)}:resolved);
  }
  const product={name:'Synthetic',type:'private',discipline:'ski',price:75,pricing_type:'fixed',currency:'CHF',sort_order:0};
  const rows:Record<string,unknown>={seasons:[{id:'season',start_date:'2026-12-01',end_date:'2027-04-15'}],products:[...ids.map(id=>({...product,id})),{...product,type:'group',id:'group',price:300}],product_price_tiers:[{product_id:'group',day_count:1,cumulative_price:70}],product_public_offerings:[],bc_product_tariff_sources:ids.map(product_id=>({product_id,duration_minutes:120,persons_per_lesson:1,price_chf:170}))};
  assert(t && t in rows,`Unexpected table ${t}`);return new Response(JSON.stringify(rows[t]),{headers:{'Content-Type':'application/json'}});
 };
 await import('./index.ts');assert(handler);
 assertEquals((await handler(new Request('http://localhost/catalog'))).status,401);assertEquals(calls,0);
 const request=()=>new Request('http://localhost/catalog',{headers:{'x-api-key':'synthetic-key'}});
 for(const state of ['resolved','not_verified','resolver_error','missing','exception_leak','zero']){
  mode=state;rpcProducts.length=0;const r=await handler(request());assertEquals(r.status,200,state);const {products}=await r.json();
  assert(!rpcProducts.includes('group'),'group products never projected');
  for(const p of products){assertEquals(p.online_bookable,false);
   if(p.id==='group'){assertEquals(p.price,300);assertEquals(p.price_tiers,[{day_count:1,cumulative_price:70}]);assertEquals('public_private_time_tariffs' in p,false);continue;}
   assertEquals(p.availability_policy,'private_check');
   assertEquals('public_private_time_tariffs' in p,state==='resolved',`${state} ${p.id}`);
   if(state==='resolved'){
    const tt=p.public_private_time_tariffs;assertEquals([tt.version,tt.purpose,tt.base_persons,tt.currency],[1,'display_information_only',1,'CHF']);
    assertEquals(tt.windows.map((w:{start:string;end:string})=>`${w.start}-${w.end}`),['09:00-10:00','12:00-13:00','13:00-14:00','10:00-12:00','12:00-14:00','14:00-16:00']);
    assertEquals(tt.windows.map((w:{amount_chf:number})=>w.amount_chf),p.id===ids[1]?[75,75,75,200,150,190]:[75,75,75,190,150,190]);
    assertEquals(tt.windows.map((w:{extra_person_chf:number})=>w.extra_person_chf),[20,20,20,40,40,40]);
    assertEquals(p.public_private_tariff_rules,{version:1,extra_person_basis:'per_window',discount:{percent:10,threshold:240,unit:'minutes',scope:'same_participant_same_day'},affects_operational_pricing:false});
    assert(!JSON.stringify(p).includes('revision'));
   }
  }
 }
 mode='denied';assertEquals((await handler(request())).status,503);
 }finally{globalThis.fetch=fetchBefore;Deno.serve=serveBefore;keys.forEach((k,i)=>env[i]===undefined?Deno.env.delete(k):Deno.env.set(k,env[i]??''));}
}});
