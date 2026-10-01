// Staff manual portrait upload: re-encoded without metadata, stored PRIVATELY with manual_upload provenance.
// A manual photo becomes current and always wins over later Booking-Corner reimports.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireRole } from "../_shared/staffAuth.ts";
import { sha256Hex } from "../_shared/bcImport/parse.ts";
import { makeRendition } from "../_shared/bcImport/image.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const auth = await requireRole(req, ["admin", "office", "super_admin"], cors);
  if (auth instanceof Response) return auth;

  let form: FormData;
  try { form = await req.formData(); } catch { return json({ error: "invalid_form" }, 400); }
  const id = String(form.get("instructor_id") ?? "");
  const f = form.get("file");
  if (!UUID.test(id)) return json({ error: "instructor_id_invalid" }, 400);
  if (!(f instanceof File) || f.size === 0 || f.size > 5 * 1024 * 1024) return json({ error: "file_invalid" }, 400);
  const bytes = new Uint8Array(await f.arrayBuffer());
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) return json({ error: "jpeg_required" }, 400);

  let r;
  try { r = makeRendition(bytes); } catch { return json({ error: "image_unreadable" }, 422); }
  const sha = await sha256Hex(r.bytes);
  const path = `${id}/manual-${sha}.jpg`;
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const up = await sb.storage.from("instructor-hr-photos").upload(path, r.bytes, { upsert: true, contentType: "image/jpeg" });
  if (up.error) { console.error("manual_photo_upload_failed"); return json({ error: "upload_failed" }, 500); }
  const { error } = await sb.rpc("bc_register_manual_photo", { p_instructor: id, p_path: path, p_width: r.width, p_height: r.height });
  if (error) { console.error("manual_photo_register_failed"); return json({ error: "register_failed" }, 500); }
  return json({ ok: true, path, width: r.width, height: r.height });
});
