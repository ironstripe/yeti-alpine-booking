import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { CalendarDays } from "lucide-react";

interface DayNavigatorProps {
  dates: Date[];
  onJumpToDay: (index: number) => void;
}

export function DayNavigator({ dates, onJumpToDay }: DayNavigatorProps) {
  if (dates.length <= 1) return null;

  return (
    <div className="flex items-center gap-1 border-l pl-3 ml-2">
      <CalendarDays className="h-4 w-4 text-muted-foreground mr-1" />
      <span className="text-xs text-muted-foreground mr-1">Springe zu:</span>
      {dates.map((date, index) => (
        <Button
          key={date.toISOString()}
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => onJumpToDay(index)}
        >
          {format(date, "EEE d.", { locale: de })}
        </Button>
      ))}
    </div>
  );
}
