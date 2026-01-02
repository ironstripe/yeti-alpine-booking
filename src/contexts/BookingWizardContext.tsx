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
  
  // Step 2: Product & Date
  productType: "private" | "group" | null;
  productId: string | null;
  sport: "ski" | "snowboard" | null;
  dateRange: { start: string; end: string } | null;
  selectedDates: string[];
  timeSlot: string | null;
  duration: number | null;
  includeLunch: boolean;
  
  // Step 3: Instructor & Details
  instructorId: string | null;
  instructor: Tables<"instructors"> | null;
  assignLater: boolean;
  meetingPoint: string | null;
  preferredInstructorId: string | null;
  language: string;
  customerNotes: string;
  internalNotes: string;
  instructorNotes: string;
  
  // Step 4: Payment & Confirmation
  paymentMethod: "cash" | "card" | "twint" | "invoice" | null;
  isPaid: boolean;
  paymentDueDate: string | null;
  discountPercent: number;
  discountReason: string;
  sendCustomerEmail: boolean;
  sendCustomerWhatsApp: boolean;
  notifyInstructor: boolean;
  
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
  // Step 2 setters
  setProductType: (type: "private" | "group" | null) => void;
  setProductId: (id: string | null) => void;
  setSport: (sport: "ski" | "snowboard" | null) => void;
  setDateRange: (range: { start: string; end: string } | null) => void;
  setSelectedDates: (dates: string[]) => void;
  setTimeSlot: (slot: string | null) => void;
  setDuration: (duration: number | null) => void;
  setIncludeLunch: (include: boolean) => void;
  // Step 3 setters
  setInstructor: (instructor: Tables<"instructors"> | null) => void;
  setAssignLater: (assignLater: boolean) => void;
  setMeetingPoint: (point: string | null) => void;
  setPreferredInstructorId: (id: string | null) => void;
  setLanguage: (language: string) => void;
  setCustomerNotes: (notes: string) => void;
  setInternalNotes: (notes: string) => void;
  setInstructorNotes: (notes: string) => void;
  // Navigation
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
  productType: null,
  productId: null,
  sport: null,
  dateRange: null,
  selectedDates: [],
  timeSlot: null,
  duration: null,
  includeLunch: false,
  instructorId: null,
  instructor: null,
  assignLater: false,
  meetingPoint: "hotel_gorfion",
  preferredInstructorId: null,
  language: "de",
  customerNotes: "",
  internalNotes: "",
  instructorNotes: "",
  paymentMethod: null,
  isPaid: false,
  paymentDueDate: null,
  discountPercent: 0,
  discountReason: "",
  sendCustomerEmail: true,
  sendCustomerWhatsApp: false,
  notifyInstructor: true,
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
      selectedParticipants: [],
      // Pre-fill language from customer if available
      language: customer?.language ?? "de",
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

  // Step 2 setters
  const setProductType = (type: "private" | "group" | null) => {
    setState((prev) => ({
      ...prev,
      productType: type,
      productId: null,
      // Reset instructor if switching to group (not needed)
      instructorId: type === "group" ? null : prev.instructorId,
      instructor: type === "group" ? null : prev.instructor,
    }));
  };

  const setProductId = (id: string | null) => {
    setState((prev) => ({ ...prev, productId: id }));
  };

  const setSport = (sport: "ski" | "snowboard" | null) => {
    setState((prev) => ({ ...prev, sport }));
  };

  const setDateRange = (range: { start: string; end: string } | null) => {
    setState((prev) => ({ ...prev, dateRange: range }));
  };

  const setSelectedDates = (dates: string[]) => {
    setState((prev) => ({ ...prev, selectedDates: dates }));
  };

  const setTimeSlot = (slot: string | null) => {
    setState((prev) => ({ ...prev, timeSlot: slot }));
  };

  const setDuration = (duration: number | null) => {
    setState((prev) => ({ ...prev, duration }));
  };

  const setIncludeLunch = (include: boolean) => {
    setState((prev) => ({ ...prev, includeLunch: include }));
  };

  // Step 3 setters
  const setInstructor = (instructor: Tables<"instructors"> | null) => {
    setState((prev) => ({
      ...prev,
      instructor,
      instructorId: instructor?.id ?? null,
      assignLater: false,
    }));
  };

  const setAssignLater = (assignLater: boolean) => {
    setState((prev) => ({
      ...prev,
      assignLater,
      instructor: assignLater ? null : prev.instructor,
      instructorId: assignLater ? null : prev.instructorId,
    }));
  };

  const setMeetingPoint = (point: string | null) => {
    setState((prev) => ({ ...prev, meetingPoint: point }));
  };

  const setPreferredInstructorId = (id: string | null) => {
    setState((prev) => ({ ...prev, preferredInstructorId: id }));
  };

  const setLanguage = (language: string) => {
    setState((prev) => ({ ...prev, language }));
  };

  const setCustomerNotes = (notes: string) => {
    setState((prev) => ({ ...prev, customerNotes: notes }));
  };

  const setInternalNotes = (notes: string) => {
    setState((prev) => ({ ...prev, internalNotes: notes }));
  };

  const setInstructorNotes = (notes: string) => {
    setState((prev) => ({ ...prev, instructorNotes: notes }));
  };

  const setCurrentStep = (step: WizardStep) => {
    setState((prev) => ({ ...prev, currentStep: step }));
  };

  const setConversationId = (id: string | null) => {
    setState((prev) => ({ ...prev, conversationId: id }));
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
        return state.productType !== null && state.selectedDates.length > 0;
      case 3: {
        // Meeting point and language are always required
        const hasBasicRequirements = state.meetingPoint !== null && state.language !== "";
        
        // For private: instructor selected OR assign later checked
        if (state.productType === "private") {
          return hasBasicRequirements && (state.instructor !== null || state.assignLater);
        }
        // For group: no instructor validation needed
        return hasBasicRequirements;
      }
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
        setProductType,
        setProductId,
        setSport,
        setDateRange,
        setSelectedDates,
        setTimeSlot,
        setDuration,
        setIncludeLunch,
        setInstructor,
        setAssignLater,
        setMeetingPoint,
        setPreferredInstructorId,
        setLanguage,
        setCustomerNotes,
        setInternalNotes,
        setInstructorNotes,
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
