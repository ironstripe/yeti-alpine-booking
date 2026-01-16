import { createContext, useContext, useState, ReactNode } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

export type WizardStep = 1 | 2 | 3;

export interface SelectedParticipant {
  id: string;
  first_name: string;
  last_name: string | null;
  birth_date: string;
  level_last_season: string | null;
  level_current_season: string | null;
  sport: string | null;
  isGuest?: boolean;
}

// New: Support for variable appointments (Complex Mode)
export interface AppointmentSlot {
  date: string;
  startTime: string;
  durationMinutes: number;
}

// Track original ticket items for edit mode
export interface OriginalTicketItem {
  id: string;
  participantId: string;
  date: string;
  timeStart: string | null;
  timeEnd: string | null;
  instructorId: string | null;
  meetingPoint: string | null;
  productId: string | null;
  unitPrice: number | null;
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
  
  // Private lesson specific
  numberOfPersons: number; // For additional person pricing (max 4)
  
  // Group course specific
  selectedGroupId: string | null;
  groupCourseType: "windel_wedelkurs" | "kids_village" | "standard" | null;
  lunchSelections: Record<string, string[]>; // { participantId: ['2026-01-06', ...] }
  vegetarianSelections: Record<string, boolean>; // { participantId: true/false }
  
  // New: Variable appointments (from scheduler multi-slot selection)
  appointments: AppointmentSlot[] | null;
  
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
  
  // Edit mode
  isEditMode: boolean;
  editingTicketId: string | null;
  originalItems: OriginalTicketItem[];
  originalParticipantIds: string[]; // Track original participants to detect add/remove
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
  setNumberOfPersons: (count: number) => void;
  setAppointments: (appointments: AppointmentSlot[] | null) => void;
  // Group course setters
  setSelectedGroupId: (id: string | null) => void;
  setGroupCourseType: (type: "windel_wedelkurs" | "kids_village" | "standard" | null) => void;
  setLunchDaysForParticipant: (participantId: string, days: string[]) => void;
  setVegetarianForParticipant: (participantId: string, isVegetarian: boolean) => void;
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
  // New: Pre-fill from scheduler
  prefillFromScheduler: (instructorId: string, appointments: AppointmentSlot[]) => void;
  // Edit mode
  loadTicketForEditing: (ticketId: string) => Promise<void>;
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
  numberOfPersons: 1,
  selectedGroupId: null,
  groupCourseType: null,
  lunchSelections: {},
  vegetarianSelections: {},
  appointments: null,
  instructorId: null,
  instructor: null,
  assignLater: false,
  meetingPoint: "sammelplatz_gorfion",
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
  // Edit mode defaults
  isEditMode: false,
  editingTicketId: null,
  originalItems: [],
  originalParticipantIds: [],
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

  const setNumberOfPersons = (count: number) => {
    setState((prev) => ({ ...prev, numberOfPersons: Math.min(Math.max(count, 1), 4) }));
  };

  const setAppointments = (appointments: AppointmentSlot[] | null) => {
    setState((prev) => {
      if (!appointments) {
        return { ...prev, appointments: null };
      }
      // Also derive selectedDates from appointments
      const dates = [...new Set(appointments.map((a) => a.date))];
      return { ...prev, appointments, selectedDates: dates };
    });
  };

  // Group course setters
  const setSelectedGroupId = (id: string | null) => {
    setState((prev) => ({ ...prev, selectedGroupId: id }));
  };

  const setGroupCourseType = (type: "windel_wedelkurs" | "kids_village" | "standard" | null) => {
    setState((prev) => ({ ...prev, groupCourseType: type }));
  };

  const setLunchDaysForParticipant = (participantId: string, days: string[]) => {
    setState((prev) => ({
      ...prev,
      lunchSelections: {
        ...prev.lunchSelections,
        [participantId]: days,
      },
    }));
  };

  const setVegetarianForParticipant = (participantId: string, isVegetarian: boolean) => {
    setState((prev) => ({
      ...prev,
      vegetarianSelections: {
        ...prev.vegetarianSelections,
        [participantId]: isVegetarian,
      },
    }));
  };

  const prefillFromScheduler = (instructorId: string, appointments: AppointmentSlot[]) => {
    const dates = [...new Set(appointments.map((a) => a.date))];
    setState((prev) => ({
      ...prev,
      instructorId,
      appointments,
      selectedDates: dates,
      productType: "private",
    }));
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
      currentStep: Math.min(prev.currentStep + 1, 3) as WizardStep,
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
      case 2: {
        // Merged step: Product + Instructor + Meeting Point
        const hasProduct = state.productType !== null && state.selectedDates.length > 0;
        const hasMeetingPoint = state.meetingPoint !== null;
        
        // For private: instructor selected OR assign later checked
        if (state.productType === "private") {
          return hasProduct && hasMeetingPoint && (state.instructor !== null || state.assignLater);
        }
        // For group: no instructor validation needed
        return hasProduct && hasMeetingPoint;
      }
      case 3:
        return true;
      default:
        return false;
    }
  };

  const resetWizard = () => {
    setState(initialState);
  };

  // Load existing ticket for editing
  const loadTicketForEditing = async (ticketId: string) => {
    try {
      // Fetch ticket with all related data
      const { data: ticket, error } = await supabase
        .from("tickets")
        .select(`
          *,
          customer:customers!tickets_customer_id_fkey (*),
          ticket_items (
            id,
            date,
            time_start,
            time_end,
            instructor_id,
            meeting_point,
            participant_id,
            product_id,
            unit_price,
            internal_notes,
            instructor_notes,
            product:products!ticket_items_product_id_fkey (id, name, type),
            instructor:instructors!ticket_items_instructor_id_fkey (*),
            participant:customer_participants!ticket_items_participant_id_fkey (*)
          )
        `)
        .eq("id", ticketId)
        .single();

      if (error) throw error;
      if (!ticket) throw new Error("Buchung nicht gefunden");

      const items = ticket.ticket_items || [];
      
      // Extract unique participants from items
      const participantMap = new Map<string, SelectedParticipant>();
      for (const item of items) {
        if (item.participant && !participantMap.has(item.participant.id)) {
          participantMap.set(item.participant.id, {
            id: item.participant.id,
            first_name: item.participant.first_name,
            last_name: item.participant.last_name,
            birth_date: item.participant.birth_date,
            level_last_season: item.participant.level_last_season,
            level_current_season: item.participant.level_current_season,
            sport: item.participant.sport,
          });
        }
      }
      const selectedParticipants = Array.from(participantMap.values());
      const originalParticipantIds = selectedParticipants.map(p => p.id);

      // Extract unique dates
      const selectedDates = [...new Set(items.map(i => i.date).filter(Boolean))].sort();

      // Get time from first item
      const firstItem = items[0];
      const timeSlot = firstItem?.time_start && firstItem?.time_end
        ? `${firstItem.time_start.slice(0, 5)} - ${firstItem.time_end.slice(0, 5)}`
        : null;

      // Calculate duration
      let duration = null;
      if (firstItem?.time_start && firstItem?.time_end) {
        const startHour = parseInt(firstItem.time_start.split(":")[0]);
        const endHour = parseInt(firstItem.time_end.split(":")[0]);
        duration = endHour - startHour;
      }

      // Get product type
      const productType = firstItem?.product?.type === "group" ? "group" : "private";
      const productId = firstItem?.product_id || null;

      // Get instructor (if any)
      const instructorItem = items.find(i => i.instructor);
      const instructor = instructorItem?.instructor || null;

      // Get meeting point
      const meetingPoint = firstItem?.meeting_point || "sammelplatz_gorfion";

      // Build original items for tracking changes
      const originalItems: OriginalTicketItem[] = items.map(item => ({
        id: item.id,
        participantId: item.participant_id || "",
        date: item.date,
        timeStart: item.time_start,
        timeEnd: item.time_end,
        instructorId: item.instructor_id,
        meetingPoint: item.meeting_point,
        productId: item.product_id,
        unitPrice: item.unit_price,
      }));

      // Update state with all the loaded data
      setState(prev => ({
        ...prev,
        // Edit mode flags
        isEditMode: true,
        editingTicketId: ticketId,
        originalItems,
        originalParticipantIds,
        // Customer (locked in edit mode, but still loaded)
        customer: ticket.customer as Tables<"customers">,
        customerId: ticket.customer?.id || null,
        // Participants
        selectedParticipants,
        // Product & dates
        productType: productType as "private" | "group",
        productId,
        selectedDates,
        timeSlot,
        duration,
        // Instructor
        instructor: instructor as Tables<"instructors"> | null,
        instructorId: instructor?.id || null,
        assignLater: !instructor,
        // Meeting point
        meetingPoint,
        // Notes
        internalNotes: firstItem?.internal_notes || "",
        instructorNotes: firstItem?.instructor_notes || "",
        customerNotes: ticket.notes || "",
        // Start at step 2 (skip customer selection)
        currentStep: 2,
      }));
    } catch (error) {
      console.error("Error loading ticket for editing:", error);
      throw error;
    }
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
        setNumberOfPersons,
        setAppointments,
        setSelectedGroupId,
        setGroupCourseType,
        setLunchDaysForParticipant,
        setVegetarianForParticipant,
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
        prefillFromScheduler,
        loadTicketForEditing,
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
