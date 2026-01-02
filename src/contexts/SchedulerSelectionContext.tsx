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

interface SelectionState {
  teacherId: string | null;
  selections: SlotSelection[];
  isResizing: boolean;
  activeResizeId: string | null;
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

export function SchedulerSelectionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SelectionState>({
    teacherId: null,
    selections: [],
    isResizing: false,
    activeResizeId: null,
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
