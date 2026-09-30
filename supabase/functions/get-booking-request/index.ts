// Public (anon) endpoint: booking request lookup by magic token for the
// RequestConfirmation page. Returns only display fields; every failure path
// returns the same generic 404 so token existence is never disclosed.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TOKEN_RE = /^[a-f0-9]{64}$/;
const STATUSES = new Set(["pending", "processing", "confirmed", "rejected", "expired"]);

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
const notFound = () => json({ error: "not_found" }, 404);

type Participant = { firstName?: unknown; lastName?: unknown; birthDate?: unknown };
type Customer = { salutation?: unknown; lastName?: unknown };
const str = (v: unknown) => (typeof v === "string" ? v : "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let token: unknown;
  try {
    token = (await req.json())?.token;
  } catch {
    return notFound();
  }
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return notFound();

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { data, error } = await supabase
      .from("booking_requests")
      .select(
        "request_number, status, type, sport_type, requested_date, requested_time_slot, duration_hours, participant_count, participants_data, customer_data, estimated_price, voucher_code, voucher_discount, created_at, expires_at",
      )
      .eq("magic_token", token)
      .maybeSingle();

    if (error || !data) return notFound();
    if (!data.expires_at || new Date(data.expires_at).getTime() < Date.now()) return notFound();

    const participants = Array.isArray(data.participants_data) ? (data.participants_data as Participant[]) : [];
    const customer = (data.customer_data ?? {}) as Customer;

    return json(
      {
        request_number: data.request_number,
        status: STATUSES.has(data.status) ? data.status : "pending",
        type: data.type,
        sport_type: data.sport_type,
        requested_date: data.requested_date,
        requested_time_slot: data.requested_time_slot,
        duration_hours: data.duration_hours,
        participant_count: data.participant_count,
        participants: participants.map((p) => ({
          firstName: str(p.firstName),
          lastName: str(p.lastName),
          birthDate: str(p.birthDate),
        })),
        customer: { salutation: str(customer.salutation), lastName: str(customer.lastName) },
        estimated_price: data.estimated_price,
        voucher_code: data.voucher_code ?? null,
        voucher_discount: data.voucher_discount ?? null,
        created_at: data.created_at,
      },
      200,
    );
  } catch {
    return notFound();
  }
});
