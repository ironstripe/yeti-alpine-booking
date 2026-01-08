import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ParticipantData } from "@/components/booking-portal/ParticipantFormFields";
import type { Json } from "@/integrations/supabase/types";

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
  requestId: string;
  requestNumber: string;
  magicToken: string;
}

export function useBookingRequest() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createRequest = useMutation({
    mutationFn: async (data: BookingRequestData): Promise<CreateBookingRequestResult> => {
      setIsSubmitting(true);

      // Generate a temporary request number (will be replaced by trigger)
      const tempRequestNumber = `ANF-TEMP-${Date.now()}`;
      
      const { data: result, error } = await supabase
        .from("booking_requests")
        .insert([{
          request_number: tempRequestNumber,
          type: data.type,
          sport_type: data.sport,
          requested_date: data.requestedDate,
          requested_time_slot: data.requestedTimeSlot,
          duration_hours: data.durationHours,
          participant_count: data.participantCount,
          participants_data: data.participants as unknown as Json,
          customer_data: data.customer as unknown as Json,
          voucher_code: data.voucherCode,
          voucher_discount: data.voucherDiscount,
          estimated_price: data.estimatedPrice,
          notes: data.notes,
          product_id: data.productId,
          source: "website",
        }])
        .select("id, request_number, magic_token")
        .single();

      if (error) throw error;

      return {
        requestId: result.id,
        requestNumber: result.request_number,
        magicToken: result.magic_token,
      };
    },
    onSettled: () => {
      setIsSubmitting(false);
    },
  });

  const fetchRequestByToken = async (token: string) => {
    const { data, error } = await supabase
      .from("booking_requests")
      .select("*")
      .eq("magic_token", token)
      .single();

    if (error) throw error;
    return data;
  };

  const fetchRequestByNumber = async (requestNumber: string) => {
    const { data, error } = await supabase
      .from("booking_requests")
      .select("*")
      .eq("request_number", requestNumber)
      .single();

    if (error) throw error;
    return data;
  };

  return {
    createRequest,
    fetchRequestByToken,
    fetchRequestByNumber,
    isSubmitting,
  };
}
