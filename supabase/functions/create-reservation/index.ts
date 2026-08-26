// Public endpoint: create a provisional reservation (First come, first served).
// Validates input, then calls the atomic DB function create_provisional_reservation
// which handles customer dedupe, server-side pricing, instructor assignment and
// double-booking prevention in one transaction.

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";
import { corsHeaders, checkApiKey, json } from "../_shared/intakeAuth.ts";

const Slot = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time_start: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  time_end: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
});

const Payload = z.object({
  source: z.enum(["website", "vapi"]).default("website"),
  product_id: z.string().uuid(),
  hold_minutes: z.number().int().min(5).max(60).optional(),
  notes: z.string().max(2000).optional(),
  customer: z.object({
    first_name: z.string().trim().min(1).max(100),
    last_name: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(255),
    phone: z.string().trim().min(5).max(50),
    street: z.string().trim().min(1).max(200),
    zip: z.string().trim().min(2).max(20),
    city: z.string().trim().min(1).max(100),
    country: z.string().trim().min(2).max(3).default("CH"),
  }),
  participants: z.array(z.object({
    first_name: z.string().trim().min(1).max(100),
    last_name: z.string().trim().min(1).max(100),
    birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    discipline: z.enum(["ski", "snowboard"]),
    skill_level: z.string().trim().max(50).optional(),
  })).min(1).max(20),
  items: z.array(Slot).min(1).max(30),
  consent: z.object({
    agb_accepted: z.literal(true),
    agb_version: z.string().min(1).max(50),
    privacy_accepted: z.literal(true),
    privacy_version: z.string().min(1).max(50),
    accepted_at: z.string().datetime(),
    ip_address: z.string().max(64).optional(),
    user_agent: z.string().max(500).optional(),
  }),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authErr = checkApiKey(req);
  if (authErr) return authErr;

  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const parsed = Payload.safeParse(body);
  if (!parsed.success) return json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  const data = parsed.data;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: result, error } = await supabase.rpc("create_provisional_reservation", {
      p_payload: {
        source: data.source,
        product_id: data.product_id,
        hold_minutes: data.hold_minutes,
        notes: data.notes,
        customer: data.customer,
        participants: data.participants,
        items: data.items,
      },
    });
    if (error) throw new Error(error.message);

    if (result?.status !== "success") {
      const status = result?.code === "slot_unavailable" ? 409 : 400;
      return json({ success: false, ...result }, status);
    }

    // Store consent (non-blocking for the reservation itself)
    const { error: consentErr } = await supabase.from("booking_consents").insert({
      ticket_id: result.ticket_id,
      agb_accepted: data.consent.agb_accepted,
      agb_version: data.consent.agb_version,
      privacy_accepted: data.consent.privacy_accepted,
      privacy_version: data.consent.privacy_version,
      accepted_at: data.consent.accepted_at,
      ip_address: data.consent.ip_address ?? req.headers.get("x-forwarded-for") ?? null,
      user_agent: data.consent.user_agent ?? req.headers.get("user-agent") ?? null,
      source: data.source,
      raw_payload: data,
    });
    if (consentErr) console.error("consent insert failed:", consentErr.message);

    return json({ success: true, ...result }, 201);
  } catch (e) {
    console.error("create-reservation error:", e);
    return json({ error: "Internal error", message: (e as Error).message }, 500);
  }
});
