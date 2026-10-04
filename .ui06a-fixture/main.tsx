import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { DndContext } from "@dnd-kit/core";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { BookingBar } from "../src/components/scheduler/BookingBar";
import "../src/index.css";

const base = {
  type: "private", date: "2026-12-28", timeStart: "10:00", timeEnd: "12:00",
  participantName: "Provisorische Buchung", participantSport: "snowboard",
  isProvisional: true, source: "website",
};
function App() {
  return <MemoryRouter><TooltipProvider><DndContext>
    <div className="relative h-[64px] w-[500px] bg-background" data-testid="paid"><BookingBar booking={{...base,id:"provisional-paid",ticketId:"paid",isPaid:true} as any} slotWidth={25} instructorSpecialization="ski" /></div>
    <div className="relative h-[64px] w-[500px] bg-background" data-testid="unpaid"><BookingBar booking={{...base,id:"provisional-unpaid",ticketId:"unpaid",isPaid:false} as any} slotWidth={25} instructorSpecialization="ski" /></div>
  </DndContext></TooltipProvider></MemoryRouter>;
}
createRoot(document.getElementById("root")!).render(<App />);
