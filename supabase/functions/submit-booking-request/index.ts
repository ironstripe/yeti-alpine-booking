// Public (anon) endpoint: creates a website booking request server-side and
// sends the editable "booking.request.received" acknowledgement exactly once.
// Response contains only { requestNumber, magicToken } — never PII.
// Idempotent via client-generated submissionKey: retries return the same
// request and never trigger a second email.

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

const s = (max: number) => z.string().trim().max(max);
const Participant = z
  .object({
    firstName: s(100).optional(),
    lastName: s(100).optional(),
    birthDate: s(20).optional(),
  })
  .passthrough()
  .refine((p) => JSON.stringify(p).length <= 2000, "participant too large");

const Body = z.object({
  submissionKey: z.string().uuid(),
  type: z.enum(["private", "group"]),
  sport: z.enum(["ski", "snowboard"]),
  requestedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  requestedTimeSlot: z.enum(["morning", "afternoon", "flexible"]),
  durationHours: z.number().positive().max(24).optional(),
  participantCount: z.number().int().min(1).max(50),
  participants: z.array(Participant).max(50),
  customer: z.object({
    salutation: s(30).optional(),
    firstName: s(100).min(1),
    lastName: s(100).min(1),
    email: z.string().trim().email().max(255),
    phone: s(40).min(1),
    accommodation: s(200).optional(),
  }),
  voucherCode: s(50).optional(),
  voucherDiscount: z.number().min(0).max(100000).optional(),
  estimatedPrice: z.number().min(0).max(1000000).optional(),
  notes: s(4000).optional(),
  productId: z.string().uuid().optional(),
});

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
const fill = (tpl: string, vars: Record<string, string>, html: boolean) =>
  Object.entries(vars).reduce(
    (t, [k, v]) => t.replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g"), html ? esc(v) : v),
    tpl,
  );

// deno-lint-ignore no-explicit-any
async function sendAcknowledgement(supabase: any, row: any) {
  // Atomic claim: only one caller can flip acknowledgement_sent_at from NULL.
  const { data: claimed } = await supabase
    .from("booking_requests")
    .update({ acknowledgement_sent_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("acknowledgement_sent_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return;

  const release = () =>
    supabase.from("booking_requests").update({ acknowledgement_sent_at: null }).eq("id", row.id);

  try {
    const { data: template } = await supabase
      .from("email_templates")
      .select("id, subject, body_html, body_text")
      .eq("trigger", "booking.request.received")
      .eq("is_active", true)
      .maybeSingle();
    if (!template) {
      console.log("ack: no active template");
      return; // keep claim: nothing to send, don't retry
    }

    const c = row.customer_data ?? {};
    const [y, m, d] = String(row.requested_date).split("-");
    const sport = row.sport_type === "ski" ? "Ski" : "Snowboard";
    const vars = {
      customer_name: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim(),
      request_number: row.request_number,
      requested_date: `${d}.${m}.${y}`,
      product_name: row.type === "private" ? `Privatstunde ${sport}` : `Gruppenkurs ${sport}`,
    };
    const subject = fill(template.subject, vars, false).replace(/[\r\n]+/g, " ");
    const body = fill(template.body_html, vars, true);
    const text = template.body_text ? fill(template.body_text, vars, false) : undefined;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px}h1{color:#1e3a5f}.header{text-align:center;padding:20px 0;border-bottom:2px solid #1e3a5f;margin-bottom:20px}.footer{margin-top:30px;padding-top:20px;border-top:1px solid #eee;font-size:12px;color:#666;text-align:center}</style></head><body><div class="header"><h2>⛷️ Schneesportschule Malbun</h2></div>${body}<div class="footer"><p>Schneesportschule Malbun · Talstation Malbun · +423 123 45 67</p><p>info@schneesportschule-malbun.li · www.schneesportschule-malbun.li</p></div></body></html>`;

    const { data: log } = await supabase
      .from("email_logs")
      .insert({
        template_id: template.id,
        recipient_email: c.email,
        recipient_name: vars.customer_name,
        subject,
        status: "queued",
        metadata: { ...vars, booking_request_id: row.id },
      })
      .select("id")
      .single();

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
        "Idempotency-Key": `booking-request-ack-${row.id}`,
      },
      body: JSON.stringify({
        from: "Schneesportschule Malbun <info@schneesportschule-malbun.li>",
        to: [c.email],
        subject,
        html,
        text,
      }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("ack: provider error", res.status);
      if (log?.id) await supabase.from("email_logs").update({ status: "failed", error_message: String(out?.message ?? res.status) }).eq("id", log.id);
      await release();
      return;
    }
    if (log?.id) {
      await supabase
        .from("email_logs")
        .update({ status: "sent", sent_at: new Date().toISOString(), provider_message_id: out.id })
        .eq("id", log.id);
    }
  } catch (e) {
    console.error("ack: failed", e instanceof Error ? e.message : e);
    await release();
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "invalid_body" }, 400);
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return json({ error: "invalid_input" }, 400);
  const b = parsed.data;

  const today = new Date().toISOString().slice(0, 10);
  if (b.requestedDate < today) return json({ error: "invalid_input" }, 400);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const cols = "id, request_number, magic_token, type, sport_type, requested_date, customer_data, acknowledgement_sent_at";

  let { data: row } = await supabase
    .from("booking_requests")
    .select(cols)
    .eq("submission_key", b.submissionKey)
    .maybeSingle();

  if (!row) {
    const { data, error } = await supabase
      .from("booking_requests")
      .insert({
        request_number: `ANF-TEMP-${crypto.randomUUID()}`, // replaced by trigger
        submission_key: b.submissionKey,
        type: b.type,
        sport_type: b.sport,
        requested_date: b.requestedDate,
        requested_time_slot: b.requestedTimeSlot,
        duration_hours: b.durationHours ?? null,
        participant_count: b.participantCount,
        participants_data: b.participants,
        customer_data: b.customer,
        voucher_code: b.voucherCode || null,
        voucher_discount: b.voucherDiscount ?? null,
        estimated_price: b.estimatedPrice ?? null,
        notes: b.notes || null,
        product_id: b.productId ?? null,
        source: "website",
      })
      .select(cols)
      .single();

    if (error) {
      if (error.code === "23505") {
        // concurrent retry with same key won the race
        ({ data: row } = await supabase.from("booking_requests").select(cols).eq("submission_key", b.submissionKey).maybeSingle());
      } else {
        console.error("insert failed", error.code);
        return json({ error: "server_error" }, 500);
      }
    } else {
      row = data;
    }
  }
  if (!row) return json({ error: "server_error" }, 500);

  if (!row.acknowledgement_sent_at) await sendAcknowledgement(supabase, row);

  return json({ requestNumber: row.request_number, magicToken: row.magic_token }, 200);
});
