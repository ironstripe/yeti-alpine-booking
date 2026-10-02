import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Download, Loader2, ShieldAlert } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { useIsSuperAdmin } from "@/hooks/useIsSuperAdmin";
import { validatePackage } from "@/lib/bcMigration/contract";
import { evaluatePackage, type ExistingTargetItem, type Report, type Window } from "@/lib/bcMigration/evaluate";

const PAGE = 1000;
export const MAX_PACKAGE_BYTES = 5 * 1024 * 1024;
const STATUS_LABEL: Record<string, string> = {
  data_review_ok: "Datenprüfung ohne Befund (nicht importbereit)", blocked: "Blockiert",
  collision_candidate: "Kollisionskandidat", out_of_scope: "Ausserhalb Saison",
};

async function readAll<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[] | null> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await q(from, from + PAGE - 1);
    if (error) return null;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

/**
 * Buchungsübernahme 26/27 — local validation + dry-run only. The file stays in memory;
 * nothing is persisted, logged or written. There is deliberately no apply action.
 */
export function BookingMigrationPrep() {
  const { isAdminOrOffice, loading } = useUserRole();
  const isSuperAdmin = useIsSuperAdmin();
  const [errors, setErrors] = useState<string[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  if (loading) return null;
  if (!isAdminOrOffice) return null;

  const onFile = async (file: File | undefined) => {
    const run = ++seq.current;
    const current = () => run === seq.current;
    setReport(null); setErrors([]);
    if (!file) return;
    if (file.size > MAX_PACKAGE_BYTES) { setErrors(["file_too_large"]); return; }
    setBusy(true);
    try {
      let raw: unknown;
      try { raw = JSON.parse(await file.text()); } catch { if (current()) setErrors(["json_invalid"]); return; }
      const v = validatePackage(raw);
      if ("errors" in v) { if (current()) setErrors(v.errors); return; }

      const { data: seasons, error: sErr } = await supabase.from("seasons").select("name, start_date, end_date").ilike("name", "%26/27%");
      if (!current()) return;
      if (sErr) { setErrors(["season_read_failed"]); return; }
      if (!seasons || seasons.length !== 1) { setErrors([seasons?.length ? "season_ambiguous" : "season_missing"]); return; }
      const season = { start: seasons[0].start_date as string, end: seasons[0].end_date as string };

      // HR-protected tables: only read when the session is super_admin; otherwise "unavailable" (never bypassed).
      let links: Map<string, string[]> | null = null;
      let windows: Map<string, Window[]> | null = null;
      if (isSuperAdmin) {
        const l = await readAll<{ source_id: string; instructor_id: string }>((a, b) =>
          supabase.from("instructor_source_links").select("source_id, instructor_id").eq("source_system", "booking_corner").eq("rollout", v.pkg.manifest.rollout).order("source_id").range(a, b));
        if (l) { links = new Map(); for (const r of l) links.set(r.source_id, [...(links.get(r.source_id) ?? []), r.instructor_id]); }
        const w = await readAll<{ instructor_id: string; valid_from: string; valid_until: string }>((a, b) =>
          supabase.from("instructor_deployment_windows").select("instructor_id, valid_from, valid_until").order("id").range(a, b));
        if (w) { windows = new Map(); for (const r of w) windows.set(r.instructor_id, [...(windows.get(r.instructor_id) ?? []), { from: r.valid_from, until: r.valid_until }]); }
      }
      const existing = await readAll<ExistingTargetItem>((a, b) =>
        supabase.from("ticket_items").select("id, ticket_id, date, time_start, time_end, instructor_id, appointment_id")
          .gte("date", season.start).lte("date", season.end).order("id").range(a, b));
      if (!current()) return;

      setReport(evaluatePackage(v.pkg, {
        season, instructorLinks: links, deploymentWindows: windows, existingItems: existing,
        absenceCheckAvailable: false, capabilityCheckAvailable: false, targetReferencesVerified: false, groupTargetMappingAvailable: false,
      }));
    } catch {
      // Generic, value-free error: never surface file contents or PII.
      if (current()) setErrors(["unexpected_error"]);
    } finally { if (current()) setBusy(false); }
  };

  const downloadReport = () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = `bc-dryrun-${report.snapshot_id}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const existingTickets = report ? new Set(report.sales.flatMap((s) => s.collisions.map((c) => c.target_ticket_id))) : null;
  const money = (m: number | null, cur: string) => (m === null ? "fehlt" : `${(m / 100).toFixed(2)} ${cur}`);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Buchungsübernahme 26/27 (Probelauf)</CardTitle>
        <CardDescription>
          Prüft ein normalisiertes Übernahmepaket (Format yeti.bc-migration.normalized v1) nur lokal im Browser.
          Es wird nichts gespeichert und nichts übernommen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Nur Probelauf – kein Verkauf ist importbereit</AlertTitle>
          <AlertDescription>
            Ein Leser für den Original-Export fehlt. Abwesenheits-, Fähigkeits-, Gruppen- und Quell-Kollisionsprüfungen sowie
            die Prüfung von Kunden-/Teilnehmer-Zielen sind nicht verfügbar und gelten als Blocker. Schulgruppen und Gruppenkurse
            werden nicht in den Planer übertragen.
          </AlertDescription>
        </Alert>
        <div className="flex flex-wrap items-center gap-3">
          <label className={`inline-flex items-center rounded-md border px-4 py-2 text-sm ${busy ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-accent"}`}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Paket (JSON, max. 5 MB) wählen
            <input type="file" accept="application/json,.json" className="sr-only" disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void onFile(f); }} />
          </label>
          {report && <Button variant="outline" size="sm" onClick={downloadReport}><Download className="mr-2 h-4 w-4" />Bericht (JSON)</Button>}
          {!isSuperAdmin && <span className="text-sm text-muted-foreground">Lehrer-Zuordnung prüfbar nur mit Super-Admin-Recht.</span>}
        </div>

        {errors.length > 0 && (
          <Alert variant="destructive"><AlertTitle>Paket ungültig oder Prüfung fehlgeschlagen</AlertTitle>
            <AlertDescription><ul className="list-disc pl-5 text-xs font-mono">{errors.slice(0, 50).map((e) => <li key={e}>{e}</li>)}</ul></AlertDescription>
          </Alert>
        )}

        {report && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="destructive">Importbereit {report.totals.import_ready}</Badge>
              <Badge variant="secondary">Verkäufe {report.totals.sales}</Badge>
              <Badge variant="secondary">Einheiten in Saison {report.totals.sessions_in_scope}</Badge>
              {Object.entries(STATUS_LABEL).map(([k, l]) => <Badge key={k} variant="outline">{l} {report.totals[k as keyof Report["totals"]]}</Badge>)}
              <Badge variant="outline">Kollisionskandidaten {report.totals.collision_candidates}</Badge>
            </div>
            <div className="text-sm">
              <p className="font-medium">Übergreifende Blocker</p>
              <ul className="list-disc pl-5 font-mono text-xs">{report.global_blockers.map((b) => <li key={b}>{b}</li>)}</ul>
            </div>
            {report.shared_groups.length > 0 && (
              <p className="text-sm text-muted-foreground">Quell-Gruppen: {report.shared_groups.length} (nicht zugeordnet, nicht übertragen).</p>
            )}
            <p className="text-sm text-muted-foreground">
              Bestehende Buchungszeilen in der Saison ohne Überschneidung: {report.unmatched_existing_items.length}
              {existingTickets && ` · bestehende Buchungen mit Kollisionskandidaten: ${existingTickets.size}`}. Es wird nichts gelöscht.
            </p>
            <div className="space-y-2">
              {report.sales.map((s) => (
                <details key={s.source_sale_id} className="border rounded-md p-2 text-xs">
                  <summary className="cursor-pointer flex flex-wrap items-center gap-2">
                    <span className="font-mono">{s.source_sale_id}</span>
                    <Badge variant={s.status === "blocked" ? "destructive" : "outline"}>{STATUS_LABEL[s.status]}</Badge>
                    <span>Planer: {s.scheduler_state === "blocked" ? "blockiert" : s.scheduler_state === "unverified" ? "nicht verifiziert" : "—"}</span>
                    <span>Einheiten {s.sessions_in_scope}{s.sessions_out_of_scope ? ` (+${s.sessions_out_of_scope} ausserhalb)` : ""}</span>
                    <span>{money(s.finance.items_total_minor, s.finance.currency)}</span>
                  </summary>
                  <div className="mt-2 space-y-2 font-mono">
                    <div><b>Blocker/Hinweise:</b> {[...s.blockers, ...s.warnings].join(", ") || "—"}</div>
                    <div><b>Lehrer-Zuordnung:</b> {s.mappings.map((m) => `${m.source_teacher_id}→${m.instructor_id}`).join(", ") || "—"}</div>
                    <div><b>Kollisionskandidaten:</b> {s.collisions.map((c) => `${c.source_session_id}→item ${c.target_item_id} / ticket ${c.target_ticket_id}`).join(", ") || "—"}</div>
                    <div><b>Projektion:</b>
                      <ul className="list-disc pl-5">{s.projection.map((p) => (
                        <li key={p.source_session_id}>{p.source_session_id} {p.date} {p.start}–{p.end} {p.kind} → {p.target}
                          {p.source_group_id ? ` gruppe=${p.source_group_id}` : ""} lehrer={p.instructor_id ?? "offen"} preis={money(p.price_minor, s.finance.currency)}</li>
                      ))}</ul>
                    </div>
                    <div><b>Finanzen:</b> Rest {money(s.finance.computed_rest_minor, s.finance.currency)} · Quelle-Saldo {money(s.finance.source_balance_minor, s.finance.currency)} · Abgleich {s.finance.reconciliation}</div>
                    <div><b>Vorgeschlagene Aktionen:</b><ul className="list-disc pl-5">{s.proposed_actions.map((a) => <li key={a}>{a}</li>)}</ul></div>
                  </div>
                </details>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
