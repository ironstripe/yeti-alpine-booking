import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, Plus, Building, Hourglass, Link2, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getBookingBarClasses,
  type SchedulerAbsence,
  type SchedulerBooking,
  type SchedulerInstructor,
} from "@/lib/scheduler-utils";
import {
  buildAgendaForInstructor,
  getAvailabilityState,
  AVAILABILITY_LABELS,
  type AgendaEntry,
} from "@/lib/scheduler-agenda";
import { BookingDetailDialog } from "../BookingDetailDialog";
import type { MobileSlotTapPayload } from "./MobileSlotContext";

const ABSENCE_LABELS: Record<string, string> = {
  vacation: "Ferien",
  sick: "Krank",
  organization: "Organisation",
  office_duty: "Bürodienst",
  other: "Abwesend",
};

interface MobileSchedulerAgendaProps {
  instructors: SchedulerInstructor[];
  date: Date;
  bookings: SchedulerBooking[];
  absences: SchedulerAbsence[];
  isLoading?: boolean;
  highlightedInstructorId?: string | null;
  onFreeSlotTap: (payload: MobileSlotTapPayload) => void;
}

export function MobileSchedulerAgenda({
  instructors,
  date,
  bookings,
  absences,
  isLoading = false,
  highlightedInstructorId,
  onFreeSlotTap,
}: MobileSchedulerAgendaProps) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [detailItemId, setDetailItemId] = useState<string | null>(null);

  const dateKey = format(date, "yyyy-MM-dd");

  const sections = useMemo(
    () =>
      instructors.map((instructor) => {
        const entries = buildAgendaForInstructor(instructor.id, dateKey, bookings, absences);
        return {
          instructor,
          entries,
          availability: getAvailabilityState(entries),
        };
      }),
    [instructors, dateKey, bookings, absences]
  );

  const handleBookingTap = (booking: SchedulerBooking) => {
    if (booking.type === "group") {
      navigate(`/trainings/capacity?course=${booking.ticketId}`);
      return;
    }
    setDetailItemId(booking.id);
  };

  if (isLoading) {
    return (
      <div className="space-y-3 p-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Keine Lehrer für die aktuellen Filter.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {sections.map(({ instructor, entries, availability }) => {
        const isCollapsed = collapsed[instructor.id];
        const name = `${instructor.first_name} ${instructor.last_name}`;
        return (
          <section
            key={instructor.id}
            className={cn(
              "bg-background",
              highlightedInstructorId === instructor.id && "ring-2 ring-primary ring-inset"
            )}
          >
            <button
              type="button"
              onClick={() =>
                setCollapsed((prev) => ({ ...prev, [instructor.id]: !prev[instructor.id] }))
              }
              className="sticky top-0 z-10 flex min-h-12 w-full items-center justify-between gap-2 border-b border-border bg-muted/60 px-3 py-2 text-left backdrop-blur"
            >
              <span className="flex min-w-0 items-center gap-2">
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate text-sm font-semibold">{name}</span>
                {instructor.specialization && (
                  <span className="shrink-0 text-xs">
                    {instructor.specialization === "snowboard" ? "🏂" : "⛷️"}
                  </span>
                )}
              </span>
              <Badge
                variant={
                  availability === "free"
                    ? "secondary"
                    : availability === "partly"
                      ? "outline"
                      : "destructive"
                }
                className="shrink-0 text-[10px]"
              >
                {AVAILABILITY_LABELS[availability]}
              </Badge>
            </button>

            {!isCollapsed && (
              <ul className="divide-y divide-border/60">
                {entries.map((entry) => (
                  <AgendaRow
                    key={`${entry.kind}-${entry.startTime}-${entry.endTime}-${
                      entry.kind === "booking" ? entry.booking.id : entry.kind === "absence" ? entry.absence.id : "free"
                    }`}
                    entry={entry}
                    onFreeTap={() =>
                      onFreeSlotTap({
                        instructorId: instructor.id,
                        date: dateKey,
                        startTime: entry.startTime,
                        endTime: entry.endTime,
                      })
                    }
                    onBookingTap={handleBookingTap}
                  />
                ))}
                {entries.length === 0 && (
                  <li className="px-3 py-3 text-xs text-muted-foreground">
                    Keine Einträge
                  </li>
                )}
              </ul>
            )}
          </section>
        );
      })}

      <BookingDetailDialog
        open={!!detailItemId}
        onOpenChange={(open) => !open && setDetailItemId(null)}
        ticketItemId={detailItemId}
      />
    </div>
  );
}

function AgendaRow({
  entry,
  onFreeTap,
  onBookingTap,
}: {
  entry: AgendaEntry;
  onFreeTap: () => void;
  onBookingTap: (booking: SchedulerBooking) => void;
}) {
  const timeLabel = `${entry.startTime}–${entry.endTime}`;

  if (entry.kind === "free") {
    return (
      <li>
        <button
          type="button"
          onClick={onFreeTap}
          className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left active:bg-accent"
        >
          <span className="w-[92px] shrink-0 font-mono text-xs text-muted-foreground">
            {timeLabel}
          </span>
          <span className="flex-1 text-sm text-muted-foreground">Frei</span>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15">
            <Plus className="h-4 w-4 text-primary" />
          </span>
        </button>
      </li>
    );
  }

  if (entry.kind === "absence") {
    return (
      <li className="flex min-h-12 items-center gap-3 bg-muted/30 px-3 py-2">
        <span className="w-[92px] shrink-0 font-mono text-xs text-muted-foreground">
          {timeLabel}
        </span>
        <span className="flex flex-1 items-center gap-1.5 text-sm">
          <Ban className="h-3.5 w-3.5 text-muted-foreground" />
          {ABSENCE_LABELS[entry.absence.type] || "Abwesend"}
          {entry.absence.reason && (
            <span className="truncate text-xs text-muted-foreground">
              · {entry.absence.reason}
            </span>
          )}
        </span>
      </li>
    );
  }

  const booking = entry.booking;
  const title = booking.isSharedLesson && booking.sharedCustomerNames?.length
    ? booking.sharedCustomerNames.join(" / ")
    : booking.participantName ||
      (booking.type === "group" ? "Gruppe" : booking.type === "office_shift" ? "Bürodienst" : "Privat");

  const typeLabel =
    booking.type === "group"
      ? "Gruppe"
      : booking.type === "office_shift"
        ? "Bürodienst"
        : "Privat";

  return (
    <li>
      <button
        type="button"
        onClick={() => onBookingTap(booking)}
        className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left active:bg-accent"
      >
        <span className="w-[92px] shrink-0 font-mono text-xs text-muted-foreground">
          {timeLabel}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                "h-2.5 w-2.5 shrink-0 rounded-sm border",
                booking.isProvisional
                  ? "bg-amber-400 border-amber-600"
                  : getBookingBarClasses(
                      booking.type as "private" | "group" | "office_shift",
                      booking.isPaid
                    )
              )}
            />
            <span className="truncate text-sm font-medium">{title}</span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>{typeLabel}</span>
            {booking.participantSport && (
              <span>{booking.participantSport === "snowboard" ? "🏂" : "⛷️"}</span>
            )}
            {booking.type === "group" && (
              <span>
                {booking.currentParticipants ?? 0}/{booking.maxParticipants ?? "?"} Teilnehmer
              </span>
            )}
            {booking.isPartOfPeriod && (
              <span className="flex items-center gap-0.5">
                <Link2 className="h-3 w-3" /> Periode
              </span>
            )}
            {booking.type === "office_shift" && <Building className="h-3 w-3" />}
            {booking.isProvisional && (
              <span className="flex items-center gap-0.5 text-amber-600">
                <Hourglass className="h-3 w-3" /> Provisorisch
              </span>
            )}
            {booking.type === "private" && !booking.isProvisional && (
              <span className={booking.isPaid ? "text-emerald-600" : "text-orange-600"}>
                {booking.isPaid ? "Bezahlt" : "Offen"}
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}
