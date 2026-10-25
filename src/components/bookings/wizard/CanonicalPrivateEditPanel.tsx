// B03a: edit an existing canonical private booking. Shows stored values (no live repricing); a
// participant change needs a server quote that staff explicitly confirm before one atomic save.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useBookingWizard } from "@/contexts/BookingWizardContext";
import { MEETING_POINTS } from "@/lib/meeting-point-utils";
import {
  buildEditRequest, draftFromSnapshot, needsQuote, type CanonicalEditDraft, type CanonicalEditSnapshot, type EditQuote,
} from "@/lib/canonicalPrivateEdit";
import { paEditApply, paEditQuote, PrivateAppointmentError } from "@/lib/privateAppointmentsApi";

const chf = (n: number) => `CHF ${n.toFixed(2)}`;

export function CanonicalPrivateEditPanel({ snapshot }: { snapshot: CanonicalEditSnapshot }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { resetWizard } = useBookingWizard();
  const [draft, setDraft] = useState<CanonicalEditDraft>(() => draftFromSnapshot(snapshot));
  const [quote, setQuote] = useState<{ key: string; value: EditQuote } | null>(null);
  const [busy, setBusy] = useState<"quote" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const request = useMemo(() => buildEditRequest(snapshot, draft), [snapshot, draft]);
  const key = JSON.stringify(request);
  const currentQuote = quote && quote.key === key ? quote.value : null;
  const quoteRequired = needsQuote(request);
  const name = (id: string) => {
    const p = snapshot.participants.find((x) => x.id === id);
    return p ? `${p.first_name} ${p.last_name ?? ""}`.trim() : "Unbekannt";
  };

  const update = (patch: Partial<CanonicalEditDraft>) => { setError(null); setDraft((d) => ({ ...d, ...patch })); };
  const toggle = (apptId: string, pid: string, on: boolean) => {
    const cur = draft.participantIds[apptId] ?? [];
    update({ participantIds: { ...draft.participantIds, [apptId]: on ? [...cur, pid] : cur.filter((x) => x !== pid) } });
  };

  const fail = (e: unknown) => {
    const msg = e instanceof Error ? e.message : "Fehler beim Speichern. Es wurde nichts geändert.";
    if (e instanceof PrivateAppointmentError && e.code === "quote_changed" && e.quote) setQuote({ key, value: e.quote as EditQuote });
    setError(msg);
    toast.error(msg, { duration: 10000 });
  };

  const runQuote = async () => {
    if (!request) return;
    setBusy("quote");
    try { const r = await paEditQuote(request); setQuote({ key, value: r.quote }); }
    catch (e) { fail(e); } finally { setBusy(null); }
  };

  const save = async () => {
    // Unchanged save: nothing is sent and nothing is written.
    if (!request) { toast.info("Keine Änderungen"); resetWizard(); navigate(`/bookings/${snapshot.ticketId}`); return; }
    if (quoteRequired && !currentQuote) return;
    setBusy("save");
    try {
      const applyRequest = buildEditRequest(snapshot, draft, currentQuote);
      if (!applyRequest) return;
      await paEditApply(applyRequest);
      for (const k of ["tickets", "ticket", "ticket-detail", "booking-detail", "scheduler-bookings"]) queryClient.invalidateQueries({ queryKey: [k] });
      toast.success("Buchung wurde aktualisiert");
      resetWizard();
      navigate(`/bookings/${snapshot.ticketId}`);
    } catch (e) { fail(e); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-4" data-testid="canonical-private-edit">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">
          Privatlektion {snapshot.ticketNumber ?? ""} – gespeicherter Total {chf(snapshot.totalAmount)}
        </CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Gespeicherte Preise bleiben unverändert, solange keine Teilnehmer geändert werden.
          Zahlung, Fälligkeit und Rabatte werden hier nicht geändert.
        </CardContent>
      </Card>

      {snapshot.appointments.map((a) => {
        const sel = draft.participantIds[a.id] ?? [];
        const q = currentQuote?.appointments.find((x) => x.appointment_id === a.id);
        return (
          <Card key={a.id} data-testid={`appointment-${a.id}`}>
            <CardHeader className="pb-2"><CardTitle className="text-sm">
              {format(parseISO(a.date), "EEE, d. MMM yyyy", { locale: de })} · {a.timeStart}–{a.timeEnd} · {a.instructorName ?? "Lehrperson später zuweisen"}
            </CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-4">
                {snapshot.participants.map((p) => (
                  <label key={p.id} className="flex items-center gap-2">
                    <Checkbox checked={sel.includes(p.id)} onCheckedChange={(v) => toggle(a.id, p.id, v === true)}
                      aria-label={`${name(p.id)} für ${a.date}`} />
                    {name(p.id)}
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Label htmlFor={`mp-${a.id}`}>Treffpunkt</Label>
                <select id={`mp-${a.id}`} className="h-9 rounded-md border border-input bg-background px-2"
                  value={draft.meetingPoints[a.id] ?? ""}
                  onChange={(e) => update({ meetingPoints: { ...draft.meetingPoints, [a.id]: e.target.value || null } })}>
                  {!a.meetingPoint && <option value="">–</option>}
                  {MEETING_POINTS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <span className="ml-auto">
                  {sel.length} Person(en) · {chf(a.price)}{a.discountPercent > 0 ? ` (−${a.discountPercent}% Rabatt bleibt)` : ""}
                  {q && q.participants_changed && <strong className="ml-2">→ {chf(q.new_price)}</strong>}
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div><Label htmlFor={`ce-int-${a.id}`}>Interne Notiz</Label>
                  <Textarea id={`ce-int-${a.id}`} value={draft.internalNotes[a.id]} onChange={(e) => update({ internalNotes: { ...draft.internalNotes, [a.id]: e.target.value } })} /></div>
                <div><Label htmlFor={`ce-ins-${a.id}`}>Notiz für Lehrperson</Label>
                  <Textarea id={`ce-ins-${a.id}`} value={draft.instructorNotes[a.id]} onChange={(e) => update({ instructorNotes: { ...draft.instructorNotes, [a.id]: e.target.value } })} /></div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardContent className="pt-4">
          <div><Label htmlFor="ce-cust">Kundennotiz</Label>
            <Textarea id="ce-cust" value={draft.customerNotes} onChange={(e) => update({ customerNotes: e.target.value })} /></div>
        </CardContent>
      </Card>

      {quoteRequired && currentQuote && (
        <div role="status" className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm" data-testid="price-change">
          Neuer Total: <strong>{chf(currentQuote.new_total)}</strong> (bisher {chf(currentQuote.old_total)}). Mit „Änderungen speichern" bestätigen Sie diesen Preis.
        </div>
      )}
      {error && <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => { resetWizard(); navigate(`/bookings/${snapshot.ticketId}`); }}>Abbrechen</Button>
        {quoteRequired && !currentQuote ? (
          <Button onClick={runQuote} disabled={busy !== null || Object.values(draft.participantIds).some((x) => x.length === 0)}>
            {busy === "quote" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Neuen Preis prüfen
          </Button>
        ) : (
          <Button onClick={save} disabled={busy !== null}>
            {busy === "save" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Änderungen speichern
          </Button>
        )}
      </div>
    </div>
  );
}
