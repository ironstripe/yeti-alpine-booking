import { CalendarCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBookingWizard } from "@/contexts/BookingWizardContext";

function formatDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("de-CH", { weekday: "short", day: "2-digit", month: "2-digit" });
}

/**
 * Shows which values were taken over from the scheduler selection
 * and lets the user discard them.
 */
export function SchedulerPrefillBanner() {
  const { state, clearSchedulerPrefill } = useBookingWizard();

  const appointments = state.appointments;
  if (!appointments || appointments.length === 0) return null;

  const dates = [...new Set(appointments.map((a) => a.date))].sort();
  const instructorName = state.instructor
    ? `${state.instructor.first_name} ${state.instructor.last_name}`
    : null;

  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5 px-4 py-3 flex flex-wrap items-center gap-3">
      <CalendarCheck className="h-4 w-4 text-primary shrink-0" />
      <div className="flex flex-wrap items-center gap-2 text-sm flex-1 min-w-0">
        <span className="font-medium">Aus Stundenplan übernommen:</span>
        {instructorName && <Badge variant="secondary">{instructorName}</Badge>}
        {state.timeSlot && <Badge variant="secondary">{state.timeSlot}</Badge>}
        {dates.slice(0, 5).map((d) => (
          <Badge key={d} variant="outline">
            {formatDate(d)}
          </Badge>
        ))}
        {dates.length > 5 && (
          <Badge variant="outline">+{dates.length - 5} weitere</Badge>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={clearSchedulerPrefill}
        className="text-muted-foreground"
      >
        <X className="h-4 w-4 mr-1" />
        Verwerfen
      </Button>
    </div>
  );
}
