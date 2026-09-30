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

type Row = {
  source_id: string; name: string; classification: string; confidence: string; reasons: string[];
  target: { id: string; name: string } | null; diff: { field: string; source: string | null; yeti: string | null }[];
  window: { from: string; until: string } | null; has_current_window: boolean; has_photo: boolean; missing: string[];
};
type Preview = { run_id: string; counts: Record<string, number>; rows: Row[]; yeti_only: { id: string; name: string }[] };

const CLASS_LABEL: Record<string, string> = {
  create: "Neu", update: "Aktualisieren", no_op: "Unverändert", candidate: "Kandidat (prüfen)", review: "Prüfung nötig",
};
const COUNT_LABEL: [string, string][] = [
  ["profiles", "Profile (nicht archiviert)"], ["current_windows", "Mit Einsatzfenster 26/27"], ["no_current_window", "Ohne Einsatzfenster"],
  ["photos", "Fotos"], ["no_photo", "Ohne Foto"], ["explicit_absences", "Abwesenheiten in Quelle"], ["absences_to_create", "Abwesenheiten, die angelegt werden"],
  ["archived_imported", "Archivierte importiert"], ["assignment_rows", "Zuordnungen"], ["assignment_orphans", "Zuordnungen ohne Profil"],
  ["create", "Neu"], ["update", "Aktualisieren"], ["no_op", "Unverändert"], ["candidate", "Kandidaten"], ["review", "Prüfung nötig"], ["yeti_only", "Nur in YETI"],
];

export function BookingCornerPreviewDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [xlsx, setXlsx] = useState<File | null>(null);
  const [zip, setZip] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

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
    setPreview(data as Preview);
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
                  <tr><th className="p-1">ID</th><th className="p-1">Name</th><th className="p-1">Einstufung</th><th className="p-1">YETI-Treffer</th><th className="p-1">Einsatz</th><th className="p-1">Foto</th><th className="p-1">Fehlt</th><th className="p-1">Unterschiede</th></tr>
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
                      <td className="p-1">{r.window ? `${r.window.from} – ${r.window.until}` : "—"}{r.window && !r.has_current_window && <div className="text-xs text-muted-foreground">vergangen</div>}</td>
                      <td className="p-1">{r.has_photo ? "Ja" : "—"}</td>
                      <td className="p-1">{r.missing.join(", ") || "—"}</td>
                      <td className="p-1 text-xs">{r.diff.map((d) => <div key={d.field}>{d.field}: {d.yeti ?? "—"} → {d.source ?? "—"}</div>)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
