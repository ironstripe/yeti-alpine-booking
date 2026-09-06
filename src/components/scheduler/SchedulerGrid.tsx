import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format, parseISO, isValid } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { useSchedulerData } from "@/hooks/useSchedulerData";
import { useUpdateTicketItem } from "@/hooks/useUpdateTicketItem";
import { useSendBookingChangeNotification } from "@/hooks/useBookingChangeNotification";
import { DndKitProvider } from "./DndKitProvider";
import { SchedulerHeader, type ViewMode } from "./SchedulerHeader";
import { StickyTimeHeader } from "./StickyTimeHeader";
import { InstructorFocusView } from "./InstructorFocusView";
import { SelectionToolbar } from "./SelectionToolbar";

import { SchedulerSelectionProvider, useSchedulerSelection } from "@/contexts/SchedulerSelectionContext";
import { useUserRole } from "@/hooks/useUserRole";
import { hasOverlap, getDaysForViewMode, generateDateRange, isWithinOperationalHours, type SchedulerBooking } from "@/lib/scheduler-utils";
import { AlertCircle, X } from "lucide-react";
import { ColumnResizeHandle } from "./ColumnResizeHandle";
import { 
  BookingChangeConfirmDialog, 
  detectChangeType,
  type ChangeType 
} from "@/components/bookings/BookingChangeConfirmDialog";
import { PeriodModificationDialog, type PeriodModificationScope } from "./PeriodModificationDialog";
import { usePeriodModification } from "@/hooks/usePeriodModification";
import { useIsTouchDevice, useIsMobileScheduler } from "@/hooks/use-touch-device";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileSlotContext, type MobileSlotTapPayload } from "./mobile/MobileSlotContext";
import { MobileSlotSheet } from "./mobile/MobileSlotSheet";
import { MobileSchedulerAgenda } from "./mobile/MobileSchedulerAgenda";

const MOBILE_VIEW_KEY = "scheduler.mobileView";

const SLOT_WIDTH = 100; // px per hour

// Instructor column width constants
const MIN_INSTRUCTOR_COL_WIDTH = 80;
const MAX_INSTRUCTOR_COL_WIDTH = 200;
const DEFAULT_INSTRUCTOR_COL_WIDTH = 112; // w-28 = 7rem = 112px
const STORAGE_KEY = 'scheduler-instructor-col-width';

function SchedulerGridContent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isTouch = useIsTouchDevice();
  const isMobile = useIsMobile();
  const isMobileScheduler = useIsMobileScheduler();
  const [mobileView, setMobileView] = useState<"list" | "grid">(() =>
    (localStorage.getItem(MOBILE_VIEW_KEY) as "list" | "grid") || "list"
  );
  const [mobileSlot, setMobileSlot] = useState<MobileSlotTapPayload | null>(null);

  const handleMobileViewChange = useCallback((view: "list" | "grid") => {
    setMobileView(view);
    localStorage.setItem(MOBILE_VIEW_KEY, view);
  }, []);

  const handleFreeSlotTap = useCallback((payload: MobileSlotTapPayload) => {
    setMobileSlot(payload);
  }, []);
  
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
  const [viewMode, setViewMode] = useState<ViewMode>("daily"); // Default to daily view
  const [highlightedInstructorId, setHighlightedInstructorId] = useState<string | null>(null);
  
  // Consolidated filter state for settings menu
  const [filters, setFilters] = useState({
    roleFilter: null as string | null,
    capabilityFilter: null as string | null,
    bookingTypeFilter: null as string | null,
    sortBy: "name",
    showLegend: true,
    isPlanningMode: false,
    isFullscreen: false,
    compactMode: false,
  });

  // Helper to update partial filters
  const handleFiltersChange = (updates: Partial<typeof filters>) => {
    setFilters((prev) => ({ ...prev, ...updates }));
  };
  
  // Instructor column width with localStorage persistence
  const [instructorColumnWidth, setInstructorColumnWidth] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_INSTRUCTOR_COL_WIDTH;
  });

  // Resize handlers for instructor column
  const handleColumnResize = useCallback((deltaX: number) => {
    setInstructorColumnWidth(prev => 
      Math.max(MIN_INSTRUCTOR_COL_WIDTH, 
        Math.min(MAX_INSTRUCTOR_COL_WIDTH, prev + deltaX)
      )
    );
  }, []);

  const handleResizeEnd = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, instructorColumnWidth.toString());
  }, [instructorColumnWidth]);

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
  });

  const updateTicketItem = useUpdateTicketItem();
  const sendChangeNotification = useSendBookingChangeNotification();
  const periodModification = usePeriodModification();
  const { clearSelection, state, endDrag, cancelDrag, updateDrag } = useSchedulerSelection();
  const { isAdminOrOffice } = useUserRole();

  // Destructure filter values for easier use
  const { roleFilter, capabilityFilter, bookingTypeFilter, sortBy, showLegend, isPlanningMode, isFullscreen, compactMode } = filters;

  // State for drag & drop confirmation dialog
  const [showDropConfirmDialog, setShowDropConfirmDialog] = useState(false);
  const [pendingDropData, setPendingDropData] = useState<{
    booking: SchedulerBooking;
    newInstructorId: string;
    newDate: string;
    newTimeSlot: string;
    newTimeEnd: string;
    changeType: ChangeType;
    oldValues: { date?: string; time?: string; instructor?: string };
    newValues: { date?: string; time?: string; instructor?: string };
  } | null>(null);

  // State for period modification dialog
  const [showPeriodDialog, setShowPeriodDialog] = useState(false);
  const [pendingPeriodData, setPendingPeriodData] = useState<{
    booking: SchedulerBooking;
    newSlot: {
      date: string;
      timeStart: string;
      timeEnd: string;
      instructorId: string;
    };
  } | null>(null);

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
        
        // Same instructor required; the date may change (vertical multi-day drag)
        if (slotInstructorId === state.drag.instructorId && slotDate && slotTime) {
          const hasConflict = checkSlotConflict(slotInstructorId, slotDate, slotTime);
          updateDrag(slotTime, hasConflict, slotDate);
        }
      }
    };

    const handleGlobalMouseUp = () => {
      if (state.drag.isDragging) {
        endDrag(bookings, absences);
      }
    };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Priority 1: Exit fullscreen (highest priority)
        if (isFullscreen) {
          e.stopPropagation();
          handleFiltersChange({ isFullscreen: false });
          return;
        }
        // Priority 2: Cancel drag
        if (state.drag.isDragging) {
          cancelDrag();
          return;
        }
        // Priority 3: Clear selection
        clearSelection();
        setHighlightedInstructorId(null);
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
  }, [state.drag.isDragging, state.drag.instructorId, state.drag.date, bookings, absences, endDrag, cancelDrag, updateDrag, checkSlotConflict, isFullscreen, clearSelection]);

  // Helper function
  function timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + (minutes || 0);
  }

  // Filter instructors by role, compact mode, and sort
  const filteredInstructors = useMemo(() => {
    let filtered = instructors;
    
    // Filter by role type - check actual roles array for multi-role support
    if (roleFilter) {
      filtered = filtered.filter(i => {
        const roles = i.roles || [];
        if (roleFilter === 'instructor') {
          return roles.includes('ski') || roles.includes('snowboard');
        }
        if (roleFilter === 'office_staff') {
          return roles.includes('office');
        }
        return true;
      });
    }
    
    // Compact mode: hide those without bookings or absences
    if (compactMode) {
      filtered = filtered.filter(instructor => {
        const hasBookings = bookings.some(b => b.instructorId === instructor.id);
        const hasAbsences = absences.some(a => a.instructorId === instructor.id);
        return hasBookings || hasAbsences;
      });
    }

    // Determine effective sort: auto-sort when filter is active
    const effectiveSort = bookingTypeFilter === "group" ? "group" : 
                          bookingTypeFilter === "private" ? "private" : 
                          sortBy;

    // Sort by booking type
    if (effectiveSort === "group") {
      filtered = [...filtered].sort((a, b) => {
        const aHasGroup = bookings.some(bk => bk.instructorId === a.id && bk.type === "group");
        const bHasGroup = bookings.some(bk => bk.instructorId === b.id && bk.type === "group");
        if (aHasGroup && !bHasGroup) return -1;
        if (!aHasGroup && bHasGroup) return 1;
        // Secondary: count of group bookings
        const aGroupCount = bookings.filter(bk => bk.instructorId === a.id && bk.type === "group").length;
        const bGroupCount = bookings.filter(bk => bk.instructorId === b.id && bk.type === "group").length;
        if (bGroupCount !== aGroupCount) return bGroupCount - aGroupCount;
        // Tertiary: alphabetical
        return a.last_name.localeCompare(b.last_name);
      });
    } else if (effectiveSort === "private") {
      filtered = [...filtered].sort((a, b) => {
        const aHasPrivate = bookings.some(bk => bk.instructorId === a.id && bk.type === "private");
        const bHasPrivate = bookings.some(bk => bk.instructorId === b.id && bk.type === "private");
        if (aHasPrivate && !bHasPrivate) return -1;
        if (!aHasPrivate && bHasPrivate) return 1;
        const aPrivateCount = bookings.filter(bk => bk.instructorId === a.id && bk.type === "private").length;
        const bPrivateCount = bookings.filter(bk => bk.instructorId === b.id && bk.type === "private").length;
        if (bPrivateCount !== aPrivateCount) return bPrivateCount - aPrivateCount;
        return a.last_name.localeCompare(b.last_name);
      });
    }
    // "name" sort: keep default alphabetical order from DB query

    // Planning mode: sort available instructors first (takes precedence)
    if (isPlanningMode) {
      filtered = [...filtered].sort((a, b) => {
        const aBookings = bookings.filter(book => book.instructorId === a.id).length;
        const bBookings = bookings.filter(book => book.instructorId === b.id).length;
        const aAbsent = absences.some(ab => ab.instructorId === a.id);
        const bAbsent = absences.some(ab => ab.instructorId === b.id);
        
        // Absent instructors go to the bottom
        if (aAbsent && !bAbsent) return 1;
        if (!aAbsent && bAbsent) return -1;
        // Sort by booking count (fewer bookings = more available)
        return aBookings - bBookings;
      });
    }
    
    return filtered;
  }, [instructors, bookings, absences, compactMode, roleFilter, isPlanningMode, bookingTypeFilter, sortBy]);

  const compactStats = useMemo(() => ({
    visible: filteredInstructors.length,
    total: instructors.length,
  }), [filteredInstructors.length, instructors.length]);

  // Filter bookings by type (private/group)
  const filteredBookings = useMemo(() => {
    if (!bookingTypeFilter) return bookings;
    return bookings.filter(b => b.type === bookingTypeFilter);
  }, [bookings, bookingTypeFilter]);

  // Clear selection when date changes
  useEffect(() => {
    clearSelection();
  }, [selectedDate, clearSelection]);

  // Entering the phone layout must never keep a stale desktop selection alive
  useEffect(() => {
    if (isMobileScheduler) {
      clearSelection();
      setMobileSlot(null);
    }
  }, [isMobileScheduler, clearSelection]);


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

    // Check if this is a period booking - show period dialog
    if (booking.isPartOfPeriod && booking.periodGroupId) {
      setPendingPeriodData({
        booking,
        newSlot: {
          date: newDate,
          timeStart: newTimeSlot,
          timeEnd: newEndTime,
          instructorId: newInstructorId,
        },
      });
      setShowPeriodDialog(true);
      return;
    }

    // Detect what changed
    const originalTime = `${booking.timeStart} - ${booking.timeEnd}`;
    const newTime = `${newTimeSlot} - ${newEndTime}`;
    const changeType = detectChangeType(
      booking.date,
      originalTime,
      booking.instructorId,
      newDate,
      newTime,
      newInstructorId
    );

    // If no significant changes, just update without confirmation
    if (changeType === 'none') {
      updateTicketItem.mutate({
        ticketItemId: booking.id,
        instructorId: newInstructorId,
        date: newDate,
        timeStart: newTimeSlot,
        timeEnd: newEndTime,
      });
      return;
    }

    // Get instructor names
    const oldInstructor = instructors.find(i => i.id === booking.instructorId);
    const newInstructor = instructors.find(i => i.id === newInstructorId);

    // Store pending data and show confirmation dialog
    setPendingDropData({
      booking,
      newInstructorId,
      newDate,
      newTimeSlot,
      newTimeEnd: newEndTime,
      changeType,
      oldValues: {
        date: format(new Date(booking.date), "d. MMMM yyyy", { locale: de }),
        time: `${booking.timeStart.slice(0, 5)} - ${booking.timeEnd.slice(0, 5)} Uhr`,
        instructor: oldInstructor ? `${oldInstructor.first_name} ${oldInstructor.last_name}` : undefined,
      },
      newValues: {
        date: format(new Date(newDate), "d. MMMM yyyy", { locale: de }),
        time: `${newTimeSlot} - ${newEndTime} Uhr`,
        instructor: newInstructor ? `${newInstructor.first_name} ${newInstructor.last_name}` : undefined,
      },
    });
    setShowDropConfirmDialog(true);
  };

  // Handle confirmation of drag & drop change
  const handleDropConfirm = (notifyCustomer: boolean) => {
    if (!pendingDropData) return;

    const { booking, newInstructorId, newDate, newTimeSlot, newTimeEnd, changeType, oldValues, newValues } = pendingDropData;

    updateTicketItem.mutate(
      {
        ticketItemId: booking.id,
        instructorId: newInstructorId,
        date: newDate,
        timeStart: newTimeSlot,
        timeEnd: newTimeEnd,
      },
      {
        onSuccess: () => {
          toast.success("Buchung verschoben");
          
          // Send notification if requested
          if (notifyCustomer && changeType !== 'none') {
            const oldInstructor = instructors.find(i => i.id === booking.instructorId);
            const newInstructor = instructors.find(i => i.id === newInstructorId);

            sendChangeNotification.mutate({
              ticketItemId: booking.id,
              changeType,
              oldValues: {
                date: oldValues.date,
                time: oldValues.time,
                instructorId: booking.instructorId,
                instructorName: oldInstructor ? `${oldInstructor.first_name} ${oldInstructor.last_name}` : undefined,
              },
              newValues: {
                date: newValues.date,
                time: newValues.time,
                instructorId: newInstructorId,
                instructorName: newInstructor ? `${newInstructor.first_name} ${newInstructor.last_name}` : undefined,
              },
            });
          }
        },
      }
    );

    setShowDropConfirmDialog(false);
    setPendingDropData(null);
  };

  // Handle confirmation of period modification
  const handlePeriodConfirm = (scope: PeriodModificationScope, notifyCustomer: boolean) => {
    if (!pendingPeriodData) return;

    const { booking, newSlot } = pendingPeriodData;

    periodModification.mutate({
      bookingId: booking.id,
      periodGroupId: booking.periodGroupId!,
      scope,
      newDate: scope === "single_day" ? newSlot.date : undefined,
      newTimeStart: newSlot.timeStart,
      newTimeEnd: newSlot.timeEnd,
      newInstructorId: newSlot.instructorId,
      notifyCustomer,
      ticketItemId: booking.id,
      oldInstructorId: booking.instructorId,
      occurrenceDate: booking.date,
      periodStartDate: booking.periodStartDate,
      periodEndDate: booking.periodEndDate,
    });

    setShowPeriodDialog(false);
    setPendingPeriodData(null);
  };

  // Narrower (but readable) instructor column on small screens
  const effectiveInstructorColumnWidth = isMobile
    ? Math.min(instructorColumnWidth, 112)
    : instructorColumnWidth;

  // Lock the page behind the scheduler only while fullscreen is active
  useEffect(() => {
    if (!filters.isFullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [filters.isFullscreen]);

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

  const selectedMobileInstructor = mobileSlot
    ? instructors.find((i) => i.id === mobileSlot.instructorId)
    : undefined;

  return (
    <MobileSlotContext.Provider value={{ isMobileScheduler, onFreeSlotTap: handleFreeSlotTap }}>
    <DndKitProvider onBookingDrop={handleBookingDrop}>
      <div
        className={cn(
          "flex flex-col h-full min-h-0 min-w-0 bg-background",
          isFullscreen && "fixed inset-0 z-50 overflow-hidden"
        )}
        style={
          isFullscreen
            ? {
                height: "100dvh",
                paddingTop: "env(safe-area-inset-top)",
                paddingBottom: "env(safe-area-inset-bottom)",
              }
            : undefined
        }
      >
        {/* Header with Date Navigation & Filters */}
        <div className="flex items-center justify-between shrink-0">
          <SchedulerHeader
            date={selectedDate}
            onDateChange={setSelectedDate}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            instructorOptions={instructorOptions}
            onInstructorSelect={scrollToInstructor}
            filters={filters}
            onFiltersChange={handleFiltersChange}
            compactStats={compactStats}
            isMobileScheduler={isMobileScheduler}
            mobileView={mobileView}
            onMobileViewChange={handleMobileViewChange}
          />
        </div>

        {/* Vertical Stacking Grid with Instructor Focus */}
        {isFullscreen && (
          <button
            type="button"
            onClick={() => handleFiltersChange({ isFullscreen: false })}
            aria-label="Vollbild schliessen"
            className="absolute right-2 top-2 z-[60] flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background/95 shadow-md"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        {/* The single scheduler scroll container */}
        <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 min-w-0"
          style={{
            overflow: "auto",
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "contain",
            touchAction: "pan-x pan-y",
          }}
        >
          {isMobileScheduler && mobileView === "list" ? (
            <MobileSchedulerAgenda
              instructors={filteredInstructors}
              date={selectedDate}
              bookings={filteredBookings}
              absences={absences}
              isLoading={isLoading}
              highlightedInstructorId={highlightedInstructorId}
              onFreeSlotTap={handleFreeSlotTap}
            />
          ) : (
          <>
          {/* Sticky Time Header - with day column for multi-day views */}
          <StickyTimeHeader 
            slotWidth={SLOT_WIDTH} 
            showDayColumn={visibleDates.length > 1}
            instructorColumnWidth={effectiveInstructorColumnWidth}
            onColumnResize={handleColumnResize}
            onResizeEnd={handleResizeEnd}
          />

          {/* Instructor Focus View - Each instructor with day sub-rows */}
          <InstructorFocusView
            instructors={filteredInstructors}
            dates={visibleDates}
            bookings={filteredBookings}
            absences={absences}
            slotWidth={SLOT_WIDTH}
            onSlotClick={handleSlotClick}
            isLoading={isLoading}
            highlightedInstructorId={highlightedInstructorId}
            capabilityFilter={capabilityFilter}
            compactMode={compactMode}
            instructorRefs={instructorRefs}
            isPlanningMode={isPlanningMode}
            roleFilter={roleFilter}
            instructorColumnWidth={effectiveInstructorColumnWidth}
          />
          </>
          )}
        </div>

        {/* Legend - Compact (conditional) */}
        {showLegend && (
          <div className="border-t border-border px-3 py-2 flex flex-wrap gap-3 text-[10px]">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm bg-emerald-500" />
              <span>Bezahlt</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm bg-orange-500" />
              <span>Offen</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm bg-blue-600" />
              <span>Gruppe</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm bg-purple-600" />
              <span>Büro</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm bg-gray-300" />
              <span>Abwesend</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm bg-primary/20 border-l-2 border-l-primary" />
              <span>Periode</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm bg-blue-500/20 border border-blue-500" />
              <span>Auswahl</span>
            </div>
            <div className="ml-auto text-muted-foreground">
              09:00–16:00
            </div>
          </div>
        )}

        {/* Selection Toolbar */}
        <SelectionToolbar bookings={bookings} />

        {/* Booking Change Confirmation Dialog for Drag & Drop */}
        <BookingChangeConfirmDialog
          open={showDropConfirmDialog}
          onOpenChange={(open) => {
            setShowDropConfirmDialog(open);
            if (!open) setPendingDropData(null);
          }}
          onConfirm={handleDropConfirm}
          changeType={pendingDropData?.changeType || 'none'}
          oldValues={pendingDropData?.oldValues || {}}
          newValues={pendingDropData?.newValues || {}}
          isLoading={updateTicketItem.isPending || sendChangeNotification.isPending}
        />

        {/* Period Modification Dialog for multi-day bookings */}
        {pendingPeriodData && (
          <PeriodModificationDialog
            open={showPeriodDialog}
            onOpenChange={(open) => {
              setShowPeriodDialog(open);
              if (!open) setPendingPeriodData(null);
            }}
            booking={pendingPeriodData.booking}
            newSlot={pendingPeriodData.newSlot}
            instructors={instructors}
            onConfirm={handlePeriodConfirm}
            isLoading={periodModification.isPending}
          />
        )}

        {/* Mobile slot sheet: the only booking entry point below 768px */}
        <MobileSlotSheet
          slot={mobileSlot}
          instructorName={
            selectedMobileInstructor
              ? `${selectedMobileInstructor.first_name} ${selectedMobileInstructor.last_name}`
              : ""
          }
          bookings={bookings}
          absences={absences}
          onOpenChange={(open) => !open && setMobileSlot(null)}
        />
      </div>
    </DndKitProvider>
    </MobileSlotContext.Provider>
  );
}

export function SchedulerGrid() {
  return (
    <SchedulerSelectionProvider>
      <SchedulerGridContent />
    </SchedulerSelectionProvider>
  );
}
