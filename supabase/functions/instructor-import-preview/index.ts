// Super-admin-only DRY-RUN preview for the Booking-Corner instructor import.
// Writes only an import run + private staging rows. Does NOT create/modify instructors,
// does NOT upload photos, does NOT create absences. No PII in logs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireRole } from "../_shared/staffAuth.ts";
import { parseImport, sha256Hex, LIMITS } from "./parse.ts";
import { classify } from "./match.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SOURCE_SYSTEM = "booking_corner";
const ROLLOUT = "yeti_2026_27";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = await requireRole(req, ["super_admin"], cors);
  if (auth instanceof Response) return auth;

  let form: FormData;
  try { form = await req.formData(); } catch { return json({ error: "invalid_form" }, 400); }
  const xf = form.get("xlsx");
  const zf = form.get("zip");
  if (!(xf instanceof File)) return json({ error: "xlsx_required" }, 400);
  if (xf.size > LIMITS.xlsxBytes) return json({ error: "xlsx_too_large" }, 413);
  if (zf !== null && !(zf instanceof File)) return json({ error: "zip_invalid" }, 400);
  if (zf instanceof File && zf.size > LIMITS.zipBytes) return json({ error: "zip_too_large" }, 413);

  const xlsx = new Uint8Array(await xf.arrayBuffer());
  const zip = zf instanceof File ? new Uint8Array(await zf.arrayBuffer()) : null;
  const today = new Date().toISOString().slice(0, 10);

  const parsed = await parseImport(xlsx, zip, today);
  if (parsed.errors.length) return json({ ok: false, errors: parsed.errors }, 422);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const [{ data: yeti, error: e1 }, { data: links, error: e2 }] = await Promise.all([
    sb.from("instructors").select("id, first_name, last_name, phone, email, birth_date, street, zip, city, country"),
    sb.from("instructor_source_links").select("source_id, instructor_id, source_checksum")
      .eq("source_system", SOURCE_SYSTEM).eq("rollout", ROLLOUT),
  ]);
  if (e1 || e2) { console.error("preview_load_failed"); return json({ error: "load_failed" }, 500); }

  const { results, yetiOnly } = classify(parsed.profiles, yeti ?? [], links ?? []);
  const photoBy = new Map(parsed.photos.map((p) => [p.sourceId, p]));
  const countBy = (c: string) => results.filter((r) => r.classification === c).length;
  const counts = {
    profiles: parsed.profiles.length,
    archived_skipped: parsed.archivedCount,
    archived_imported: 0,
    current_windows: parsed.profiles.filter((p) => p.hasCurrentWindow).length,
    no_current_window: parsed.profiles.filter((p) => !p.hasCurrentWindow).length,
    photos: parsed.photos.length,
    no_photo: parsed.photoMissing.length,
    zip_rejected: parsed.zipRejected.length,
    zip_unused: parsed.zipUnused,
    assignment_rows: parsed.assignmentRows,
    assignment_orphans: parsed.assignmentOrphans,
    explicit_absences: parsed.explicitAbsenceDates,
    absences_to_create: 0,
    create: countBy("create"), update: countBy("update"), no_op: countBy("no_op"),
    candidate: countBy("candidate"), review: countBy("review"), yeti_only: yetiOnly.length,
  };

  const { data: run, error: runErr } = await sb.from("instructor_import_runs").insert({
    source_system: SOURCE_SYSTEM, rollout: ROLLOUT, status: "preview",
    xlsx_sha256: await sha256Hex(xlsx), zip_sha256: zip ? await sha256Hex(zip) : null,
    counts, created_by: auth.userId,
  }).select("id").single();
  if (runErr || !run) { console.error("preview_run_insert_failed"); return json({ error: "run_failed" }, 500); }

  const pById = new Map(parsed.profiles.map((p) => [p.sourceId, p]));
  const staging = results.map((r) => {
    const p = pById.get(r.sourceId)!;
    const { private: priv, checksum, window, ...normalized } = p;
    return {
      run_id: run.id, source_id: r.sourceId, classification: r.classification, confidence: r.confidence,
      target_instructor_id: r.targetInstructorId, source_checksum: checksum, normalized,
      private_payload: priv, windows: window ? [window] : [], photo: photoBy.get(r.sourceId) ?? null,
      diff: r.diff, reasons: r.reasons,
    };
  });
  for (let i = 0; i < staging.length; i += 50) {
    const { error } = await sb.from("instructor_import_staging").insert(staging.slice(i, i + 50));
    if (error) {
      console.error("preview_staging_insert_failed");
      await sb.from("instructor_import_runs").update({ status: "failed" }).eq("id", run.id);
      return json({ error: "staging_failed" }, 500);
    }
  }

  const yetiNames = new Map((yeti ?? []).map((y) => [y.id, `${y.first_name ?? ""} ${y.last_name ?? ""}`.trim()]));
  return json({
    ok: true, run_id: run.id, counts, warnings: parsed.warnings.length, notes: parsed.notes,
    rows: results.map((r) => {
      const p = pById.get(r.sourceId)!;
      return {
        source_id: r.sourceId, name: `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim(),
        classification: r.classification, confidence: r.confidence, reasons: r.reasons,
        target: r.targetInstructorId ? { id: r.targetInstructorId, name: yetiNames.get(r.targetInstructorId) ?? "" } : null,
        diff: r.diff, window: p.window, has_current_window: p.hasCurrentWindow, has_photo: photoBy.has(r.sourceId),
        missing: (["email", "phone"] as const).filter((k) => !p[k]).concat(p.private.wage_raw ? [] : ["wage" as never]),
      };
    }),
    yeti_only: yetiOnly.map((id) => ({ id, name: yetiNames.get(id) ?? "" })),
  });
});
