import { useEffect, Component, ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import {
  BookingWizardProvider,
  useBookingWizard,
} from "@/contexts/BookingWizardContext";
import { WizardProgress } from "@/components/bookings/wizard/WizardProgress";
import { Step1CustomerParticipant } from "@/components/bookings/wizard/Step1CustomerParticipant";
import { Step2ProductDates } from "@/components/bookings/wizard/Step2ProductDates";
import { Step3InstructorDetails } from "@/components/bookings/wizard/Step3InstructorDetails";
import { Step4Summary } from "@/components/bookings/wizard/Step4Summary";

function BookingWizardContent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { state, setCustomer, setConversationId, setCurrentStep, canProceed, goToNextStep, resetWizard } =
    useBookingWizard();

  const customerId = searchParams.get("customer");
  const conversationId = searchParams.get("conversation");

  // Fetch customer if provided in URL
  const { data: prefetchedCustomer } = useQuery({
    queryKey: ["customer", customerId],
    queryFn: async () => {
      if (!customerId) return null;
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("id", customerId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!customerId && !state.customer,
  });

  // Pre-fill from URL params
  useEffect(() => {
    if (prefetchedCustomer && !state.customer) {
      setCustomer(prefetchedCustomer);
      toast.success("Kunde aus Anfrage übernommen");
    }
  }, [prefetchedCustomer, state.customer, setCustomer]);

  useEffect(() => {
    if (conversationId) {
      setConversationId(conversationId);
    }
  }, [conversationId, setConversationId]);

  const handleCancel = () => {
    resetWizard();
    navigate("/bookings");
  };

  const handleNext = () => {
    if (canProceed()) {
      goToNextStep();
      if (state.currentStep === 4) {
        // Final step - create booking
        toast.info("Buchungserstellung wird noch implementiert");
      }
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm">
                <X className="mr-2 h-4 w-4" />
                Abbrechen
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Buchung abbrechen?</AlertDialogTitle>
                <AlertDialogDescription>
                  Alle eingegebenen Daten gehen verloren. Möchtest du wirklich
                  abbrechen?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Weiter bearbeiten</AlertDialogCancel>
                <AlertDialogAction onClick={handleCancel}>
                  Ja, abbrechen
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <h1 className="text-lg font-semibold">Neue Buchung</h1>

          <div className="w-[100px]" /> {/* Spacer for centering */}
        </div>
      </header>

      {/* Progress */}
      <div className="mx-auto max-w-3xl px-4">
        <WizardProgress
          currentStep={state.currentStep}
          onStepClick={setCurrentStep}
        />
      </div>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-4 pb-32">
        {state.currentStep === 1 && <Step1CustomerParticipant />}
        {state.currentStep === 2 && <Step2ProductDates />}
        {state.currentStep === 3 && <Step3InstructorDetails />}
        {state.currentStep === 4 && <Step4Summary onEditStep={setCurrentStep} />}
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 border-t bg-background p-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          {state.currentStep > 1 ? (
            <Button
              variant="outline"
              onClick={() => setCurrentStep((state.currentStep - 1) as 1 | 2 | 3 | 4)}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Zurück
            </Button>
          ) : (
            <div />
          )}

          <Button onClick={handleNext} disabled={!canProceed()}>
            {state.currentStep === 4 ? "Buchung erstellen" : "Weiter"}
          </Button>
        </div>
      </footer>
    </div>
  );
}

class BookingWizardErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    if (error.message.includes("useBookingWizard must be used within")) {
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-muted-foreground">Laden...</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function BookingWizard() {
  return (
    <BookingWizardErrorBoundary>
      <BookingWizardProvider>
        <BookingWizardContent />
      </BookingWizardProvider>
    </BookingWizardErrorBoundary>
  );
}
