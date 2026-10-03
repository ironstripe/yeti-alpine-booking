// Public website API for 26/27 course bookings (#36). NOT deployed.
// Actions: options | reserve | complete | cancel. API key checked like the other intake endpoints.
// Group courses have no sales cap ("Wir buchen ohne Limite"); private lessons keep instructor locks.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, checkApiKey, json } from "../_shared/intakeAuth.ts";
import { completeBooking } from "./flow.ts";
import { resendTransport } from "../_shared/invoiceDelivery.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authErr = checkApiKey(req);
  if (authErr) return authErr;
  // deno-lint-ignore no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (body?.payment_method && body.payment_method !== "invoice") {
    return json({ success: false, code: "payment_provider_unavailable", error: "Nur Zahlung per Rechnung möglich." }, 503);
  }
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    switch (body?.action) {
      case "options": {
        const { data, error } = await sb.rpc("bc_2627_course_options", { p_from: body.from ?? null, p_to: body.to ?? null });
        return error ? json({ error: "Internal error" }, 500) : json(data);
      }
      case "reserve": {
        const { data, error } = await sb.rpc("bc_2627_reserve", { p_payload: body.reservation });
        if (error) return json({ error: "Internal error" }, 500);
        return json(data, data?.status === "success" ? 201 : data?.code === "slot_unavailable" ? 409 : 400);
      }
      case "complete": {
        const r = await completeBooking(sb, body, { transport: resendTransport });
        return json(r.body, r.status);
      }
      case "cancel": {
        const { data: t } = await sb.from("tickets").select("id, status, reservation_token").eq("id", body.ticket_id).maybeSingle();
        if (!t || t.reservation_token !== body.reservation_token) return json({ error: "Reservation not found" }, 404);
        if (t.status !== "provisional") return json({ success: false, code: "invalid_status" }, 409);
        await sb.from("tickets").update({ status: "cancelled" }).eq("id", t.id).eq("status", "provisional");
        const { data } = await sb.rpc("bc_2627_release", { p_ticket_id: t.id });
        return json(data);
      }
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    console.error("course-booking error:", (e as Error).message);
    return json({ error: "Internal error" }, 500);
  }
});
