// Staff-only (office/admin) course archive / restore / guarded delete.
// Every write is one transaction in a service_role-only course_* SQL function
// (supabase/pending/course_archive_delete.sql). No raw DELETE on group_courses.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireRole } from "../_shared/staffAuth.ts";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(["capabilities", "dependencies", "archive", "restore", "delete"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = await requireRole(req, ["office", "admin"], corsHeaders);
  if (auth instanceof Response) return auth;

  let body: { action?: string; course_id?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid" }, 400); }
  const action = body.action ?? "";
  if (!ACTIONS.has(action)) return json({ error: "invalid", field: "action" }, 400);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (action === "capabilities") {
    // Verifies the schema is installed (column + function) before the UI enables actions.
    const probe = await db.from("group_courses").select("archived_at").limit(1);
    if (probe.error) return json({ installed: false }, 200);
    const fn = await db.rpc("course_dependencies", { p_course: "00000000-0000-0000-0000-000000000000" });
    return json({ installed: !fn.error }, 200);
  }

  if (!body.course_id || !UUID.test(body.course_id)) return json({ error: "invalid", field: "course_id" }, 400);
  const id = body.course_id;

  const rpc = action === "dependencies"
    ? await db.rpc("course_dependencies", { p_course: id })
    : action === "delete"
    ? await db.rpc("course_delete_if_unused", { p_course: id, p_actor: auth.userId })
    : await db.rpc("course_set_archived", { p_course: id, p_archive: action === "archive", p_actor: auth.userId });

  if (rpc.error || rpc.data == null) {
    console.error("course-management rpc failed", action, rpc.error?.code);
    return json({ error: rpc.error?.code === "PGRST202" ? "not_installed" : "internal_error" }, rpc.error?.code === "PGRST202" ? 503 : 500);
  }
  const result = rpc.data as Record<string, unknown>;
  if (action === "dependencies") return json({ dependencies: result }, 200);
  const status = result.error === "not_found" ? 404 : result.error === "referenced" ? 409 : 200;
  return json(result, status);
});
