import { CalendarCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBookingWizard, type AppointmentSlot } from "@/contexts/BookingWizardContext";

function formatDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("de-CH", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function planKey(plan: AppointmentSlot[]): string {
  return plan
    .map((a) => `${a.date}|${a.startTime}|${a.durationMinutes}|${a.instructorId ?? ""}`)
    .sort()
    .join(";");
}

/**
 * Shows the plan taken over from the scheduler. Derived only from the
 * canonical `appointments` list, and marks it as changed once the user
 * edits the plan in the wizard, so it never describes a stale selection.
 */
export function SchedulerPrefillBanner() {
  const { state, clearSchedulerPrefill } = useBookingWizard();

  // Explicit provenance is the only proof of a Scheduler prefill;
  // `appointments` is only the current plan to display.
  if (!state.schedulerPrefill) return null;
  const appointments = state.appointments ?? [];
  if (appointments.length === 0) return null;
  const origin = state.schedulerPrefill.plan;

  const modified = planKey(origin) !== planKey(appointments);
  const dates = [...new Set(appointments.map((a) => a.date))].sort();
  const instructorIds = new Set(appointments.map((a) => a.instructorId).filter(Boolean));
  const instructorLabel =
    instructorIds.size > 1
      ? `${instructorIds.size} Lehrpersonen`
      : state.instructor && (instructorIds.size === 0 || instructorIds.has(state.instructor.id))
        ? `${state.instructor.first_name} ${state.instructor.last_name}`
        : null;

  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5 px-4 py-3 flex flex-wrap items-center gap-3">
      <CalendarCheck className="h-4 w-4 text-primary shrink-0" />
      <div className="flex flex-wrap items-center gap-2 text-sm flex-1 min-w-0">
        <span className="font-medium">
          {modified ? "Aus Stundenplan übernommen, danach angepasst:" : "Aus Stundenplan übernommen:"}
        </span>
        {instructorLabel && <Badge variant="secondary">{instructorLabel}</Badge>}
        <Badge variant="secondary">
          {appointments.length} {appointments.length === 1 ? "Termin" : "Termine"}
        </Badge>
        {dates.slice(0, 5).map((d) => (
          <Badge key={d} variant="outline">
            {formatDate(d)}
          </Badge>
        ))}
        {dates.length > 5 && <Badge variant="outline">+{dates.length - 5} weitere</Badge>}
      </div>
      <Button variant="ghost" size="sm" onClick={clearSchedulerPrefill} className="text-muted-foreground">
        <X className="h-4 w-4 mr-1" />
        Verwerfen
      </Button>
    </div>
  );
}
