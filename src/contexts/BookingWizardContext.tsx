import { createContext, useContext, useState, useCallback, ReactNode } from "react";
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
  // Skill level IDs (points to skill_levels table for progression)
  current_ski_level_id?: string | null;
  current_snowboard_level_id?: string | null;
  // Training IDs (points to group_courses table) - for future use
  current_ski_training_id?: string | null;
  current_snowboard_training_id?: string | null;
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

// NEW: Participant-specific booking details
export interface ParticipantBookingDetails {
  participantId: string;
  productType: "private" | "group";
  productId: string | null;
  groupCourseId: string | null;
  dates: string[];
  startTime: string | null;
  endTime: string | null;
  lunchDays: string[];
  isVegetarian: boolean;
}

// Per-day time override for period bookings (supports multiple time blocks per day)
export interface TimeBlock {
  id: string;
  startTime: string;
  endTime: string;
  instructorId?: string | null; // Per-block instructor override
}

// Legacy single-block format (for backwards compatibility during migration)
export interface DayTimeOverride {
  startTime: string;
  endTime: string;
}

// NEW: Time selection for unified day×time grid
export interface TimeSelection {
  date: string;
  startTime: string;
  endTime: string;
}

// NEW: Mini-scheduler slot selection for multi-select in booking wizard
export interface MiniSchedulerSlot {
  id: string;
  instructorId: string;
  instructorName: string;
  date: string;
  startTime: string;
  endTime: string;
}

// Multi-group private lesson proposal
export interface PrivateGroupProposal {
  groups: Array<{
    id: string;
    participantIds: string[];
    instructorId: string | null;
    instructor: Tables<"instructors"> | null;
    startTime: string | null;
    endTime: string | null;
  }>;
  warnings: string[];
}

// NEW: Cart item represents one product configuration in the shopping cart
export interface CartItem {
  id: string;
  productType: "private" | "group" | null;
  productId: string | null;
  sport: "ski" | "snowboard" | null;
  dateRange: { start: string; end: string } | null;
  selectedDates: string[];
  timeSlot: string | null;
  duration: number | null;
  numberOfPersons: number;
  includeLunch: boolean;
  selectedGroupId: string | null;
  groupCourseType: "windel_wedelkurs" | "kids_village" | "standard" | null;
  lunchSelections: Record<string, string[]>;
  vegetarianSelections: Record<string, boolean>;
  appointments: AppointmentSlot[] | null;
  useParticipantSpecificBooking: boolean;
  participantBookings: Record<string, ParticipantBookingDetails>;
  dayInstructorOverrides: Record<string, string | null>;
  dayTimeOverrides: Record<string, TimeBlock[]>;
  timeSelections: TimeSelection[];
  miniSchedulerSelections: MiniSchedulerSlot[];
  privateGroupProposal: PrivateGroupProposal | null;
  instructorId: string | null;
  instructor: Tables<"instructors"> | null;
  assignLater: boolean;
  meetingPoint: string | null;
  preferredInstructorId: string | null;
  language: string;
  assignedParticipantIds: string[];
}

export function createEmptyCartItem(): CartItem {
  return {
    id: crypto.randomUUID(),
    productType: null,
    productId: null,
    sport: null,
    dateRange: null,
    selectedDates: [],
    timeSlot: null,
    duration: null,
    numberOfPersons: 1,
    includeLunch: false,
    selectedGroupId: null,
    groupCourseType: null,
    lunchSelections: {},
    vegetarianSelections: {},
    appointments: null,
    useParticipantSpecificBooking: false,
    participantBookings: {},
    dayInstructorOverrides: {},
    dayTimeOverrides: {},
    timeSelections: [],
    miniSchedulerSelections: [],
    privateGroupProposal: null,
    instructorId: null,
    instructor: null,
    assignLater: false,
    meetingPoint: "sammelplatz_gorfion",
    preferredInstructorId: null,
    language: "de",
    assignedParticipantIds: [],
  };
}

// Extract product-related fields from root state into a CartItem snapshot
function extractCartItemFromState(state: BookingWizardState, itemId: string): CartItem {
  return {
    id: itemId,
    productType: state.productType,
    productId: state.productId,
    sport: state.sport,
    dateRange: state.dateRange,
    selectedDates: state.selectedDates,
    timeSlot: state.timeSlot,
    duration: state.duration,
    numberOfPersons: state.numberOfPersons,
    includeLunch: state.includeLunch,
    selectedGroupId: state.selectedGroupId,
    groupCourseType: state.groupCourseType,
    lunchSelections: state.lunchSelections,
    vegetarianSelections: state.vegetarianSelections,
    appointments: state.appointments,
    useParticipantSpecificBooking: state.useParticipantSpecificBooking,
    participantBookings: state.participantBookings,
    dayInstructorOverrides: state.dayInstructorOverrides,
    dayTimeOverrides: state.dayTimeOverrides,
    timeSelections: state.timeSelections,
    miniSchedulerSelections: state.miniSchedulerSelections,
    privateGroupProposal: state.privateGroupProposal,
    instructorId: state.instructorId,
    instructor: state.instructor,
    assignLater: state.assignLater,
    meetingPoint: state.meetingPoint,
    preferredInstructorId: state.preferredInstructorId,
    language: state.language,
    assignedParticipantIds: state.cartItems.find(i => i.id === itemId)?.assignedParticipantIds || [],
  };
}

// Apply a CartItem's fields back to root state
function applyCartItemToState(item: CartItem): Partial<BookingWizardState> {
  return {
    productType: item.productType,
    productId: item.productId,
    sport: item.sport,
    dateRange: item.dateRange,
    selectedDates: item.selectedDates,
    timeSlot: item.timeSlot,
    duration: item.duration,
    numberOfPersons: item.numberOfPersons,
    includeLunch: item.includeLunch,
    selectedGroupId: item.selectedGroupId,
    groupCourseType: item.groupCourseType,
    lunchSelections: item.lunchSelections,
    vegetarianSelections: item.vegetarianSelections,
    appointments: item.appointments,
    useParticipantSpecificBooking: item.useParticipantSpecificBooking,
    participantBookings: item.participantBookings,
    dayInstructorOverrides: item.dayInstructorOverrides,
    dayTimeOverrides: item.dayTimeOverrides,
    timeSelections: item.timeSelections,
    miniSchedulerSelections: item.miniSchedulerSelections,
    privateGroupProposal: item.privateGroupProposal,
    instructorId: item.instructorId,
    instructor: item.instructor,
    assignLater: item.assignLater,
    meetingPoint: item.meetingPoint,
    preferredInstructorId: item.preferredInstructorId,
    language: item.language,
  };
}

export interface BookingWizardState {
  // Step 1: Customer & Participants
  customerId: string | null;
  customer: Tables<"customers"> | null;
  selectedParticipants: SelectedParticipant[];
  
  // Step 2: Product & Date (shared mode - default)
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
  
  // NEW: Participant-specific booking mode
  useParticipantSpecificBooking: boolean;
  participantBookings: Record<string, ParticipantBookingDetails>;
  
  // NEW: Per-day overrides for period bookings
  dayInstructorOverrides: Record<string, string | null>; // { "2025-02-10": "instructor-uuid" }
  dayTimeOverrides: Record<string, TimeBlock[]>; // { "2025-02-10": [{ id, startTime, endTime }, ...] }
  
  // NEW: Unified time selections from BookingTimeGrid
  timeSelections: TimeSelection[];
  
  // NEW: Mini-scheduler multi-select slots
  miniSchedulerSelections: MiniSchedulerSlot[];
  
  // Multi-group private lesson proposal
  privateGroupProposal: PrivateGroupProposal | null;
  
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
  // Cart
  cartItems: CartItem[];
  activeCartItemId: string | null;
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
  // NEW: Participant-specific booking setters
  setUseParticipantSpecificBooking: (use: boolean) => void;
  setParticipantBooking: (participantId: string, booking: ParticipantBookingDetails) => void;
  initializeParticipantBookings: () => void;
  copyBookingToAllParticipants: (sourceParticipantId: string) => void;
  // NEW: Per-day override setters for period bookings
  setDayInstructorOverride: (date: string, instructorId: string | null) => void;
  setDayTimeOverride: (date: string, startTime: string, endTime: string) => void;
  addTimeBlock: (date: string, startTime: string, endTime: string, instructorId?: string | null) => void;
  updateTimeBlock: (date: string, blockId: string, startTime: string, endTime: string, instructorId?: string | null) => void;
  removeTimeBlock: (date: string, blockId: string) => void;
  removeDayInstructorOverride: (date: string) => void;
  removeDayTimeOverride: (date: string) => void;
  clearDayOverrides: () => void;
  // NEW: Time selections for unified day×time grid
  setTimeSelections: (selections: TimeSelection[]) => void;
  // NEW: Mini-scheduler multi-select
  toggleMiniSchedulerSlot: (slot: Omit<MiniSchedulerSlot, "id">) => void;
  // Multi-group private lesson
  setPrivateGroupProposal: (proposal: PrivateGroupProposal | null) => void;
  setGroupInstructor: (groupId: string, instructor: Tables<"instructors"> | null) => void;
  setGroupTime: (groupId: string, startTime: string, endTime: string) => void;
  clearMiniSchedulerSelection: () => void;
  applyMiniSchedulerSelection: () => void;
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
  // Cart management
  addCartItem: () => void;
  removeCartItem: (id: string) => void;
  setActiveCartItem: (id: string) => void;
  getAllCartItems: () => CartItem[];
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
  // NEW: Participant-specific booking defaults
  useParticipantSpecificBooking: false,
  participantBookings: {},
  // NEW: Per-day override defaults
  dayInstructorOverrides: {},
  dayTimeOverrides: {},
  // NEW: Time selections default
  timeSelections: [],
  // NEW: Mini-scheduler multi-select default
  miniSchedulerSelections: [],
  // Multi-group private lesson
  privateGroupProposal: null,
  // Step 3
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
  // Cart
  cartItems: [],
  activeCartItemId: null,
};

const BookingWizardContext = createContext<BookingWizardContextType | null>(null);

export function BookingWizardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BookingWizardState>(() => {
    const firstItem = createEmptyCartItem();
    return {
      ...initialState,
      cartItems: [firstItem],
      activeCartItemId: firstItem.id,
    };
  });

  // === Cart Management ===
  const addCartItem = () => {
    setState(prev => {
      // Save current root state to active cart item
      const updatedItems = prev.cartItems.map(item =>
        item.id === prev.activeCartItemId
          ? extractCartItemFromState(prev, item.id)
          : item
      );
      const newItem = createEmptyCartItem();
      return {
        ...prev,
        ...applyCartItemToState(newItem),
        cartItems: [...updatedItems, newItem],
        activeCartItemId: newItem.id,
      };
    });
  };

  const removeCartItem = (id: string) => {
    setState(prev => {
      const filtered = prev.cartItems.filter(item => item.id !== id);
      if (filtered.length === 0) {
        const newItem = createEmptyCartItem();
        return { ...prev, ...applyCartItemToState(newItem), cartItems: [newItem], activeCartItemId: newItem.id };
      }
      if (prev.activeCartItemId === id) {
        const target = filtered[0];
        return { ...prev, ...applyCartItemToState(target), cartItems: filtered, activeCartItemId: target.id };
      }
      return { ...prev, cartItems: filtered };
    });
  };

  const setActiveCartItem = (id: string) => {
    setState(prev => {
      if (prev.activeCartItemId === id) return prev;
      // Save current root state to active cart item
      const updatedItems = prev.cartItems.map(item =>
        item.id === prev.activeCartItemId
          ? extractCartItemFromState(prev, item.id)
          : item
      );
      const target = updatedItems.find(item => item.id === id);
      if (!target) return prev;
      return { ...prev, ...applyCartItemToState(target), cartItems: updatedItems, activeCartItemId: id };
    });
  };

  const getAllCartItems = (): CartItem[] => {
    return state.cartItems.map(item =>
      item.id === state.activeCartItemId
        ? extractCartItemFromState(state, item.id)
        : item
    );
  };

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
    setState((prev) => {
      const newState = { ...prev, selectedDates: dates };
      
      // Sync to participant bookings if in individual mode
      if (prev.useParticipantSpecificBooking && Object.keys(prev.participantBookings).length > 0) {
        const previousDates = prev.selectedDates;
        const updatedBookings = { ...prev.participantBookings };
        
        for (const pId of Object.keys(updatedBookings)) {
          const booking = updatedBookings[pId];
          
          // Sync if:
          // 1. Participant's dates are empty, OR
          // 2. Participant's dates exactly match the previous shared dates (not manually overridden)
          const sortedBookingDates = [...booking.dates].sort().join(',');
          const sortedPreviousDates = [...previousDates].sort().join(',');
          const shouldSync = booking.dates.length === 0 || sortedBookingDates === sortedPreviousDates;
          
          if (shouldSync) {
            updatedBookings[pId] = { ...booking, dates: [...dates] };
          }
        }
        newState.participantBookings = updatedBookings;
      }
      
      return newState;
    });
  };

  const setTimeSlot = useCallback((slot: string | null) => {
    setState((prev) => ({ ...prev, timeSlot: slot }));
  }, []);

  const setDuration = useCallback((duration: number | null) => {
    setState((prev) => ({ ...prev, duration }));
  }, []);

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

  // NEW: Participant-specific booking setters
  const setUseParticipantSpecificBooking = (use: boolean) => {
    setState((prev) => ({ ...prev, useParticipantSpecificBooking: use }));
  };

  const setParticipantBooking = (participantId: string, booking: ParticipantBookingDetails) => {
    setState((prev) => ({
      ...prev,
      participantBookings: {
        ...prev.participantBookings,
        [participantId]: booking,
      },
    }));
  };

  const initializeParticipantBookings = () => {
    setState((prev) => {
      const bookings: Record<string, ParticipantBookingDetails> = {};
      for (const p of prev.selectedParticipants) {
        bookings[p.id] = {
          participantId: p.id,
          productType: prev.productType || "group",
          productId: prev.productId,
          groupCourseId: prev.selectedGroupId,
          dates: [...prev.selectedDates],
          startTime: prev.timeSlot?.split(" - ")[0] || null,
          endTime: prev.timeSlot?.split(" - ")[1] || null,
          lunchDays: prev.lunchSelections[p.id] || [],
          isVegetarian: prev.vegetarianSelections[p.id] || false,
        };
      }
      return { ...prev, participantBookings: bookings };
    });
  };

  const copyBookingToAllParticipants = (sourceParticipantId: string) => {
    setState((prev) => {
      const source = prev.participantBookings[sourceParticipantId];
      if (!source) return prev;

      const newBookings: Record<string, ParticipantBookingDetails> = {};
      for (const p of prev.selectedParticipants) {
        newBookings[p.id] = {
          ...source,
          participantId: p.id,
        };
      }
      return { ...prev, participantBookings: newBookings };
    });
  };

  // NEW: Per-day override setters for period bookings
  const setDayInstructorOverride = (date: string, instructorId: string | null) => {
    setState((prev) => ({
      ...prev,
      dayInstructorOverrides: {
        ...prev.dayInstructorOverrides,
        [date]: instructorId,
      },
    }));
  };

  // Generate unique ID for time blocks
  const generateTimeBlockId = () => `tb-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  // Sets ALL time blocks for a day (replaces existing) - primary block
  const setDayTimeOverride = (date: string, startTime: string, endTime: string, instructorId?: string | null) => {
    setState((prev) => ({
      ...prev,
      dayTimeOverrides: {
        ...prev.dayTimeOverrides,
        [date]: [{ id: generateTimeBlockId(), startTime, endTime, instructorId }],
      },
    }));
  };

  // Adds an additional time block to a day
  const addTimeBlock = (date: string, startTime: string, endTime: string, instructorId?: string | null) => {
    setState((prev) => {
      const existing = prev.dayTimeOverrides[date] || [];
      return {
        ...prev,
        dayTimeOverrides: {
          ...prev.dayTimeOverrides,
          [date]: [...existing, { id: generateTimeBlockId(), startTime, endTime, instructorId }],
        },
      };
    });
  };

  // Updates a specific time block by ID (including instructor)
  const updateTimeBlock = (date: string, blockId: string, startTime: string, endTime: string, instructorId?: string | null) => {
    setState((prev) => {
      const existing = prev.dayTimeOverrides[date] || [];
      const updated = existing.map((block) =>
        block.id === blockId ? { ...block, startTime, endTime, instructorId } : block
      );
      return {
        ...prev,
        dayTimeOverrides: {
          ...prev.dayTimeOverrides,
          [date]: updated,
        },
      };
    });
  };

  // Removes a specific time block by ID
  const removeTimeBlock = (date: string, blockId: string) => {
    setState((prev) => {
      const existing = prev.dayTimeOverrides[date] || [];
      const filtered = existing.filter((block) => block.id !== blockId);
      
      // If no blocks left, remove the day entry entirely
      if (filtered.length === 0) {
        const { [date]: removed, ...remaining } = prev.dayTimeOverrides;
        return { ...prev, dayTimeOverrides: remaining };
      }
      
      return {
        ...prev,
        dayTimeOverrides: {
          ...prev.dayTimeOverrides,
          [date]: filtered,
        },
      };
    });
  };

  const removeDayInstructorOverride = (date: string) => {
    setState((prev) => {
      const { [date]: removed, ...remaining } = prev.dayInstructorOverrides;
      return { ...prev, dayInstructorOverrides: remaining };
    });
  };

  const removeDayTimeOverride = (date: string) => {
    setState((prev) => {
      const { [date]: removed, ...remaining } = prev.dayTimeOverrides;
      return { ...prev, dayTimeOverrides: remaining };
    });
  };

  const clearDayOverrides = () => {
    setState((prev) => ({
      ...prev,
      dayInstructorOverrides: {},
      dayTimeOverrides: {},
    }));
  };

  // NEW: Set time selections from BookingTimeGrid
  const setTimeSelections = (selections: TimeSelection[]) => {
    setState((prev) => {
      // Also sync timeSlot from first selection for compatibility with existing logic
      let timeSlot = prev.timeSlot;
      let duration = prev.duration;
      
      if (selections.length > 0) {
        const first = selections[0];
        timeSlot = `${first.startTime} - ${first.endTime}`;
        const startHour = parseInt(first.startTime.split(":")[0]);
        const endHour = parseInt(first.endTime.split(":")[0]);
        duration = endHour - startHour;
      }
      
      return { ...prev, timeSelections: selections, timeSlot, duration };
    });
  };

  // Generate unique ID for mini-scheduler slots
  const generateMiniSlotId = () => `mini-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  // Toggle slot selection in mini-scheduler (for Ctrl+Click)
  const toggleMiniSchedulerSlot = (slot: Omit<MiniSchedulerSlot, "id">) => {
    setState((prev) => {
      // Find any existing selection that overlaps with the clicked cell
      const clickedStartMinutes = parseInt(slot.startTime.split(":")[0]) * 60;
      const existingIndex = prev.miniSchedulerSelections.findIndex((s) => {
        if (s.instructorId !== slot.instructorId || s.date !== slot.date) return false;
        const selStart = parseInt(s.startTime.split(":")[0]) * 60;
        const selEnd = parseInt(s.endTime.split(":")[0]) * 60;
        return clickedStartMinutes >= selStart && clickedStartMinutes < selEnd;
      });

      if (existingIndex >= 0) {
        // Remove the entire overlapping slot (toggle off)
        const newSelections = [...prev.miniSchedulerSelections];
        newSelections.splice(existingIndex, 1);
        return { ...prev, miniSchedulerSelections: newSelections };
      }

      // Multi-instructor selections are allowed for multi-participant bookings

      // Add the slot
      return {
        ...prev,
        miniSchedulerSelections: [
          ...prev.miniSchedulerSelections,
          { ...slot, id: generateMiniSlotId() },
        ],
      };
    });
  };

  // Clear all mini-scheduler selections
  const clearMiniSchedulerSelection = () => {
    setState((prev) => ({ ...prev, miniSchedulerSelections: [] }));
  };

  // Multi-group private lesson setters
  const setPrivateGroupProposal = (proposal: PrivateGroupProposal | null) => {
    setState((prev) => ({ ...prev, privateGroupProposal: proposal }));
  };

  const setGroupInstructor = (groupId: string, instructor: Tables<"instructors"> | null) => {
    setState((prev) => {
      if (!prev.privateGroupProposal) return prev;
      const updatedGroups = prev.privateGroupProposal.groups.map((g) =>
        g.id === groupId ? { ...g, instructor, instructorId: instructor?.id ?? null } : g
      );
      return {
        ...prev,
        privateGroupProposal: { ...prev.privateGroupProposal, groups: updatedGroups },
      };
    });
  };

  const setGroupTime = (groupId: string, startTime: string, endTime: string) => {
    setState((prev) => {
      if (!prev.privateGroupProposal) return prev;
      const updatedGroups = prev.privateGroupProposal.groups.map((g) =>
        g.id === groupId ? { ...g, startTime, endTime } : g
      );
      return {
        ...prev,
        privateGroupProposal: { ...prev.privateGroupProposal, groups: updatedGroups },
      };
    });
  };

  // Apply mini-scheduler selection to populate dates, time, instructor, and overrides
  const applyMiniSchedulerSelection = () => {
    setState((prev) => {
      if (prev.miniSchedulerSelections.length === 0) return prev;

      // Sort slots by date
      const sortedSlots = [...prev.miniSchedulerSelections].sort((a, b) =>
        a.date.localeCompare(b.date)
      );

      // Extract unique dates
      const dates = [...new Set(sortedSlots.map((s) => s.date))].sort();

      // Count instructors (for multi-instructor detection)
      const instructorCounts = new Map<string, { count: number; name: string }>();
      for (const slot of sortedSlots) {
        const ic = instructorCounts.get(slot.instructorId);
        if (ic) {
          ic.count++;
        } else {
          instructorCounts.set(slot.instructorId, { count: 1, name: slot.instructorName });
        }
      }

      // --- Merge adjacent 1h slots per instructor+date into contiguous ranges ---
      type MergedRange = { instructorId: string; instructorName: string; date: string; startTime: string; endTime: string };
      const mergedRanges: MergedRange[] = [];

      // Group slots by instructorId + date
      const slotGroups = new Map<string, typeof sortedSlots>();
      for (const slot of sortedSlots) {
        const key = `${slot.instructorId}|${slot.date}`;
        const arr = slotGroups.get(key) || [];
        arr.push(slot);
        slotGroups.set(key, arr);
      }

      for (const [, groupSlots] of slotGroups) {
        // Sort by startTime
        const sorted = [...groupSlots].sort((a, b) => a.startTime.localeCompare(b.startTime));
        let current = { ...sorted[0] };
        for (let i = 1; i < sorted.length; i++) {
          // If this slot's start equals current end, extend
          if (sorted[i].startTime === current.endTime) {
            current.endTime = sorted[i].endTime;
          } else {
            mergedRanges.push({ instructorId: current.instructorId, instructorName: current.instructorName, date: current.date, startTime: current.startTime, endTime: current.endTime });
            current = { ...sorted[i] };
          }
        }
        mergedRanges.push({ instructorId: current.instructorId, instructorName: current.instructorName, date: current.date, startTime: current.startTime, endTime: current.endTime });
      }

      // Find most frequent instructor
      let baseInstructorId = sortedSlots[0].instructorId;
      let maxInstructorCount = 0;
      for (const [id, { count }] of instructorCounts) {
        if (count > maxInstructorCount) {
          maxInstructorCount = count;
          baseInstructorId = id;
        }
      }

      // Find most frequent merged time range
      const mergedTimeCounts = new Map<string, number>();
      for (const r of mergedRanges) {
        const key = `${r.startTime}-${r.endTime}`;
        mergedTimeCounts.set(key, (mergedTimeCounts.get(key) || 0) + 1);
      }
      let baseTimeKey = `${mergedRanges[0].startTime}-${mergedRanges[0].endTime}`;
      let maxTimeCount = 0;
      for (const [key, count] of mergedTimeCounts) {
        if (count > maxTimeCount) {
          maxTimeCount = count;
          baseTimeKey = key;
        }
      }
      const [baseStartTime, baseEndTime] = baseTimeKey.split("-");

      // Calculate duration from merged range
      const startHour = parseInt(baseStartTime.split(":")[0]);
      const endHour = parseInt(baseEndTime.split(":")[0]);
      const duration = endHour - startHour;

      // Build time selections and overrides
      const timeSelections: TimeSelection[] = sortedSlots.map((s) => ({
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
      }));

      // Group time blocks by date (supports multiple blocks per day)
      const dayTimeOverrides: Record<string, TimeBlock[]> = {};
      const dayInstructorOverrides: Record<string, string | null> = {};

      // Group slots by date
      const slotsByDate = new Map<string, typeof sortedSlots>();
      for (const slot of sortedSlots) {
        const existing = slotsByDate.get(slot.date) || [];
        slotsByDate.set(slot.date, [...existing, slot]);
      }

      // Process each date
      for (const [date, slotsOnDate] of slotsByDate) {
        // Build time blocks for this date with per-block instructor
        const blocks: TimeBlock[] = [];
        for (const slot of slotsOnDate) {
          // Determine if this block has an instructor override
          const blockInstructorId = slot.instructorId !== baseInstructorId ? slot.instructorId : undefined;
          
          // Only add override blocks if different from base OR multiple blocks
          if (
            slotsOnDate.length > 1 ||
            slot.startTime !== baseStartTime ||
            slot.endTime !== baseEndTime ||
            blockInstructorId
          ) {
            blocks.push({
              id: `tb-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              startTime: slot.startTime,
              endTime: slot.endTime,
              instructorId: blockInstructorId,
            });
          }
        }
        
        if (blocks.length > 0) {
          dayTimeOverrides[date] = blocks;
        }
        
        // Day-level instructor override (for backwards compatibility with single-block days)
        // Only set if ALL blocks on this day have the same non-base instructor
        const allSameInstructor = slotsOnDate.every(s => s.instructorId === slotsOnDate[0].instructorId);
        if (allSameInstructor && slotsOnDate[0].instructorId !== baseInstructorId) {
          dayInstructorOverrides[date] = slotsOnDate[0].instructorId;
        }
      }

      // Check if multiple instructors are selected AND multiple participants exist
      const uniqueInstructorIds = [...instructorCounts.keys()];
      let privateGroupProposal = prev.privateGroupProposal;

      if (uniqueInstructorIds.length > 1 && prev.selectedParticipants.length > 1) {
        // Build a privateGroupProposal: split participants across instructors
        const participantIds = prev.selectedParticipants.map(p => p.id);
        const groups = uniqueInstructorIds.map((instrId, idx) => {
          // Use merged ranges for this instructor's time
          const instrRanges = mergedRanges.filter(r => r.instructorId === instrId);
          const instrTimeCounts = new Map<string, number>();
          for (const r of instrRanges) {
            const tk = `${r.startTime}-${r.endTime}`;
            instrTimeCounts.set(tk, (instrTimeCounts.get(tk) || 0) + 1);
          }
          let bestTime = `${instrRanges[0].startTime}-${instrRanges[0].endTime}`;
          let bestCount = 0;
          for (const [tk, c] of instrTimeCounts) {
            if (c > bestCount) { bestCount = c; bestTime = tk; }
          }
          const [st, et] = bestTime.split("-");

          return {
            id: `mini-group-${idx + 1}`,
            participantIds: [] as string[],
            instructorId: instrId,
            instructor: null as Tables<"instructors"> | null,
            startTime: st,
            endTime: et,
          };
        });

        // Distribute participants evenly across groups (round-robin)
        participantIds.forEach((pid, idx) => {
          groups[idx % groups.length].participantIds.push(pid);
        });

        privateGroupProposal = { groups, warnings: [] };
      }

      // Clear base instructor when multi-group proposal is active
      const isMultiGroup = privateGroupProposal && privateGroupProposal.groups.length > 1;

      return {
        ...prev,
        selectedDates: dates,
        instructorId: isMultiGroup ? null : baseInstructorId,
        instructor: isMultiGroup ? null : prev.instructor,
        timeSlot: `${baseStartTime} - ${baseEndTime}`,
        duration,
        timeSelections,
        dayTimeOverrides,
        dayInstructorOverrides,
        privateGroupProposal,
        miniSchedulerSelections: [], // Clear after applying
      };
    });
  };

  const prefillFromScheduler = async (instructorId: string, appointments: AppointmentSlot[]) => {
    const dates = [...new Set(appointments.map((a) => a.date))].sort();
    
    // Fetch full instructor record for Step 3
    let instructor: Tables<"instructors"> | null = null;
    try {
      const { data, error } = await supabase
        .from("instructors")
        .select("*")
        .eq("id", instructorId)
        .single();
      
      if (!error && data) {
        instructor = data;
      }
    } catch (e) {
      console.error("Failed to fetch instructor for scheduler prefill:", e);
    }
    
    // Convert all appointments to TimeSelection format for the BookingTimeGrid
    const timeSelections: TimeSelection[] = appointments.map(appt => {
      const startHour = parseInt(appt.startTime.split(":")[0]);
      const startMinutes = parseInt(appt.startTime.split(":")[1] || "0");
      const totalEndMinutes = startHour * 60 + startMinutes + appt.durationMinutes;
      const endHour = Math.floor(totalEndMinutes / 60);
      const endMin = totalEndMinutes % 60;
      const endTime = `${endHour.toString().padStart(2, "0")}:${endMin.toString().padStart(2, "0")}`;
      
      return {
        date: appt.date,
        startTime: appt.startTime,
        endTime,
      };
    });
    
    // Use first appointment as base for timeSlot and duration
    const baseAppt = appointments[0];
    const baseStartTime = baseAppt?.startTime || "10:00";
    const baseDuration = baseAppt?.durationMinutes || 120;
    const baseStartHour = parseInt(baseStartTime.split(":")[0]);
    const baseStartMin = parseInt(baseStartTime.split(":")[1] || "0");
    const baseEndMinutes = baseStartHour * 60 + baseStartMin + baseDuration;
    const baseEndHour = Math.floor(baseEndMinutes / 60);
    const baseEndMin = baseEndMinutes % 60;
    const baseEndTime = `${baseEndHour.toString().padStart(2, "0")}:${baseEndMin.toString().padStart(2, "0")}`;
    
    // Calculate dayTimeOverrides for appointments that differ from base (as TimeBlock arrays)
    const dayTimeOverrides: Record<string, TimeBlock[]> = {};
    
    // Group time selections by date
    const selectionsByDate = new Map<string, TimeSelection[]>();
    for (const ts of timeSelections) {
      const existing = selectionsByDate.get(ts.date) || [];
      selectionsByDate.set(ts.date, [...existing, ts]);
    }
    
    // Build time blocks for each date
    for (const [date, selectionsOnDate] of selectionsByDate) {
      const blocks: TimeBlock[] = [];
      for (const ts of selectionsOnDate) {
        // Only add if different from base time OR if multiple blocks on same day
        if (
          selectionsOnDate.length > 1 ||
          ts.startTime !== baseStartTime ||
          ts.endTime !== baseEndTime
        ) {
          blocks.push({
            id: `tb-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            startTime: ts.startTime,
            endTime: ts.endTime,
          });
        }
      }
      if (blocks.length > 0) {
        dayTimeOverrides[date] = blocks;
      }
    }
    
    const timeSlot = baseAppt ? `${baseStartTime} - ${baseEndTime}` : null;
    const duration = baseDuration / 60;
    
    setState((prev) => ({
      ...prev,
      instructorId,
      instructor,
      appointments,
      selectedDates: dates,
      productType: "private",
      timeSlot,
      duration,
      // Populate per-day time fields for BookingTimeGrid and PeriodDayPlanner
      timeSelections,
      dayTimeOverrides,
      assignLater: false, // Instructor is already assigned from scheduler
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
      case 1: {
        // Step 1: Product + Cart - active item must have valid product config
        const hasProduct = state.productType !== null && state.selectedDates.length > 0;
        const hasMeetingPoint = state.meetingPoint !== null;
        
        if (state.productType === "private") {
          return hasProduct && hasMeetingPoint && (state.instructor !== null || state.assignLater);
        }
        return hasProduct && hasMeetingPoint;
      }
      case 2:
        // Step 2: Customer + Participants assigned
        return state.customer !== null && state.selectedParticipants.length > 0;
      case 3:
        return true;
      default:
        return false;
    }
  };

  const resetWizard = () => {
    const firstItem = createEmptyCartItem();
    setState({
      ...initialState,
      cartItems: [firstItem],
      activeCartItemId: firstItem.id,
    });
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
        // NEW: Participant-specific booking setters
        setUseParticipantSpecificBooking,
        setParticipantBooking,
        initializeParticipantBookings,
        copyBookingToAllParticipants,
        // NEW: Per-day override setters for period bookings
        setDayInstructorOverride,
        setDayTimeOverride,
        addTimeBlock,
        updateTimeBlock,
        removeTimeBlock,
        removeDayInstructorOverride,
        removeDayTimeOverride,
        clearDayOverrides,
        // NEW: Time selections for unified day×time grid
        setTimeSelections,
        // NEW: Mini-scheduler multi-select
        toggleMiniSchedulerSlot,
        clearMiniSchedulerSelection,
        applyMiniSchedulerSelection,
        // Multi-group private lesson
        setPrivateGroupProposal,
        setGroupInstructor,
        setGroupTime,
        // Step 3 setters
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
        // Cart management
        addCartItem,
        removeCartItem,
        setActiveCartItem,
        getAllCartItems,
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
