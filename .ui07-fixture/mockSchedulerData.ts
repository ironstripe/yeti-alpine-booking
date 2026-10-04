const names = ["Anna Muster", "Beat Beispiel", "Clara Demo", "David Test", "Eva Muster", "Fabian Beispiel", "Gina Demo", "Hans Test", "Ida Muster", "Jonas Beispiel", "Klara Demo", "Lukas Test", "Mara Muster", "Noah Beispiel", "Olivia Demo", "Peter Test", "Rita Muster", "Simon Beispiel"];
const instructors = names.map((name, index) => {
  const [first_name, last_name] = name.split(" ");
  return { id: `i-${index}`, first_name, last_name, status: "active", specialization: index % 2 ? "snowboard" : "ski", role: "instructor", roles: [index % 2 ? "snowboard" : "ski"], color: index % 2 ? "yellow" : "red", todayBookingsCount: 0, roleType: "instructor", languages: ["de"], level: "instruktor" };
});
const today = new Date().toISOString().slice(0, 10);
const bookings = [
  { id: "b1", instructorId: "i-0", date: today, timeStart: "10:00", timeEnd: "12:00", type: "private", isPaid: true, ticketId: "T-1", participantName: "Langer Testname", status: "booked" },
  { id: "b2", instructorId: "i-1", date: today, timeStart: "13:00", timeEnd: "15:00", type: "group", isPaid: true, ticketId: "G-1", participantName: "Gruppe", status: "scheduled" },
];
export function useSchedulerData() { return { instructors, bookings, absences: [], isLoading: false, error: null, refetch: () => {} }; }
