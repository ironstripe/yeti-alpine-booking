import "../index.css";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BookingWizardProvider, useBookingWizard } from "@/contexts/BookingWizardContext";
import { Step1ProductCart } from "@/components/bookings/wizard/Step1ProductCart";
import { Step2AssignCustomer } from "@/components/bookings/wizard/Step2AssignCustomer";
import { useEffect } from "react";

const params = new URLSearchParams(location.search);
const dates = (params.get("dates") || "2026-12-21").split(",");
const customer = params.get("customer");

function Probe() {
  const w = useBookingWizard();
  const { state } = w;
  useEffect(() => {
    w.setProductType("private");
    w.setSport("ski");
    w.setSelectedDates(dates);
    w.setTimeSlot("12:00 - 14:00");
    w.setMeetingPoint("sammelplatz_gorfion");
    if (customer) w.setCustomer({ id: customer, first_name: "Synth", last_name: "Kunde", email: "synth@example.invalid" } as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const items = w.getAllCartItems();
  return (
    <div className="p-4">
      <pre data-testid="probe" className="text-xs">{JSON.stringify({
        step: state.currentStep, canProceed: w.canProceed(), assignLater: state.assignLater,
        instructorId: state.instructorId, timeSlot: state.timeSlot, duration: state.duration, dates: state.selectedDates,
        local: state.localParticipants.map(p => p.first_name),
        items: items.map(i => ({ ids: i.assignedParticipantIds.length, instr: i.instructorId, al: i.assignLater, ts: i.timeSlot, d: i.selectedDates })),
      })}</pre>
      {state.currentStep === 1 && <Step1ProductCart />}
      {state.currentStep === 2 && <Step2AssignCustomer />}
      <div className="flex gap-2 mt-4">
        <button data-testid="back" onClick={() => w.setCurrentStep(1 as any)}>Zurück</button>
        <button data-testid="next" disabled={!w.canProceed()} onClick={() => w.setCurrentStep(2 as any)}>Weiter</button>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><TooltipProvider><BookingWizardProvider><Probe /></BookingWizardProvider></TooltipProvider></MemoryRouter>
  </QueryClientProvider>
);
