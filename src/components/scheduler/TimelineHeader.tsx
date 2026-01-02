import { TIME_SLOTS } from "@/lib/scheduler-utils";

export function TimelineHeader() {
  return (
    <div className="flex border-b bg-muted/50 sticky top-0 z-10">
      {/* Instructor column header */}
      <div className="w-48 shrink-0 border-r p-3 font-medium text-sm text-muted-foreground">
        Lehrer
      </div>
      
      {/* Time slot headers */}
      <div className="flex flex-1">
        {TIME_SLOTS.map((time, index) => (
          <div
            key={time}
            className="flex-1 min-w-[100px] border-r last:border-r-0 p-2 text-center text-sm font-medium text-muted-foreground"
          >
            {time}
          </div>
        ))}
      </div>
    </div>
  );
}
