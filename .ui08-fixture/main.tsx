import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import Lists from "@/pages/Lists";
import "@/index.css";
if (new URLSearchParams(location.search).get("theme") === "dark") document.documentElement.classList.add("dark");
createRoot(document.getElementById("root")!).render(<BrowserRouter><TooltipProvider><main className="min-h-screen bg-background p-4 text-foreground"><Lists /></main></TooltipProvider></BrowserRouter>);
