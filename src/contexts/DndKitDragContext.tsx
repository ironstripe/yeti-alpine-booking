import { createContext, useContext } from "react";

interface DndKitDragContextValue {
  activeDragBookingId: string | null;
}

export const DndKitDragContext = createContext<DndKitDragContextValue>({
  activeDragBookingId: null,
});

export const useDndKitDrag = () => useContext(DndKitDragContext);
