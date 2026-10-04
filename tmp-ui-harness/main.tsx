import "@/index.css";
import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { BookingWizardProvider, useBookingWizard } from "@/contexts/BookingWizardContext";
import { Step1ProductCart } from "@/components/bookings/wizard/Step1ProductCart";
import { Step2AssignCustomer } from "@/components/bookings/wizard/Step2AssignCustomer";

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const L = "Ausserordentlich-langer-synthetischer-Name-";
function Seed() {
  const w = useBookingWizard(); const done = useRef(0);
  const steps: (() => void)[] = [
    () => w.setCustomer({ id: "c1", first_name: "Maximiliane " + L, last_name: "Testkundin" + L, email: "sehr.lange.synthetische.adresse." + "x".repeat(50) + "@example.invalid", phone: "+41 79 000 00 00", street: "Synthetische Strasse " + L, zip: "9497", city: "Triesenberg", country: "LI", language: "de", holiday_address: "Ferienwohnung " + L + L } as any),
    () => w.setSelectedParticipants([{ id: "p1", first_name: "Teilnehmerin" + L, last_name: "Eins", birth_date: null } as any, { id: "p2", first_name: "Zweiter", last_name: "Teilnehmer", birth_date: null } as any]),
    () => w.setProductType("private"), () => w.setSport("ski"),
    () => w.setSelectedDates(["2026-12-21", "2026-12-22", "2026-12-23"]), () => w.setTimeSlot("10:00"),
    () => w.addCartItem(), () => w.setProductType("group"), () => w.setSelectedDates(["2026-12-28"]),
    () => w.addCartItem(), () => w.setProductType("private"), () => w.setSport("snowboard"), () => w.setSelectedDates(["2027-01-04", "2027-01-05"]),
    () => w.toggleMiniSchedulerSlot({ instructorId: "i1", instructorName: "Anna Test", date: "2027-01-04", startTime: "10:00", endTime: "12:00" }),
    () => w.toggleMiniSchedulerSlot({ instructorId: "i1", instructorName: "Anna Test", date: "2027-01-05", startTime: "14:00", endTime: "16:00" }),
  ];
  useEffect(() => { if (done.current < steps.length) { const i = done.current++; setTimeout(steps[i], 30); } else (window as any).__seeded = true; });
  return null;
}
const which = new URLSearchParams(location.search).get("c");
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={qc}><MemoryRouter><AuthProvider><TooltipProvider><BookingWizardProvider>
    <Seed /><div className="mx-auto max-w-6xl space-y-6 p-4">{which === "s2" ? <Step2AssignCustomer /> : <Step1ProductCart />}</div>
  </BookingWizardProvider></TooltipProvider></AuthProvider></MemoryRouter></QueryClientProvider>
);
