import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { requireRole } from '../_shared/staffAuth.ts';

const patch = z.object({
  name:z.string().trim().min(1),type:z.enum(['private','group','group_toddler','group_beginner','addon','lunch']),
  description:z.string().nullable(),duration_minutes:z.number().int().nonnegative().nullable(),
  min_age:z.number().nonnegative().nullable(),max_age:z.number().nonnegative().nullable(),
  is_active:z.boolean(),is_training_product:z.boolean(),show_on_website:z.boolean(),
  discipline:z.enum(['ski','snowboard','other']).nullable(),audience:z.enum(['kids','adults','mixed']).nullable(),
  reporting_category:z.enum(['private','group','other']).nullable(),
  price:z.number().nonnegative(),pricing_type:z.enum(['flat','fixed','hourly','tiered']),
}).partial().strict();
const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('dependencies'),product_id:z.string().uuid()}).strict(),
  z.object({action:z.literal('delete'),product_id:z.string().uuid(),expected:z.record(z.unknown())}).strict(),
  z.object({action:z.literal('update'),product_id:z.string().uuid(),expected:z.record(z.unknown()),patch:patch.refine(p=>Object.keys(p).length>0)}).strict(),
]);
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  if(req.method!=='POST')return reply({error:'method_not_allowed'},405);
  const auth=await requireRole(req,['office','admin','super_admin'],corsHeaders);
  if(auth instanceof Response)return auth;
  let raw:unknown;try{raw=await req.json();}catch{return reply({error:'invalid'},400);}
  const parsed=schema.safeParse(raw);if(!parsed.success)return reply({error:'invalid'},400);
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)return reply({error:'unavailable'},503);
  const b=parsed.data;
  const {data,error}=await createClient(url,key).rpc('product_lifecycle',{
    p_product:b.product_id,p_action:b.action,p_expected:b.action==='dependencies'?null:b.expected,
    p_patch:b.action==='update'?b.patch:null,p_actor:auth.userId,
  });
  if(error)return reply({error:error.code==='PGRST202'?'not_installed':error.code==='42501'?'forbidden':'dependency_check_failed'},error.code==='42501'?403:error.code==='PGRST202'?503:400);
  if(!data)return reply({error:'dependency_check_failed'},500);
  return reply(data,data.error==='conflict'||data.error==='referenced'?409:data.error==='not_found'?404:200);
});