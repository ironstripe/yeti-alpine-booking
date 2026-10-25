// Staff-only (office/admin) 26/27 group-course booking.
// All checks, pricing and writes happen in service_role-only SQL
// (migrations 0003-0006): options (read-only) and one atomic, idempotent booking transaction that
// also records the office settlement/notes. No invoice, e-mail or online charge here.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { checkSaturdaySelection } from "../_shared/saturdaySelection.ts";
import { requireRole } from "../_shared/staffAuth.ts";
import { birthDateIssue } from "../_shared/birthDate.ts";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MISSING = new Set(["42703", "PGRST204", "PGRST202", "42883", "42P01", "PGRST205"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = await requireRole(req, ["office", "admin"], corsHeaders);
  if (auth instanceof Response) return auth;

  let body: { action?: string; dates?: unknown; sport?: unknown; booking?: unknown };
  try { body = await req.json(); } catch { return json({ error: "invalid" }, 400); }
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (body.action === "capabilities" || body.action === "options") {
    const dates = body.action === "capabilities" ? ["2026-12-14"] : body.dates;
    const sport = body.action === "capabilities" ? "ski" : body.sport;
    if (!Array.isArray(dates) || dates.length === 0 || dates.length > 10 || !dates.every((d) => typeof d === "string" && DATE.test(d))) {
      return json({ error: "invalid", field: "dates" }, 400);
    }
    if (sport !== "ski" && sport !== "snowboard") return json({ error: "invalid", field: "sport" }, 400);
    const rpc = await db.rpc("bc_2627_staff_group_options", { p_dates: dates, p_sport: sport });
    if (rpc.error) {
      if (MISSING.has(rpc.error.code ?? "")) return json({ installed: false }, 200);
      console.error("staff-group-booking options failed", rpc.error.code);
      return json({ error: "internal_error" }, 500);
    }
    if (body.action === "capabilities") return json({ installed: true }, 200);
    try {
      const options = [];
      for (const option of rpc.data ?? []) {
        if (!await checkSaturdaySelection(db, option.course_id, option.product_id, dates as string[])) options.push(option);
      }
      return json({ installed: true, options }, 200);
    } catch { return json({ error: "internal_error" }, 500); }
  }

  if (body.action === "create") {
    if (!body.booking || typeof body.booking !== "object") return json({ error: "invalid", field: "booking" }, 400);
    const booking = { ...(body.booking as Record<string, unknown>) };
    if (!Array.isArray(booking.lines)) return json({ error: "invalid", field: "lines" }, 400);
    // B08: new people need a real birth date not after the school date; rejected before any write.
    for (const [index, line] of booking.lines.entries()) {
      const guest = line && typeof line === "object" ? (line as { guest?: { birth_date?: unknown } }).guest : undefined;
      if (guest && typeof guest === "object" && birthDateIssue(guest.birth_date) !== null) {
        return json({ error: "invalid", field: "birth_date", line: String(index) }, 400);
      }
    }
    try {
      for (const [index, line] of booking.lines.entries()) {
        if (!line || typeof line.course_id !== 'string' || typeof line.product_id !== 'string'
          || !Array.isArray(line.dates) || !line.dates.every((date: unknown) => typeof date === 'string' && DATE.test(date))) return json({ error: "invalid", field: "line_shape" }, 400);
        const message = await checkSaturdaySelection(db, line.course_id, line.product_id, line.dates);
        if (message) return json({ error: "invalid", field: "dates", line: String(index), message }, 422);
      }
    } catch { return json({ error: "internal_error" }, 500); }
    const f = booking.finalization;
    if (f !== undefined) {
      if (!f || typeof f !== "object" || Array.isArray(f)) return json({ error: "invalid", field: "finalization" }, 400);
      // Actor identity comes only from the verified caller, never from the browser.
      booking.finalization = { ...(f as Record<string, unknown>), actor_name: auth.email?.split("@")[0] || "System", actor_email: auth.email };
    }
    if (booking.confirmation_requested !== undefined && typeof booking.confirmation_requested !== "boolean") return json({ error: "invalid", field: "confirmation_requested" }, 400);
    const rpc = booking.confirmation_requested === undefined
      ? await db.rpc("bc_2627_staff_group_book", { p: booking, p_actor: auth.userId })
      : await db.rpc("b05_office_create", { p: booking, p_actor: auth.userId, p_kind: "group" });
    if (rpc.error?.code === "22008") return json({ error: "invalid", field: "birth_date" }, 400);
    if (rpc.error || rpc.data == null) {
      if (MISSING.has(rpc.error?.code ?? "")) return json({ error: "not_installed" }, 503);
      console.error("staff-group-booking create failed", rpc.error?.code);
      return json({ error: "internal_error" }, 500);
    }
    const result = rpc.data as Record<string, unknown>;
    if (result.error) return json(result, result.error === "not_found" ? 404 : 422);
    return json(result, 200);
  }

  return json({ error: "invalid", field: "action" }, 400);
});
