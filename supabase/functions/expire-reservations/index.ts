// Cron target: expire provisional reservations whose hold time has elapsed.
// Called every minute via pg_cron (uses the anon key, so no API-key check here —
// it only runs the idempotent expire_reservations() function).

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/intakeAuth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data, error } = await supabase.rpc("expire_reservations");
    if (error) throw new Error(error.message);
    return json({ success: true, expired: data });
  } catch (e) {
    console.error("expire-reservations error:", e);
    return json({ error: "Internal error", message: (e as Error).message }, 500);
  }
});
