import { forwardRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { de } from "date-fns/locale";
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

const SUB_ROW_HEIGHT = 32; // Compact sub-row height

interface InstructorWeekBlockProps {
  instructor: SchedulerInstructor;
  dates: Date[];
  bookings: SchedulerBooking[];
  absences: SchedulerAbsence[];
  slotWidth: number;
  onSlotClick: (instructorId: string, date: string, timeSlot: string) => void;
  isHighlighted?: boolean;
  capabilityFilter?: string | null;
  rowIndex?: number;
}

export const InstructorWeekBlock = forwardRef<HTMLDivElement, InstructorWeekBlockProps>(
  function InstructorWeekBlock(
    {
      instructor,
      dates,
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

    // Check if instructor matches capability filter
    const matchesFilter = matchesCapabilityFilter(instructor.specialization, capabilityFilter);
    const isDimmed = capabilityFilter && !matchesFilter;

    // Get discipline badges
    const badges = getDisciplineBadges(instructor.specialization);

    const handleNameClick = () => {
      navigate(`/instructors/${instructor.id}`);
    };

    // Calculate total bookings across all dates
    const totalBookings = useMemo(() => {
      return bookings.filter(b => b.instructorId === instructor.id).length;
    }, [bookings, instructor.id]);

    // Zebra striping between instructors
    const isEvenRow = rowIndex % 2 === 0;
    const bgColor = isEvenRow ? "bg-slate-50" : "bg-white";

    return (
      <div 
        ref={ref}
        className={cn(
          "border-b-2 border-slate-300",
          isHighlighted && "ring-2 ring-primary ring-inset bg-primary/5",
          isDimmed && "opacity-40"
        )}
      >
        {/* CSS Grid layout: instructor column spans all day rows */}
        <div className="flex">
          {/* Instructor Info Column - spans all days */}
          <div className={cn(
            "w-40 shrink-0 border-r border-slate-300 sticky left-0 z-20",
            bgColor
          )}>
            <div className="px-2 py-2 flex items-center gap-1.5 h-full">
              {/* Color Indicator */}
              <div
                className={cn(
                  "w-2.5 h-2.5 rounded-full shrink-0",
                  colorClasses.bg
                )}
              />
              
              {/* Name with HoverCard */}
              <HoverCard openDelay={200} closeDelay={100}>
                <HoverCardTrigger asChild>
                  <button
                    onClick={handleNameClick}
                    className="min-w-0 text-left hover:underline focus:outline-none rounded truncate flex-1"
                  >
                    <span className="font-medium text-xs truncate">
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

              {/* Discipline Badges + Total Count */}
              <div className="flex items-center gap-0.5 shrink-0">
                {badges.map((badge) => (
                  <Tooltip key={badge.label}>
                    <TooltipTrigger asChild>
                      <span className="text-[10px] leading-none">
                        {badge.label === "K" ? "⛷️" : "🏂"}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {badge.title}
                    </TooltipContent>
                  </Tooltip>
                ))}
                {totalBookings > 0 && (
                  <span className="text-[10px] text-muted-foreground ml-0.5 font-medium">
                    ({totalBookings})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Day Sub-Rows Container */}
          <div className="flex-1 flex flex-col">
            {dates.map((date, dayIndex) => {
              const dateStr = format(date, "yyyy-MM-dd");
              const absenceInfo = isInstructorAbsent(instructor.id, dateStr, absences);
              const isAbsent = !!absenceInfo;
              const isLastDay = dayIndex === dates.length - 1;

              return (
                <div 
                  key={date.toISOString()}
                  className={cn(
                    "flex border-b border-slate-200",
                    isLastDay && "border-b-0",
                    isAbsent && "bg-muted/20",
                    !isAbsent && bgColor
                  )}
                >
                  {/* Day Label */}
                  <div className={cn(
                    "w-14 shrink-0 border-r border-slate-200 px-1.5 flex items-center justify-between sticky left-40 z-10 text-[10px]",
                    isAbsent ? "bg-muted/20" : bgColor
                  )}>
                    <span className={cn(
                      "font-medium",
                      isAbsent && "text-muted-foreground"
                    )}>
                      {format(date, "EEE", { locale: de })}
                    </span>
                    <span className="text-muted-foreground">
                      {format(date, "d.")}
                    </span>
                  </div>

                  {/* Time Slots */}
                  <div 
                    className="relative"
                    style={{ 
                      width: `${BOOKABLE_HOURS * slotWidth}px`,
                      height: `${SUB_ROW_HEIGHT}px`
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
            })}
          </div>
        </div>
      </div>
    );
  }
);
