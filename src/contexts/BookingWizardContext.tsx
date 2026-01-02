import { createContext, useContext, useState, ReactNode } from "react";
import type { Tables } from "@/integrations/supabase/types";

export type WizardStep = 1 | 2 | 3 | 4;

export interface SelectedParticipant {
  id: string;
  first_name: string;
  last_name: string | null;
  birth_date: string;
  level: string | null;
  sport: string | null;
  isGuest?: boolean;
}

export interface BookingWizardState {
  // Step 1: Customer & Participants
  customerId: string | null;
  customer: Tables<"customers"> | null;
  selectedParticipants: SelectedParticipant[];
  
  // Step 2: Product & Date (future)
  productId: string | null;
  dateRange: { start: string; end: string } | null;
  timeSlots: { start: string; end: string }[] | null;
  
  // Step 3: Instructor & Details (future)
  instructorId: string | null;
  meetingPoint: string | null;
  notes: string | null;
  
  // Metadata
  conversationId: string | null;
  currentStep: WizardStep;
}

interface BookingWizardContextType {
  state: BookingWizardState;
  setCustomer: (customer: Tables<"customers"> | null) => void;
  setSelectedParticipants: (participants: SelectedParticipant[]) => void;
  toggleParticipant: (participant: SelectedParticipant) => void;
  addGuestParticipant: (participant: Omit<SelectedParticipant, "id" | "isGuest">) => void;
  setCurrentStep: (step: WizardStep) => void;
  setConversationId: (id: string | null) => void;
  goToNextStep: () => void;
  goToPreviousStep: () => void;
  canProceed: () => boolean;
  resetWizard: () => void;
}

const initialState: BookingWizardState = {
  customerId: null,
  customer: null,
  selectedParticipants: [],
  productId: null,
  dateRange: null,
  timeSlots: null,
  instructorId: null,
  meetingPoint: null,
  notes: null,
  conversationId: null,
  currentStep: 1,
};

const BookingWizardContext = createContext<BookingWizardContextType | null>(null);

export function BookingWizardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BookingWizardState>(initialState);

  const setCustomer = (customer: Tables<"customers"> | null) => {
    setState((prev) => ({
      ...prev,
      customer,
      customerId: customer?.id ?? null,
      // Clear participants when customer changes
      selectedParticipants: [],
    }));
  };

  const setSelectedParticipants = (participants: SelectedParticipant[]) => {
    setState((prev) => ({
      ...prev,
      selectedParticipants: participants,
    }));
  };

  const toggleParticipant = (participant: SelectedParticipant) => {
    setState((prev) => {
      const isSelected = prev.selectedParticipants.some((p) => p.id === participant.id);
      if (isSelected) {
        return {
          ...prev,
          selectedParticipants: prev.selectedParticipants.filter((p) => p.id !== participant.id),
        };
      } else {
        // Check max limit
        if (prev.selectedParticipants.length >= 6) {
          return prev;
        }
        return {
          ...prev,
          selectedParticipants: [...prev.selectedParticipants, participant],
        };
      }
    });
  };

  const addGuestParticipant = (participant: Omit<SelectedParticipant, "id" | "isGuest">) => {
    setState((prev) => {
      if (prev.selectedParticipants.length >= 6) {
        return prev;
      }
      const guestParticipant: SelectedParticipant = {
        ...participant,
        id: `guest-${Date.now()}`,
        isGuest: true,
      };
      return {
        ...prev,
        selectedParticipants: [...prev.selectedParticipants, guestParticipant],
      };
    });
  };

  const setCurrentStep = (step: WizardStep) => {
    setState((prev) => ({
      ...prev,
      currentStep: step,
    }));
  };

  const setConversationId = (id: string | null) => {
    setState((prev) => ({
      ...prev,
      conversationId: id,
    }));
  };

  const goToNextStep = () => {
    setState((prev) => ({
      ...prev,
      currentStep: Math.min(prev.currentStep + 1, 4) as WizardStep,
    }));
  };

  const goToPreviousStep = () => {
    setState((prev) => ({
      ...prev,
      currentStep: Math.max(prev.currentStep - 1, 1) as WizardStep,
    }));
  };

  const canProceed = (): boolean => {
    switch (state.currentStep) {
      case 1:
        return state.customer !== null && state.selectedParticipants.length > 0;
      case 2:
        return state.productId !== null && state.dateRange !== null;
      case 3:
        return true; // Instructor is optional
      case 4:
        return true;
      default:
        return false;
    }
  };

  const resetWizard = () => {
    setState(initialState);
  };

  return (
    <BookingWizardContext.Provider
      value={{
        state,
        setCustomer,
        setSelectedParticipants,
        toggleParticipant,
        addGuestParticipant,
        setCurrentStep,
        setConversationId,
        goToNextStep,
        goToPreviousStep,
        canProceed,
        resetWizard,
      }}
    >
      {children}
    </BookingWizardContext.Provider>
  );
}

export function useBookingWizard() {
  const context = useContext(BookingWizardContext);
  if (!context) {
    throw new Error("useBookingWizard must be used within a BookingWizardProvider");
  }
  return context;
}
