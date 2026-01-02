import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import type { SchedulerBooking, SchedulerAbsence } from "@/lib/scheduler-utils";
import { OPERATIONAL_START_MINUTES, OPERATIONAL_END_MINUTES } from "@/lib/scheduler-utils";

export interface SlotSelection {
  id: string;
  instructorId: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
}

export interface DragState {
  isDragging: boolean;
  instructorId: string | null;
  date: string | null;
  startTime: string | null;
  currentTime: string | null;
  isBlocked: boolean;
}

interface SelectionState {
  teacherId: string | null;
  selections: SlotSelection[];
  isResizing: boolean;
  activeResizeId: string | null;
  drag: DragState;
}

interface SchedulerSelectionContextType {
  state: SelectionState;
  addSelection: (slot: Omit<SlotSelection, "id">) => boolean;
  removeSelection: (slotId: string) => void;
  updateSelectionDuration: (slotId: string, newEndTime: string, newDurationMinutes: number) => void;
  clearSelection: () => void;
  isSlotSelected: (instructorId: string, date: string, time: string) => boolean;
  getSelectionAt: (instructorId: string, date: string, time: string) => SlotSelection | undefined;
  canSelectSlot: (
    instructorId: string,
    date: string,
    startTime: string,
    endTime: string,
    bookings: SchedulerBooking[],
    absences: SchedulerAbsence[]
  ) => { valid: boolean; reason?: string };
  setIsResizing: (isResizing: boolean, slotId?: string) => void;
  getTotalHours: () => number;
  startDrag: (instructorId: string, date: string, startTime: string) => void;
  updateDrag: (currentTime: string, isBlocked: boolean) => void;
  endDrag: (bookings: SchedulerBooking[], absences: SchedulerAbsence[]) => void;
  cancelDrag: () => void;
}

const SchedulerSelectionContext = createContext<SchedulerSelectionContextType | null>(null);

function generateSlotId(): string {
  return `slot-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + (minutes || 0);
}

function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

const initialDragState: DragState = {
  isDragging: false,
  instructorId: null,
  date: null,
  startTime: null,
  currentTime: null,
  isBlocked: false,
};

export function SchedulerSelectionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SelectionState>({
    teacherId: null,
    selections: [],
    isResizing: false,
    activeResizeId: null,
    drag: initialDragState,
  });

  const canSelectSlot = useCallback(
    (
      instructorId: string,
      date: string,
      startTime: string,
      endTime: string,
      bookings: SchedulerBooking[],
      absences: SchedulerAbsence[]
    ): { valid: boolean; reason?: string } => {
      const startMinutes = timeToMinutes(startTime);
      const endMinutes = timeToMinutes(endTime);
      const duration = endMinutes - startMinutes;

      // Check operational hours (09:00 - 16:00)
      if (startMinutes < OPERATIONAL_START_MINUTES) {
        return { valid: false, reason: "Frühester Start: 09:00" };
      }
      if (endMinutes > OPERATIONAL_END_MINUTES) {
        return { valid: false, reason: "Spätestes Ende: 16:00 (Liftschluss)" };
      }

      // Check minimum duration (60 minutes)
      if (duration < 60) {
        return { valid: false, reason: "Mindestdauer: 60 Minuten" };
      }

      // Check maximum duration (4 hours = 240 minutes)
      if (duration > 240) {
        return { valid: false, reason: "Maximaldauer: 4 Stunden" };
      }

      // Check if instructor is absent
      const isAbsent = absences.some(
        (a) =>
          a.instructorId === instructorId &&
          date >= a.startDate &&
          date <= a.endDate
      );
      if (isAbsent) {
        return { valid: false, reason: "Lehrer abwesend" };
      }

      // Check for booking overlaps
      const hasBookingOverlap = bookings.some((b) => {
        if (b.instructorId !== instructorId || b.date !== date) return false;
        const bookingStart = timeToMinutes(b.timeStart);
        const bookingEnd = timeToMinutes(b.timeEnd);
        return startMinutes < bookingEnd && endMinutes > bookingStart;
      });
      if (hasBookingOverlap) {
        return { valid: false, reason: "Zeitraum bereits belegt" };
      }

      // Check for selection overlaps (same instructor, same date)
      const hasSelectionOverlap = state.selections.some((s) => {
        if (s.instructorId !== instructorId || s.date !== date) return false;
        const selStart = timeToMinutes(s.startTime);
        const selEnd = timeToMinutes(s.endTime);
        return startMinutes < selEnd && endMinutes > selStart;
      });
      if (hasSelectionOverlap) {
        return { valid: false, reason: "Überschneidung mit anderer Auswahl" };
      }

      // Check if all selections are for the same teacher
      if (state.teacherId && state.teacherId !== instructorId) {
        return { valid: false, reason: "Nur ein Lehrer pro Buchung" };
      }

      return { valid: true };
    },
    [state.selections, state.teacherId]
  );

  const addSelection = useCallback(
    (slot: Omit<SlotSelection, "id">): boolean => {
      // If selecting different teacher, reject
      if (state.teacherId && state.teacherId !== slot.instructorId) {
        return false;
      }

      const newSelection: SlotSelection = {
        ...slot,
        id: generateSlotId(),
      };

      setState((prev) => ({
        ...prev,
        teacherId: slot.instructorId,
        selections: [...prev.selections, newSelection],
      }));

      return true;
    },
    [state.teacherId]
  );

  const removeSelection = useCallback((slotId: string) => {
    setState((prev) => {
      const newSelections = prev.selections.filter((s) => s.id !== slotId);
      return {
        ...prev,
        selections: newSelections,
        teacherId: newSelections.length === 0 ? null : prev.teacherId,
      };
    });
  }, []);

  const updateSelectionDuration = useCallback(
    (slotId: string, newEndTime: string, newDurationMinutes: number) => {
      setState((prev) => ({
        ...prev,
        selections: prev.selections.map((s) =>
          s.id === slotId
            ? { ...s, endTime: newEndTime, durationMinutes: newDurationMinutes }
            : s
        ),
      }));
    },
    []
  );

  const clearSelection = useCallback(() => {
    setState({
      teacherId: null,
      selections: [],
      isResizing: false,
      activeResizeId: null,
      drag: initialDragState,
    });
  }, []);

  const isSlotSelected = useCallback(
    (instructorId: string, date: string, time: string): boolean => {
      const timeMin = timeToMinutes(time);
      return state.selections.some((s) => {
        if (s.instructorId !== instructorId || s.date !== date) return false;
        const selStart = timeToMinutes(s.startTime);
        const selEnd = timeToMinutes(s.endTime);
        return timeMin >= selStart && timeMin < selEnd;
      });
    },
    [state.selections]
  );

  const getSelectionAt = useCallback(
    (instructorId: string, date: string, time: string): SlotSelection | undefined => {
      const timeMin = timeToMinutes(time);
      return state.selections.find((s) => {
        if (s.instructorId !== instructorId || s.date !== date) return false;
        const selStart = timeToMinutes(s.startTime);
        const selEnd = timeToMinutes(s.endTime);
        return timeMin >= selStart && timeMin < selEnd;
      });
    },
    [state.selections]
  );

  const setIsResizing = useCallback((isResizing: boolean, slotId?: string) => {
    setState((prev) => ({
      ...prev,
      isResizing,
      activeResizeId: isResizing ? slotId || null : null,
    }));
  }, []);

  const getTotalHours = useCallback(() => {
    return state.selections.reduce((acc, s) => acc + s.durationMinutes / 60, 0);
  }, [state.selections]);

  // Drag selection handlers
  const startDrag = useCallback((instructorId: string, date: string, startTime: string) => {
    // Check if trying to select for different teacher
    if (state.teacherId && state.teacherId !== instructorId) {
      return;
    }
    
    setState((prev) => ({
      ...prev,
      drag: {
        isDragging: true,
        instructorId,
        date,
        startTime,
        currentTime: startTime,
        isBlocked: false,
      },
    }));
  }, [state.teacherId]);

  const updateDrag = useCallback((currentTime: string, isBlocked: boolean) => {
    setState((prev) => {
      if (!prev.drag.isDragging) return prev;
      return {
        ...prev,
        drag: {
          ...prev.drag,
          currentTime,
          isBlocked,
        },
      };
    });
  }, []);

  const endDrag = useCallback((bookings: SchedulerBooking[], absences: SchedulerAbsence[]) => {
    setState((prev) => {
      if (!prev.drag.isDragging || !prev.drag.instructorId || !prev.drag.date || !prev.drag.startTime || !prev.drag.currentTime) {
        return { ...prev, drag: initialDragState };
      }

      const { instructorId, date, startTime, currentTime, isBlocked } = prev.drag;
      
      if (isBlocked) {
        return { ...prev, drag: initialDragState };
      }

      // Calculate the range (handle drag in either direction)
      const startMinutes = timeToMinutes(startTime);
      const currentMinutes = timeToMinutes(currentTime);
      
      const rangeStart = Math.min(startMinutes, currentMinutes);
      const rangeEnd = Math.max(startMinutes, currentMinutes) + 60; // Add 1 hour for end slot
      
      // Clamp to operational hours
      const clampedStart = Math.max(rangeStart, OPERATIONAL_START_MINUTES);
      const clampedEnd = Math.min(rangeEnd, OPERATIONAL_END_MINUTES);
      
      const duration = clampedEnd - clampedStart;
      
      // Validate minimum duration
      if (duration < 60) {
        return { ...prev, drag: initialDragState };
      }

      const newStartTime = minutesToTime(clampedStart);
      const newEndTime = minutesToTime(clampedEnd);

      // Check for conflicts
      const hasBookingOverlap = bookings.some((b) => {
        if (b.instructorId !== instructorId || b.date !== date) return false;
        const bookingStart = timeToMinutes(b.timeStart);
        const bookingEnd = timeToMinutes(b.timeEnd);
        return clampedStart < bookingEnd && clampedEnd > bookingStart;
      });

      const isAbsent = absences.some(
        (a) =>
          a.instructorId === instructorId &&
          date >= a.startDate &&
          date <= a.endDate
      );

      const hasSelectionOverlap = prev.selections.some((s) => {
        if (s.instructorId !== instructorId || s.date !== date) return false;
        const selStart = timeToMinutes(s.startTime);
        const selEnd = timeToMinutes(s.endTime);
        return clampedStart < selEnd && clampedEnd > selStart;
      });

      if (hasBookingOverlap || isAbsent || hasSelectionOverlap) {
        return { ...prev, drag: initialDragState };
      }

      // Add the selection
      const newSelection: SlotSelection = {
        id: generateSlotId(),
        instructorId,
        date,
        startTime: newStartTime,
        endTime: newEndTime,
        durationMinutes: duration,
      };

      return {
        ...prev,
        teacherId: instructorId,
        selections: [...prev.selections, newSelection],
        drag: initialDragState,
      };
    });
  }, []);

  const cancelDrag = useCallback(() => {
    setState((prev) => ({
      ...prev,
      drag: initialDragState,
    }));
  }, []);

  return (
    <SchedulerSelectionContext.Provider
      value={{
        state,
        addSelection,
        removeSelection,
        updateSelectionDuration,
        clearSelection,
        isSlotSelected,
        getSelectionAt,
        canSelectSlot,
        setIsResizing,
        getTotalHours,
        startDrag,
        updateDrag,
        endDrag,
        cancelDrag,
      }}
    >
      {children}
    </SchedulerSelectionContext.Provider>
  );
}

export function useSchedulerSelection() {
  const context = useContext(SchedulerSelectionContext);
  if (!context) {
    throw new Error(
      "useSchedulerSelection must be used within a SchedulerSelectionProvider"
    );
  }
  return context;
}
