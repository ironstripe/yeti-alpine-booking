// Staff-only: short-lived signed URL for an instructor's CURRENT private portrait (manual or import).
// Signed URLs are never stored. Falls back to the existing public avatar_url if no private photo exists.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireRole } from "../_shared/staffAuth.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const TTL = 300;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const auth = await requireRole(req, ["admin", "office", "super_admin"], cors);
  if (auth instanceof Response) return auth;
  let id = "";
  try { id = String((await req.json())?.instructor_id ?? ""); } catch { return json({ error: "invalid_json" }, 400); }
  if (!UUID.test(id)) return json({ error: "instructor_id_invalid" }, 400);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: ph } = await sb.from("instructor_photos").select("id, storage_path, origin")
    .eq("instructor_id", id).eq("is_current", true).maybeSingle();
  if (ph?.storage_path) {
    const { data, error } = await sb.storage.from("instructor-hr-photos").createSignedUrl(ph.storage_path, TTL);
    if (!error && data?.signedUrl) return json({ ok: true, url: data.signedUrl, photo_id: ph.id, origin: ph.origin, private: true, expires_in: TTL });
  }
  const { data: ins } = await sb.from("instructors").select("avatar_url").eq("id", id).maybeSingle();
  return json({ ok: true, url: ins?.avatar_url ?? null, origin: ins?.avatar_url ? "legacy_public" : null, private: false });
});
