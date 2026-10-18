// Staff edit/verify path only; not an operational pricing endpoint. UI intentionally deferred.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireRole } from '../_shared/staffAuth.ts';
import { publicPrivateSaveSchema } from '../_shared/publicPrivateTariffDisplay.ts';
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
Deno.serve(async req=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
  if(req.method!=='POST') return reply({error:'Method not allowed'},405);
  const auth=await requireRole(req,['office','admin','super_admin'],corsHeaders);
  if(auth instanceof Response) return auth;
  let raw:unknown;try{raw=await req.json();}catch{return reply({error:'Invalid JSON'},400);}
  const parsed=publicPrivateSaveSchema.safeParse(raw);if(!parsed.success)return reply({error:'Invalid display tariff input'},400);
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url || !key)return reply({error:'Service unavailable'},503);
  const b=parsed.data;
  const {data,error}=await createClient(url,key).rpc('save_public_private_tariff_display',{p_product_id:b.product_id,p_season_id:b.season_id,p_information:b.information,p_expected_revision:b.expected_revision,p_verify:b.verify,p_actor:auth.userId});
  return error?reply({error:error.message},error.code==='40001'?409:400):reply({information:data});
});
