import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type MessageClassification = 
  | "new_booking" 
  | "cancellation" 
  | "modification" 
  | "general_inquiry" 
  | "complaint" 
  | "other";

interface ClassificationConfig {
  label: string;
  className: string;
}

const classificationConfig: Record<MessageClassification, ClassificationConfig> = {
  new_booking: {
    label: "Neue Buchung",
    className: "bg-green-600 hover:bg-green-600 text-white border-transparent",
  },
  cancellation: {
    label: "Stornierung",
    className: "bg-red-600 hover:bg-red-600 text-white border-transparent",
  },
  modification: {
    label: "Änderung",
    className: "bg-orange-500 hover:bg-orange-500 text-white border-transparent",
  },
  general_inquiry: {
    label: "Allgemeine Anfrage",
    className: "bg-blue-600 hover:bg-blue-600 text-white border-transparent",
  },
  complaint: {
    label: "Beschwerde",
    className: "bg-red-900 hover:bg-red-900 text-white border-transparent",
  },
  other: {
    label: "Sonstiges",
    className: "bg-gray-500 hover:bg-gray-500 text-white border-transparent",
  },
};

interface ClassificationBadgeProps {
  classification: MessageClassification;
  className?: string;
}

export function ClassificationBadge({ classification, className }: ClassificationBadgeProps) {
  const config = classificationConfig[classification] || classificationConfig.other;

  return (
    <Badge className={cn(config.className, className)}>
      {config.label}
    </Badge>
  );
}
