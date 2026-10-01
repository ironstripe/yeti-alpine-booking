// Super-admin-only APPLY for a reviewed Booking-Corner preview run.
// Actions: start (multipart: run_id, decisions, xlsx, zip) | batch | photo | finish | status (JSON {action, run_id}).
// Writes only through service-role DB functions; never deletes; no PII in logs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { unzipSync } from "npm:fflate@0.8.2";
import { requireRole } from "../_shared/staffAuth.ts";
import { parseImport, sha256Hex, LIMITS } from "../_shared/bcImport/parse.ts";
import { classify } from "../_shared/bcImport/match.ts";
import { buildPayload, snapshotOf, validateDecisions, duplicateSourceEmails, APPLY_FIELDS } from "../_shared/bcImport/apply.ts";
import { makeRendition } from "../_shared/bcImport/image.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCE_BUCKET = "instructor-import-sources";
const PHOTO_BUCKET = "instructor-hr-photos";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const auth = await requireRole(req, ["super_admin"], cors);
  if (auth instanceof Response) return auth;
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const isForm = (req.headers.get("content-type") ?? "").includes("multipart/form-data");
  if (isForm) return start(req, sb, auth.userId);

  let body: { action?: string; run_id?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const runId = body.run_id ?? "";
  if (!UUID.test(runId)) return json({ error: "run_id_invalid" }, 400);
  switch (body.action) {
    case "batch": {
      const { data, error } = await sb.rpc("bc_apply_batch", { p_run: runId, p_limit: 20 });
      if (error) { console.error("apply_batch_failed"); return json({ error: error.message === "run_not_applying" ? "run_not_applying" : "batch_failed" }, 409); }
      return json({ ok: true, ...data });
    }
    case "photo": return photo(sb, runId);
    case "finish": {
      const { data, error } = await sb.rpc("bc_finish_run", { p_run: runId });
      if (error) return json({ error: "finish_failed" }, 500);
      if (data?.finished) await sb.storage.from(SOURCE_BUCKET).remove([`${runId}/photos.zip`]);
      return json({ ok: true, ...data });
    }
    case "status": return status(sb, runId);
    case "retry_failed_photos": {
      await sb.from("instructor_import_staging").update({ photo_status: "pending", error: null })
        .eq("run_id", runId).eq("photo_status", "failed");
      return json({ ok: true });
    }
    default: return json({ error: "unknown_action" }, 400);
  }
});

// deno-lint-ignore no-explicit-any
type SB = any;

async function status(sb: SB, runId: string) {
  const [{ data: run }, { data: rows }] = await Promise.all([
    sb.from("instructor_import_runs").select("id, status, applied_at").eq("id", runId).maybeSingle(),
    sb.from("instructor_import_staging").select("source_id, batch_status, photo_status, error, decision").eq("run_id", runId),
  ]);
  if (!run) return json({ error: "run_not_found" }, 404);
  const tally = (k: "batch_status" | "photo_status") =>
    (rows ?? []).reduce((a: Record<string, number>, r: Record<string, string>) => ({ ...a, [r[k]]: (a[r[k]] ?? 0) + 1 }), {});
  return json({
    ok: true, run_status: run.status, rows: tally("batch_status"), photos: tally("photo_status"),
    problems: (rows ?? []).filter((r: Record<string, string>) => ["conflict", "failed"].includes(r.batch_status) || r.photo_status === "failed")
      .map((r: Record<string, string>) => ({ source_id: r.source_id, status: r.batch_status, photo: r.photo_status, error: r.error })),
  });
}

async function start(req: Request, sb: SB, userId: string) {
  let form: FormData;
  try { form = await req.formData(); } catch { return json({ error: "invalid_form" }, 400); }
  const runId = String(form.get("run_id") ?? "");
  if (!UUID.test(runId)) return json({ error: "run_id_invalid" }, 400);
  let decisions: Record<string, unknown>;
  try { decisions = JSON.parse(String(form.get("decisions") ?? "")); } catch { return json({ error: "decisions_invalid" }, 400); }
  if (!decisions || typeof decisions !== "object" || Array.isArray(decisions)) return json({ error: "decisions_invalid" }, 400);
  const xf = form.get("xlsx"), zf = form.get("zip");
  if (!(xf instanceof File) || xf.size > LIMITS.xlsxBytes) return json({ error: "xlsx_required" }, 400);
  if (zf !== null && (!(zf instanceof File) || zf.size > LIMITS.zipBytes)) return json({ error: "zip_invalid" }, 400);

  const { data: run } = await sb.from("instructor_import_runs").select("*").eq("id", runId).maybeSingle();
  if (!run) return json({ error: "run_not_found" }, 404);
  if (run.status !== "preview") return json({ error: "run_not_in_preview", status: run.status }, 409);

  const xlsx = new Uint8Array(await xf.arrayBuffer());
  const zip = zf instanceof File ? new Uint8Array(await zf.arrayBuffer()) : null;
  if (await sha256Hex(xlsx) !== run.xlsx_sha256) return json({ error: "xlsx_hash_mismatch" }, 409);
  if ((zip ? await sha256Hex(zip) : null) !== (run.zip_sha256 ?? null)) return json({ error: "zip_hash_mismatch" }, 409);

  const season = run.counts?.season;
  const { data: seasons } = await sb.from("seasons").select("name, start_date, end_date").ilike("name", "%26/27%");
  if (!season || !seasons || seasons.length !== 1 || seasons[0].start_date !== season.start || seasons[0].end_date !== season.end)
    return json({ error: "season_changed" }, 409);

  const parsed = await parseImport(xlsx, zip, season);
  if (parsed.errors.length) return json({ error: "parse_failed", errors: parsed.errors }, 422);
  if (parsed.photoIssues.length) return json({ error: "photo_issues", count: parsed.photoIssues.length }, 422);

  const { data: staged } = await sb.from("instructor_import_staging")
    .select("id, source_id, classification, target_instructor_id, source_checksum, diff, photo, assignments").eq("run_id", runId);
  const pBy = new Map(parsed.profiles.map((p) => [p.sourceId, p]));
  if (!staged || staged.length !== parsed.profiles.length) return json({ error: "staging_mismatch" }, 409);
  for (const s of staged) {
    const p = pBy.get(s.source_id);
    if (!p || p.checksum !== s.source_checksum) return json({ error: "staging_mismatch" }, 409);
    if ((s.assignments ?? []).length !== (parsed.assignments[s.source_id] ?? []).length) return json({ error: "preview_outdated_rerun" }, 409);
  }
  const decErr = validateDecisions(staged, decisions);
  if (decErr.length) return json({ error: "decisions_invalid", details: decErr.slice(0, 20) }, 400);

  const [{ data: yeti }, { data: links }] = await Promise.all([
    sb.from("instructors").select(`id, ${APPLY_FIELDS.join(", ")}`),
    sb.from("instructor_source_links").select("source_id, instructor_id, source_checksum").eq("source_system", run.source_system).eq("rollout", run.rollout),
  ]);
  const { results } = classify(parsed.profiles, yeti ?? [], links ?? []);
  const now = new Map(results.map((r) => [r.sourceId, r]));
  const yBy = new Map<string, Record<string, unknown>>((yeti ?? []).map((y: Record<string, unknown>) => [y.id as string, y]));
  const photoBy = new Map(parsed.photos.map((p) => [p.sourceId, p]));
  const payloads = staged.filter((s: { source_id: string }) => decisions[s.source_id] !== "skip")
    .map((s: { source_id: string }) => ({ source_id: s.source_id, email: pBy.get(s.source_id)!.email }));
  const dupEmail = duplicateSourceEmails(payloads);

  const updates = staged.map((s: Record<string, unknown> & { source_id: string; id: string }) => {
    const d = decisions[s.source_id] as string;
    const p = pBy.get(s.source_id)!;
    const cur = now.get(s.source_id)!;
    let conflict: string | null = null;
    if (cur.classification !== s.classification || cur.targetInstructorId !== s.target_instructor_id) conflict = "evidence_changed";
    else if (JSON.stringify(cur.diff) !== JSON.stringify(s.diff)) conflict = "evidence_changed";
    else if (d !== "skip" && dupEmail.has(s.source_id)) conflict = "email_duplicate_in_source";
    const ph = photoBy.get(s.source_id);
    const stagedSha = (s.photo as { sha256?: string } | null)?.sha256 ?? null;
    if (!conflict && (ph?.sha256 ?? null) !== stagedSha) conflict = "photo_changed";
    const target = s.target_instructor_id as string | null;
    return {
      id: s.id,
      decision: d,
      apply_payload: buildPayload(p),
      review_snapshot: d === "link" && target && yBy.has(target) ? snapshotOf(yBy.get(target) as Record<string, unknown>) : null,
      batch_status: conflict && d !== "skip" ? "conflict" : "pending",
      error: d !== "skip" ? conflict : null,
      photo_status: d !== "skip" && ph?.verified ? "pending" : "none",
    };
  });
  for (let i = 0; i < updates.length; i += 10) {
    const res = await Promise.all(updates.slice(i, i + 10).map(({ id, ...u }: { id: string }) =>
      sb.from("instructor_import_staging").update(u).eq("id", id)));
    if (res.some((r: { error: unknown }) => r.error)) { console.error("apply_start_staging_failed"); return json({ error: "staging_update_failed" }, 500); }
  }
  if (zip) {
    const { error } = await sb.storage.from(SOURCE_BUCKET).upload(`${runId}/photos.zip`, zip, { upsert: true, contentType: "application/zip" });
    if (error) { console.error("apply_source_upload_failed"); return json({ error: "source_store_failed" }, 500); }
  }
  const { data: upd } = await sb.from("instructor_import_runs")
    .update({ status: "applying", apply_started_by: userId, apply_started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", runId).eq("status", "preview").select("id");
  if (!upd?.length) return json({ error: "run_not_in_preview" }, 409);
  const c = (k: string, v: string) => updates.filter((u: Record<string, unknown>) => u[k] === v).length;
  return json({ ok: true, pending: c("batch_status", "pending") - c("decision", "skip"), skipped: c("decision", "skip"), conflict: c("batch_status", "conflict"), photos: c("photo_status", "pending") });
}

async function photo(sb: SB, runId: string) {
  const { data: run } = await sb.from("instructor_import_runs").select("status").eq("id", runId).maybeSingle();
  if (run?.status !== "applying") return json({ error: "run_not_applying" }, 409);
  const { data: row } = await sb.from("instructor_import_staging")
    .select("id, source_id, photo, applied_instructor_id").eq("run_id", runId).eq("batch_status", "applied")
    .eq("photo_status", "pending").order("source_id").limit(1).maybeSingle();
  if (!row) return json({ ok: true, remaining: 0 });
  const fail = async (code: string) => {
    await sb.from("instructor_import_staging").update({ photo_status: "failed", error: `photo:${code}` }).eq("id", row.id);
    return json({ ok: false, source_id: row.source_id, error: code }, 422);
  };
  const { data: blob, error } = await sb.storage.from(SOURCE_BUCKET).download(`${runId}/photos.zip`);
  if (error || !blob) return fail("source_missing");
  const entry = row.photo?.entry as string;
  let bytes: Uint8Array | undefined;
  try { bytes = unzipSync(new Uint8Array(await blob.arrayBuffer()), { filter: (f) => f.name === entry })[entry]; }
  catch { return fail("zip_unreadable"); }
  if (!bytes || await sha256Hex(bytes) !== row.photo?.sha256) return fail("sha_mismatch");
  let r;
  try { r = makeRendition(bytes); } catch (e) { return fail((e as Error).message === "rendition_unsafe" ? "rendition_unsafe" : "decode_failed"); }
  const path = `${row.applied_instructor_id}/import-${row.photo.sha256}.jpg`;
  const up = await sb.storage.from(PHOTO_BUCKET).upload(path, r.bytes, { upsert: true, contentType: "image/jpeg" });
  if (up.error) return fail("upload_failed");
  const { data: res, error: re } = await sb.rpc("bc_register_import_photo",
    { p_run: runId, p_source_id: row.source_id, p_path: path, p_sha: row.photo.sha256, p_width: r.width, p_height: r.height });
  if (re) return fail("register_failed");
  const { count } = await sb.from("instructor_import_staging").select("id", { count: "exact", head: true })
    .eq("run_id", runId).eq("batch_status", "applied").eq("photo_status", "pending");
  return json({ ok: true, result: res, remaining: count ?? 0 });
}
