import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format, parseISO, isValid } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";

import { useSchedulerData } from "@/hooks/useSchedulerData";
import { useUpdateTicketItem } from "@/hooks/useUpdateTicketItem";
import { DndKitProvider } from "./DndKitProvider";
import { SchedulerHeader, type ViewMode } from "./SchedulerHeader";
import { StickyTimeHeader } from "./StickyTimeHeader";
import { DaySection } from "./DaySection";
import { SelectionToolbar } from "./SelectionToolbar";
import { PendingAbsencesList } from "./PendingAbsencesList";
import { SchedulerSelectionProvider, useSchedulerSelection } from "@/contexts/SchedulerSelectionContext";
import { useUserRole } from "@/hooks/useUserRole";
import { hasOverlap, getDaysForViewMode, generateDateRange, isWithinOperationalHours, type SchedulerBooking } from "@/lib/scheduler-utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

const SLOT_WIDTH = 100; // px per hour

function SchedulerGridContent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // Read initial date from URL params if present
  const initialDate = useMemo(() => {
    const dateParam = searchParams.get("date");
    if (dateParam) {
      const parsed = parseISO(dateParam);
      if (isValid(parsed)) return parsed;
    }
    return new Date();
  }, []);

  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [viewMode, setViewMode] = useState<ViewMode>("daily");
  const [selectedInstructorId, setSelectedInstructorId] = useState<string | null>(null);
  const [highlightedInstructorId, setHighlightedInstructorId] = useState<string | null>(null);
  const [capabilityFilter, setCapabilityFilter] = useState<string | null>(null);
  const [compactMode, setCompactMode] = useState(false);

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
  const dayRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const { instructors, bookings, absences, isLoading, error } = useSchedulerData({
    startDate,
    endDate,
    instructorId: selectedInstructorId,
  });

  const updateTicketItem = useUpdateTicketItem();
  const { clearSelection, state, endDrag, cancelDrag } = useSchedulerSelection();
  const { isAdminOrOffice } = useUserRole();

  // Global mouseup handler for drag selection
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (state.drag.isDragging) {
        endDrag(bookings, absences);
      }
    };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Cancel drag on Escape
      if (e.key === "Escape" && state.drag.isDragging) {
        cancelDrag();
      }
    };

    window.addEventListener("mouseup", handleGlobalMouseUp);
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("mouseup", handleGlobalMouseUp);
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [state.drag.isDragging, bookings, absences, endDrag, cancelDrag]);

  // Filter instructors in compact mode (hide those without bookings or absences)
  const filteredInstructors = useMemo(() => {
    if (!compactMode) return instructors;
    
    return instructors.filter(instructor => {
      const hasBookings = bookings.some(b => b.instructorId === instructor.id);
      const hasAbsences = absences.some(a => a.instructorId === instructor.id);
      return hasBookings || hasAbsences;
    });
  }, [instructors, bookings, absences, compactMode]);

  const compactStats = useMemo(() => ({
    visible: filteredInstructors.length,
    total: instructors.length,
  }), [filteredInstructors.length, instructors.length]);

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

  // Scroll to instructor and highlight (first occurrence in any day section)
  const scrollToInstructor = useCallback((instructorId: string) => {
    requestAnimationFrame(() => {
      // Find the first day's instructor row
      const firstDateStr = format(visibleDates[0], "yyyy-MM-dd");
      const key = `${instructorId}-${firstDateStr}`;
      const element = instructorRefs.current.get(key);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightedInstructorId(instructorId);
        setTimeout(() => {
          setHighlightedInstructorId(null);
        }, 3000);
      }
    });
  }, [visibleDates]);

  // Jump to specific day section
  const handleJumpToDay = useCallback((dayIndex: number) => {
    const element = dayRefs.current.get(dayIndex);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
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
            visibleDates={visibleDates}
            onJumpToDay={handleJumpToDay}
            compactMode={compactMode}
            onCompactModeChange={setCompactMode}
            compactStats={compactStats}
          />
          {/* Admin: Show Pending Absences Button */}
          {isAdminOrOffice && <PendingAbsencesList />}
        </div>

        {/* Vertical Stacking Grid */}
        <div ref={scrollContainerRef} className="flex-1 overflow-auto">
          {/* Sticky Time Header */}
          <StickyTimeHeader slotWidth={SLOT_WIDTH} />

          {/* Sticky Jump Bar - Only for multi-day views */}
          {viewMode !== "daily" && visibleDates.length > 1 && !isLoading && (
            <div className="sticky top-[34px] z-25 bg-background/95 backdrop-blur-sm border-b border-border/30 px-3 py-1 flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground mr-1">Springe:</span>
              {visibleDates.map((date, index) => (
                <Button
                  key={index}
                  variant="ghost"
                  size="sm"
                  className="h-5 px-2 text-[10px] font-medium"
                  onClick={() => handleJumpToDay(index)}
                >
                  {format(date, "EEE d.", { locale: de })}
                </Button>
              ))}
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="space-y-0">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="flex border-b border-border/20">
                  <div className="w-40 shrink-0 border-r border-border/20 px-2 py-1">
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <div className="flex-1 p-1">
                    <Skeleton className="h-8 w-full" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* No Instructors State */}
          {!isLoading && instructors.length === 0 && (
            <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
              Keine aktiven Lehrer gefunden
            </div>
          )}

          {/* Compact Mode Info Bar */}
          {!isLoading && compactMode && filteredInstructors.length < instructors.length && (
            <div className="bg-muted/40 border-b border-border/30 px-3 py-1 text-[10px] text-muted-foreground">
              Kompakt: {filteredInstructors.length}/{instructors.length} Lehrer
            </div>
          )}

          {/* Day Sections - Vertically Stacked */}
          {!isLoading && filteredInstructors.length > 0 && visibleDates.map((date, dayIndex) => (
            <DaySection
              key={date.toISOString()}
              ref={(el) => {
                if (el) {
                  dayRefs.current.set(dayIndex, el);
                } else {
                  dayRefs.current.delete(dayIndex);
                }
              }}
              date={date}
              instructors={filteredInstructors}
              bookings={bookings}
              absences={absences}
              slotWidth={SLOT_WIDTH}
              onSlotClick={handleSlotClick}
              isFirstDay={dayIndex === 0}
              highlightedInstructorId={highlightedInstructorId}
              capabilityFilter={capabilityFilter}
              instructorRefs={instructorRefs}
              collapseEmpty={compactMode}
            />
          ))}
        </div>

        {/* Legend - Compact */}
        <div className="border-t border-border/30 px-3 py-2 flex flex-wrap gap-3 text-[10px]">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm bg-green-500" />
            <span>Bezahlt</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm bg-red-500" />
            <span>Offen</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm bg-blue-700" />
            <span>Gruppe</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm bg-gray-700" />
            <span>Abwesend</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm bg-primary/20 border border-primary" />
            <span>Auswahl</span>
          </div>
          <div className="ml-auto text-muted-foreground">
            09:00–16:00
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
