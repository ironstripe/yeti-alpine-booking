import { useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

type Decision = "create" | "link" | "skip";
const DEFAULT_DECISION: Record<string, Decision | undefined> = { create: "create", update: "link", no_op: "link" };

type Row = {
  source_id: string; name: string; classification: string; confidence: string; reasons: string[];
  target: { id: string; name: string } | null; diff: { field: string; source: string | null; yeti: string | null }[];
  window: { from: string; until: string } | null; has_current_window: boolean; has_photo: boolean; photo_verified?: boolean; missing: string[];
};
type Preview = {
  run_id: string; counts: Record<string, number>;
  season?: { name: string; start: string; end: string }; apply_blocked?: boolean; photo_issues?: { sourceId: string | null; code: string }[]; rows: Row[]; yeti_only: { id: string; name: string }[] };

const CLASS_LABEL: Record<string, string> = {
  create: "Neu", update: "Aktualisieren", no_op: "Unverändert", candidate: "Kandidat (prüfen)", review: "Prüfung nötig",
};
const COUNT_LABEL: [string, string][] = [
  ["profiles", "Profile (nicht archiviert)"], ["current_windows", "Mit Einsatzfenster 26/27"], ["no_current_window", "Ohne Einsatzfenster"],
  ["photos", "Fotos"], ["photos_verified", "Fotos geprüft (Bildzuordnung)"], ["photo_issues", "Foto-Abweichungen"], ["zip_metadata", "ZIP-Metadateien"], ["zip_rejected", "ZIP abgelehnt"], ["no_photo", "Ohne Foto"], ["explicit_absences", "Abwesenheiten in Quelle"], ["absences_to_create", "Abwesenheiten, die angelegt werden"],
  ["archived_imported", "Archivierte importiert"], ["assignment_rows", "Zuordnungen"], ["assignment_orphans", "Zuordnungen ohne Profil"],
  ["create", "Neu"], ["update", "Aktualisieren"], ["no_op", "Unverändert"], ["candidate", "Kandidaten"], ["review", "Prüfung nötig"], ["yeti_only", "Nur in YETI"],
];

export function BookingCornerPreviewDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [xlsx, setXlsx] = useState<File | null>(null);
  const [zip, setZip] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision | undefined>>({});
  const [consent, setConsent] = useState(false);
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const call = async (body: unknown) => {
    const { data, error } = await supabase.functions.invoke("instructor-import-apply", { body: body as Record<string, unknown> });
    if (error) throw new Error(error instanceof FunctionsHttpError ? await error.context.text() : error.message);
    return data;
  };

  const undecided = preview ? preview.rows.filter((r) => !decisions[r.source_id]).length : 0;

  const apply = async () => {
    if (!preview || !xlsx) return;
    setApplying(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("run_id", preview.run_id);
      fd.append("decisions", JSON.stringify(decisions));
      fd.append("xlsx", xlsx);
      if (zip) fd.append("zip", zip);
      setProgress("Prüfe Dateien und Nachweise …");
      const { data: st, error: se } = await supabase.functions.invoke("instructor-import-apply", { body: fd });
      if (se) throw new Error(se instanceof FunctionsHttpError ? await se.context.text() : se.message);
      if (st?.conflict) setProgress(`${st.conflict} Konflikte – werden nicht übernommen.`);
      for (let i = 0; i < 50; i++) {
        const b = await call({ action: "batch", run_id: preview.run_id });
        setProgress(`Profile übernommen … verbleibend ${b.remaining ?? 0}`);
        if (!b.remaining) break;
      }
      for (let i = 0; i < 100; i++) {
        let ph;
        try { ph = await call({ action: "photo", run_id: preview.run_id }); } catch { continue; }
        setProgress(`Fotos verarbeitet … verbleibend ${ph.remaining ?? 0}`);
        if (!ph.remaining) break;
      }
      const fin = await call({ action: "finish", run_id: preview.run_id });
      const stat = await call({ action: "status", run_id: preview.run_id });
      setProgress(fin.finished ? "Übernahme abgeschlossen." : `Übernahme unvollständig: ${(stat.problems ?? []).length} Probleme (Konflikte/Fotos).`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApplying(false);
    }
  };

  const run = async () => {
    if (!xlsx) return;
    setLoading(true); setError(null); setPreview(null);
    const fd = new FormData();
    fd.append("xlsx", xlsx);
    if (zip) fd.append("zip", zip);
    const { data, error } = await supabase.functions.invoke("instructor-import-preview", { body: fd });
    setLoading(false);
    if (error) {
      const details = error instanceof FunctionsHttpError ? await error.context.text() : error.message;
      setError(details);
      return;
    }
    const pv = data as Preview;
    setPreview(pv);
    setConsent(false); setProgress(null);
    setDecisions(Object.fromEntries(pv.rows.map((r) => [r.source_id, DEFAULT_DECISION[r.classification]])));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Booking-Corner Vorschau (Probelauf)</DialogTitle>
          <DialogDescription>
            Es wird nichts importiert: keine Lehrpersonen, Fotos oder Abwesenheiten werden angelegt oder geändert.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="bc-xlsx">Excel-Datei (.xlsx)</Label>
            <Input id="bc-xlsx" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => setXlsx(e.target.files?.[0] ?? null)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bc-zip">Foto-Archiv (.zip, optional)</Label>
            <Input id="bc-zip" type="file" accept=".zip,application/zip" onChange={(e) => setZip(e.target.files?.[0] ?? null)} />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={run} disabled={!xlsx || loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Vorschau erstellen
          </Button>
        </div>
        {error && <p className="text-sm text-destructive break-all">Fehler: {error}</p>}

        {preview && (
          <ScrollArea className="flex-1 min-h-0 border rounded-md">
            <div className="p-3 space-y-4">
              {preview.season && (
                <p className="text-sm text-muted-foreground">
                  Einsatzfenster zählt, wenn es die Saison {preview.season.name} ({preview.season.start} – {preview.season.end}) überschneidet.
                </p>
              )}
              {preview.apply_blocked && (
                <div className="rounded-md border border-destructive p-2 text-sm">
                  <div className="font-medium text-destructive">Übernahme gesperrt: Fotos stimmen nicht mit der Bildzuordnung überein.</div>
                  <ul className="mt-1 text-xs text-muted-foreground">
                    {(preview.photo_issues ?? []).slice(0, 50).map((i, n) => <li key={n}>{i.sourceId ?? "ZIP"}: {i.code}</li>)}
                  </ul>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {COUNT_LABEL.map(([k, label]) => (
                  <div key={k} className="rounded-md border p-2">
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className="text-lg font-semibold">{preview.counts[k] ?? 0}</div>
                  </div>
                ))}
              </div>
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr><th className="p-1">ID</th><th className="p-1">Name</th><th className="p-1">Einstufung</th><th className="p-1">YETI-Treffer</th><th className="p-1">Einsatz</th><th className="p-1">Foto</th><th className="p-1">Fehlt</th><th className="p-1">Unterschiede (YETI → Booking-Corner)</th><th className="p-1">Entscheidung</th></tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.source_id} className="border-t align-top">
                      <td className="p-1">{r.source_id}</td>
                      <td className="p-1">{r.name}</td>
                      <td className="p-1">
                        <Badge variant={r.classification === "review" || r.classification === "candidate" ? "destructive" : "secondary"}>{CLASS_LABEL[r.classification]}</Badge>
                        <div className="text-xs text-muted-foreground">{r.confidence} · {r.reasons.join(", ")}</div>
                      </td>
                      <td className="p-1">{r.target?.name ?? "—"}</td>
                      <td className="p-1">{r.window ? `${r.window.from} – ${r.window.until}` : "—"}{r.window && !r.has_current_window && <div className="text-xs text-muted-foreground">ausserhalb Saison</div>}</td>
                      <td className="p-1">{r.has_photo ? (r.photo_verified ? "Ja, geprüft" : "Ja, ungeprüft") : "—"}</td>
                      <td className="p-1">{r.missing.join(", ") || "—"}</td>
                      <td className="p-1 text-xs">{r.diff.map((d) => <div key={d.field}>{d.field}: {d.yeti ?? "—"} → {d.source ?? "—"}</div>)}</td>
                      <td className="p-1">
                        <select
                          className="h-8 rounded-md border bg-background px-1 text-xs"
                          value={decisions[r.source_id] ?? ""}
                          disabled={applying}
                          onChange={(e) => setDecisions((d) => ({ ...d, [r.source_id]: (e.target.value || undefined) as Decision | undefined }))}
                        >
                          <option value="">— wählen —</option>
                          {r.classification !== "update" && r.classification !== "no_op" && <option value="create">Neu anlegen</option>}
                          {r.target && <option value="link">Mit {r.target.name} verknüpfen</option>}
                          <option value="skip">Überspringen</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="rounded-md border p-3 space-y-2">
                <div className="font-medium text-sm">Übernahme</div>
                <p className="text-xs text-muted-foreground">
                  Verknüpfte Profile behalten ID, Status, Website-Sichtbarkeit und manuelle Fotos; leere Quellwerte löschen nichts.
                  Es wird niemand auf der Website veröffentlicht.
                </p>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} disabled={applying} />
                  Ich habe alle Entscheidungen und Unterschiede geprüft.
                </label>
                {undecided > 0 && <p className="text-xs text-destructive">{undecided} Zeilen ohne Entscheidung.</p>}
                <Button onClick={apply} disabled={!consent || undecided > 0 || applying || !!preview.apply_blocked}>
                  {applying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Übernahme starten
                </Button>
                {progress && <p className="text-sm">{progress}</p>}
              </div>
              {preview.yeti_only.length > 0 && (
                <div>
                  <div className="font-medium text-sm">Nur in YETI (werden nicht verändert)</div>
                  <div className="text-sm text-muted-foreground">{preview.yeti_only.map((y) => y.name).join(", ")}</div>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
