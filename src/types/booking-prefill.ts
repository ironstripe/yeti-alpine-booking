/**
 * Shared type for booking wizard prefill data from AI extraction or other sources
 */

export interface PrefillParticipant {
  first_name: string;
  last_name: string;
  age?: number;
  birth_date?: string;
  skill_level?: string;
  discipline?: string;
  notes?: string;
}

export interface PrefillCustomer {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  holiday_address?: string;
  street?: string;
  zip?: string;
  city?: string;
  country?: string;
}

export interface PrefillBooking {
  product_type?: "private" | "group";
  dates?: Array<{ date: string; time_preference?: string; start_time?: string; end_time?: string }>;
  lunch_supervision?: boolean;
  instructor_preference?: string;
  special_requests?: string;
}

export interface BookingPrefillState {
  // Customer data - either existing ID or new customer data
  matchedCustomerId?: string | null;
  customer: PrefillCustomer;
  
  // Participants to create or match
  participants: PrefillParticipant[];
  
  // Booking preferences
  booking: PrefillBooking;
  
  // Source conversation for linking
  sourceConversationId: string;
}
