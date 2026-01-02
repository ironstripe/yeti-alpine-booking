import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";

import { useSchedulerData } from "@/hooks/useSchedulerData";
import { useUpdateTicketItem } from "@/hooks/useUpdateTicketItem";
import { DndKitProvider } from "./DndKitProvider";
import { SchedulerHeader, type ViewMode } from "./SchedulerHeader";
import { TimelineHeader } from "./TimelineHeader";
import { InstructorRow } from "./InstructorRow";
import { SelectionToolbar } from "./SelectionToolbar";
import { SchedulerSelectionProvider, useSchedulerSelection } from "@/contexts/SchedulerSelectionContext";
import { hasOverlap, TIME_SLOTS, type SchedulerBooking } from "@/lib/scheduler-utils";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";

const SLOT_WIDTH = 100; // px per hour

function SchedulerGridContent() {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("daily");
  const [selectedInstructorId, setSelectedInstructorId] = useState<string | null>(null);

  const { instructors, bookings, absences, isLoading, error } = useSchedulerData({
    date: selectedDate,
    instructorId: selectedInstructorId,
  });

  const updateTicketItem = useUpdateTicketItem();
  const { clearSelection } = useSchedulerSelection();

  // Clear selection when date changes
  useEffect(() => {
    clearSelection();
  }, [selectedDate, clearSelection]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearSelection();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clearSelection]);

  // Navigate to booking wizard with pre-filled context (for single slot click from old flow)
  const handleSlotClick = (instructorId: string, date: string, timeSlot: string) => {
    // This is now handled by the selection context
    // We could optionally navigate directly for double-click
  };

  // Handle drag & drop
  const handleBookingDrop = (
    booking: SchedulerBooking, 
    newInstructorId: string, 
    newTimeSlot: string
  ) => {
    // Only allow moving private lessons
    if (booking.type !== "private") {
      toast.error("Gruppenkurse können nicht verschoben werden");
      return;
    }

    // Calculate new end time (maintain duration)
    const startMinutes = parseInt(booking.timeStart.split(":")[0]) * 60 + parseInt(booking.timeStart.split(":")[1] || "0");
    const endMinutes = parseInt(booking.timeEnd.split(":")[0]) * 60 + parseInt(booking.timeEnd.split(":")[1] || "0");
    const duration = endMinutes - startMinutes;
    
    const newStartMinutes = parseInt(newTimeSlot.split(":")[0]) * 60;
    const newEndMinutes = newStartMinutes + duration;
    const newEndHour = Math.floor(newEndMinutes / 60);
    const newEndMinute = newEndMinutes % 60;
    const newEndTime = `${newEndHour.toString().padStart(2, "0")}:${newEndMinute.toString().padStart(2, "0")}`;

    // Check for overlaps
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    if (hasOverlap(newInstructorId, dateStr, newTimeSlot, newEndTime, bookings.filter(b => b.id !== booking.id))) {
      toast.error("Zeitraum bereits belegt");
      return;
    }

    // Update the booking
    updateTicketItem.mutate({
      ticketItemId: booking.id,
      instructorId: newInstructorId,
      timeStart: newTimeSlot,
      timeEnd: newEndTime,
    });
  };

  const instructorOptions = instructors.map((i) => ({
    id: i.id,
    name: `${i.first_name} ${i.last_name}`,
  }));

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h3 className="text-lg font-medium">Fehler beim Laden</h3>
        <p className="text-muted-foreground">
          Die Daten konnten nicht geladen werden. Bitte versuche es erneut.
        </p>
      </div>
    );
  }

  return (
    <DndKitProvider onBookingDrop={handleBookingDrop}>
      <div className="flex flex-col h-full bg-background">
        {/* Header with Date Navigation & Filters */}
        <SchedulerHeader
          date={selectedDate}
          onDateChange={setSelectedDate}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          selectedInstructorId={selectedInstructorId}
          onInstructorFilterChange={setSelectedInstructorId}
          instructorOptions={instructorOptions}
        />

        {/* Grid */}
        <div className="flex-1 overflow-auto">
          {/* Timeline Header */}
          <TimelineHeader />

          {/* Loading State */}
          {isLoading && (
            <div className="space-y-1">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex border-b">
                  <div className="w-48 shrink-0 border-r p-3">
                    <Skeleton className="h-4 w-24 mb-1" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <div className="flex-1 p-2">
                    <Skeleton className="h-12 w-full" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Instructor Rows */}
          {!isLoading && instructors.length === 0 && (
            <div className="flex items-center justify-center p-12 text-muted-foreground">
              Keine aktiven Lehrer gefunden
            </div>
          )}

          {!isLoading && instructors.map((instructor) => (
            <InstructorRow
              key={instructor.id}
              instructor={instructor}
              bookings={bookings}
              absences={absences}
              date={format(selectedDate, "yyyy-MM-dd")}
              slotWidth={SLOT_WIDTH}
              onSlotClick={handleSlotClick}
            />
          ))}
        </div>

        {/* Legend */}
        <div className="border-t p-3 flex flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-green-500" />
            <span>Privat (bezahlt)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-red-500" />
            <span>Privat (offen)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-blue-700" />
            <span>Gruppenkurs</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-gray-700" />
            <span>Abwesend</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-primary/20 border-2 border-primary" />
            <span>Ausgewählt</span>
          </div>
        </div>

        {/* Selection Toolbar */}
        <SelectionToolbar />
      </div>
    </DndKitProvider>
  );
}

export function SchedulerGrid() {
  return (
    <SchedulerSelectionProvider>
      <SchedulerGridContent />
    </SchedulerSelectionProvider>
  );
}
