import { forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { 
  BOOKABLE_HOURS,
  getInstructorColorClasses,
  type SchedulerInstructor, 
  type SchedulerBooking,
  type SchedulerAbsence 
} from "@/lib/scheduler-utils";
import { formatLanguages } from "@/lib/language-utils";
import { 
  formatDisciplines, 
  formatInstructorLevel, 
  getDisciplineBadges,
  matchesCapabilityFilter 
} from "@/lib/level-utils";
import { DaySlots } from "./DaySlots";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Languages, Award, GraduationCap } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { format } from "date-fns";

interface InstructorRowProps {
  instructor: SchedulerInstructor;
  dates: Date[];
  bookings: SchedulerBooking[];
  absences: SchedulerAbsence[];
  slotWidth: number;
  onSlotClick: (instructorId: string, date: string, timeSlot: string) => void;
  isHighlighted?: boolean;
  capabilityFilter?: string | null;
}

export const InstructorRow = forwardRef<HTMLDivElement, InstructorRowProps>(
  function InstructorRow(
    {
      instructor,
      dates,
      bookings,
      absences,
      slotWidth,
      onSlotClick,
      isHighlighted = false,
      capabilityFilter = null,
    },
    ref
  ) {
    const navigate = useNavigate();
    const colorClasses = getInstructorColorClasses(instructor.color);

    // Check if instructor matches capability filter
    const matchesFilter = matchesCapabilityFilter(instructor.specialization, capabilityFilter);
    const isDimmed = capabilityFilter && !matchesFilter;

    // Get discipline badges
    const badges = getDisciplineBadges(instructor.specialization);

    const handleNameClick = () => {
      navigate(`/instructors/${instructor.id}`);
    };

    return (
      <div 
        ref={ref}
        className={cn(
          "flex border-b hover:bg-muted/30 transition-all duration-300",
          isHighlighted && "ring-2 ring-primary ring-inset bg-primary/5",
          isDimmed && "opacity-40"
        )}
      >
        {/* Instructor Info Column - Sticky */}
        <div className="w-48 shrink-0 border-r p-3 flex items-center gap-2 sticky left-0 bg-background z-10 shadow-[2px_0_4px_rgba(0,0,0,0.05)]">
          {/* Color Indicator */}
          <div
            className={cn(
              "w-3 h-3 rounded-full shrink-0",
              colorClasses.bg
            )}
          />
          
          {/* Name & Info with HoverCard */}
          <HoverCard openDelay={200} closeDelay={100}>
            <HoverCardTrigger asChild>
              <button
                onClick={handleNameClick}
                className="min-w-0 text-left hover:underline focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded flex-1"
              >
                <p className="font-medium text-sm truncate">
                  {instructor.first_name} {instructor.last_name}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {instructor.todayBookingsCount > 0 
                    ? `${instructor.todayBookingsCount} Buchung${instructor.todayBookingsCount > 1 ? "en" : ""}`
                    : "Verfügbar"
                  }
                </p>
              </button>
            </HoverCardTrigger>
            <HoverCardContent side="right" align="start" className="w-72">
              <div className="space-y-2">
                <p className="font-medium">
                  {instructor.first_name} {instructor.last_name}
                </p>
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Languages className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Sprachen: {formatLanguages(instructor.languages)}</span>
                </div>
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Award className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Disziplinen: {formatDisciplines(instructor.specialization)}</span>
                </div>
                {instructor.level && (
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <GraduationCap className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>Stufe: {formatInstructorLevel(instructor.level)}</span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Klicken für Profil öffnen
                </p>
              </div>
            </HoverCardContent>
          </HoverCard>

          {/* Discipline Badges */}
          {badges.length > 0 && (
            <div className="flex gap-0.5 shrink-0">
              {badges.map((badge) => (
                <Tooltip key={badge.label}>
                  <TooltipTrigger asChild>
                    <span
                      className="text-[10px] font-bold px-1 py-0.5 rounded bg-muted text-muted-foreground"
                    >
                      {badge.label}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {badge.title}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          )}
        </div>

        {/* Timeline Slots for each day */}
        <div className="flex">
          {dates.map((date, dayIndex) => {
            const dateStr = format(date, "yyyy-MM-dd");
            return (
              <div 
                key={dateStr}
                className={cn(
                  "relative h-16",
                  dayIndex > 0 && "border-l-2 border-primary/30"
                )}
                style={{ width: `${BOOKABLE_HOURS * slotWidth}px` }}
              >
                <DaySlots
                  instructor={instructor}
                  date={dateStr}
                  bookings={bookings}
                  absences={absences}
                  slotWidth={slotWidth}
                  onSlotClick={onSlotClick}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  }
);
