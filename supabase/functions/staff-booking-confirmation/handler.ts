import { z } from "https://esm.sh/zod@3.23.8";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { assertDeliverySchema, ensureDelivery, attemptDelivery, type Transport } from "../_shared/courseDelivery.ts";
// deno-lint-ignore no-explicit-any
type Client = any;
const Body = z.object({ ticket_id: z.string().uuid(), action: z.enum(["status", "process", "send"]) }).strict();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
export function createConfirmationHandler(sb: Client, deps: {
 transport: Transport; authorize: (req: Request) => Promise<{ userId: string } | Response>; now?: () => number;
}) {
 return async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, outcome: "unavailable" },405);
  const auth=await deps.authorize(req); if(auth instanceof Response) return auth;
  let raw: unknown; try {raw=await req.json();} catch {return json({success:false,outcome:"invalid"},400);}
  const parsed=Body.safeParse(raw); if(!parsed.success) return json({success:false,outcome:"invalid"},400);
  const {ticket_id:ticketId,action}=parsed.data;
  try {
   const {data:ticket,error:te}=await sb.from("tickets").select("id,customer:customers(email)").eq("id",ticketId).maybeSingle();
   if(te) throw new Error("ticket_read_failed"); if(!ticket) return json({success:false,outcome:"not_found"},404);
   const {data:intent,error:ie}=await sb.from("office_booking_confirmation_intents").select("requested").eq("ticket_id",ticketId).maybeSingle();
   if(ie) throw new Error("intent_unavailable");
   await assertDeliverySchema(sb);
   const {data:existing,error:de}=await sb.from("booking_email_deliveries").select("*").eq("ticket_id",ticketId).eq("kind","booking_confirmation").maybeSingle();
   if(de) throw new Error("delivery_read_failed");
   if(existing?.status==="sent") return json({success:true,outcome:"already_sent"});
   if(existing && existing.delivery_protocol!=="leased_v1") return json({success:false,outcome:"needs_review",code:"legacy_delivery_review"});
   const email=ticket.customer?.email?.trim();
   const validEmail=typeof email==="string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
   if(!existing&&!validEmail) return json({success:false,outcome:"no_email"});
   if(action==="status") return json({success:false,outcome:existing?.status==="sending"?"in_progress":existing?.status??(intent?.requested?"pending":"not_requested"),code:existing?.last_error_code??null});
   if(action==="process"&&intent?.requested!==true) return json({success:false,outcome:"not_requested"});
   const row=existing??await ensureDelivery(sb,ticketId,"booking_confirmation",email);
   if(!row) throw new Error("delivery_read_failed");
   if(action==="process"&&row.status!=="pending") return json({success:false,outcome:row.status==="sending"?"in_progress":row.status,code:row.last_error_code});
   const mode=row.status==="pending"?"auto":row.status==="failed"?"manual":"recover";
   const result=await attemptDelivery(sb,row.id,deps.transport,{mode,now:deps.now});
   return json({success:["sent","already_sent","reconciled_sent"].includes(result.outcome),...result});
  } catch(e) {return json({success:false,outcome:"unavailable",code:e instanceof Error?e.message:"delivery_unavailable"},503);}
 };
}
