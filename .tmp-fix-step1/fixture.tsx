import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BookingWizardProvider } from "@/contexts/BookingWizardContext";
import { Step1ProductCart } from "@/components/bookings/wizard/Step1ProductCart";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BookingWizardProvider>
        <div style={{ maxWidth: 820, margin: "24px auto", padding: "0 16px" }}>
          <Step1ProductCart />
        </div>
      </BookingWizardProvider>
    </QueryClientProvider>
  </StrictMode>
);
