import { createContext, useContext } from "react";

export interface MobileSlotTapPayload {
  instructorId: string;
  date: string;
  /** Start of the tapped free interval */
  startTime: string;
  /** End of the tapped free interval */
  endTime: string;
}

interface MobileSlotContextValue {
  /** True below 768px: the mobile booking path replaces the desktop selection flow */
  isMobileScheduler: boolean;
  /** Opens the mobile slot sheet instead of creating a desktop selection */
  onFreeSlotTap: (payload: MobileSlotTapPayload) => void;
}

export const MobileSlotContext = createContext<MobileSlotContextValue>({
  isMobileScheduler: false,
  onFreeSlotTap: () => {},
});

export const useMobileSlot = () => useContext(MobileSlotContext);
