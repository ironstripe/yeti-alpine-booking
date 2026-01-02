import { ReactNode, useState, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
} from "@dnd-kit/core";
import type { SchedulerBooking } from "@/lib/scheduler-utils";
import { cn } from "@/lib/utils";

interface DndKitProviderProps {
  children: ReactNode;
  onBookingDrop?: (
    booking: SchedulerBooking,
    newInstructorId: string,
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
  isBlocked: boolean;
}

export function DndKitProvider({ children, onBookingDrop }: DndKitProviderProps) {
  const [activeBooking, setActiveBooking] = useState<SchedulerBooking | null>(null);
  const [overSlot, setOverSlot] = useState<DropData | null>(null);

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

      if (
        activeData?.type === "booking" &&
        overData?.type === "slot" &&
        !overData.isBlocked &&
        onBookingDrop
      ) {
        onBookingDrop(activeData.booking, overData.instructorId, overData.timeSlot);
      }

      setActiveBooking(null);
      setOverSlot(null);
    },
    [onBookingDrop]
  );

  const handleDragCancel = useCallback(() => {
    setActiveBooking(null);
    setOverSlot(null);
  }, []);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
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
              "bg-green-500 text-white border-green-600",
              activeBooking.type === "private" && !activeBooking.isPaid && "bg-red-500 border-red-600",
              "cursor-grabbing opacity-90"
            )}
            style={{ minWidth: 80 }}
          >
            <span className="truncate">
              {activeBooking.participantName || "Privatstunde"}
            </span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// Export types for child components
export type { DragData, DropData };
