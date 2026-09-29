import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ParticipantData } from "@/components/booking-portal/ParticipantFormFields";

export interface BookingRequestData {
  type: "private" | "group";
  sport: "ski" | "snowboard";
  requestedDate: string;
  requestedTimeSlot: "morning" | "afternoon" | "flexible";
  durationHours?: number;
  participantCount: number;
  participants: ParticipantData[];
  customer: {
    salutation?: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    accommodation?: string;
  };
  voucherCode?: string;
  voucherDiscount?: number;
  estimatedPrice?: number;
  notes?: string;
  productId?: string;
}

interface CreateBookingRequestResult {
  requestNumber: string;
  magicToken: string;
}

/**
 * Submits a public booking request through the server (no direct table access).
 * One submission key per form instance: retries after an error reuse it, so the
 * server returns the same request and never sends a second acknowledgement.
 */
export function useBookingRequest() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionKey = useRef<string>(crypto.randomUUID());

  const createRequest = useMutation({
    mutationFn: async (data: BookingRequestData): Promise<CreateBookingRequestResult> => {
      setIsSubmitting(true);
      const { data: result, error } = await supabase.functions.invoke("submit-booking-request", {
        body: { ...data, submissionKey: submissionKey.current },
      });
      if (error) throw error;
      if (!result?.magicToken || !result?.requestNumber) throw new Error("invalid_response");
      return { requestNumber: result.requestNumber, magicToken: result.magicToken };
    },
    onSettled: () => setIsSubmitting(false),
  });

  return { createRequest, isSubmitting };
}
