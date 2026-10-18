// Offline handler execution; synthetic catalog only, every network call intercepted.
import { assertEquals, assert } from 'jsr:@std/assert@1';
Deno.test({name:'optional product offering, ordered dates, exact single tiers, old fields and gates',
  // Existing handler creates an auth SDK refresh interval without exposing the client.
  // It is unrelated to catalog requests; all fetches remain restricted to localhost mocks.
  sanitizeOps:false, fn:async () => {
  const originalFetch=globalThis.fetch;
  const originalServe=Deno.serve;
  const oldEnv=new Map(['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','YETI_INTAKE_API_KEY'].map(k=>[k,Deno.env.get(k)]));
  let handler: ((request:Request)=>Promise<Response>) | undefined;
  const queried:string[]=[];
  const dates=['2027-01-30','2027-01-02','2027-01-09','2027-01-16','2027-01-23'];
  try {
    Deno.env.set('SUPABASE_URL','http://localhost:54321');Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','synthetic-only');Deno.env.set('YETI_INTAKE_API_KEY','synthetic-test-key');
    Deno.serve=((fn:unknown)=>{handler=fn as typeof handler;return {} as Deno.HttpServer;}) as typeof Deno.serve;
    globalThis.fetch=(input)=>{
      const url=new URL(input instanceof Request?input.url:String(input));
      assertEquals(url.origin,'http://localhost:54321');
      const table=url.pathname.split('/').pop() ?? '';queried.push(table);
      const product={name:'Synthetic',type:'group',discipline:'ski',audience:'kids',price:100,pricing_type:'tiered',duration_minutes:240,min_age:5,max_age:16,currency:'CHF',sort_order:0,is_active:false};
      const rows:Record<string,unknown>={seasons:[{id:'s',name:'Winter',start_date:'2026-12-01',end_date:'2027-04-15'}],products:[{...product,id:'p'},{...product,id:'legacy'}],product_price_tiers:[{product_id:'p',day_count:5,cumulative_price:320}],product_public_offerings:[{product_id:'p',schedule_kind:'explicit_dates',weekdays:[],dates,time_blocks:[{start:'10:00',end:'12:00'},{start:'14:00',end:'16:00'}]}]};
      assert(table in rows,`Unexpected query ${table}`);
      return Promise.resolve(new Response(JSON.stringify(rows[table]),{headers:{'Content-Type':'application/json'}}));
    };
    await import('./index.ts');assert(handler);
    assertEquals((await handler(new Request('http://localhost/catalog'))).status,401);
    const response=await handler(new Request('http://localhost/catalog',{headers:{'x-api-key':'synthetic-test-key'}}));assertEquals(response.status,200);
    const body=await response.json();const p=body.products.find((p:{id:string})=>p.id==='p');
    assertEquals(p.public_offering.dates,dates);assertEquals(p.public_offering.time_blocks.length,2);
    assertEquals(p.price,100);assertEquals(p.price_tiers,[{day_count:5,cumulative_price:320}]);assertEquals(p.online_bookable,false);
    assertEquals(body.products.find((p:{id:string})=>p.id==='legacy').public_offering,null);
    for(const key of ['id','name','title','subtitle','type','discipline','audience','icon_key','badge','requirement','meta','notes','pricing_type','availability_policy','price','price_tiers','private_rates','duration_minutes','min_age','max_age','currency','sort_order','online_bookable'])assert(key in p,key);
    assert(!('description' in p));assert(!queried.some(t=>['group_courses','group_course_instances','instructors'].includes(t)));
  } finally {globalThis.fetch=originalFetch;Deno.serve=originalServe;for(const [k,v] of oldEnv){if(v===undefined)Deno.env.delete(k);else Deno.env.set(k,v);}}
});
