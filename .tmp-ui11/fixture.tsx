import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RecurringBlocksTab } from "@/components/instructor/RecurringBlocksTab";

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function App() {
  return (
    <div className="p-2 max-w-full">
      <RecurringBlocksTab instructorId="00000000-0000-0000-0000-000000000000" />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
