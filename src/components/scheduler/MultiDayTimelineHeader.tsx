import { format } from "date-fns";
import { de } from "date-fns/locale";
import { TIME_SLOTS, BOOKABLE_HOURS } from "@/lib/scheduler-utils";
import { cn } from "@/lib/utils";

interface MultiDayTimelineHeaderProps {
  dates: Date[];
  slotWidth: number;
}

export function MultiDayTimelineHeader({ dates, slotWidth }: MultiDayTimelineHeaderProps) {
  const isMultiDay = dates.length > 1;
  
  return (
    <div className="flex border-b bg-muted/50 sticky top-0 z-20">
      {/* Instructor column header - sticky left */}
      <div className="w-48 shrink-0 border-r p-3 font-medium text-sm text-muted-foreground sticky left-0 bg-muted/50 z-30">
        Lehrer
      </div>
      
      {/* Day groups */}
      <div className="flex">
        {dates.map((date, dayIndex) => (
          <div 
            key={date.toISOString()} 
            className={cn(
              "flex flex-col",
              dayIndex > 0 && "border-l-2 border-primary/30" // Thick separator between days
            )}
            style={{ width: `${BOOKABLE_HOURS * slotWidth}px` }}
          >
            {/* Date header - only show for multi-day view */}
            {isMultiDay && (
              <div className="text-center py-1.5 font-semibold text-sm border-b bg-muted">
                {format(date, "EEE, d. MMM", { locale: de })}
              </div>
            )}
            
            {/* Time slots for this day */}
            <div className="flex">
              {TIME_SLOTS.slice(0, -1).map((time) => (
                <div
                  key={`${date.toISOString()}-${time}`}
                  className="border-r last:border-r-0 p-2 text-center text-xs font-medium text-muted-foreground"
                  style={{ width: `${slotWidth}px` }}
                >
                  {time}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
