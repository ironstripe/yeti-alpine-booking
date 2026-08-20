import { useEffect, useRef, useState, Component, ReactNode } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { ArrowLeft, X, RefreshCw } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { SchedulerPrefillBanner } from "@/components/bookings/wizard/SchedulerPrefillBanner";
import { cn } from "@/lib/utils";

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
import { Step1ProductCart } from "@/components/bookings/wizard/Step1ProductCart";
import { Step2AssignCustomer } from "@/components/bookings/wizard/Step2AssignCustomer";
import { Step4Summary } from "@/components/bookings/wizard/Step4Summary";
import type { BookingPrefillState } from "@/types/booking-prefill";

function BookingWizardContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const didApplyPrefill = useRef(false);
  const didLoadEditMode = useRef(false);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [isLoadingEdit, setIsLoadingEdit] = useState(false);
  
  const { 
    state, 
    setCustomer, 
    setConversationId,
    setCurrentStep, 
    setSelectedParticipants,
    setProductType,
    setSelectedDates,
    setTimeSlot,
    setDuration,
    setSport,
    setAssignLater,
    canProceed, 
    goToNextStep, 
    resetWizard,
    loadTicketForEditing,
    prefillFromScheduler,
  } = useBookingWizard();

  const customerId = searchParams.get("customer");
  const conversationId = searchParams.get("conversation");
  const editTicketId = searchParams.get("edit");
  const schedulerInstructorId = searchParams.get("instructor");
  const schedulerAppointments = searchParams.get("appointments");
  
  // Get prefill from navigation state
  const prefill = (location.state as { prefill?: BookingPrefillState })?.prefill;

  // Helper function to apply prefill from AI extraction data
  const applyPrefillFromExtraction = async (extractedData: any) => {
    console.log("Applying prefill from extraction:", extractedData);
    
    // Build prefill structure from extraction
    const newPrefill: BookingPrefillState = {
      sourceConversationId: conversationId || undefined,
      matchedCustomerId: extractedData.customer?.id || extractedData.matched_customer_id,
      customer: extractedData.customer || {},
      participants: extractedData.participants || [],
      booking: extractedData.booking || {},
    };

    // Apply product type
    if (newPrefill.booking?.product_type) {
      setProductType(newPrefill.booking.product_type);
    }

    // Apply dates
    if (newPrefill.booking?.dates && newPrefill.booking.dates.length > 0) {
      setSelectedDates(newPrefill.booking.dates.map((d: any) => d.date).filter(Boolean));
      
      // Apply times from first date that has them
      const dateWithTime = newPrefill.booking.dates.find((d: any) => d.start_time && d.end_time);
      if (dateWithTime) {
        const timeSlotValue = `${dateWithTime.start_time} - ${dateWithTime.end_time}`;
        setTimeSlot(timeSlotValue);
        
        // Calculate duration
        const startHour = parseInt(dateWithTime.start_time.split(":")[0]);
        const endHour = parseInt(dateWithTime.end_time.split(":")[0]);
        const durationHours = endHour - startHour;
        if (durationHours > 0) {
          setDuration(durationHours);
        }
        console.log("Applied time from re-analysis:", timeSlotValue, "duration:", durationHours);
      }
    }

    // Auto-set assign later for inbox bookings
    if (conversationId) {
      setAssignLater(true);
    }

    toast.success("Daten aktualisiert");
  };

  // Re-analyze function
  const handleReanalyze = async () => {
    if (!conversationId) return;
    
    setIsReanalyzing(true);
    try {
      const { error: fnError } = await supabase.functions.invoke("process-ai-message", {
        body: { conversationId }
      });
      
      if (fnError) throw fnError;
      
      // Refetch conversation and re-apply prefill
      const { data, error } = await supabase
        .from("conversations")
        .select("ai_extracted_data")
        .eq("id", conversationId)
        .single();
      
      if (error) throw error;
      
      if (data?.ai_extracted_data) {
        await applyPrefillFromExtraction(data.ai_extracted_data);
        toast.success("Analyse abgeschlossen");
      }
    } catch (error) {
      console.error("Re-analyze error:", error);
      toast.error("Analyse fehlgeschlagen");
    } finally {
      setIsReanalyzing(false);
    }
  };

  // Apply scheduler prefill (instructor + appointments from URL params)
  const didApplySchedulerPrefill = useRef(false);
  useEffect(() => {
    if (!schedulerInstructorId || !schedulerAppointments) return;
    if (didApplySchedulerPrefill.current) return;
    if (state.appointments) return; // Already applied

    try {
      const appointments = JSON.parse(decodeURIComponent(schedulerAppointments));
      
      // Filter out past dates
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const validAppointments = appointments.filter((appt: any) => {
        const apptDate = new Date(appt.date);
        apptDate.setHours(0, 0, 0, 0);
        return apptDate >= today;
      });
      
      if (validAppointments.length === 0) {
        toast.error("Alle ausgewählten Termine liegen in der Vergangenheit");
        return;
      }
      
      if (validAppointments.length < appointments.length) {
        toast.warning("Vergangene Termine wurden entfernt");
      }
      
      didApplySchedulerPrefill.current = true;
      prefillFromScheduler(schedulerInstructorId, validAppointments);
      console.log("Applied scheduler prefill:", { schedulerInstructorId, validAppointments });
    } catch (e) {
      console.error("Failed to parse scheduler appointments:", e);
    }
  }, [schedulerInstructorId, schedulerAppointments, prefillFromScheduler, state.appointments]);

  // Load ticket for edit mode
  useEffect(() => {
    const loadEditTicket = async () => {
      if (!editTicketId || didLoadEditMode.current || state.isEditMode) return;
      
      didLoadEditMode.current = true;
      setIsLoadingEdit(true);
      
      try {
        await loadTicketForEditing(editTicketId);
        toast.success("Buchung zum Bearbeiten geladen");
      } catch (error) {
        console.error("Error loading ticket for edit:", error);
        toast.error("Fehler beim Laden der Buchung");
        navigate("/bookings");
      } finally {
        setIsLoadingEdit(false);
      }
    };

    loadEditTicket();
  }, [editTicketId, state.isEditMode, loadTicketForEditing, navigate]);

  // Refresh-safe: fetch conversation data if we have conversationId but no prefill
  useEffect(() => {
    const fetchConversationPrefill = async () => {
      if (!conversationId || prefill || didApplyPrefill.current || editTicketId) return;
      
      console.log("Fetching conversation for refresh-safe prefill:", conversationId);
      const { data, error } = await supabase
        .from("conversations")
        .select("ai_extracted_data, matched_customer_id")
        .eq("id", conversationId)
        .single();
      
      if (error) {
        console.error("Error fetching conversation:", error);
        return;
      }
      
      if (data?.ai_extracted_data) {
        didApplyPrefill.current = true;
        await applyPrefillFromExtraction(data.ai_extracted_data);
      }
    };
    
    fetchConversationPrefill();
  }, [conversationId, prefill, editTicketId]);

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
            
            // Apply start/end times from the first date that has them
            const dateWithTime = prefill.booking.dates.find(d => d.start_time && d.end_time);
            if (dateWithTime && dateWithTime.start_time && dateWithTime.end_time) {
              const timeSlotValue = `${dateWithTime.start_time} - ${dateWithTime.end_time}`;
              setTimeSlot(timeSlotValue);
              
              // Calculate duration from times
              const startHour = parseInt(dateWithTime.start_time.split(":")[0]);
              const endHour = parseInt(dateWithTime.end_time.split(":")[0]);
              const durationHours = endHour - startHour;
              if (durationHours > 0) {
                setDuration(durationHours);
              }
              console.log("Applied time from prefill:", timeSlotValue, "duration:", durationHours);
            }
          }

          // Determine sport from first participant if available
          if (selectedParticipants.length > 0 && selectedParticipants[0].sport) {
            setSport(selectedParticipants[0].sport as "ski" | "snowboard");
          }
          
          // Auto-set "Später zuweisen" for inbox-originated bookings
          // This prevents the wizard from feeling "stuck" when no instructor is assigned yet
          if (prefill.sourceConversationId) {
            setAssignLater(true);
            console.log("Auto-set assignLater=true for inbox-originated booking");
          }
        }

        // Set conversation ID
        if (prefill.sourceConversationId) {
          setConversationId(prefill.sourceConversationId);
        }

        // Jump to step 2 if we have customer + participants
        if (customer && selectedParticipants.length > 0) {
          setCurrentStep(1);
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

  // Show loading while applying prefill or loading edit mode
  const isApplyingPrefill = prefill && !didApplyPrefill.current && isLoadingCustomer;

  if (isApplyingPrefill || isLoadingEdit) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">
          {isLoadingEdit ? "Buchung wird geladen..." : "Daten werden geladen..."}
        </p>
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
                <AlertDialogTitle>
                  {state.isEditMode ? "Bearbeitung abbrechen?" : "Buchung abbrechen?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Alle Änderungen gehen verloren. Möchtest du wirklich abbrechen?
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

          <h1 className="text-lg font-semibold">
            {state.isEditMode ? "Buchung bearbeiten" : "Neue Buchung"}
          </h1>

          {conversationId ? (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleReanalyze}
              disabled={isReanalyzing}
            >
              <RefreshCw className={cn("h-4 w-4 mr-2", isReanalyzing && "animate-spin")} />
              Erneut analysieren
            </Button>
          ) : (
            <div className="w-[100px]" />
          )}
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
      <main className="mx-auto max-w-5xl px-4 pb-4 space-y-4">
        {state.currentStep === 1 && <SchedulerPrefillBanner />}
        {state.currentStep === 1 && <Step1ProductCart />}
        {state.currentStep === 2 && <Step2AssignCustomer />}
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
              {state.currentStep === 1 ? "Weiter zum Kunden >" : "Weiter"}
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
