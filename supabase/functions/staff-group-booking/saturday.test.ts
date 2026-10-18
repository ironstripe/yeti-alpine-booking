import { assertEquals, assert } from 'jsr:@std/assert@1';
import { reserve } from '../course-booking/flow.ts';
Deno.test({name:'Saturday HTTP paths: staff options/create and website reserve reject invalid selections before writes',sanitizeOps:false,sanitizeResources:false,fn:async()=> {
  const originalFetch=globalThis.fetch, originalServe=Deno.serve;
  const keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'], previous=keys.map(k=>Deno.env.get(k));
  const product='00000000-0000-4000-8000-000000000001', course='00000000-0000-4000-8000-000000000002', actor='00000000-0000-4000-8000-000000000003';
  const dates=['2027-01-09','2027-01-16','2027-01-23','2027-01-30','2027-02-06'];
  let handler:((r:Request)=>Promise<Response>)|undefined, writes=0, unavailable=false, level='ski_windel_wedel', role='admin';
  const option={course_id:course,product_id:product,unit_price:140,blocks:dates.slice(0,3).map(date=>({date,time_start:'10:00',time_end:'12:00'}))};
  try {
    Deno.env.set(keys[0],'http://localhost:54321'); Deno.env.set(keys[1],'synthetic');
    Deno.serve=((f:unknown)=>{handler=f as typeof handler;return {} as Deno.HttpServer;}) as typeof Deno.serve;
    globalThis.fetch=async(input:string|URL|Request,init?:RequestInit)=> {
      const url=new URL(input instanceof Request?input.url:String(input));assertEquals(url.origin,'http://localhost:54321');
      let data:unknown;
      if(url.pathname==='/auth/v1/user') data={id:actor,email:'test@example.invalid'};
      else if(url.pathname==='/rest/v1/user_roles') data=role==='teacher'?[]:[{role}];
      else if(url.pathname==='/rest/v1/group_courses') data={course_type:'saturday_course',skill_level_id:level};
      else if(url.pathname==='/rest/v1/products') data={type:level==='ski_windel_wedel'?'group_toddler':'group'};
      else if(url.pathname==='/rest/v1/bc_product_tariff_sources') data=[{source_family:'Samstagkurs'}];
      else if(url.pathname==='/rest/v1/bc_2627_course_period_sources') data=[{source_key:'series-1',course_id:course,teaching_dates:dates,eligible_variants:{[product]:[1,2,3,4,5]}}];
      else if(url.pathname==='/rest/v1/rpc/bc_2627_staff_group_options') data=[option];
      else if(url.pathname==='/rest/v1/rpc/bc_2627_staff_group_book') {
        writes++;const raw=input instanceof Request?await input.text():String(init?.body);const sent=JSON.parse(raw);
        assertEquals(sent.p.lines[0].expected_unit_price,140);assertEquals(sent.p.lines[0].dates,[dates[0],dates[3],dates[4]]);assertEquals(sent.p_actor,actor);
        data={ok:true,ticket_id:course,total:140};
      } else throw new Error('Unexpected endpoint '+url.pathname);
      if(unavailable && url.pathname==='/rest/v1/group_courses') return new Response(JSON.stringify({message:'unavailable',code:'42P01'}),{status:500,headers:{'Content-Type':'application/json'}});
      return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
    };
    await import('./index.ts');assert(handler);
    const request=(body:unknown,auth=true)=>new Request('http://localhost/',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer synthetic'}:{})},body:JSON.stringify(body)});
    const create=(selected:string[])=>({action:'create',booking:{lines:[{course_id:course,product_id:product,dates:selected,expected_unit_price:140}]}});
    assertEquals((await handler(request(create(dates),false))).status,401);
    role='teacher';assertEquals((await handler(request(create(dates)))).status,403);role='admin';
    for(const selected of [[dates[1]],dates.slice(0,4)]) assertEquals((await handler(request(create(selected)))).status,422);
    assertEquals(writes,0);
    let r=await handler(request({action:'options',sport:'ski',dates:[dates[1]]}));assertEquals((await r.json()).options,[]);
    r=await handler(request({action:'options',sport:'ski',dates:dates.slice(0,3)}));assertEquals((await r.json()).options,[option]);
    assertEquals((await handler(request(create([dates[0],dates[3],dates[4]])))).status,200);assertEquals(writes,1);
    unavailable=true;assertEquals((await handler(request(create([dates[0]])))).status,500);assertEquals(writes,1);unavailable=false;
    // Website path uses the same server-read facts and forwards unchanged valid payloads.
    const client={from(table:string){const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:table==='group_courses'?{course_type:'saturday_course',skill_level_id:level}:table==='products'?{type:'group_toddler'}:{course_id:course},error:null}),then(resolve:(v:unknown)=>unknown){return Promise.resolve({data:table==='bc_product_tariff_sources'?[{source_family:'Samstagkurs'}]:[{source_key:'series-1',teaching_dates:dates,eligible_variants:{[product]:[1,2,3]}}],error:null}).then(resolve)}};return q},rpc(name:string,args:Record<string,unknown>){assertEquals(name,'bc_2627_reserve');writes++;return Promise.resolve({data:{status:'success',total_amount:140,quote:args.p_payload},error:null})}};
    const reservation=(selected:string[])=>({idempotency_key:'test-saturday-key',selections:[{kind:'group',period_key:'series-1',product_id:product,dates:selected}]});
    assertEquals((await reserve(client,{reservation:reservation([dates[1]])})).status,400);assertEquals(writes,1);
    const valid=reservation([dates[0],dates[3],dates[4]]);const result=await reserve(client,{reservation:valid});assertEquals(result.status,201);assertEquals(result.body.quote,valid);assertEquals(writes,2);
  } finally {
    globalThis.fetch=originalFetch;Deno.serve=originalServe;
    keys.forEach((k,i)=>previous[i]===undefined?Deno.env.delete(k):Deno.env.set(k,previous[i]??''));
  }
}});