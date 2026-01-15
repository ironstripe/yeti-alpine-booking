import { useEffect, useRef, Component, ReactNode } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { ArrowLeft, X } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
  SelectedParticipant,
} from "@/contexts/BookingWizardContext";
import { WizardProgress } from "@/components/bookings/wizard/WizardProgress";
import { Step1CustomerParticipant } from "@/components/bookings/wizard/Step1CustomerParticipant";
import { Step2ProductAllocation } from "@/components/bookings/wizard/Step2ProductAllocation";
import { Step4Summary } from "@/components/bookings/wizard/Step4Summary";
import type { BookingPrefillState } from "@/types/booking-prefill";

function BookingWizardContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const didApplyPrefill = useRef(false);
  
  const { 
    state, 
    setCustomer, 
    setConversationId, 
    setCurrentStep, 
    setSelectedParticipants,
    setProductType,
    setSelectedDates,
    setSport,
    canProceed, 
    goToNextStep, 
    resetWizard 
  } = useBookingWizard();

  const customerId = searchParams.get("customer");
  const conversationId = searchParams.get("conversation");
  
  // Get prefill from navigation state
  const prefill = (location.state as { prefill?: BookingPrefillState })?.prefill;

  // Fetch customer if provided in URL or prefill
  const targetCustomerId = customerId || prefill?.matchedCustomerId;
  
  const { data: prefetchedCustomer, isLoading: isLoadingCustomer } = useQuery({
    queryKey: ["customer", targetCustomerId],
    queryFn: async () => {
      if (!targetCustomerId) return null;
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("id", targetCustomerId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!targetCustomerId && !state.customer,
  });

  // Mutation to create a new customer
  const createCustomerMutation = useMutation({
    mutationFn: async (customerData: BookingPrefillState["customer"]) => {
      const { data, error } = await supabase
        .from("customers")
        .insert({
          first_name: customerData.first_name || null,
          last_name: customerData.last_name || "Unbekannt",
          email: customerData.email || "unknown@example.com",
          phone: customerData.phone || null,
          holiday_address: customerData.holiday_address || "",
          street: customerData.street || null,
          zip: customerData.zip || null,
          city: customerData.city || null,
          country: customerData.country || "CH",
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
  });

  // Mutation to create participants
  const createParticipantMutation = useMutation({
    mutationFn: async ({ customerId, participant }: { 
      customerId: string; 
      participant: BookingPrefillState["participants"][0] 
    }) => {
      // Calculate birth date from age if needed
      let birthDate = participant.birth_date;
      if (!birthDate && participant.age) {
        const year = new Date().getFullYear() - participant.age;
        birthDate = `${year}-01-01`;
      }
      if (!birthDate) {
        birthDate = "2015-01-01"; // Default
      }

      const { data, error } = await supabase
        .from("customer_participants")
        .insert({
          customer_id: customerId,
          first_name: participant.first_name || "Teilnehmer",
          last_name: participant.last_name || null,
          birth_date: birthDate,
          level_current_season: participant.skill_level || null,
          sport: participant.discipline || "ski",
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
  });

  // Apply prefill data once
  useEffect(() => {
    if (didApplyPrefill.current) return;
    if (!prefill) return;
    if (isLoadingCustomer) return; // Wait for customer query to complete
    
    const applyPrefill = async () => {
      didApplyPrefill.current = true;
      console.log("Applying prefill data:", prefill);
      
      try {
        let customer = prefetchedCustomer;
        
        // If no existing customer, try to create one
        if (!customer && prefill.customer && (prefill.customer.last_name || prefill.customer.email)) {
          console.log("Attempting to create new customer from prefill:", prefill.customer);
          try {
            customer = await createCustomerMutation.mutateAsync(prefill.customer);
            toast.success("Neuer Kunde erstellt");
          } catch (customerError: any) {
            console.error("Customer creation error:", customerError);
            // If duplicate email error, try to fetch existing customer
            if (customerError.code === "23505" && prefill.customer.email) {
              console.log("Duplicate email detected, fetching existing customer by email:", prefill.customer.email);
              const { data: existingCustomer } = await supabase
                .from("customers")
                .select("*")
                .eq("email", prefill.customer.email)
                .maybeSingle();

              if (existingCustomer) {
                console.log("Found existing customer:", existingCustomer.id);
                customer = existingCustomer;
                toast.info("Bestehender Kunde gefunden");
              }
            }
            // Continue even if customer creation/lookup failed - might still apply other data
          }
        }

        if (!customer) {
          console.log("No customer available, staying on step 1");
          // Still try to apply booking data even without customer
          if (prefill.booking) {
            if (prefill.booking.product_type) {
              setProductType(prefill.booking.product_type);
            }
            if (prefill.booking.dates && prefill.booking.dates.length > 0) {
              setSelectedDates(prefill.booking.dates.map(d => d.date));
            }
          }
          return;
        }

        // Set customer in wizard
        setCustomer(customer);
        
        // Create or fetch participants
        const selectedParticipants: SelectedParticipant[] = [];
        
        if (prefill.participants && prefill.participants.length > 0) {
          // First, fetch existing participants for this customer
          const { data: existingParticipants } = await supabase
            .from("customer_participants")
            .select("*")
            .eq("customer_id", customer.id);

          for (const prefillParticipant of prefill.participants) {
            // Try to match with existing participant by first name
            const existing = existingParticipants?.find(
              p => p.first_name.toLowerCase() === prefillParticipant.first_name.toLowerCase()
            );

            if (existing) {
              selectedParticipants.push({
                id: existing.id,
                first_name: existing.first_name,
                last_name: existing.last_name,
                birth_date: existing.birth_date,
                level_last_season: existing.level_last_season,
                level_current_season: existing.level_current_season,
                sport: existing.sport,
              });
            } else if (prefillParticipant.first_name) {
              // Create new participant
              console.log("Creating new participant:", prefillParticipant);
              const newParticipant = await createParticipantMutation.mutateAsync({
                customerId: customer.id,
                participant: prefillParticipant,
              });
              
              selectedParticipants.push({
                id: newParticipant.id,
                first_name: newParticipant.first_name,
                last_name: newParticipant.last_name,
                birth_date: newParticipant.birth_date,
                level_last_season: newParticipant.level_last_season,
                level_current_season: newParticipant.level_current_season,
                sport: newParticipant.sport,
              });
            }
          }
        }

        if (selectedParticipants.length > 0) {
          setSelectedParticipants(selectedParticipants);
        }

        // Set booking details
        if (prefill.booking) {
          if (prefill.booking.product_type) {
            setProductType(prefill.booking.product_type);
          }
          
          if (prefill.booking.dates && prefill.booking.dates.length > 0) {
            setSelectedDates(prefill.booking.dates.map(d => d.date));
          }

          // Determine sport from first participant if available
          if (selectedParticipants.length > 0 && selectedParticipants[0].sport) {
            setSport(selectedParticipants[0].sport as "ski" | "snowboard");
          }
        }

        // Set conversation ID
        if (prefill.sourceConversationId) {
          setConversationId(prefill.sourceConversationId);
        }

        // Jump to step 2 if we have customer + participants
        if (customer && selectedParticipants.length > 0) {
          setCurrentStep(2);
          toast.success("Daten aus Anfrage übernommen");
        } else if (customer) {
          toast.success("Kunde aus Anfrage übernommen");
        }
      } catch (error) {
        console.error("Error applying prefill:", error);
        toast.error("Fehler beim Übernehmen der Daten");
      }
    };

    applyPrefill();
  }, [
    prefill, 
    prefetchedCustomer, 
    isLoadingCustomer,
    setCustomer, 
    setSelectedParticipants, 
    setProductType, 
    setSelectedDates,
    setSport,
    setConversationId, 
    setCurrentStep,
    createCustomerMutation,
    createParticipantMutation,
  ]);

  // Pre-fill from URL params (legacy support)
  useEffect(() => {
    if (prefetchedCustomer && !state.customer && !prefill) {
      setCustomer(prefetchedCustomer);
      toast.success("Kunde aus Anfrage übernommen");
    }
  }, [prefetchedCustomer, state.customer, setCustomer, prefill]);

  useEffect(() => {
    if (conversationId && !prefill) {
      setConversationId(conversationId);
    }
  }, [conversationId, setConversationId, prefill]);

  const handleCancel = () => {
    resetWizard();
    navigate("/bookings");
  };

  const handleNext = () => {
    if (canProceed()) {
      goToNextStep();
      if (state.currentStep === 3) {
        // Final step - create booking
        toast.info("Buchungserstellung wird noch implementiert");
      }
    }
  };

  // Show loading while applying prefill
  const isApplyingPrefill = prefill && !didApplyPrefill.current && isLoadingCustomer;

  if (isApplyingPrefill) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Daten werden geladen...</p>
      </div>
    );
  }

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
      <div className="mx-auto max-w-5xl px-4">
        <WizardProgress
          currentStep={state.currentStep}
          onStepClick={setCurrentStep}
        />
      </div>

      {/* Content */}
      <main className="mx-auto max-w-5xl px-4 pb-4">
        {state.currentStep === 1 && <Step1CustomerParticipant />}
        {state.currentStep === 2 && <Step2ProductAllocation />}
        {state.currentStep === 3 && <Step4Summary onEditStep={setCurrentStep} />}
      </main>

      {/* Sticky Footer - Only show for steps 1 and 2 */}
      {state.currentStep < 3 && (
        <footer className="sticky bottom-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-3">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
            {state.currentStep > 1 ? (
              <Button
                variant="outline"
                onClick={() => setCurrentStep((state.currentStep - 1) as 1 | 2 | 3)}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Zurück
              </Button>
            ) : (
              <div />
            )}

            <Button onClick={handleNext} disabled={!canProceed()}>
              Weiter
            </Button>
          </div>
        </footer>
      )}
    </div>
  );
}

class BookingWizardErrorBoundary extends Component<
  { children: ReactNode },
  { hasContextError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasContextError: false };
  }

  static getDerivedStateFromError(error: Error) {
    // Only catch the specific context error - let others bubble up
    if (error.message.includes("useBookingWizard must be used within")) {
      return { hasContextError: true };
    }
    // For non-context errors, don't update state - let them propagate
    throw error;
  }

  componentDidCatch(error: Error) {
    if (error.message.includes("useBookingWizard must be used within")) {
      console.error("Context error detected, reloading:", error);
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasContextError) {
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
