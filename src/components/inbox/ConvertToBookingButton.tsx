import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { BookingPrefillState } from "@/types/booking-prefill";

interface ExtractedData {
  customer?: {
    name?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    address?: string | {
      street?: string;
      zip?: string;
      city?: string;
      country?: string;
    };
    hotel?: string;
  };
  participants?: Array<{
    name?: string;
    first_name?: string;
    last_name?: string;
    age?: number;
    birth_date?: string;
    skill_level?: string;
    discipline?: string;
    notes?: string;
  }>;
  booking?: {
    product_type?: string;
    dates?: Array<{ date: string; time_preference?: string; start_time?: string; end_time?: string }>;
    flexibility?: string;
    instructor_preference?: string;
    lunch_supervision?: boolean;
    special_requests?: string;
  };
  matched_customer_id?: string;
}

interface ConvertToBookingButtonProps {
  conversationId: string;
  extractedData: ExtractedData | null;
  matchedCustomerId?: string | null;
  className?: string;
}

export function ConvertToBookingButton({ 
  conversationId, 
  extractedData,
  matchedCustomerId,
  className 
}: ConvertToBookingButtonProps) {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const handleConvert = async () => {
    if (!extractedData) {
      toast.error("Keine extrahierten Daten verfügbar");
      return;
    }

    setIsLoading(true);

    try {
      // Build pre-fill state for the booking wizard
      const customer = extractedData.customer;
      const nameParts = customer?.name?.split(" ") || [];
      const firstName = customer?.first_name || nameParts[0] || "";
      const lastName = customer?.last_name || nameParts.slice(1).join(" ") || "";

      const prefillState: BookingPrefillState = {
        // Use matched customer ID if available
        matchedCustomerId: matchedCustomerId || extractedData.matched_customer_id || null,
        
        // Customer data for creation if no match
        customer: {
          first_name: firstName,
          last_name: lastName,
          email: customer?.email || "",
          phone: customer?.phone || "",
          holiday_address: customer?.hotel || "",
          street: typeof customer?.address === "object" ? customer.address.street || "" : "",
          zip: typeof customer?.address === "object" ? customer.address.zip || "" : "",
          city: typeof customer?.address === "object" ? customer.address.city || "" : "",
          country: typeof customer?.address === "object" ? customer.address.country || "CH" : "CH",
        },
        
        // Participants - will be created/matched in the wizard
        participants: extractedData.participants?.map(p => {
          const pNameParts = p.name?.split(" ") || [];
          return {
            first_name: p.first_name || pNameParts[0] || "",
            last_name: p.last_name || pNameParts.slice(1).join(" ") || "",
            age: p.age,
            birth_date: p.birth_date,
            skill_level: p.skill_level,
            discipline: p.discipline,
            notes: p.notes,
          };
        }) || [],
        
        // Booking preferences
        booking: {
          product_type: extractedData.booking?.product_type as "private" | "group" | undefined,
          dates: extractedData.booking?.dates || [],
          lunch_supervision: extractedData.booking?.lunch_supervision,
          instructor_preference: extractedData.booking?.instructor_preference,
          special_requests: extractedData.booking?.special_requests,
        },
        
        // Link back to conversation
        sourceConversationId: conversationId,
      };

      // Build query params for resilience (refresh-safe)
      const queryParams = new URLSearchParams();
      queryParams.set("conversation", conversationId);
      if (prefillState.matchedCustomerId) {
        queryParams.set("customer", prefillState.matchedCustomerId);
      }

      // Navigate to booking wizard with pre-filled state
      navigate(`/bookings/new?${queryParams.toString()}`, { 
        state: { prefill: prefillState } 
      });

      toast.success("Buchungsassistent geöffnet");
    } catch (error) {
      console.error("Error converting to booking:", error);
      toast.error("Fehler beim Erstellen der Buchung");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button 
      onClick={handleConvert} 
      disabled={isLoading || !extractedData}
      className={className}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <ArrowRight className="h-4 w-4 mr-2" />
      )}
      Buchung erstellen
    </Button>
  );
}
