import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import Current from "@/pages/InstructorDetail";
import Before from "./InstructorDetailBefore";
import "@/index.css";
const before = new URLSearchParams(location.search).get("version") === "before";
const Page = before ? Before : Current;
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById("root")!).render(
  <React.StrictMode><QueryClientProvider client={queryClient}><TooltipProvider><MemoryRouter initialEntries={["/instructors/synthetic-instructor"]}><div className="min-h-screen bg-background text-foreground"><div className="hidden md:fixed md:inset-y-0 md:left-0 md:block md:w-[250px] md:border-r md:bg-card" aria-hidden="true" /><main className="p-4 md:ml-[250px] md:p-5"><Routes><Route path="/instructors/:id" element={<Page />} /></Routes></main></div></MemoryRouter></TooltipProvider></QueryClientProvider></React.StrictMode>
);
