import { useState } from "react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { CalendarClock, ChevronDown, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useBookingWizard, type AppointmentSlot } from "@/contexts/BookingWizardContext";
import { useInstructors } from "@/hooks/useInstructors";
import { endOf, fromMin, PLAN_DAY_END, PLAN_DAY_START, sortPlan, toMin } from "@/lib/privatePlan";

/** The only editor for the canonical private-lesson plan. */
export function PlannedAppointmentsCard() {
  const { state, updatePlannedAppointments } = useBookingWizard();
  const { data: instructors = [] } = useInstructors();
  const [open, setOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const plan = sortPlan(state.appointments ?? []);
  const emptyDates = [...state.selectedDates].sort().filter((d) => !plan.some((a) => a.date === d));

  const apply = (next: AppointmentSlot[]) => setError(updatePlannedAppointments(next));

  const edit = (idx: number, patch: { date?: string; start?: string; end?: string; instructorId?: string }) => {
    const cur = plan[idx];
    const start = patch.start ?? cur.startTime;
    const end = patch.end ?? endOf(cur);
    const updated: AppointmentSlot = {
      date: patch.date ?? cur.date,
      startTime: start,
      durationMinutes: toMin(end) - toMin(start),
      instructorId: patch.instructorId ?? cur.instructorId,
    };
    apply(plan.map((a, i) => (i === idx ? updated : a)));
  };

  const addOn = (date: string) => {
    const onDay = plan.filter((a) => a.date === date);
    const lastEnd = onDay.length ? Math.max(...onDay.map((a) => toMin(endOf(a)))) : toMin("10:00");
    const start = Math.min(lastEnd, toMin(PLAN_DAY_END) - 60);
    apply([
      ...plan,
      { date, startTime: fromMin(start), durationMinutes: 60, instructorId: onDay[0]?.instructorId ?? state.instructorId ?? undefined },
    ]);
  };

  const name = (id?: string) => {
    const i = instructors.find((x) => x.id === id);
    return i ? `${i.first_name} ${i.last_name}` : "Lehrperson wählen";
  };

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="py-3">
          <CollapsibleTrigger asChild>
            <button type="button" className="flex w-full items-center justify-between text-left">
              <CardTitle className="flex items-center gap-2 text-sm">
                <CalendarClock className="h-4 w-4" />
                Geplante Termine ({plan.length})
              </CardTitle>
              <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-2 pt-0">
            {error && (
              <Alert variant="destructive">
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            )}
            {plan.length === 0 && emptyDates.length === 0 && (
              <p className="text-xs text-muted-foreground">Noch keine Termine geplant.</p>
            )}
            {plan.map((a, idx) => (
              <div key={`${a.date}-${a.startTime}-${idx}`} className="grid grid-cols-[1fr_5.5rem_5.5rem_1.5fr_auto] items-center gap-2">
                <Select value={a.date} onValueChange={(v) => edit(idx, { date: v })}>
                  <SelectTrigger className="h-8 text-xs" aria-label="Datum"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[...state.selectedDates].sort().map((d) => (
                      <SelectItem key={d} value={d}>{format(parseISO(d), "EEE d. MMM", { locale: de })}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="time" step={900} min={PLAN_DAY_START} max={PLAN_DAY_END} className="h-8 text-xs" aria-label="Beginn"
                  value={a.startTime} onChange={(e) => e.target.value && edit(idx, { start: e.target.value })} />
                <Input type="time" step={900} min={PLAN_DAY_START} max={PLAN_DAY_END} className="h-8 text-xs" aria-label="Ende"
                  value={endOf(a)} onChange={(e) => e.target.value && edit(idx, { end: e.target.value })} />
                <Select value={a.instructorId ?? ""} onValueChange={(v) => edit(idx, { instructorId: v })}>
                  <SelectTrigger className="h-8 text-xs" aria-label="Lehrperson"><SelectValue placeholder="Lehrperson wählen">{name(a.instructorId)}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {instructors.filter((i) => i.status !== "inactive").map((i) => (
                      <SelectItem key={i.id} value={i.id}>{i.first_name} {i.last_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Termin entfernen"
                  onClick={() => apply(plan.filter((_, i) => i !== idx))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-1 pt-1">
              {[...state.selectedDates].sort().map((d) => (
                <Button key={d} type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => addOn(d)}>
                  <Plus className="mr-1 h-3 w-3" />
                  {format(parseISO(d), "EEE d.", { locale: de })}
                  {emptyDates.includes(d) ? " – noch kein Termin" : ""}
                </Button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Termine zwischen {PLAN_DAY_START} und {PLAN_DAY_END}, ohne Überschneidung am selben Tag.
            </p>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
