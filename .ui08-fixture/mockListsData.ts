const params = new URLSearchParams(window.location.search);
const nonzero = params.get("mode") === "nonzero";
const empty = { data: [] };
export const useLunchChildren = () => empty;
export const useDailyBookings = () => empty;
export const useInstructorSchedules = () => ({ data: nonzero ? [{ id: "i-1", name: "Lehrperson mit aussergewöhnlich langem Namen", items: [] }] : [] });
export const useGroups = () => ({ data: nonzero ? [{ id: "g-1", name: "Lange synthetische Gruppe", level: "blue", instructorName: "Test Person", participants: [] }] : [] });
export const useListsSummary = () => nonzero
  ? { lunchChildrenCount: 12, groupsCount: 4, bookingsCount: 27, instructorsCount: 8 }
  : { lunchChildrenCount: 0, groupsCount: 0, bookingsCount: 0, instructorsCount: 0 };
export type LunchChild = any;
export type GroupData = any;
export type DailyBooking = any;
export type InstructorSchedule = any;
