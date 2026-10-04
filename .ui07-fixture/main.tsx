import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import Scheduler from "@/pages/Scheduler";
import "@/index.css";
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(<React.StrictMode><QueryClientProvider client={queryClient}><MemoryRouter><TooltipProvider delayDuration={0}><div className="h-[100dvh]"><Scheduler /></div></TooltipProvider></MemoryRouter></QueryClientProvider></React.StrictMode>);
