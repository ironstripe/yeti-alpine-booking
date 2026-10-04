import "@/index.css";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { BookingDetailDialog } from "@/components/scheduler/BookingDetailDialog";
import { BookingApprovalModal } from "@/components/bookings/BookingApprovalModal";
import { EditInstructorModal } from "@/components/instructors/EditInstructorModal";

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false }, mutations: { retry: false } } });
const LONG = "Sehr-lange-synthetische-Bezeichnung-ohne-Umbruchmoeglichkeit-".repeat(3);
const inst = (id: string, f: string, l: string) => ({ id, first_name: f, last_name: l, status: "active", email: `${f}@example.invalid`, phone: "+41 79 000 00 00", roles: ["ski"], specialization: "ski", avatar_url: null, todayBookingsCount: 0 } as any);
const instructors = [inst("i1", "Anna", "Test"), inst("i2", "Beat", "Konflikt")];
qc.setQueryData(["instructors"], instructors);
qc.setQueryData(["booking-detail", "ti1"], {
  id: "ti1", ticketId: "t1", date: "2026-12-20", timeStart: "10:00:00", timeEnd: "12:00:00", status: "confirmed",
  meetingPoint: null, internalNotes: "Interne Notiz " + LONG, instructorNotes: "Lehrernotiz", instructorId: "i1",
  participantId: "p1", appointmentId: null, participants: [],
  product: { id: "pr1", name: "Privatlektion " + LONG, type: "private", durationMinutes: 120 },
  participant: { id: "p1", firstName: "Synthetische", lastName: "Teilnehmerin" },
  instructor: { id: "i1", firstName: "Anna", lastName: "Test" },
  customer: { id: "c1", firstName: "Kunde", lastName: "Synthetisch", email: "sehr.lange.synthetische.adresse." + "x".repeat(40) + "@example.invalid", phone: "+41790000000", holidayAddress: "Ferienadresse " + LONG },
  ticket: { id: "t1", ticketNumber: "T-2026-999999-SYNTHETIC-LONG", status: "confirmed", paidAmount: null, totalAmount: 240 },
});

function App() {
  const which = new URLSearchParams(location.search).get("c");
  const [open, setOpen] = useState(false);
  return (
    <div className="p-6">
      <button id="opener" className="border px-3 py-2" onClick={() => setOpen(true)}>Öffnen</button>
      {which === "detail" && <BookingDetailDialog open={open} onOpenChange={setOpen} ticketItemId="ti1" />}
      {which === "approval" && <BookingApprovalModal open={open} onOpenChange={setOpen} ticket={{ id: "t1", ticket_number: "T-2026-999999-SYNTHETIC-LONG-NUMBER", customer_name: "Kunde " + LONG, customer_email: "sehr.lange." + "y".repeat(40) + "@example.invalid", total_amount: 1234.5, source_channel: "email" }} />}
      {which === "instructor" && <EditInstructorModal open={open} onOpenChange={setOpen} instructor={{ ...inst("i1", "Anna", "Test"), birth_date: null, gender: null, level: null, hourly_rate: null, entry_date: null, street: null, zip: null, city: null, country: "CH", bank_name: null, notes: null } as any} />}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={qc}><MemoryRouter><AuthProvider><TooltipProvider><App /></TooltipProvider></AuthProvider></MemoryRouter></QueryClientProvider>
);
