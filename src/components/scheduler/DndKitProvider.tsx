import { ReactNode, useState, useCallback, useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  pointerWithin,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import type { SchedulerBooking } from "@/lib/scheduler-utils";
import { cn } from "@/lib/utils";
import { DndKitDragContext } from "@/contexts/DndKitDragContext";

interface DndKitProviderProps {
  children: ReactNode;
  onBookingDrop?: (
    booking: SchedulerBooking,
    newInstructorId: string,
    newDate: string,
    newTimeSlot: string
  ) => void;
}

interface DragData {
  type: "booking";
  booking: SchedulerBooking;
}

interface DropData {
  type: "slot";
  instructorId: string;
  date: string;
  timeSlot: string;
  isBlocked: boolean; // Now includes both absences and occupied slots
}

export function DndKitProvider({ children, onBookingDrop }: DndKitProviderProps) {
  const [activeBooking, setActiveBooking] = useState<SchedulerBooking | null>(null);
  const [overSlot, setOverSlot] = useState<DropData | null>(null);
  const [lastInvalidAttempt, setLastInvalidAttempt] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required before drag starts
      },
    }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as DragData | undefined;
    if (data?.type === "booking") {
      setActiveBooking(data.booking);
    }
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const overData = event.over?.data.current as DropData | undefined;
    if (overData?.type === "slot" && !overData.isBlocked) {
      setOverSlot(overData);
    } else {
      setOverSlot(null);
    }
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const activeData = event.active.data.current as DragData | undefined;
      const overData = event.over?.data.current as DropData | undefined;

      if (activeData?.type === "booking" && overData?.type === "slot") {
        if (overData.isBlocked) {
          // Show toast for invalid drop attempt
          toast.error("Dieser Zeitslot ist bereits belegt. Bitte wähle einen freien Slot.", {
            duration: 3000,
          });
        } else if (onBookingDrop) {
          onBookingDrop(activeData.booking, overData.instructorId, overData.date, overData.timeSlot);
        }
      }

      setActiveBooking(null);
      setOverSlot(null);
      setLastInvalidAttempt(null);
    },
    [onBookingDrop]
  );

  const handleDragCancel = useCallback(() => {
    setActiveBooking(null);
    setOverSlot(null);
    setLastInvalidAttempt(null);
  }, []);

  const contextValue = useMemo(() => ({
    activeDragBookingId: activeBooking?.id ?? null,
  }), [activeBooking?.id]);

  return (
    <DndKitDragContext.Provider value={contextValue}>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {children}

      {/* Drag Overlay - renders dragged item outside of normal flow */}
      <DragOverlay dropAnimation={{ duration: 200, easing: "ease-out" }}>
        {activeBooking && (
          <div
            className={cn(
              "rounded-md border px-2 py-1 text-xs font-medium shadow-lg",
              // Show green when over valid slot, red for blocked, gray otherwise
              overSlot && !overSlot.isBlocked 
                ? "bg-green-500 text-white border-green-600" 
                : overSlot?.isBlocked 
                  ? "bg-red-500 text-white border-red-600"
                  : "bg-gray-400 text-white border-gray-500",
              "cursor-grabbing"
            )}
            style={{ 
              minWidth: 80,
              maxWidth: 150,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            <span className="truncate">
              {activeBooking.participantName || "Privatstunde"}
            </span>
          </div>
        )}
      </DragOverlay>
      </DndContext>
    </DndKitDragContext.Provider>
  );
}

// Export types for child components
export type { DragData, DropData };
