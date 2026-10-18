import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { requireRole } from '../_shared/staffAuth.ts';

// Staff-only guarded product delete. Usage checks and the delete run in SQL `product_delete`.
const schema = z.object({ action: z.literal('delete'), product_id: z.string().uuid() }).strict();
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
  const auth = await requireRole(req, ['office', 'admin', 'super_admin'], corsHeaders);
  if (auth instanceof Response) return auth;
  let raw: unknown;
  try { raw = await req.json(); } catch { return reply({ error: 'invalid' }, 400); }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return reply({ error: 'invalid' }, 400);
  const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return reply({ error: 'unavailable' }, 503);
  const { data, error } = await createClient(url, key).rpc('product_delete', {
    p_product: parsed.data.product_id, p_actor: auth.userId,
  });
  if (error) {
    if (error.code === 'PGRST202') return reply({ error: 'not_installed' }, 503);
    if (error.code === '42501') return reply({ error: 'forbidden' }, 403);
    // FK violation = concurrent usage appeared; FK stays final protection.
    if (error.code === '23503') return reply({ error: 'referenced', dependencies: {} }, 409);
    return reply({ error: 'delete_failed' }, 400);
  }
  if (!data) return reply({ error: 'delete_failed' }, 500);
  return reply(data, data.error === 'referenced' ? 409 : data.error === 'not_found' ? 404 : 200);
});
