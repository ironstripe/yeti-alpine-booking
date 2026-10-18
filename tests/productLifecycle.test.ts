import {test,expect,mock} from 'bun:test';
let response: {data:unknown;error:unknown}={data:{ok:true},error:null};
const calls:Record<string,unknown>[]=[];
mock.module('@/integrations/supabase/client',()=>({supabase:{functions:{invoke:async(name:string,{body}:{body:Record<string,unknown>})=>{expect(name).toBe('product-management');calls.push(body);return response;}}}}));
const {productLifecycle,productSnapshot,ProductLifecycleError}=await import('../src/lib/productLifecycle');
test('optimistic snapshot removes tiers only and preserves activation/visibility',()=>{
  expect(productSnapshot({id:'fixture',is_active:false,show_on_website:true,price:70,price_tiers:[{day_count:1,cumulative_price:70}]})).toEqual({id:'fixture',is_active:false,show_on_website:true,price:70});
});
test('referenced HTTP conflict retains dependencies for deactivate choice',async()=>{
  response={data:null,error:{context:new Response(JSON.stringify({error:'referenced',dependencies:{'group_courses.product_id':2}}),{status:409})}};
  try{await productLifecycle({action:'delete',product_id:'fixture'});throw Error('must reject');}
  catch(e){expect(e).toBeInstanceOf(ProductLifecycleError);expect((e as InstanceType<typeof ProductLifecycleError>).result.dependencies).toEqual({'group_courses.product_id':2});}
});
test('failed dependency read never falls back to direct browser delete',async()=>{
  response={data:null,error:{context:new Response('unavailable',{status:503})}};
  await expect(productLifecycle({action:'delete',product_id:'fixture'})).rejects.toThrow('nichts gelöscht');
  expect(calls.at(-1)?.action).toBe('delete');
});