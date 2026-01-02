import { useMemo, useRef } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarDays, ExternalLink, Loader2 } from "lucide-react";
import { useSchedulerData } from "@/hooks/useSchedulerData";
import { StickyTimeHeader } from "@/components/scheduler/StickyTimeHeader";
import { DaySection } from "@/components/scheduler/DaySection";
import { DndKitProvider } from "@/components/scheduler/DndKitProvider";
import { SchedulerSelectionProvider } from "@/contexts/SchedulerSelectionContext";
import { generateDateRange } from "@/lib/scheduler-utils";

const SLOT_WIDTH = 100;

interface EmbeddedSchedulerProps {
  defaultDays?: number;
}

export function EmbeddedScheduler({ defaultDays = 2 }: EmbeddedSchedulerProps) {
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);
  
  const visibleDates = useMemo(() => 
    generateDateRange(today, defaultDays), 
    [today, defaultDays]
  );

  const startDate = visibleDates[0];
  const endDate = visibleDates[visibleDates.length - 1];

  const { instructors, bookings, absences, isLoading, error } = useSchedulerData({
    startDate,
    endDate,
  });

  const dayRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardContent className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="h-full">
        <CardContent className="flex items-center justify-center h-full">
          <p className="text-destructive text-sm">Fehler beim Laden des Kalenders</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <SchedulerSelectionProvider>
      <DndKitProvider>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">
                Stundenplan
              </span>
              <span className="text-xs text-muted-foreground">
                {format(today, "d. MMMM yyyy", { locale: de })}
              </span>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-7 text-xs"
              onClick={() => navigate("/scheduler")}
            >
              Vollansicht
              <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
          </div>

          {/* Scheduler Content */}
          <div className="flex-1 overflow-auto">
            <StickyTimeHeader slotWidth={SLOT_WIDTH} />
            
            {visibleDates.map((date, dayIndex) => (
              <DaySection
                key={date.toISOString()}
                ref={(el) => dayRefs.current.set(dayIndex, el)}
                date={date}
                instructors={instructors}
                bookings={bookings}
                absences={absences}
                slotWidth={SLOT_WIDTH}
                onSlotClick={() => {}}
                isFirstDay={dayIndex === 0}
              />
            ))}
          </div>
        </div>
      </DndKitProvider>
    </SchedulerSelectionProvider>
  );
}
