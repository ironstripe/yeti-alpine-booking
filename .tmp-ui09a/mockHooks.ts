const longName = new URLSearchParams(window.location.search).get("name") === "long";
const populated = new URLSearchParams(window.location.search).get("bookings") === "populated";
export const syntheticInstructor = {
  id: "synthetic-instructor", first_name: longName ? "Alexandra-Maria" : "Mia",
  last_name: longName ? "von Beispielhausen-Winterberg" : "Meier",
  specialization: "both", roles: ["teacher"], level: "instructor", real_time_status: "available",
  status: "active", avatar_url: null, website_teaser: "Erfahrene Lehrperson für lange Tage im Schnee.",
  show_on_website: true, instructor_type: "teacher", email: "alexandra@example.test", phone: "+41 79 000 00 00",
  street: "Lange Beispielstrasse 123", zip: "8888", city: "Beispielort", country: "Schweiz",
  languages: ["de", "en"], hourly_rate: 55, role: "rolle_1", entry_date: "2024-01-01",
  bank_name: null, iban: null, ahv_number: null, notes: null, gender: "female",
};
const todayBookings = populated ? [{ id: "b1", time_start: "09:00:00", time_end: "11:00:00", product_type: "private", participant_name: "Sehr langer Teilnehmername für die Darstellung", product_name: "Privatunterricht", instructor_confirmation: "confirmed" }] : [];
export function useInstructorDetail() { return { instructor: syntheticInstructor, isLoading: false, error: null, todayBookings, seasonStats: { bookedHours: 12, confirmedHours: 8, pendingHours: 4, grossEarnings: 660 }, isPulsing: false, updateStatus: () => {}, isUpdatingStatus: false }; }
export function useUserRole() { return { isTeacher: false, isAdminOrOffice: true, instructorId: null }; }
export function useIsSuperAdmin() { return false; }
export function useStaffInstructorPhotos() { return { data: {} }; }
export function useInviteInstructor() { return { mutate: () => {}, isPending: false }; }
