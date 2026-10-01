// Explicit, single-instructor website release. Import/manual photos remain private
// until staff confirms the exact portrait and teaser in the YETI editor.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireRole } from "../_shared/staffAuth.ts";
import { makeRendition } from "../_shared/bcImport/image.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASHED_JPEG = /\/(?:import|manual)-[0-9a-f]{64}\.jpg$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const auth = await requireRole(req, ["admin", "office", "super_admin"], cors);
  if (auth instanceof Response) return auth;

  let input: Record<string, unknown>;
  try { input = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const id = input?.instructor_id;
  const enabled = input?.show_on_website;
  const teaser = typeof input?.website_teaser === "string" ? input.website_teaser.trim() : "";
  const photoId = input?.source_photo_id;
  if (typeof id !== "string" || !UUID.test(id) || typeof enabled !== "boolean" ||
      (photoId !== undefined && (typeof photoId !== "string" || !UUID.test(photoId)))) {
    return json({ error: "invalid_request" }, 400);
  }
  if (enabled && (!teaser || teaser.length > 280)) return json({ error: "teaser_required" }, 422);
  if (!enabled && photoId !== undefined) return json({ error: "photo_not_allowed_for_unpublish" }, 400);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: current, error: readError } = await sb.from("instructors")
    .select("id, status, avatar_url").eq("id", id).maybeSingle();
  if (readError) return json({ error: "read_failed" }, 500);
  if (!current) return json({ error: "not_found" }, 404);

  if (!enabled) {
    const { error } = await sb.from("instructors").update({ show_on_website: false }).eq("id", id);
    if (error) return json({ error: "unpublish_failed" }, 500);
    return json({ ok: true, published: false });
  }
  if (current.status !== "active") return json({ error: "inactive_profile" }, 409);

  let publicUrl = current.avatar_url?.trim() || "";
  if (photoId) {
    // Lock the released image to the CURRENT selected portrait; a newer manual
    // replacement invalidates an earlier confirmation instead of publishing it.
    const { data: photo, error: photoError } = await sb.from("instructor_photos")
      .select("id, storage_path, origin").eq("id", photoId)
      .eq("instructor_id", id).eq("is_current", true).maybeSingle();
    if (photoError) return json({ error: "photo_lookup_failed" }, 500);
    if (!photo || !["booking_import", "manual_upload"].includes(photo.origin) ||
        !photo.storage_path.startsWith(`${id}/`) || !HASHED_JPEG.test(photo.storage_path)) {
      return json({ error: "photo_changed" }, 409);
    }

    const { data: blob, error: downloadError } = await sb.storage
      .from("instructor-hr-photos").download(photo.storage_path);
    if (downloadError || !blob || blob.size > 10 * 1024 * 1024) {
      return json({ error: "private_photo_unavailable" }, 409);
    }
    let rendition;
    try { rendition = makeRendition(new Uint8Array(await blob.arrayBuffer())); }
    catch { return json({ error: "photo_unreadable" }, 422); }

    const digestInput = new Uint8Array(rendition.bytes.byteLength);
    digestInput.set(rendition.bytes);
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", digestInput)))
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    const path = `${id}/website-${digest}.jpg`;
    const { error: uploadError } = await sb.storage.from("instructor-avatars")
      .upload(path, rendition.bytes, { upsert: true, contentType: "image/jpeg", cacheControl: "300" });
    if (uploadError) return json({ error: "public_photo_upload_failed" }, 500);
    publicUrl = sb.storage.from("instructor-avatars").getPublicUrl(path).data.publicUrl;
    if (!publicUrl) return json({ error: "public_url_failed" }, 500);

    const { data: stillCurrent } = await sb.from("instructor_photos").select("id")
      .eq("id", photoId).eq("instructor_id", id).eq("is_current", true).maybeSingle();
    if (!stillCurrent) return json({ error: "photo_changed" }, 409);
  }
  if (!publicUrl) return json({ error: "public_photo_required" }, 422);

  // Only the three public-profile fields change. Never write payroll, contact,
  // Booking source links, the private photo row or unrelated instructor fields.
  const { data: saved, error: saveError } = await sb.from("instructors")
    .update({ avatar_url: publicUrl, website_teaser: teaser, show_on_website: true })
    .eq("id", id).eq("status", "active").select("id").maybeSingle();
  if (saveError || !saved) return json({ error: "publish_failed" }, 409);
  return json({ ok: true, published: true, avatar_url: publicUrl });
});
