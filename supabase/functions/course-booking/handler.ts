// Request handler for the public 26/27 course-booking API (#36), separated from
// Deno.serve so tests drive the exact production code path. NOT deployed.
import { checkApiKey, corsHeaders, json } from "../_shared/intakeAuth.ts";
import { err } from "../_shared/courseBookingContract.ts";
import { cancel, complete, options, reserve, type Deps } from "./flow.ts";

// deno-lint-ignore no-explicit-any
type Client = any;

export function createHandler(sb: Client, deps: Deps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json(err("method_not_allowed", "Nur POST"), 405);
    const authErr = checkApiKey(req);
    if (authErr) return authErr;
    // deno-lint-ignore no-explicit-any
    let body: any;
    try { body = await req.json(); } catch { return json(err("invalid_json", "Ungültiges JSON"), 400); }
    if (body?.payment_method !== undefined && body.payment_method !== "invoice") {
      return json(err("payment_provider_unavailable", "Nur Zahlung per Rechnung möglich."), 503);
    }
    try {
      const r = body?.action === "options" ? await options(sb, body)
        : body?.action === "reserve" ? await reserve(sb, body)
        : body?.action === "complete" ? await complete(sb, body, deps)
        : body?.action === "cancel" ? await cancel(sb, body)
        : { status: 400, body: err("unknown_action", "Unbekannte Aktion") };
      return json(r.body, r.status);
    } catch (e) {
      console.error("course-booking error:", (e as Error).message);
      // Unknown outcome: the client repeats the identical request (idempotent).
      return json(err("internal", "Interner Fehler; bitte dieselbe Anfrage wiederholen", true), 500);
    }
  };
}
