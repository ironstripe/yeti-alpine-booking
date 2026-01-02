import { TIME_SLOTS, BOOKABLE_HOURS } from "@/lib/scheduler-utils";

interface StickyTimeHeaderProps {
  slotWidth: number;
}

export function StickyTimeHeader({ slotWidth }: StickyTimeHeaderProps) {
  return (
    <div className="flex border-b bg-muted/50 sticky top-0 z-30">
      {/* Instructor column placeholder - sticky left */}
      <div className="w-48 shrink-0 border-r p-3 font-medium text-sm text-muted-foreground sticky left-0 bg-muted/50 z-40">
        Lehrer
      </div>
      
      {/* Time slots - 09:00 to 15:00 (last hour ends at 16:00) */}
      <div className="flex" style={{ width: `${BOOKABLE_HOURS * slotWidth}px` }}>
        {TIME_SLOTS.slice(0, -1).map((time) => (
          <div 
            key={time}
            className="border-r p-2 text-center text-xs font-medium text-muted-foreground"
            style={{ width: `${slotWidth}px` }}
          >
            {time}
          </div>
        ))}
      </div>
    </div>
  );
}
