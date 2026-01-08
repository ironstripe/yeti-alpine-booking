import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ExtractedData {
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    hotel?: string;
  };
  participants?: Array<{
    name: string;
    age?: number;
    skill_level?: string;
    discipline?: string;
    notes?: string;
  }>;
  booking?: {
    product_type?: string;
    dates?: Array<{ date: string; time_preference?: string }>;
    flexibility?: string;
    instructor_preference?: string;
    lunch_supervision?: boolean;
    special_requests?: string;
  };
}

interface ConvertToBookingButtonProps {
  conversationId: string;
  extractedData: ExtractedData | null;
  className?: string;
}

export function ConvertToBookingButton({ 
  conversationId, 
  extractedData,
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
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      const prefillState = {
        // Customer data
        customer: {
          first_name: firstName,
          last_name: lastName,
          email: customer?.email || "",
          phone: customer?.phone || "",
          holiday_address: customer?.hotel || "",
        },
        // Participants - will be created in the wizard
        participants: extractedData.participants?.map(p => ({
          first_name: p.name.split(" ")[0] || "",
          last_name: p.name.split(" ").slice(1).join(" ") || "",
          age: p.age,
          skill_level: p.skill_level,
          discipline: p.discipline,
          notes: p.notes,
        })) || [],
        // Booking preferences
        booking: {
          product_type: extractedData.booking?.product_type,
          dates: extractedData.booking?.dates || [],
          lunch_supervision: extractedData.booking?.lunch_supervision,
          instructor_preference: extractedData.booking?.instructor_preference,
          special_requests: extractedData.booking?.special_requests,
        },
        // Link back to conversation
        sourceConversationId: conversationId,
      };

      // Navigate to booking wizard with pre-filled state
      navigate("/bookings/new", { 
        state: { prefill: prefillState, conversation: conversationId } 
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
