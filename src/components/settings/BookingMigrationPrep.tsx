import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, ShieldAlert } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { useIsSuperAdmin } from "@/hooks/useIsSuperAdmin";
import { validatePackage } from "@/lib/bcMigration/contract";
import { evaluatePackage, type ExistingTargetItem, type Report, type Window } from "@/lib/bcMigration/evaluate";

const PAGE = 1000;
const STATUS_LABEL: Record<string, string> = {
  ready_for_review: "Bereit zur Prüfung", blocked: "Blockiert", duplicate_candidate: "Mögliches Duplikat", out_of_scope: "Ausserhalb Saison",
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

  if (loading) return null;
  if (!isAdminOrOffice) return null;

  const onFile = async (file: File | undefined) => {
    setReport(null); setErrors([]);
    if (!file) return;
    setBusy(true);
    try {
      let raw: unknown;
      try { raw = JSON.parse(await file.text()); } catch { setErrors(["json_invalid"]); return; }
      const v = validatePackage(raw);
      if (!v.ok) { setErrors(v.errors); return; }

      const { data: seasons } = await supabase.from("seasons").select("name, start_date, end_date").ilike("name", "%26/27%");
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

      setReport(evaluatePackage(v.pkg, {
        season, instructorLinks: links, deploymentWindows: windows, existingItems: existing,
        absenceCheckAvailable: false, capabilityCheckAvailable: false,
      }));
    } finally { setBusy(false); }
  };

  const existingTickets = report ? new Set(report.sales.flatMap((s) => s.collisions.map((c) => c.target_ticket_id))) : null;

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
          <AlertTitle>Nur Probelauf</AlertTitle>
          <AlertDescription>
            Ein Leser für den Original-Export aus Booking Corner fehlt noch. Abwesenheits-, Kollisions- und Fähigkeitsprüfungen
            sind nicht verfügbar und gelten als Blocker. Eine Übernahme ist in diesem Schritt nicht möglich.
          </AlertDescription>
        </Alert>
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" disabled={busy}>
            <label className="cursor-pointer">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Paket (JSON) wählen
              <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          </Button>
          {!isSuperAdmin && <span className="text-sm text-muted-foreground">Lehrer-Zuordnung prüfbar nur mit Super-Admin-Recht.</span>}
        </div>

        {errors.length > 0 && (
          <Alert variant="destructive"><AlertTitle>Paket ungültig</AlertTitle>
            <AlertDescription><ul className="list-disc pl-5 text-xs font-mono">{errors.slice(0, 50).map((e) => <li key={e}>{e}</li>)}</ul></AlertDescription>
          </Alert>
        )}

        {report && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="secondary">Verkäufe {report.totals.sales}</Badge>
              <Badge variant="secondary">Einheiten in Saison {report.totals.sessions_in_scope}</Badge>
              {Object.entries(STATUS_LABEL).map(([k, l]) => <Badge key={k} variant="outline">{l} {report.totals[k as keyof Report["totals"]]}</Badge>)}
              <Badge variant="outline">Kollisionen {report.totals.collisions}</Badge>
            </div>
            <div className="text-sm">
              <p className="font-medium">Übergreifende Blocker</p>
              <ul className="list-disc pl-5 font-mono text-xs">{report.global_blockers.map((b) => <li key={b}>{b}</li>)}</ul>
            </div>
            <p className="text-sm text-muted-foreground">
              Bestehende Buchungszeilen in der Saison ohne Bezug zum Paket: {report.unmatched_existing_items.length}
              {existingTickets && ` · betroffene bestehende Buchungen: ${existingTickets.size}`}. Es wird nichts gelöscht.
            </p>
            <div className="overflow-auto border rounded-md">
              <table className="w-full text-xs">
                <thead className="bg-muted/50"><tr className="text-left">
                  <th className="p-2">Quelle</th><th className="p-2">Status</th><th className="p-2">Einheiten</th><th className="p-2">Betrag</th><th className="p-2">Blocker / Hinweise</th>
                </tr></thead>
                <tbody>
                  {report.sales.map((s) => (
                    <tr key={s.source_sale_id} className="border-t align-top">
                      <td className="p-2 font-mono">{s.source_sale_id}</td>
                      <td className="p-2"><Badge variant={s.status === "blocked" ? "destructive" : "outline"}>{STATUS_LABEL[s.status]}</Badge></td>
                      <td className="p-2">{s.sessions_in_scope}{s.sessions_out_of_scope ? ` (+${s.sessions_out_of_scope} ausserhalb)` : ""}</td>
                      <td className="p-2">{s.finance.items_total_minor === null ? "fehlt" : `${(s.finance.items_total_minor / 100).toFixed(2)} ${s.finance.currency}`}</td>
                      <td className="p-2 font-mono">{[...s.blockers, ...s.warnings].join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
