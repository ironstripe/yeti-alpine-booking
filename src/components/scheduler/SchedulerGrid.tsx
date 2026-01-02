import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format, addDays } from "date-fns";
import { toast } from "sonner";

import { useSchedulerData } from "@/hooks/useSchedulerData";
import { useUpdateTicketItem } from "@/hooks/useUpdateTicketItem";
import { DndKitProvider } from "./DndKitProvider";
import { SchedulerHeader, type ViewMode } from "./SchedulerHeader";
import { MultiDayTimelineHeader } from "./MultiDayTimelineHeader";
import { InstructorRow } from "./InstructorRow";
import { SelectionToolbar } from "./SelectionToolbar";
import { PendingAbsencesList } from "./PendingAbsencesList";
import { SchedulerSelectionProvider, useSchedulerSelection } from "@/contexts/SchedulerSelectionContext";
import { useUserRole } from "@/hooks/useUserRole";
import { hasOverlap, getDaysForViewMode, generateDateRange, isWithinOperationalHours, type SchedulerBooking } from "@/lib/scheduler-utils";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";

const SLOT_WIDTH = 100; // px per hour

function SchedulerGridContent() {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("daily");
  const [selectedInstructorId, setSelectedInstructorId] = useState<string | null>(null);
  const [highlightedInstructorId, setHighlightedInstructorId] = useState<string | null>(null);
  const [capabilityFilter, setCapabilityFilter] = useState<string | null>(null);

  // Calculate visible dates based on view mode
  const visibleDates = useMemo(() => {
    const days = getDaysForViewMode(viewMode);
    return generateDateRange(selectedDate, days);
  }, [selectedDate, viewMode]);

  // Calculate date range for data fetching
  const startDate = visibleDates[0];
  const endDate = visibleDates[visibleDates.length - 1];

  // Refs for scroll-to-row functionality
  const instructorRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const { instructors, bookings, absences, isLoading, error } = useSchedulerData({
    startDate,
    endDate,
    instructorId: selectedInstructorId,
  });

  const updateTicketItem = useUpdateTicketItem();
  const { clearSelection } = useSchedulerSelection();
  const { isAdminOrOffice } = useUserRole();

  // Clear selection when date changes
  useEffect(() => {
    clearSelection();
  }, [selectedDate, clearSelection]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearSelection();
        setHighlightedInstructorId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clearSelection]);

  // Scroll to instructor and highlight
  const scrollToInstructor = useCallback((instructorId: string) => {
    // Wait for next frame to ensure refs are set
    requestAnimationFrame(() => {
      const element = instructorRefs.current.get(instructorId);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightedInstructorId(instructorId);
        // Remove highlight after 3 seconds
        setTimeout(() => {
          setHighlightedInstructorId(null);
        }, 3000);
      }
    });
  }, []);

  // Navigate to booking wizard with pre-filled context (for single slot click from old flow)
  const handleSlotClick = (instructorId: string, date: string, timeSlot: string) => {
    // This is now handled by the selection context
    // We could optionally navigate directly for double-click
  };

  // Handle drag & drop with cross-day support
  const handleBookingDrop = (
    booking: SchedulerBooking, 
    newInstructorId: string, 
    newDate: string,
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

    // Validate operational hours (09:00 - 16:00)
    if (!isWithinOperationalHours(newTimeSlot, newEndTime)) {
      toast.error("Buchungen nur zwischen 09:00 - 16:00 erlaubt");
      return;
    }

    // Check for overlaps on the target date
    if (hasOverlap(newInstructorId, newDate, newTimeSlot, newEndTime, bookings.filter(b => b.id !== booking.id))) {
      toast.error("Zeitraum bereits belegt");
      return;
    }

    // Update the booking with new date
    updateTicketItem.mutate({
      ticketItemId: booking.id,
      instructorId: newInstructorId,
      date: newDate,
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
        <div className="flex items-center justify-between">
          <SchedulerHeader
            date={selectedDate}
            onDateChange={setSelectedDate}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            selectedInstructorId={selectedInstructorId}
            onInstructorFilterChange={setSelectedInstructorId}
            instructorOptions={instructorOptions}
            onInstructorSelect={scrollToInstructor}
            capabilityFilter={capabilityFilter}
            onCapabilityFilterChange={setCapabilityFilter}
          />
          {/* Admin: Show Pending Absences Button */}
          {isAdminOrOffice && <PendingAbsencesList />}
        </div>

        {/* Grid with horizontal scroll for multi-day */}
        <div className="flex-1 overflow-auto">
          {/* Multi-Day Timeline Header */}
          <MultiDayTimelineHeader dates={visibleDates} slotWidth={SLOT_WIDTH} />

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
              ref={(el) => {
                if (el) {
                  instructorRefs.current.set(instructor.id, el);
                } else {
                  instructorRefs.current.delete(instructor.id);
                }
              }}
              instructor={instructor}
              dates={visibleDates}
              bookings={bookings}
              absences={absences}
              slotWidth={SLOT_WIDTH}
              onSlotClick={handleSlotClick}
              isHighlighted={highlightedInstructorId === instructor.id}
              capabilityFilter={capabilityFilter}
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
          <div className="ml-auto text-muted-foreground">
            Betriebszeiten: 09:00 - 16:00 (Liftschluss)
          </div>
        </div>

        {/* Selection Toolbar */}
        <SelectionToolbar bookings={bookings} />
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
