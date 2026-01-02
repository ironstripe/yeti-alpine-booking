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
import { InstructorFocusView } from "./InstructorFocusView";
import { SelectionToolbar } from "./SelectionToolbar";
import { PendingAbsencesList } from "./PendingAbsencesList";
import { SchedulerSelectionProvider, useSchedulerSelection } from "@/contexts/SchedulerSelectionContext";
import { useUserRole } from "@/hooks/useUserRole";
import { hasOverlap, getDaysForViewMode, generateDateRange, isWithinOperationalHours, type SchedulerBooking } from "@/lib/scheduler-utils";
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
  const [viewMode, setViewMode] = useState<ViewMode>("weekly"); // Default to weekly for instructor focus
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const { instructors, bookings, absences, isLoading, error } = useSchedulerData({
    startDate,
    endDate,
    instructorId: selectedInstructorId,
  });

  const updateTicketItem = useUpdateTicketItem();
  const { clearSelection, state, endDrag, cancelDrag, updateDrag } = useSchedulerSelection();
  const { isAdminOrOffice } = useUserRole();

  // Helper to check conflicts at a slot position
  const checkSlotConflict = useCallback((instructorId: string, date: string, slotTime: string): boolean => {
    const slotMin = timeToMinutes(slotTime);
    const slotEnd = slotMin + 60;
    
    // Check bookings
    const hasBookingConflict = bookings.some((b) => {
      if (b.instructorId !== instructorId || b.date !== date) return false;
      const bookingStart = timeToMinutes(b.timeStart);
      const bookingEnd = timeToMinutes(b.timeEnd);
      return slotMin < bookingEnd && slotEnd > bookingStart;
    });
    
    if (hasBookingConflict) return true;
    
    // Check absences
    return absences.some(a => 
      a.instructorId === instructorId && 
      date >= a.startDate && 
      date <= a.endDate
    );
  }, [bookings, absences]);

  // Global mouse handlers for drag selection
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!state.drag.isDragging) return;
      
      // Find which slot element the mouse is over
      const element = document.elementFromPoint(e.clientX, e.clientY);
      if (!element) return;
      
      // Check if it's an empty slot element
      const slotElement = element.closest('[data-slot-time]') as HTMLElement | null;
      if (slotElement) {
        const slotTime = slotElement.getAttribute('data-slot-time');
        const slotInstructorId = slotElement.getAttribute('data-instructor-id');
        const slotDate = slotElement.getAttribute('data-date');
        
        // Only update if same instructor and date
        if (slotInstructorId === state.drag.instructorId && 
            slotDate === state.drag.date && 
            slotTime) {
          const hasConflict = checkSlotConflict(slotInstructorId, slotDate, slotTime);
          updateDrag(slotTime, hasConflict);
        }
      }
    };

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

    window.addEventListener("mousemove", handleGlobalMouseMove);
    window.addEventListener("mouseup", handleGlobalMouseUp);
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [state.drag.isDragging, state.drag.instructorId, state.drag.date, bookings, absences, endDrag, cancelDrag, updateDrag, checkSlotConflict]);

  // Helper function
  function timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + (minutes || 0);
  }

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

  // Scroll to instructor and highlight
  const scrollToInstructor = useCallback((instructorId: string) => {
    requestAnimationFrame(() => {
      const element = instructorRefs.current.get(instructorId);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightedInstructorId(instructorId);
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
            visibleDates={visibleDates}
            compactMode={compactMode}
            onCompactModeChange={setCompactMode}
            compactStats={compactStats}
          />
          {/* Admin: Show Pending Absences Button */}
          {isAdminOrOffice && <PendingAbsencesList />}
        </div>

        {/* Vertical Stacking Grid with Instructor Focus */}
        <div ref={scrollContainerRef} className="flex-1 overflow-auto">
          {/* Sticky Time Header - with day column for multi-day views */}
          <StickyTimeHeader 
            slotWidth={SLOT_WIDTH} 
            showDayColumn={visibleDates.length > 1}
          />

          {/* Instructor Focus View - Each instructor with day sub-rows */}
          <InstructorFocusView
            instructors={instructors}
            dates={visibleDates}
            bookings={bookings}
            absences={absences}
            slotWidth={SLOT_WIDTH}
            onSlotClick={handleSlotClick}
            isLoading={isLoading}
            highlightedInstructorId={highlightedInstructorId}
            capabilityFilter={capabilityFilter}
            compactMode={compactMode}
            instructorRefs={instructorRefs}
          />
        </div>

        {/* Legend - Compact */}
        <div className="border-t border-slate-300 px-3 py-2 flex flex-wrap gap-3 text-[10px]">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm bg-emerald-500" />
            <span>Bezahlt</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm bg-rose-500" />
            <span>Offen</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm bg-blue-600" />
            <span>Gruppe</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm bg-gray-700" />
            <span>Abwesend</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm bg-blue-500/20 border border-blue-500" />
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
