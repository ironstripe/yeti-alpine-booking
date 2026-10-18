import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { requireRole } from '../_shared/staffAuth.ts';
import { validateOffering, normalizeScheduleText, validateScheduleText } from '../_shared/productOffering.ts';
const schema = z.object({ product_id: z.string().uuid(), offering: z.object({
  schedule_kind: z.enum(['weekly','explicit_dates','flexible_private']),
  weekdays: z.array(z.number().int().min(1).max(7)).max(7),
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(366),
  time_blocks: z.array(z.object({ start: z.string(), end: z.string() }).strict()).max(2),
  series: z.array(z.object({sequence:z.number().int().min(1),label:z.string().nullable().optional().refine(text=>validateScheduleText(text)===null).transform(normalizeScheduleText),start_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),end_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),max_selected_days:z.number().int().min(1).max(366)}).strict()).max(24).optional(),
  display_schedule_text: z.string().nullable().optional().refine(text=>validateScheduleText(text) === null).transform(normalizeScheduleText),
}).strict().nullable() }).strict();
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), {status, headers:{...corsHeaders,'Content-Type':'application/json'}});
Deno.serve(async req => {
  if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
  if(req.method!=='POST') return reply({error:'Method not allowed'},405);
  const auth=await requireRole(req,['office','admin','super_admin'],corsHeaders);
  if(auth instanceof Response) return auth;
  let raw: unknown; try { raw=await req.json(); } catch { return reply({error:'Invalid JSON'},400); }
  const body=schema.safeParse(raw); if(!body.success) return reply({error:'Invalid offering input'},400);
  const url=Deno.env.get('SUPABASE_URL'), key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url || !key) return reply({error:'Service unavailable'},503);
  const db=createClient(url,key);
  const {data:p,error:pe}=await db.from('products').select('type,duration_minutes,season_id').eq('id',body.data.product_id).single();
  if(pe || !p) return reply({error:'Product not found'},400);
  let season=null;
  if(p.season_id) { const {data:s,error}=await db.from('seasons').select('start_date,end_date').eq('id',p.season_id).single(); if(error) return reply({error:'Season unavailable'},400); season=s; }
  if(body.data.offering) { const error=validateOffering(body.data.offering,{...p,season}); if(error) return reply({error},400); }
  const {data,error}=await db.rpc('save_product_public_offering',{p_product_id:body.data.product_id,p_offering:body.data.offering,p_actor:auth.userId});
  return error ? reply({error:error.message},400) : reply({offering:data});
});
