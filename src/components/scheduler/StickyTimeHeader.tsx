import { TIME_SLOTS, BOOKABLE_HOURS } from "@/lib/scheduler-utils";
import { ColumnResizeHandle } from "./ColumnResizeHandle";

interface StickyTimeHeaderProps {
  slotWidth: number;
  showDayColumn?: boolean;
  instructorColumnWidth: number;
  onColumnResize: (deltaX: number) => void;
  onResizeEnd: () => void;
}

export function StickyTimeHeader({ 
  slotWidth, 
  showDayColumn = false,
  instructorColumnWidth,
  onColumnResize,
  onResizeEnd,
}: StickyTimeHeaderProps) {
  return (
    <div className="flex border-b border-slate-300 bg-slate-100 sticky top-0 z-30">
      {/* Instructor column placeholder - compact sticky left with resize handle */}
      <div 
        className="shrink-0 border-r border-slate-300 px-2 py-1.5 font-medium text-xs text-muted-foreground sticky left-0 bg-slate-100 z-40 relative"
        style={{ width: `${instructorColumnWidth}px` }}
      >
        Lehrer
        <ColumnResizeHandle onResize={onColumnResize} onResizeEnd={onResizeEnd} />
      </div>
      
      {/* Day column placeholder for instructor-focus view */}
      {showDayColumn && (
        <div 
          className="w-14 shrink-0 border-r border-slate-300 py-1.5 text-center text-[10px] font-medium text-muted-foreground sticky bg-slate-100 z-35"
          style={{ left: `${instructorColumnWidth}px` }}
        >
          Tag
        </div>
      )}
      
      {/* Time slots - 09:00 to 15:00 (last hour ends at 16:00) */}
      <div className="flex" style={{ width: `${BOOKABLE_HOURS * slotWidth}px` }}>
        {TIME_SLOTS.slice(0, -1).map((time) => (
          <div 
            key={time}
            className="border-r border-slate-300 py-1.5 text-center text-[10px] font-medium text-muted-foreground"
            style={{ width: `${slotWidth}px` }}
          >
            {time}
          </div>
        ))}
      </div>
    </div>
  );
}
