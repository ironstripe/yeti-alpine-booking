import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DndContext } from "@dnd-kit/core";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BookingBar } from "@/components/scheduler/BookingBar";
import { SchedulerLegend } from "@/components/scheduler/SchedulerLegend";
import { RangeDatePicker } from "@/components/ui/range-date-picker";
import { MobileSchedulerAgenda } from "@/components/scheduler/mobile/MobileSchedulerAgenda";
import type { SchedulerBooking } from "@/lib/scheduler-utils";
import "@/index.css";

const date = "2026-12-28";
const bookings: SchedulerBooking[] = [
  { id: "paid", instructorId: "i", date, timeStart: "09:00", timeEnd: "10:00", type: "private", isPaid: true, ticketId: "T-1", participantName: "Sehr langer Name für bezahlte Privatstunde", status: "confirmed" },
  { id: "open", instructorId: "i", date, timeStart: "10:00", timeEnd: "11:00", type: "private", isPaid: false, ticketId: "T-2", participantName: "Offene Privatstunde", status: "confirmed", participantSport: "snowboard" },
  { id: "group", instructorId: "i", date, timeStart: "11:00", timeEnd: "11:30", type: "group", isPaid: false, ticketId: "T-3", participantName: "Sehr langer Gruppenname", status: "confirmed", currentParticipants: 12, maxParticipants: 8 },
  { id: "office", instructorId: "i", date, timeStart: "12:00", timeEnd: "13:00", type: "office_shift", isPaid: false, ticketId: "T-4", participantName: "Bürodienst mit langem Namen", status: "confirmed" },
  { id: "provisional", instructorId: "i", date, timeStart: "14:00", timeEnd: "15:00", type: "private", isPaid: false, ticketId: "T-5", participantName: "Provisorische Reservation", status: "pending", isProvisional: true },
];
function Fixture() {
  const [selected, setSelected] = useState<Date[]>([new Date(2026, 11, 28), new Date(2026, 11, 29)]);
  return <main className="min-h-screen bg-background p-4 text-foreground">
    <section aria-label="Scheduler-Buchungen" className="relative h-16 w-[700px] max-w-full border bg-background" data-testid="bars">
      {bookings.map((booking) => <BookingBar key={booking.id} booking={booking} slotWidth={100} instructorSpecialization={booking.id === "open" ? "ski" : null} />)}
    </section>
    <SchedulerLegend compact className="mt-4" />
    <SchedulerLegend className="mt-4" />
    <section aria-label="Mobile Agenda" className="mt-4 max-w-sm border"><MobileSchedulerAgenda instructors={[{ id: "i", first_name: "Anna", last_name: "Muster", specialization: "ski", color: "red", todayBookingsCount: 5, roleType: "instructor" } as any]} date={new Date(2026, 11, 28)} bookings={bookings} absences={[]} onFreeSlotTap={() => undefined} /></section>
    <section className="mt-6 w-fit max-w-full"><RangeDatePicker selected={selected} onSelect={setSelected} month={new Date(2026, 11, 1)} minDate={new Date(2026, 11, 1)} /></section>
    <output data-testid="selected-count">{selected.length}</output>
  </main>;
}
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(<React.StrictMode><QueryClientProvider client={client}><BrowserRouter><TooltipProvider><DndContext><Fixture /></DndContext></TooltipProvider></BrowserRouter></QueryClientProvider></React.StrictMode>);
