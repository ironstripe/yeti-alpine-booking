// Public intake endpoint for bookings from website/Vapi/Make
// Protected via X-API-Key header. Validates input with Zod, creates customer (dedupe by email),
// participants, ticket, ticket_items, and consent record. Tries auto-assign of an instructor.

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DateSlot = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "start_time HH:MM"),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "end_time HH:MM"),
});

const Participant = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "birth_date YYYY-MM-DD"),
  skill_level: z.string().trim().max(50).optional(),
  discipline: z.enum(["ski", "snowboard"]),
});

const Payload = z.object({
  source: z.enum(["website", "vapi"]),
  customer: z.object({
    salutation: z.string().trim().max(20).optional(),
    first_name: z.string().trim().min(1).max(100),
    last_name: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(255),
    phone: z.string().trim().min(5).max(50),
    street: z.string().trim().min(1).max(200),
    zip: z.string().trim().min(2).max(20),
    city: z.string().trim().min(1).max(100),
    country: z.string().trim().min(2).max(3),
  }),
  participants: z.array(Participant).min(1).max(20),
  booking: z.object({
    product_type: z.enum(["private", "group"]),
    sport: z.enum(["ski", "snowboard"]),
    dates: z.array(DateSlot).min(1).max(30),
    participant_count: z.number().int().min(1).max(20),
    notes: z.string().max(2000).optional(),
  }),
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

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // API key check
  const expectedKey = Deno.env.get("YETI_INTAKE_API_KEY");
  const providedKey = req.headers.get("x-api-key");
  if (!expectedKey || providedKey !== expectedKey) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const parsed = Payload.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
  }
  const data = parsed.data;

  // Block past dates
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const d of data.booking.dates) {
    if (new Date(d.date) < today) {
      return json({ error: "Validation failed", details: { dates: [`Date ${d.date} is in the past`] } }, 400);
    }
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // 1. Customer dedupe by email
    const email = data.customer.email.toLowerCase();
    const { data: existingCustomer } = await supabase
      .from("customers")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    let customerId: string;
    if (existingCustomer) {
      customerId = existingCustomer.id;
    } else {
      const { data: newCustomer, error: custErr } = await supabase
        .from("customers")
        .insert({
          first_name: data.customer.first_name,
          last_name: data.customer.last_name,
          email,
          phone: data.customer.phone,
          street: data.customer.street,
          zip: data.customer.zip,
          city: data.customer.city,
          country: data.customer.country,
          holiday_address: "",
          customer_type: "private",
        })
        .select("id")
        .single();
      if (custErr) throw new Error(`customer insert: ${custErr.message}`);
      customerId = newCustomer.id;
    }

    // 2. Participants: dedupe by name + birth_date for this customer
    const participantIds: string[] = [];
    for (const p of data.participants) {
      const { data: existing } = await supabase
        .from("customer_participants")
        .select("id")
        .eq("customer_id", customerId)
        .eq("first_name", p.first_name)
        .eq("last_name", p.last_name)
        .eq("birth_date", p.birth_date)
        .maybeSingle();
      if (existing) {
        participantIds.push(existing.id);
        continue;
      }
      const { data: newP, error: pErr } = await supabase
        .from("customer_participants")
        .insert({
          customer_id: customerId,
          first_name: p.first_name,
          last_name: p.last_name,
          birth_date: p.birth_date,
          sport: p.discipline,
          level_last_season: p.skill_level ?? null,
        })
        .select("id")
        .single();
      if (pErr) throw new Error(`participant insert: ${pErr.message}`);
      participantIds.push(newP.id);
    }

    // 3. Pick a matching product (first active product of type + matching sport hint not enforced)
    const { data: product, error: prodErr } = await supabase
      .from("products")
      .select("id, price")
      .eq("type", data.booking.product_type)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (prodErr) throw new Error(`product lookup: ${prodErr.message}`);
    if (!product) {
      return json({ error: "No active product found for type " + data.booking.product_type }, 400);
    }

    // 4. Generate ticket number
    const { data: ticketNumberData, error: tnErr } = await supabase.rpc("generate_ticket_number");
    if (tnErr) throw new Error(`ticket_number: ${tnErr.message}`);
    const ticketNumber = ticketNumberData as string;

    // 5. Create ticket
    const { data: ticket, error: tErr } = await supabase
      .from("tickets")
      .insert({
        ticket_number: ticketNumber,
        customer_id: customerId,
        status: "unconfirmed",
        notes: data.booking.notes ?? null,
        ticket_type: "standard",
        source: data.source,
      })
      .select("id, ticket_number")
      .single();
    if (tErr) throw new Error(`ticket insert: ${tErr.message}`);

    // 6. Create ticket_items (one per date × participant for private, or per date with group for group)
    const itemsToInsert: any[] = [];
    for (const slot of data.booking.dates) {
      // Try auto-assign: find an instructor with no conflicting ticket_item on this slot
      const instructorId = await tryAutoAssignInstructor(supabase, slot, data.booking.sport);

      if (data.booking.product_type === "private") {
        // One item per participant per date (typical Yeti pattern)
        for (const pid of participantIds) {
          itemsToInsert.push({
            ticket_id: ticket.id,
            product_id: product.id,
            participant_id: pid,
            instructor_id: instructorId,
            date: slot.date,
            time_start: slot.start_time,
            time_end: slot.end_time,
            unit_price: product.price,
            quantity: 1,
            item_type: "participant",
            status: "booked",
          });
        }
      } else {
        // Group booking: one item per participant, no instructor auto-assign (will be assigned via group)
        for (const pid of participantIds) {
          itemsToInsert.push({
            ticket_id: ticket.id,
            product_id: product.id,
            participant_id: pid,
            date: slot.date,
            time_start: slot.start_time,
            time_end: slot.end_time,
            unit_price: product.price,
            quantity: 1,
            item_type: "participant",
            status: "booked",
          });
        }
      }
    }

    const { error: itemsErr } = await supabase.from("ticket_items").insert(itemsToInsert);
    if (itemsErr) throw new Error(`ticket_items insert: ${itemsErr.message}`);

    // 7. Store consent
    const { error: consentErr } = await supabase.from("booking_consents").insert({
      ticket_id: ticket.id,
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
    if (consentErr) throw new Error(`consent insert: ${consentErr.message}`);

    return json({
      success: true,
      ticket_id: ticket.id,
      ticket_number: ticket.ticket_number,
      customer_id: customerId,
    }, 201);
  } catch (e) {
    console.error("intake-booking error:", e);
    return json({ error: "Internal error", message: (e as Error).message }, 500);
  }
});

async function tryAutoAssignInstructor(
  supabase: ReturnType<typeof createClient>,
  slot: { date: string; start_time: string; end_time: string },
  sport: "ski" | "snowboard",
): Promise<string | null> {
  // Find active instructors
  const { data: instructors } = await supabase
    .from("instructors")
    .select("id")
    .eq("is_active", true);
  if (!instructors || instructors.length === 0) return null;

  for (const inst of instructors) {
    // Check for conflicts on same date with overlapping time
    const { data: conflicts } = await supabase
      .from("ticket_items")
      .select("id")
      .eq("instructor_id", inst.id)
      .eq("date", slot.date)
      .neq("status", "cancelled")
      .lt("time_start", slot.end_time)
      .gt("time_end", slot.start_time);
    if (!conflicts || conflicts.length === 0) {
      return inst.id;
    }
  }
  return null;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
