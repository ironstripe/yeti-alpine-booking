import { forwardRef } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { 
  BOOKABLE_HOURS,
  getInstructorColorClasses,
  isInstructorAbsent,
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

const ROW_HEIGHT = 40; // Compact row height in px

interface SingleDayInstructorRowProps {
  instructor: SchedulerInstructor;
  date: Date;
  bookings: SchedulerBooking[];
  absences: SchedulerAbsence[];
  slotWidth: number;
  onSlotClick: (instructorId: string, date: string, timeSlot: string) => void;
  isHighlighted?: boolean;
  capabilityFilter?: string | null;
  rowIndex?: number;
}

export const SingleDayInstructorRow = forwardRef<HTMLDivElement, SingleDayInstructorRowProps>(
  function SingleDayInstructorRow(
    {
      instructor,
      date,
      bookings,
      absences,
      slotWidth,
      onSlotClick,
      isHighlighted = false,
      capabilityFilter = null,
      rowIndex = 0,
    },
    ref
  ) {
    const navigate = useNavigate();
    const colorClasses = getInstructorColorClasses(instructor.color);
    const dateStr = format(date, "yyyy-MM-dd");

    // Check if instructor matches capability filter
    const matchesFilter = matchesCapabilityFilter(instructor.specialization, capabilityFilter);
    const isDimmed = capabilityFilter && !matchesFilter;

    // Check if instructor is absent this day
    const absenceInfo = isInstructorAbsent(instructor.id, dateStr, absences);
    const isFullDayAbsent = !!absenceInfo;

    // Get discipline badges
    const badges = getDisciplineBadges(instructor.specialization);

    const handleNameClick = () => {
      navigate(`/instructors/${instructor.id}`);
    };

    // Calculate booking count for this specific day
    const dayBookingCount = bookings.filter(
      b => b.instructorId === instructor.id && b.date === dateStr
    ).length;

    // Zebra striping for alternate rows
    const isEvenRow = rowIndex % 2 === 0;

    return (
      <div 
        ref={ref}
        className={cn(
          "flex border-b border-slate-300 hover:bg-slate-100/70 transition-all duration-200",
          isHighlighted && "ring-2 ring-primary ring-inset bg-primary/5",
          isDimmed && "opacity-40",
          isFullDayAbsent && "bg-muted/20",
          isEvenRow && !isFullDayAbsent && !isHighlighted && "bg-slate-50"
        )}
      >
        {/* Instructor Info Column - Compact Sticky */}
        <div className={cn(
          "w-28 shrink-0 border-r border-slate-300 px-2 py-1 flex items-center gap-1.5 sticky left-0 z-10 shadow-[1px_0_2px_rgba(0,0,0,0.03)]",
          isEvenRow && !isFullDayAbsent && !isHighlighted ? "bg-slate-50" : "bg-background"
        )}>
          {/* Color Indicator */}
          <div
            className={cn(
              "w-2 h-2 rounded-full shrink-0",
              colorClasses.bg,
              isFullDayAbsent && "opacity-50"
            )}
          />
          
          {/* Name with HoverCard - Single Line */}
          <HoverCard openDelay={200} closeDelay={100}>
            <HoverCardTrigger asChild>
              <button
                onClick={handleNameClick}
                className="min-w-0 text-left hover:underline focus:outline-none rounded truncate flex-1"
              >
                <span className={cn(
                  "font-medium text-xs truncate",
                  isFullDayAbsent && "text-muted-foreground"
                )}>
                  {instructor.first_name} {instructor.last_name.charAt(0)}.
                </span>
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

          {/* Inline: Discipline Badges + Count */}
          <div className="flex items-center gap-0.5 shrink-0">
            {badges.map((badge) => (
              <Tooltip key={badge.label}>
                <TooltipTrigger asChild>
                  <span className={cn(
                    "text-[10px] leading-none",
                    isFullDayAbsent && "opacity-50"
                  )}>
                    {badge.label === "K" ? "⛷️" : "🏂"}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {badge.title}
                </TooltipContent>
              </Tooltip>
            ))}
            {dayBookingCount > 0 && !isFullDayAbsent && (
              <span className="text-[10px] text-muted-foreground ml-0.5">
                ({dayBookingCount})
              </span>
            )}
          </div>
        </div>

        {/* Single Day Slots - Compact Height */}
        <div 
          className="relative"
          style={{ 
            width: `${BOOKABLE_HOURS * slotWidth}px`,
            height: `${ROW_HEIGHT}px`
          }}
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
      </div>
    );
  }
);
