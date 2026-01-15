import { CheckCircle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface BookingReadyBadgeProps {
  isReady: boolean;
  missingFields?: string[];
  className?: string;
}

const fieldLabels: Record<string, string> = {
  // New standardized field names
  customer_name: "Vor- und Nachname",
  customer_contact: "E-Mail oder Telefon",
  customer_address: "Adresse",
  participant_names: "Teilnehmernamen",
  participant_birthdates: "Geburtsdaten/Alter",
  participant_skill_levels: "Könnensstufe",
  booking_dates: "Konkrete Daten",
  booking_course_type: "Kurstyp",
  booking_times: "Uhrzeiten",
  lunch_supervision: "Mittagsbetreuung",
  vegetarian_preference: "Vegetarisch",
  // Legacy field names
  start_date: "Startdatum",
  contact_info: "Kontaktdaten (E-Mail/Telefon)",
  participant_ages: "Alter der Teilnehmer",
  skill_levels: "Kenntnisstand",
  course_type: "Kurstyp",
};

export function BookingReadyBadge({ 
  isReady, 
  missingFields = [],
  className 
}: BookingReadyBadgeProps) {
  if (isReady) {
    return (
      <Badge 
        className={cn(
          "bg-green-100 text-green-700 border-green-200 hover:bg-green-100",
          className
        )}
      >
        <CheckCircle className="h-3 w-3 mr-1" />
        Buchung möglich
      </Badge>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge 
          variant="outline"
          className={cn(
            "bg-yellow-50 text-yellow-700 border-yellow-200 cursor-help",
            className
          )}
        >
          <Clock className="h-3 w-3 mr-1" />
          Rückfrage nötig
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="font-medium mb-1">Fehlende Pflichtangaben:</p>
        <ul className="text-xs space-y-0.5">
          {missingFields.map((field) => (
            <li key={field}>• {fieldLabels[field] || field}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

// Helper function to calculate missing required fields
export function getMissingRequiredFields(data: any): string[] {
  if (!data) return [];
  const missing: string[] = [];
  
  const booking = data.booking || {};
  const participants = data.participants || [];
  const customer = data.customer || {};
  
  // Check for start date
  if (!booking.start_date && (!booking.dates || booking.dates.length === 0)) {
    missing.push("start_date");
  }
  
  // Check for real participant names (not just "Teilnehmer 1")
  const hasRealNames = participants.some((p: any) => 
    p.name && !p.name.match(/^Teilnehmer \d+$/i)
  );
  if (!hasRealNames && participants.length > 0) {
    missing.push("participant_names");
  }
  
  // Check for contact info
  if (!customer.email && !customer.phone) {
    missing.push("contact_info");
  }
  
  return missing;
}

// Calculate data completeness (0-1 scale)
export function calculateDataCompleteness(data: any): number {
  if (!data) return 0;
  
  let score = 0;
  
  const booking = data.booking || {};
  const participants = data.participants || [];
  const customer = data.customer || {};
  
  // Required fields (60%)
  // Start date (15%)
  if (booking.start_date || (booking.dates && booking.dates.length > 0)) {
    score += 15;
  }
  
  // Has participants (15%)
  if (participants.length > 0) {
    score += 15;
  }
  
  // Has real participant names - not just "Teilnehmer 1" (15%)
  const hasRealNames = participants.some((p: any) => 
    p.name && !p.name.match(/^Teilnehmer \d+$/i)
  );
  if (hasRealNames) {
    score += 15;
  }
  
  // Has contact info (15%)
  if (customer.email || customer.phone) {
    score += 15;
  }
  
  // Important fields (30%)
  // Participant ages (10%)
  if (participants.some((p: any) => p.age && p.age > 0)) {
    score += 10;
  }
  
  // Skill levels (10%)
  if (participants.some((p: any) => p.skill_level && p.skill_level !== "unknown")) {
    score += 10;
  }
  
  // Course type (10%)
  if (booking.product_type && booking.product_type !== "unknown") {
    score += 10;
  }
  
  // Nice-to-have fields (10%)
  // Duration / multiple dates (5%)
  if ((booking.dates && booking.dates.length > 1) || booking.end_date) {
    score += 5;
  }
  
  // Sport type (5%)
  if (participants.some((p: any) => p.discipline && p.discipline !== "unknown")) {
    score += 5;
  }
  
  return score / 100;
}

// Check if booking is ready (all required fields present)
export function isBookingReady(data: any): boolean {
  if (!data) return false;
  
  const booking = data.booking || {};
  const participants = data.participants || [];
  const customer = data.customer || {};
  
  const hasStartDate = !!(booking.start_date || (booking.dates && booking.dates.length > 0));
  const hasParticipants = participants.length > 0;
  const hasRealNames = participants.some((p: any) => 
    p.name && !p.name.match(/^Teilnehmer \d+$/i)
  );
  const hasContact = !!(customer.email || customer.phone);
  
  return hasStartDate && hasParticipants && hasRealNames && hasContact;
}
